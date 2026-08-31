// Cloudflare Pages Functions - /api/gemini proxy
const ipUsageMap = new Map();
const MAX_USER_DAILY = 5;

function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const record = ipUsageMap.get(ip) || { date: today, count: 0 };
  if (record.date !== today) {
    record.date = today;
    record.count = 0;
  }
  if (record.count >= MAX_USER_DAILY) {
    return { allowed: false, remaining: 0, reason: '今日公用免費配額 (5次) 已用完，請在右上角「AI 設定」輸入您的個人金鑰！' };
  }
  return { allowed: true, remaining: MAX_USER_DAILY - record.count };
}

function recordUsage(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const record = ipUsageMap.get(ip) || { date: today, count: 0 };
  if (record.date !== today) {
    record.date = today;
    record.count = 0;
  }
  record.count += 1;
  ipUsageMap.set(ip, record);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const apiKey = env?.GEMINI_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '');

    if (!apiKey || String(apiKey).trim().length === 0) {
      return new Response(JSON.stringify({
        error: 'SERVER_KEY_NOT_CONFIGURED',
        message: '伺服器未配置 GEMINI_API_KEY。請在右上角「AI 設定」輸入您的個人 Google Gemini API Key，或直接使用「Tesseract.js 本機離線引擎」進行 100% 免費無限制辨識！'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
    const limit = checkRateLimit(clientIp);
    if (!limit.allowed) {
      return new Response(JSON.stringify({
        error: 'QUOTA_EXCEEDED',
        message: limit.reason
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const cleanKey = String(apiKey).trim();
    const model = body.model || 'gemini-3.6-flash';
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(cleanKey);

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
        detail: errText
      }), {
        status: geminiRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const data = await geminiRes.json();
    recordUsage(clientIp);
    const updatedLimit = checkRateLimit(clientIp);

    return new Response(JSON.stringify({
      ...data,
      _quota: {
        remaining: updatedLimit.remaining,
        max: MAX_USER_DAILY
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: err.message || 'AI 伺服器處理異常'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key'
    }
  });
}
