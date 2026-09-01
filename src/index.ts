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
  encryptedVault?: { cipher: string; iv: string; salt: string; updatedAt?: string } | null;
}

interface QuotaState {
  max: number;
  remaining: number;
  used: number;
  usedPercent: number;
  remainingPercent: number;
  resetAt: number;
}

interface GlobalQuotaRecord {
  max: number;
  used: number;
  resetAt: number;
}

interface UserQuotaRecord {
  max: number;
  remaining: number;
  resetAt: number;
}

// 記憶體內簡易備援儲存
const memoryUserMap = new Map<string, UserRecord>();
const memoryUserQuotaMap = new Map<string, UserQuotaRecord>();

const RESET_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 小時 (毫秒)
const MAX_USER_5H = 5;
const MAX_GLOBAL_5H = 200;

let globalQuotaMemory: GlobalQuotaRecord = {
  max: MAX_GLOBAL_5H,
  used: 0,
  resetAt: Date.now() + RESET_INTERVAL_MS,
};

function corsHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-username, x-user-id",
    ...extra,
  };
}

// ==================== 全域 5 小時額度操作 ====================
async function getGlobalQuotaState(env: Env): Promise<{ state: QuotaState; raw: GlobalQuotaRecord }> {
  const now = Date.now();
  let record: GlobalQuotaRecord = { ...globalQuotaMemory };

  if (env.POBI_KV) {
    try {
      const data = await env.POBI_KV.get("quota_global_5h", "json");
      if (data) record = data as GlobalQuotaRecord;
    } catch {}
  }

  // 檢查是否超過 5 小時需自動重置
  if (!record.resetAt || now >= record.resetAt) {
    record = {
      max: MAX_GLOBAL_5H,
      used: 0,
      resetAt: now + RESET_INTERVAL_MS,
    };
    if (env.POBI_KV) {
      try {
        await env.POBI_KV.put("quota_global_5h", JSON.stringify(record));
      } catch {}
    }
    globalQuotaMemory = { ...record };
  }

  const used = Math.min(record.max, record.used || 0);
  const remaining = Math.max(0, record.max - used);
  const usedPercent = Number(((used / record.max) * 100).toFixed(1));
  const remainingPercent = Number(((remaining / record.max) * 100).toFixed(1));

  return {
    state: {
      max: record.max,
      remaining,
      used,
      usedPercent,
      remainingPercent,
      resetAt: record.resetAt,
    },
    raw: record,
  };
}

// ==================== 個人 5 小時額度操作 (依帳號嚴格區分) ====================
async function getUserQuotaState(username: string | null | undefined, ip: string, env: Env): Promise<QuotaState> {
  const now = Date.now();
  const key = username && username.trim() ? `user_quota:${username.trim()}` : `ip_quota:${ip}`;

  let record: UserQuotaRecord | null = null;

  if (env.POBI_KV) {
    try {
      record = (await env.POBI_KV.get(key, "json")) as UserQuotaRecord | null;
    } catch {}
  }

  if (!record) {
    record = memoryUserQuotaMap.get(key) || null;
  }

  // 若尚未初始化或已超過 5 小時，重置為 5 次
  if (!record || !record.resetAt || now >= record.resetAt) {
    record = {
      max: MAX_USER_5H,
      remaining: MAX_USER_5H,
      resetAt: now + RESET_INTERVAL_MS,
    };
    if (env.POBI_KV) {
      try {
        await env.POBI_KV.put(key, JSON.stringify(record));
      } catch {}
    }
    memoryUserQuotaMap.set(key, record);
  }

  const remaining = Math.max(0, Math.min(record.max, record.remaining));
  const used = record.max - remaining;
  const usedPercent = Number(((used / record.max) * 100).toFixed(1));
  const remainingPercent = Number(((remaining / record.max) * 100).toFixed(1));

  return {
    max: record.max,
    remaining,
    used,
    usedPercent,
    remainingPercent,
    resetAt: record.resetAt,
  };
}

