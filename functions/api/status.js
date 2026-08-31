// Cloudflare Pages Functions - /api/status
export async function onRequestGet(context) {
  const { request, env } = context;
  const rawKey = env ? (env.GEMINI_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '')) : '';
  const hasPublicApi = Boolean(rawKey && String(rawKey).trim().length > 0);

  return new Response(JSON.stringify({
    hasPublicApi,
    dailyLimitPerUser: 5,
    remainingToday: hasPublicApi ? 5 : 0,
    isAvailable: true,
    message: hasPublicApi ? '伺服器公用金鑰已就緒' : '伺服器未配置公用金鑰，建議在右上角「AI 設定」輸入自備 Gemini API Key 或使用本機離線 Tesseract OCR'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
