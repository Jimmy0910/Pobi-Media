interface Env {
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  POBI_KV?: KVNamespace;
}

interface UserRecord {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: string;
}

// 記憶體內簡易備援儲存與計數器
const memoryUserMap = new Map<string, UserRecord>();
const ipUsageMap = new Map<string, { count: number; date: string }>();
let globalDailyCount = 0;
let globalDate = "";

const MAX_USER_DAILY = 5;
const MAX_GLOBAL_DAILY = 200;

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function corsHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  };
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; reason?: string } {
  const today = getTodayString();

  if (globalDate !== today) {
    globalDate = today;
    globalDailyCount = 0;
  }

  if (globalDailyCount >= MAX_GLOBAL_DAILY) {
    return {
      allowed: false,
      remaining: 0,
      reason: "本日公用 API 全局總配額已耗盡，請使用自備 API Key 或純本地演算法",
    };
  }

  const userRecord = ipUsageMap.get(ip);
  if (!userRecord || userRecord.date !== today) {
    ipUsageMap.set(ip, { count: 0, date: today });
  }

  const currentUsage = ipUsageMap.get(ip)!;
  if (currentUsage.count >= MAX_USER_DAILY) {
    return {
      allowed: false,
      remaining: 0,
      reason: `您今日的公用配額 (${MAX_USER_DAILY}次) 已用完，請貼上自備 API Key 解鎖無限使用，或使用純演算法`,
    };
  }

  return {
    allowed: true,
    remaining: MAX_USER_DAILY - currentUsage.count,
  };
}

function recordUsage(ip: string) {
  const today = getTodayString();
  globalDailyCount++;
  const userRecord = ipUsageMap.get(ip);
  if (userRecord && userRecord.date === today) {
    userRecord.count++;
  } else {
    ipUsageMap.set(ip, { count: 1, date: today });
  }
}

// 雲端使用者資料操作輔助
async function getUserFromStore(username: string, env: Env): Promise<UserRecord | null> {
  const key = `user:${username.toLowerCase()}`;
  if (env.POBI_KV) {
    const data = await env.POBI_KV.get(key, "json");
    if (data) return data as UserRecord;
  }
  return memoryUserMap.get(key) || null;
}

