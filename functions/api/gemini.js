// Cloudflare Pages Functions - /api/gemini proxy
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'SERVER_KEY_NOT_CONFIGURED',
        message: '伺服器未配置 GEMINI_API_KEY。請在右上角「AI 設定」輸入您的個人 Google Gemini API Key，或直接使用「Tesseract.js 本機離線引擎」進行 100% 免費無限制辨識！'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const model = body.model || 'gemini-1.5-flash';
    const geminiUrl = https://generativelanguage.googleapis.com/v1beta/models/:generateContent?key=;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: body.contents,
        generationConfig: body.generationConfig
      })
    });

    const data = await geminiRes.text();
    return new Response(data, {
      status: geminiRes.status,
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
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
