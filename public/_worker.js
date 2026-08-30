// Cloudflare Pages Advanced Mode _worker.js
const memoryUserMap = new Map();
const ipUsageMap = new Map();
let globalDailyCount = 0;
let globalDate = "";

const MAX_USER_DAILY = 5;
const MAX_GLOBAL_DAILY = 200;

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function corsHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  };
}

function checkRateLimit(ip) {
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
  const currentUsage = ipUsageMap.get(ip);
  if (currentUsage.count >= MAX_USER_DAILY) {
    return {
      allowed: false,
      remaining: 0,
      reason: "您今日的公用配額已用完，請貼上自備 API Key 解鎖無限使用，或使用純演算法",
    };
  }
  return {
    allowed: true,
    remaining: MAX_USER_DAILY - currentUsage.count,
  };
}

function recordUsage(ip) {
  const today = getTodayString();
  globalDailyCount++;
  const userRecord = ipUsageMap.get(ip);
  if (userRecord && userRecord.date === today) {
    userRecord.count++;
  } else {
    ipUsageMap.set(ip, { count: 1, date: today });
  }
}

async function getUserFromStore(username, env) {
  const key = "user:" + username.toLowerCase();
  if (env && env.POBI_KV) {
    try {
      const data = await env.POBI_KV.get(key, "json");
      if (data) return data;
    } catch (e) {}
  }
  return memoryUserMap.get(key) || null;
}

async function saveUserToStore(user, env) {
  const key = "user:" + user.username.toLowerCase();
  if (env && env.POBI_KV) {
    try {
      await env.POBI_KV.put(key, JSON.stringify(user));
      let list = (await env.POBI_KV.get("user_index_list", "json")) || [];
      if (!list.includes(user.username.toLowerCase())) {
        list.push(user.username.toLowerCase());
        await env.POBI_KV.put("user_index_list", JSON.stringify(list));
      }
    } catch (e) {}
  }
  memoryUserMap.set(key, user);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
      const limit = checkRateLimit(clientIp);
      const hasPublicApi = Boolean(env && env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
      return new Response(
        JSON.stringify({
          hasPublicApi,
          dailyLimitPerUser: MAX_USER_DAILY,
          remainingToday: hasPublicApi ? limit.remaining : 0,
          isAvailable: limit.allowed,
          message: hasPublicApi ? "伺服器公用金鑰已就緒" : "伺服器未配置公用金鑰，建議在右上角「AI 設定」輸入自備 Gemini API Key 或使用本機離線 Tesseract OCR"
        }),
        { headers: corsHeaders() }
      );
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = await request.json();
        const username = body.username ? body.username.trim() : "";
        const password = body.password || "";
        if (!username || !password || password.length < 4) {
          return new Response(JSON.stringify({ success: false, error: "帳號與密碼格式不正確 (密碼需至少4字元)" }), { status: 400, headers: corsHeaders() });
        }
        const existing = await getUserFromStore(username, env);
        if (existing) {
          return new Response(JSON.stringify({ success: false, error: "此使用者名稱已被註冊，請切換至「會員登入」" }), { status: 409, headers: corsHeaders() });
        }
        const role = (username.toLowerCase() === "admin" || username.toLowerCase() === "developer") ? "admin" : "user";
        const newUser = { id: crypto.randomUUID(), username, password, role, createdAt: new Date().toISOString() };
        await saveUserToStore(newUser, env);
        return new Response(JSON.stringify({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } }), { headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message || "註冊失敗" }), { status: 500, headers: corsHeaders() });
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const username = body.username ? body.username.trim() : "";
        const password = body.password || "";
        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, error: "請輸入使用者名稱與密碼" }), { status: 400, headers: corsHeaders() });
        }
        let user = await getUserFromStore(username, env);
        if (!user) {
          if (username.toLowerCase() === "admin" && password === "admin888") {
            user = { id: "admin-root", username: "admin", password: "admin888", role: "admin", createdAt: new Date().toISOString() };
            await saveUserToStore(user, env);
          } else if (username.toLowerCase() === "developer" && (password === "dev888" || password.length >= 4)) {
            user = { id: "dev-root", username: "developer", password: "dev888", role: "admin", createdAt: new Date().toISOString() };
            await saveUserToStore(user, env);
          }
        }
        if (!user) {
          return new Response(JSON.stringify({ success: false, error: "使用者不存在，請先切換至「註冊」建立帳號" }), { status: 404, headers: corsHeaders() });
        }
        if (user.password !== password) {
          return new Response(JSON.stringify({ success: false, error: "密碼不正確，請重新輸入" }), { status: 401, headers: corsHeaders() });
        }
        return new Response(JSON.stringify({ success: true, user: { id: user.id, username: user.username, role: user.role || "user" } }), { headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message || "登入失敗" }), { status: 500, headers: corsHeaders() });
      }
    }

    if (url.pathname === "/api/auth/dev-setup" && request.method === "POST") {
      try {
        let dev = await getUserFromStore("developer", env);
        if (!dev) {
          dev = { id: "dev-root", username: "developer", password: "dev888", role: "admin", createdAt: new Date().toISOString() };
          await saveUserToStore(dev, env);
        }
        return new Response(JSON.stringify({ success: true, user: { id: dev.id, username: dev.username, role: "admin" } }), { headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message || "開通失敗" }), { status: 500, headers: corsHeaders() });
      }
    }

    if (url.pathname === "/api/gemini" && request.method === "POST") {
      const apiKey = env && env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        return new Response(JSON.stringify({ error: "NO_PUBLIC_KEY", message: "此站點尚未配置後端 GEMINI_API_KEY。請點擊右上角貼上自備的免費 API Key，或直接使用離線 Tesseract OCR！" }), { status: 503, headers: corsHeaders() });
      }
      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
      const limit = checkRateLimit(clientIp);
      if (!limit.allowed) {
        return new Response(JSON.stringify({ error: "QUOTA_EXCEEDED", message: limit.reason }), { status: 429, headers: corsHeaders() });
      }
      try {
        const body = await request.json();
        const model = body.model || "gemini-1.5-flash";
        const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
        const geminiRes = await fetch(geminiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          return new Response(JSON.stringify({ error: "GEMINI_ERROR", message: "Google Gemini 伺服器回傳錯誤: " + geminiRes.status, detail: errText }), { status: geminiRes.status, headers: corsHeaders() });
        }
        const data = await geminiRes.json();
        recordUsage(clientIp);
        const currentRemaining = Math.max(0, MAX_USER_DAILY - (ipUsageMap.get(clientIp)?.count || 0));
        return new Response(JSON.stringify({ ...data, _quota: { remaining: currentRemaining, max: MAX_USER_DAILY } }), { headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ error: "INTERNAL_ERROR", message: err.message || "處理請求失敗" }), { status: 500, headers: corsHeaders() });
      }
    }

    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return fetch(request);
  }
};
