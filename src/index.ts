interface Env {
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
}

// 記憶體內簡易計數器 (Worker instance 級別防護)
const ipUsageMap = new Map<string, { count: number; date: string }>();
let globalDailyCount = 0;
let globalDate = "";

const MAX_USER_DAILY = 5;
const MAX_GLOBAL_DAILY = 200;

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
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
          { status: 503, headers: { "Content-Type": "application/json" } }
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
          { status: 429, headers: { "Content-Type": "application/json" } }
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
            { status: geminiRes.status, headers: { "Content-Type": "application/json" } }
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
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: "INTERNAL_ERROR", message: err.message || "處理請求失敗" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