// 扣除配額輔助
async function deductQuota(username: string | null | undefined, ip: string, env: Env): Promise<{ success: boolean; userQuota: QuotaState; globalQuota: QuotaState; reason?: string }> {
  const { state: globalState, raw: globalRaw } = await getGlobalQuotaState(env);
  if (globalState.remaining <= 0) {
    return {
      success: false,
      globalQuota: globalState,
      userQuota: await getUserQuotaState(username, ip, env),
      reason: `全站 5 小時公用 API 總配額池已達上限 (${MAX_GLOBAL_5H}次/5小時)。將於 ${new Date(globalState.resetAt).toLocaleTimeString()} 重置，請填入自備 API Key 繼續使用！`,
    };
  }

  const userState = await getUserQuotaState(username, ip, env);
  if (userState.remaining <= 0) {
    return {
      success: false,
      globalQuota: globalState,
      userQuota: userState,
      reason: `您帳號的 5 小時公用配額 (${MAX_USER_5H}次) 已用完。將於 ${new Date(userState.resetAt).toLocaleTimeString()} 重置，請填入自備 API Key 解鎖無限使用！`,
    };
  }

  // 執行扣除
  const key = username && username.trim() ? `user_quota:${username.trim()}` : `ip_quota:${ip}`;
  const newUserRecord: UserQuotaRecord = {
    max: MAX_USER_5H,
    remaining: userState.remaining - 1,
    resetAt: userState.resetAt,
  };

  if (env.POBI_KV) {
    try {
      await env.POBI_KV.put(key, JSON.stringify(newUserRecord));
      globalRaw.used = (globalRaw.used || 0) + 1;
      await env.POBI_KV.put("quota_global_5h", JSON.stringify(globalRaw));
    } catch {}
  }

  memoryUserQuotaMap.set(key, newUserRecord);
  globalQuotaMemory.used = (globalQuotaMemory.used || 0) + 1;

  const updatedUser = await getUserQuotaState(username, ip, env);
  const { state: updatedGlobal } = await getGlobalQuotaState(env);

  return {
    success: true,
    userQuota: updatedUser,
    globalQuota: updatedGlobal,
  };
}

// 雲端使用者資料操作輔助 (嚴格大小寫區分)
async function getUserFromStore(username: string, env: Env): Promise<UserRecord | null> {
  const key = `user:${username}`;
  if (env.POBI_KV) {
    try {
      const data = await env.POBI_KV.get(key, "json");
      if (data) return data as UserRecord;
    } catch {}
  }
  return memoryUserMap.get(key) || null;
}

async function saveUserToStore(user: UserRecord, env: Env): Promise<void> {
  const key = `user:${user.username}`;
  if (env.POBI_KV) {
    try {
      await env.POBI_KV.put(key, JSON.stringify(user));
      let list: string[] = (await env.POBI_KV.get("user_index_list", "json")) || [];
      if (!list.includes(user.username)) {
        list.push(user.username);
        await env.POBI_KV.put("user_index_list", JSON.stringify(list));
      }
    } catch {}
  }
  memoryUserMap.set(key, user);
}

