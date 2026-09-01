// Cloudflare Pages Functions: /api/auth/[action]

const memoryUserMap = new Map();
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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

async function getUserFromStore(username, env) {
  const key = 'user:' + username;
  if (env && env.POBI_KV) {
    try {
      const data = await env.POBI_KV.get(key, 'json');
      if (data) return data;
    } catch (e) {}
  }
  return memoryUserMap.get(key) || null;
}

async function saveUserToStore(user, env) {
  const key = 'user:' + user.username;
  if (env && env.POBI_KV) {
    try {
      await env.POBI_KV.put(key, JSON.stringify(user));
      let list = (await env.POBI_KV.get('user_index_list', 'json')) || [];
      if (!list.includes(user.username)) {
        list.push(user.username);
        await env.POBI_KV.put('user_index_list', JSON.stringify(list));
      }
    } catch (e) {}
  }
  memoryUserMap.set(key, user);
}

async function clearAllUsersFromStore(env) {
  let count = 0;
  if (env && env.POBI_KV) {
    try {
      const list = (await env.POBI_KV.get('user_index_list', 'json')) || [];
      for (const u of list) {
        await env.POBI_KV.delete(`user:${u}`);
        await env.POBI_KV.delete(`user_quota:${u}`);
        count++;
      }
      await env.POBI_KV.delete('user_index_list');
    } catch (e) {}
  }
  count += memoryUserMap.size;
  memoryUserMap.clear();
  memoryUserQuotaMap.clear();
  return count;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const action = params.action || '';
  const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // POST /api/auth/register
  if (action === 'register' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = body.username ? String(body.username).trim() : '';
      const password = body.password ? String(body.password) : '';

      if (!username || !password || password.length < 4) {
        return new Response(
          JSON.stringify({ success: false, error: '帳號與密碼格式不正確 (密碼需至少4字元)' }),
          { status: 400, headers: corsHeaders() }
        );
      }

      // 嚴格大小寫比對
      const existing = await getUserFromStore(username, env);
      if (existing) {
        return new Response(
          JSON.stringify({ success: false, error: '此使用者名稱已被註冊，請切換至「會員登入」或更換名稱 (注意：英文字母嚴格區分大小寫)' }),
          { status: 409, headers: corsHeaders() }
        );
      }

      // 任何自訂註冊帳號均享有完整管理與工作站最高權限
      const role = 'admin';
      const newUser = {
        id: crypto.randomUUID(),
        username,
        password,
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
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '註冊失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/login
  if (action === 'login' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = body.username ? String(body.username).trim() : '';
      const password = body.password ? String(body.password) : '';

      if (!username || !password) {
        return new Response(
          JSON.stringify({ success: false, error: '請輸入使用者名稱與密碼 (注意英文大小寫)' }),
          { status: 400, headers: corsHeaders() }
        );
      }

      let user = await getUserFromStore(username, env);

      if (!user) {
        if (username === 'admin' && password === 'admin888') {
          user = {
            id: 'admin-root',
            username: 'admin',
            password: 'admin888',
            role: 'admin',
            createdAt: new Date().toISOString(),
          };
          await saveUserToStore(user, env);
        }
      }

      if (!user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: '查無此使用者名稱，請確認英文大小寫是否完全正確，或切換至「註冊新帳號」',
          }),
          { status: 404, headers: corsHeaders() }
        );
      }

      // 嚴格比對帳號與密碼 (Case-sensitive)
      if (user.username !== username || user.password !== password) {
        return new Response(
          JSON.stringify({ success: false, error: '帳號或密碼錯誤，請注意英文字母大小寫！' }),
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
            role: user.role || 'user',
            encryptedVault: user.encryptedVault || null,
          },
          quota: { user: userQuota, global: globalQuota },
        }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '登入失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/save-vault (使用者同步端到端加密保險箱密文)
  if (action === 'save-vault' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = body.username ? String(body.username).trim() : '';
      const vault = body.vault; // { cipher, iv, salt }

      if (!username || !vault || !vault.cipher || !vault.iv || !vault.salt) {
        return new Response(
          JSON.stringify({ success: false, error: '無效的加密保險箱資料' }),
          { status: 400, headers: corsHeaders() }
        );
      }

      const user = await getUserFromStore(username, env);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: '使用者不存在' }),
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
        JSON.stringify({ success: true, message: '加密保險箱密文已安全同步至雲端 (零知識儲存)' }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '儲存失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/clear-vault (使用者清除雲端保險箱)
  if (action === 'clear-vault' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = body.username ? String(body.username).trim() : '';

      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: '未指定使用者' }),
          { status: 400, headers: corsHeaders() }
        );
      }

      const user = await getUserFromStore(username, env);
      if (user) {
        user.encryptedVault = null;
        await saveUserToStore(user, env);
      }

      return new Response(
        JSON.stringify({ success: true, message: '已清除雲端加密保險箱' }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '清除失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/dev-setup
  if (action === 'dev-setup' && request.method === 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: '開發者一鍵開通功能已鎖定停用。請切換至「註冊新帳號」建立專屬管理員帳號！' }),
      { status: 403, headers: corsHeaders() }
    );
  }

  // POST /api/auth/reset-request (使用者送出密碼重設申請)
  if (action === 'reset-request' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = body.username ? String(body.username).trim() : '';
      const contact = body.contact ? String(body.contact).trim() : '';
      const newPassword = body.newPassword ? String(body.newPassword) : '';
      const note = body.note ? String(body.note).trim() : '';

      if (!username || !newPassword || newPassword.length < 4) {
        return new Response(
          JSON.stringify({ success: false, error: '請填寫正確的使用者名稱與新密碼 (至少 4 字元)' }),
          { status: 400, headers: corsHeaders() }
        );
      }

      const user = await getUserFromStore(username, env);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: '找不到此使用者名稱，請確認帳號大小寫是否正確！' }),
          { status: 404, headers: corsHeaders() }
        );
      }

      let reqList = [];
      if (env && env.POBI_KV) {
        try {
          reqList = (await env.POBI_KV.get('pobi_reset_requests', 'json')) || [];
        } catch (e) {}
      }

      const newTicket = {
        id: crypto.randomUUID(),
        username: user.username,
        contact: contact || '未提供',
        newPassword,
        note: note || '',
        status: 'pending', // 'pending' | 'approved' | 'rejected'
        createdAt: new Date().toISOString(),
      };

      reqList.unshift(newTicket);
      if (reqList.length > 100) reqList = reqList.slice(0, 100);

      if (env && env.POBI_KV) {
        try {
          await env.POBI_KV.put('pobi_reset_requests', JSON.stringify(reqList));
        } catch (e) {}
      }

      return new Response(
        JSON.stringify({ success: true, message: '密碼重設申請已成功送出！請靜候管理員在後台審核核准。' }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '申請失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // GET /api/auth/reset-list (管理員讀取重設申請列表)
  if (action === 'reset-list' && request.method === 'GET') {
    try {
      let reqList = [];
      if (env && env.POBI_KV) {
        try {
          reqList = (await env.POBI_KV.get('pobi_reset_requests', 'json')) || [];
        } catch (e) {}
      }
      return new Response(
        JSON.stringify({ success: true, requests: reqList }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '讀取失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/reset-approve (管理員審核並正式更新密碼)
  if (action === 'reset-approve' && request.method === 'POST') {
    try {
      const body = await request.json();
      const requestId = body.requestId;

      let reqList = [];
      if (env && env.POBI_KV) {
        try {
          reqList = (await env.POBI_KV.get('pobi_reset_requests', 'json')) || [];
        } catch (e) {}
      }

      const ticket = reqList.find(r => r.id === requestId);
      if (!ticket) {
        return new Response(
          JSON.stringify({ success: false, error: '找不到該筆申請工單' }),
          { status: 404, headers: corsHeaders() }
        );
      }

      if (ticket.status !== 'pending') {
        return new Response(
          JSON.stringify({ success: false, error: `該申請工單已被處理過 (狀態: ${ticket.status})` }),
          { status: 400, headers: corsHeaders() }
        );
      }

      const user = await getUserFromStore(ticket.username, env);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: '找不到欲修改的使用者帳號' }),
          { status: 404, headers: corsHeaders() }
        );
      }

      // 正式依據工單核准修改雲端密碼
      user.password = ticket.newPassword;
      await saveUserToStore(user, env);

      ticket.status = 'approved';
      ticket.approvedAt = new Date().toISOString();

      if (env && env.POBI_KV) {
        try {
          await env.POBI_KV.put('pobi_reset_requests', JSON.stringify(reqList));
        } catch (e) {}
      }

      return new Response(
        JSON.stringify({ success: true, message: `已成功核准並將使用者「${user.username}」之密碼更新完成！` }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '核准失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/reset-reject (管理員駁回重設申請)
  if (action === 'reset-reject' && request.method === 'POST') {
    try {
      const body = await request.json();
      const requestId = body.requestId;

      let reqList = [];
      if (env && env.POBI_KV) {
        try {
          reqList = (await env.POBI_KV.get('pobi_reset_requests', 'json')) || [];
        } catch (e) {}
      }

      const ticket = reqList.find(r => r.id === requestId);
      if (!ticket) {
        return new Response(
          JSON.stringify({ success: false, error: '找不到該筆申請工單' }),
          { status: 404, headers: corsHeaders() }
        );
      }

      ticket.status = 'rejected';
      ticket.rejectedAt = new Date().toISOString();

      if (env && env.POBI_KV) {
        try {
          await env.POBI_KV.put('pobi_reset_requests', JSON.stringify(reqList));
        } catch (e) {}
      }

      return new Response(
        JSON.stringify({ success: true, message: '已成功駁回該筆密碼重設申請' }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '駁回失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  // POST /api/auth/clear-all
  if (action === 'clear-all' && request.method === 'POST') {
    try {
      const cleared = await clearAllUsersFromStore(env);
      return new Response(
        JSON.stringify({ success: true, message: `已清空 ${cleared} 位使用者帳號與配額快取` }),
        { headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || '清空失敗' }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: corsHeaders() });
}
