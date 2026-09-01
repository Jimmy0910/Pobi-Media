// Cloudflare Pages Functions - /api/gemini proxy

const memoryUserQuotaMap = new Map();
const RESET_INTERVAL_MS = 5 * 60 * 60 * 1000;
const MAX_USER_5H = 5;
const MAX_GLOBAL_5H = 200;

let globalQuotaMemory = {
  max: MAX_GLOBAL_5H,
  used: 0,
  resetAt: Date.now() + RESET_INTERVAL_MS,
};

function corsHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, x-username, x-user-id',
    ...extra,
  };
}

async function getGlobalQuotaState(env) {
  const now = Date.now();
  let record = { ...globalQuotaMemory };

  if (env && env.POBI_KV) {
    try {
      const data = await env.POBI_KV.get('quota_global_5h', 'json');
      if (data) record = data;
    } catch (e) {}
  }

  if (!record.resetAt || now >= record.resetAt) {
    record = {
      max: MAX_GLOBAL_5H,
      used: 0,
      resetAt: now + RESET_INTERVAL_MS,
    };
    if (env && env.POBI_KV) {
      try {
        await env.POBI_KV.put('quota_global_5h', JSON.stringify(record));
      } catch (e) {}
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

async function getUserQuotaState(username, ip, env) {
  const now = Date.now();
  const key = username && username.trim() ? `user_quota:${username.trim()}` : `ip_quota:${ip}`;
  let record = null;

  if (env && env.POBI_KV) {
    try {
      record = await env.POBI_KV.get(key, 'json');
    } catch (e) {}
  }

  if (!record) {
    record = memoryUserQuotaMap.get(key) || null;
  }

  if (!record || !record.resetAt || now >= record.resetAt) {
    record = {
      max: MAX_USER_5H,
      remaining: MAX_USER_5H,
      resetAt: now + RESET_INTERVAL_MS,
    };
    if (env && env.POBI_KV) {
      try {
        await env.POBI_KV.put(key, JSON.stringify(record));
      } catch (e) {}
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

async function deductQuota(username, ip, env) {
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

  const key = username && username.trim() ? `user_quota:${username.trim()}` : `ip_quota:${ip}`;
  const newUserRecord = {
    max: MAX_USER_5H,
    remaining: userState.remaining - 1,
    resetAt: userState.resetAt,
  };

  if (env && env.POBI_KV) {
    try {
      await env.POBI_KV.put(key, JSON.stringify(newUserRecord));
      globalRaw.used = (globalRaw.used || 0) + 1;
      await env.POBI_KV.put('quota_global_5h', JSON.stringify(globalRaw));
    } catch (e) {}
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

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const apiKey = env?.GEMINI_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '');

    if (!apiKey || String(apiKey).trim().length === 0) {
      return new Response(JSON.stringify({
        error: 'SERVER_KEY_NOT_CONFIGURED',
        message: '伺服器未配置 GEMINI_API_KEY。請在右上角「API 設定」輸入您的個人 Google Gemini API Key，或直接使用「Tesseract.js 本機離線引擎」進行 100% 免費無限制辨識！'
      }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
    const username = body?._username || request.headers.get('x-username') || '';

    const deduct = await deductQuota(username, clientIp, env);
    if (!deduct.success) {
      return new Response(JSON.stringify({
        error: 'QUOTA_EXCEEDED',
        message: deduct.reason,
        userQuota: deduct.userQuota,
        globalQuota: deduct.globalQuota,
      }), {
        status: 429,
        headers: corsHeaders()
      });
    }

    const cleanKey = String(apiKey).trim();
    const model = body.model || 'gemini-1.5-flash';
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(cleanKey);

    delete body._username;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey
      },
      body: JSON.stringify({
        contents: body.contents,
        generationConfig: body.generationConfig
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({
        error: 'GEMINI_ERROR',
        message: 'Google Gemini 官方回傳錯誤: ' + geminiRes.status,
        detail: errText,
        userQuota: deduct.userQuota,
        globalQuota: deduct.globalQuota,
      }), {
        status: geminiRes.status,
        headers: corsHeaders()
      });
    }

    const data = await geminiRes.json();

    return new Response(JSON.stringify({
      ...data,
      _quota: {
        user: deduct.userQuota,
        global: deduct.globalQuota,
      }
    }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: err.message || 'AI 伺服器處理異常'
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