async function saveUserToStore(user: UserRecord, env: Env): Promise<void> {
  const key = `user:${user.username.toLowerCase()}`;
  if (env.POBI_KV) {
    await env.POBI_KV.put(key, JSON.stringify(user));
    // 同步更新使用者清單索引
    let list: string[] = (await env.POBI_KV.get("user_index_list", "json")) || [];
    if (!list.includes(user.username.toLowerCase())) {
      list.push(user.username.toLowerCase());
      await env.POBI_KV.put("user_index_list", JSON.stringify(list));
    }
  }
  memoryUserMap.set(key, user);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 處理 CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 處理 API 狀態檢查
    if (url.pathname === "/api/status" && request.method === "GET") {
      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
      const limit = checkRateLimit(clientIp);
      return new Response(
        JSON.stringify({
          hasPublicApi: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0),
          dailyLimitPerUser: MAX_USER_DAILY,
          remainingToday: limit.remaining,
          isAvailable: limit.allowed,
        }),
        { headers: corsHeaders() }
      );
    }

    // ==================== 跨裝置雲端帳號認證 API ====================
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string; password?: string };
        const username = body.username?.trim();
        const password = body.password;

        if (!username || !password || password.length < 4) {
          return new Response(
            JSON.stringify({ success: false, error: "帳號與密碼格式不正確 (密碼需至少4字元)" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        const existing = await getUserFromStore(username, env);
        if (existing) {
          return new Response(
            JSON.stringify({ success: false, error: "此使用者名稱已被註冊，請切換至「會員登入」或更換一個未被使用的名稱" }),
            { status: 409, headers: corsHeaders() }
          );
        }

        const role: "admin" | "user" =
          username.toLowerCase() === "admin" || username.toLowerCase() === "developer" ? "admin" : "user";
        const newUser: UserRecord = {
          id: crypto.randomUUID(),
          username,
          password,
          role,
          createdAt: new Date().toISOString(),
        };

        await saveUserToStore(newUser, env);

        return new Response(
          JSON.stringify({
            success: true,
            user: { id: newUser.id, username: newUser.username, role: newUser.role },
          }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "註冊失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string; password?: string };
        const username = body.username?.trim();
        const password = body.password;

        if (!username || !password) {
          return new Response(
            JSON.stringify({ success: false, error: "請輸入使用者名稱與密碼" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        let user = await getUserFromStore(username, env);

        // 若尚未在雲端資料庫中，檢查是否為預設管理員/開發者帳號並自動播種
        if (!user) {
          if (username.toLowerCase() === "admin" && password === "admin888") {
            user = {
              id: "admin-root",
              username: "admin",
              password: "admin888",
              role: "admin",
              createdAt: new Date().toISOString(),
            };
            await saveUserToStore(user, env);
          } else if (username.toLowerCase() === "developer" && (password === "dev888" || password.length >= 4)) {
            user = {
              id: "dev-root",
              username: "developer",
              password: "dev888",
              role: "admin",
              createdAt: new Date().toISOString(),
            };
            await saveUserToStore(user, env);
          }
        }

        if (!user) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "找不到此使用者名稱，請切換至「註冊新帳號」或點擊下方「一次性申請開通開發者帳號」",
            }),
            { status: 404, headers: corsHeaders() }
          );
        }

        if (user.password !== password) {
          return new Response(
            JSON.stringify({ success: false, error: "密碼錯誤，請重新確認" }),
            { status: 401, headers: corsHeaders() }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            user: { id: user.id, username: user.username, role: user.role || "user" },
          }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "登入失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    if (url.pathname === "/api/auth/dev-setup" && request.method === "POST") {
      try {
        let dev = await getUserFromStore("developer", env);
        if (!dev) {
          dev = {
            id: "dev-root",
            username: "developer",
            password: "dev888",
            role: "admin",
            createdAt: new Date().toISOString(),
          };
          await saveUserToStore(dev, env);
        }
        return new Response(
          JSON.stringify({
            success: true,
            user: { id: dev.id, username: dev.username, role: "admin" },
          }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "開通失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    // 處理 Gemini API 安全代理
    if (url.pathname === "/api/gemini" && request.method === "POST") {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        return new Response(
          JSON.stringify({
            error: "NO_PUBLIC_KEY",
            message: "此站點尚未配置後端公用 API Key。請點擊右上角設定，貼上您在 Google AI Studio 申請的免費專屬 Key！",
          }),
          { status: 503, headers: corsHeaders() }
        );
      }

      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
      const limit = checkRateLimit(clientIp);
      if (!limit.allowed) {
        return new Response(
          JSON.stringify({
            error: "QUOTA_EXCEEDED",
            message: limit.reason,
          }),
          { status: 429, headers: corsHeaders() }
        );
      }

      try {
        const body = await request.json();
        const model = (body as { model?: string })?.model || "gemini-2.5-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          return new Response(
            JSON.stringify({
              error: "GEMINI_ERROR",
              message: `Google Gemini 伺服器回傳錯誤: ${geminiRes.status}`,
              detail: errText,
            }),
            { status: geminiRes.status, headers: corsHeaders() }
          );
        }

        const data = (await geminiRes.json()) as Record<string, any>;
        recordUsage(clientIp);

        const currentRemaining = Math.max(0, MAX_USER_DAILY - (ipUsageMap.get(clientIp)?.count || 0));

        return new Response(
          JSON.stringify({
            ...data,
            _quota: {
              remaining: currentRemaining,
              max: MAX_USER_DAILY,
            },
          }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: "INTERNAL_ERROR", message: err.message || "處理請求失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