// 清空所有使用者資料
async function clearAllUsersFromStore(env: Env): Promise<number> {
  let count = 0;
  if (env.POBI_KV) {
    try {
      const list: string[] = (await env.POBI_KV.get("user_index_list", "json")) || [];
      for (const u of list) {
        await env.POBI_KV.delete(`user:${u}`);
        await env.POBI_KV.delete(`user_quota:${u}`);
        count++;
      }
      await env.POBI_KV.delete("user_index_list");
    } catch {}
  }
  count += memoryUserMap.size;
  memoryUserMap.clear();
  memoryUserQuotaMap.clear();
  return count;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 處理 CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
    const reqUsername = request.headers.get("x-username") || url.searchParams.get("username") || "";

    // 處理 API 狀態檢查與百分比儀表查詢
    if (url.pathname === "/api/status" && request.method === "GET") {
      const { state: globalState } = await getGlobalQuotaState(env);
      const userState = await getUserQuotaState(reqUsername, clientIp, env);

      return new Response(
        JSON.stringify({
          hasPublicApi: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0),
          global: globalState,
          user: userState,
          isAvailable: globalState.remaining > 0 && userState.remaining > 0,
        }),
        { headers: corsHeaders() }
      );
    }

    // ==================== 跨裝置雲端帳號認證 API (嚴格大小寫) ====================
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string; password?: string };
        const username = body.username ? String(body.username).trim() : "";
        const password = body.password ? String(body.password) : "";

        if (!username || !password || password.length < 4) {
          return new Response(
            JSON.stringify({ success: false, error: "帳號與密碼格式不正確 (密碼需至少4字元)" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        // 嚴格大小寫比對
        const existing = await getUserFromStore(username, env);
        if (existing) {
          return new Response(
            JSON.stringify({ success: false, error: "此使用者名稱已被註冊，請切換至「會員登入」或更換名稱 (注意：英文字母嚴格區分大小寫)" }),
            { status: 409, headers: corsHeaders() }
          );
        }

        // 任何自訂註冊帳號均享有完整管理與工作站最高權限
        const role: "admin" | "user" = "admin";
        const newUser: UserRecord = {
          id: crypto.randomUUID(),
          username, // 保持精確大小寫
          password, // 保持精確大小寫
          role,
          createdAt: new Date().toISOString(),
        };

        await saveUserToStore(newUser, env);
        const userQuota = await getUserQuotaState(newUser.username, clientIp, env);
        const { state: globalQuota } = await getGlobalQuotaState(env);

        return new Response(
          JSON.stringify({
            success: true,
            user: { id: newUser.id, username: newUser.username, role: newUser.role },
            quota: { user: userQuota, global: globalQuota },
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
        const username = body.username ? String(body.username).trim() : "";
        const password = body.password ? String(body.password) : "";

        if (!username || !password) {
          return new Response(
            JSON.stringify({ success: false, error: "請輸入使用者名稱與密碼 (注意英文大小寫)" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        let user = await getUserFromStore(username, env);

        // 若為預設系統管理員帳號，自動安全播種 (精確大小寫)
        if (!user) {
          if (username === "admin" && password === "admin888") {
            user = {
              id: "admin-root",
              username: "admin",
              password: "admin888",
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
              error: "查無此使用者名稱，請確認英文大小寫是否完全正確，或切換至「註冊新帳號」",
            }),
            { status: 404, headers: corsHeaders() }
          );
        }

        // 嚴格比對帳號與密碼 (Case-sensitive)
        if (user.username !== username || user.password !== password) {
          return new Response(
            JSON.stringify({ success: false, error: "帳號或密碼錯誤，請注意英文字母大小寫！" }),
            { status: 401, headers: corsHeaders() }
          );
        }

        // 登入時即時同步 5 小時配額 (每 5 小時自動重置)
        const userQuota = await getUserQuotaState(user.username, clientIp, env);
        const { state: globalQuota } = await getGlobalQuotaState(env);

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              id: user.id,
              username: user.username,
              role: user.role || "user",
              encryptedVault: user.encryptedVault || null,
            },
            quota: { user: userQuota, global: globalQuota },
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

    // POST /api/auth/save-vault (使用者同步端到端加密保險箱密文)
    if (url.pathname === "/api/auth/save-vault" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string; vault?: { cipher?: string; iv?: string; salt?: string } };
        const username = body.username ? String(body.username).trim() : "";
        const vault = body.vault;

        if (!username || !vault || !vault.cipher || !vault.iv || !vault.salt) {
          return new Response(
            JSON.stringify({ success: false, error: "無效的加密保險箱資料" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        const user = await getUserFromStore(username, env);
        if (!user) {
          return new Response(
            JSON.stringify({ success: false, error: "使用者不存在" }),
            { status: 404, headers: corsHeaders() }
          );
        }

        user.encryptedVault = {
          cipher: String(vault.cipher),
          iv: String(vault.iv),
          salt: String(vault.salt),
          updatedAt: new Date().toISOString()
        };

        await saveUserToStore(user, env);

        return new Response(
          JSON.stringify({ success: true, message: "加密保險箱密文已安全同步至雲端 (零知識儲存)" }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "儲存失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    // POST /api/auth/clear-vault (使用者清除雲端保險箱)
    if (url.pathname === "/api/auth/clear-vault" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string };
        const username = body.username ? String(body.username).trim() : "";

        if (!username) {
          return new Response(
            JSON.stringify({ success: false, error: "未指定使用者" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        const user = await getUserFromStore(username, env);
        if (user) {
          user.encryptedVault = null;
          await saveUserToStore(user, env);
        }

        return new Response(
          JSON.stringify({ success: true, message: "已清除雲端加密保險箱" }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "清除失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    if (url.pathname === "/api/auth/dev-setup" && request.method === "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "開發者一鍵開通功能已鎖定停用。請切換至「註冊新帳號」建立專屬管理員帳號！" }),
        { status: 403, headers: corsHeaders() }
      );
    }

    // POST /api/auth/reset-request (使用者送出密碼重設申請)
    if (url.pathname === "/api/auth/reset-request" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string; contact?: string; newPassword?: string; note?: string };
        const username = body.username ? String(body.username).trim() : "";
        const contact = body.contact ? String(body.contact).trim() : "";
        const newPassword = body.newPassword ? String(body.newPassword) : "";
        const note = body.note ? String(body.note).trim() : "";

        if (!username || !newPassword || newPassword.length < 4) {
          return new Response(
            JSON.stringify({ success: false, error: "請填寫正確的使用者名稱與新密碼 (至少 4 字元)" }),
            { status: 400, headers: corsHeaders() }
          );
        }

        const user = await getUserFromStore(username, env);
        if (!user) {
          return new Response(
            JSON.stringify({ success: false, error: "找不到此使用者名稱，請確認帳號大小寫是否正確！" }),
            { status: 404, headers: corsHeaders() }
          );
        }

        let reqList: any[] = [];
        if (env && env.POBI_KV) {
          try {
            reqList = (await env.POBI_KV.get("pobi_reset_requests", "json")) || [];
          } catch (e) {}
        }

        const newTicket = {
          id: crypto.randomUUID(),
          username: user.username,
          contact: contact || "未提供",
          newPassword,
          note: note || "",
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        reqList.unshift(newTicket);
        if (reqList.length > 100) reqList = reqList.slice(0, 100);

        if (env && env.POBI_KV) {
          try {
            await env.POBI_KV.put("pobi_reset_requests", JSON.stringify(reqList));
          } catch (e) {}
        }

        return new Response(
          JSON.stringify({ success: true, message: "密碼重設申請已成功送出！請靜候管理員在後台審核核准。" }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "申請失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    // GET /api/auth/reset-list (管理員讀取重設申請列表)
    if (url.pathname === "/api/auth/reset-list" && request.method === "GET") {
      try {
        let reqList: any[] = [];
        if (env && env.POBI_KV) {
          try {
            reqList = (await env.POBI_KV.get("pobi_reset_requests", "json")) || [];
          } catch (e) {}
        }
        return new Response(
          JSON.stringify({ success: true, requests: reqList }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "讀取失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    // POST /api/auth/reset-approve (管理員審核並正式更新密碼)
    if (url.pathname === "/api/auth/reset-approve" && request.method === "POST") {
      try {
        const body = (await request.json()) as { requestId?: string };
        const requestId = body.requestId;

        let reqList: any[] = [];
        if (env && env.POBI_KV) {
          try {
            reqList = (await env.POBI_KV.get("pobi_reset_requests", "json")) || [];
          } catch (e) {}
        }

        const ticket = reqList.find((r: any) => r.id === requestId);
        if (!ticket) {
          return new Response(
            JSON.stringify({ success: false, error: "找不到該筆申請工單" }),
            { status: 404, headers: corsHeaders() }
          );
        }

        if (ticket.status !== "pending") {
          return new Response(
            JSON.stringify({ success: false, error: `該申請工單已被處理過 (狀態: ${ticket.status})` }),
            { status: 400, headers: corsHeaders() }
          );
        }

        const user = await getUserFromStore(ticket.username, env);
        if (!user) {
          return new Response(
            JSON.stringify({ success: false, error: "找不到欲修改的使用者帳號" }),
            { status: 404, headers: corsHeaders() }
          );
        }

        // 正式依據工單核准修改雲端密碼
        user.password = ticket.newPassword;
        await saveUserToStore(user, env);

        ticket.status = "approved";
        ticket.approvedAt = new Date().toISOString();

        if (env && env.POBI_KV) {
          try {
            await env.POBI_KV.put("pobi_reset_requests", JSON.stringify(reqList));
          } catch (e) {}
        }

        return new Response(
          JSON.stringify({ success: true, message: `已成功核准並將使用者「${user.username}」之密碼更新完成！` }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "核准失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    // POST /api/auth/reset-reject (管理員駁回重設申請)
    if (url.pathname === "/api/auth/reset-reject" && request.method === "POST") {
      try {
        const body = (await request.json()) as { requestId?: string };
        const requestId = body.requestId;

        let reqList: any[] = [];
        if (env && env.POBI_KV) {
          try {
            reqList = (await env.POBI_KV.get("pobi_reset_requests", "json")) || [];
          } catch (e) {}
        }

        const ticket = reqList.find((r: any) => r.id === requestId);
        if (!ticket) {
          return new Response(
            JSON.stringify({ success: false, error: "找不到該筆申請工單" }),
            { status: 404, headers: corsHeaders() }
          );
        }

        ticket.status = "rejected";
        ticket.rejectedAt = new Date().toISOString();

        if (env && env.POBI_KV) {
          try {
            await env.POBI_KV.put("pobi_reset_requests", JSON.stringify(reqList));
          } catch (e) {}
        }

        return new Response(
          JSON.stringify({ success: true, message: "已成功駁回該筆密碼重設申請" }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "駁回失敗" }),
          { status: 500, headers: corsHeaders() }
        );
      }
    }

    // 清空所有使用者 (需求 1)
    if (url.pathname === "/api/auth/clear-all" && request.method === "POST") {
      try {
        const cleared = await clearAllUsersFromStore(env);
        return new Response(
          JSON.stringify({ success: true, message: `已清空 ${cleared} 位使用者帳號與配額快取` }),
          { headers: corsHeaders() }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "清空失敗" }),
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

      let body: any = {};
      try {
        body = await request.json();
      } catch {}

      const username = body?._username || request.headers.get("x-username") || "";

      // 檢查並扣除 5 小時配額 (全域池與個人帳號配額)
      const deduct = await deductQuota(username, clientIp, env);
      if (!deduct.success) {
        return new Response(
          JSON.stringify({
            error: "QUOTA_EXCEEDED",
            message: deduct.reason,
            userQuota: deduct.userQuota,
            globalQuota: deduct.globalQuota,
          }),
          { status: 429, headers: corsHeaders() }
        );
      }

      try {
        const model = body?.model || "gemini-1.5-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 移除輔助欄位
        delete body._username;

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
              userQuota: deduct.userQuota,
              globalQuota: deduct.globalQuota,
            }),
            { status: geminiRes.status, headers: corsHeaders() }
          );
        }

        const data = (await geminiRes.json()) as Record<string, any>;

        return new Response(
          JSON.stringify({
            ...data,
            _quota: {
              user: deduct.userQuota,
              global: deduct.globalQuota,
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
