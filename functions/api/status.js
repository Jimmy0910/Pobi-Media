// Cloudflare Pages Functions - /api/status

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-username, x-user-id',
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawKey = env ? (env.GEMINI_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '')) : '';
  const hasPublicApi = Boolean(rawKey && String(rawKey).trim().length > 0);

  const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
  const reqUsername = request.headers.get('x-username') || url.searchParams.get('username') || '';

  const { state: globalState } = await getGlobalQuotaState(env);
  const userState = await getUserQuotaState(reqUsername, clientIp, env);

  return new Response(JSON.stringify({
    hasPublicApi,
    global: globalState,
    user: userState,
    isAvailable: hasPublicApi && globalState.remaining > 0 && userState.remaining > 0,
    message: hasPublicApi ? '伺服器公用金鑰已就緒' : '伺服器未配置公用金鑰，建議在右上角「AI 設定」輸入自備 Gemini API Key 或使用本機離線 Tesseract OCR'
  }), {
    headers: corsHeaders()
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
