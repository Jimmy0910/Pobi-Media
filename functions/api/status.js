// Cloudflare Pages Functions - /api/status
export async function onRequestGet(context) {
  const { env } = context;
  const hasPublicApi = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);

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
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
