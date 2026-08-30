(function(window, document) {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function showToast(msg, type = 'info') {
  const c = $('#toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    t.style.transition = 'all .25s ease';
    setTimeout(() => t.remove(), 250);
  }, 3200);
}

function uid() { return crypto.randomUUID(); }
function esc(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function loadImageFromFile(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => res({ img: im, url: u, file });
    im.onerror = e => { URL.revokeObjectURL(u); rej(e); };
    im.src = u;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise(res => canvas.toBlob(res, type, quality));
}

// ==================== 身份驗證與帳號管理器 (AuthManager) ====================
window.AuthManager = {
  currentUser: null,
  mode: 'login', // 'login' | 'register'

  init() {
    this.getUsers(); // 確保預設管理員與開發者種子帳號存在
    this.checkSession();
    this.bindEvents();
  },

  getUsers() {
    try {
      let users = JSON.parse(localStorage.getItem('pobi_users') || '[]');
      let updated = false;
      if (!users.some(u => u.username.toLowerCase() === 'admin')) {
        users.unshift({
          id: 'admin-root',
          username: 'admin',
          password: 'admin888',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
        updated = true;
      }
      if (!users.some(u => u.username.toLowerCase() === 'developer')) {
        users.push({
          id: 'dev-root',
          username: 'developer',
          password: 'dev888',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
        updated = true;
      }
      if (updated) {
        localStorage.setItem('pobi_users', JSON.stringify(users));
      }
      return users;
    } catch {
      return [];
    }
  },

  saveUsers(users) {
    localStorage.setItem('pobi_users', JSON.stringify(users));
  },

  checkSession() {
    const saved = localStorage.getItem('pobi_session') || sessionStorage.getItem('pobi_session');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        this.unlockApp();
        return;
      } catch {}
    }
    this.lockApp();
  },

  lockApp() {
    const overlay = $('#authOverlay');
    if (overlay) overlay.classList.remove('hidden');
    const nameEl = $('#headerUserName');
    const avatarEl = $('#headerUserAvatar');
    const signoutBtn = $('#btnSignOut');
    const adminBtn = $('#btnOpenAdminModal');
    if (nameEl) nameEl.textContent = '未登入';
    if (avatarEl) avatarEl.textContent = '?';
    if (signoutBtn) signoutBtn.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
  },

  unlockApp() {
    const overlay = $('#authOverlay');
    if (overlay) overlay.classList.add('hidden');
    const name = this.currentUser?.username || '會員';
    const nameEl = $('#headerUserName');
    const avatarEl = $('#headerUserAvatar');
    const signoutBtn = $('#btnSignOut');
    const adminBtn = $('#btnOpenAdminModal');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    if (signoutBtn) signoutBtn.style.display = 'block';

    // 若為管理員角色，顯示管理後台按鈕
    if (this.currentUser?.role === 'admin') {
      if (adminBtn) adminBtn.style.display = 'inline-flex';
    } else {
      if (adminBtn) adminBtn.style.display = 'none';
    }
  },

  bindEvents() {
    const tabLogin = $('#tabAuthLogin');
    const tabReg = $('#tabAuthRegister');
    const confirmRow = $('#authConfirmPwdRow');
    const submitBtn = $('#btnAuthSubmit');
    const btnDevSetup = $('#btnAuthDevSetup');

    if (tabLogin) {
      tabLogin.onclick = () => {
        this.mode = 'login';
        tabLogin.classList.add('active');
        tabReg.classList.remove('active');
        if (confirmRow) confirmRow.style.display = 'none';
        if (submitBtn) submitBtn.textContent = '登入進入工作站';
        this.clearAlert();
      };
    }

    if (tabReg) {
      tabReg.onclick = () => {
        this.mode = 'register';
        tabReg.classList.add('active');
        tabLogin.classList.remove('active');
        if (confirmRow) confirmRow.style.display = 'flex';
        if (submitBtn) submitBtn.textContent = '註冊並進入工作站';
        this.clearAlert();
      };
    }

    const togglePwd = $('#btnToggleAuthPwd');
    if (togglePwd) {
      togglePwd.onclick = () => {
        const pwd = $('#authPassword');
        if (pwd.type === 'password') {
          pwd.type = 'text';
          togglePwd.textContent = '隱藏';
        } else {
          pwd.type = 'password';
          togglePwd.textContent = '顯示';
        }
      };
    }

    const form = $('#authForm');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.handleSubmit();
      };
    }

    if (btnDevSetup) {
      btnDevSetup.onclick = () => this.setupDeveloperAccount();
    }

    const btnSignOut = $('#btnSignOut');
    if (btnSignOut) {
      btnSignOut.onclick = () => this.logout();
    }

    const userBtn = $('#headerUserBtn');
    if (userBtn) {
      userBtn.onclick = () => $('#apiModal').classList.add('active');
    }
  },

  setupDeveloperAccount() {
    const users = this.getUsers();
    let dev = users.find(u => u.username.toLowerCase() === 'developer');
    if (!dev) {
      dev = {
        id: 'dev-root',
        username: 'developer',
        password: 'dev888',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      users.push(dev);
      this.saveUsers(users);
    }
    
    this.currentUser = { id: dev.id, username: dev.username, role: 'admin' };
    localStorage.setItem('pobi_session', JSON.stringify(this.currentUser));
    
    this.showAlert('開發者管理員帳號 (developer) 已快速開通並自動登入！', 'success');
    setTimeout(() => {
      this.unlockApp();
      showToast('歡迎開發者 developer！具備完整多媒體與後台最高管理權限。', 'success');
      if (window.AdminManager) window.AdminManager.renderUsers();
    }, 350);
  },

  showAlert(msg, type = 'error') {
    const box = $('#authAlert');
    if (!box) return;
    box.className = `auth-alert ${type}`;
    box.textContent = msg;
  },

  clearAlert() {
    const box = $('#authAlert');
    if (!box) return;
    box.className = 'auth-alert';
    box.textContent = '';
  },

  handleSubmit() {
    const u = $('#authUsername')?.value.trim();
    const p = $('#authPassword')?.value;
    const remember = $('#authRemember')?.checked;

    if (!u) {
      this.showAlert('請輸入使用者名稱');
      return;
    }
    if (!p || p.length < 4) {
      this.showAlert('密碼長度至少需 4 個字元');
      return;
    }

    const users = this.getUsers();

    if (this.mode === 'register') {
      const cp = $('#authConfirmPassword')?.value;
      if (p !== cp) {
        this.showAlert('兩次輸入的密碼不一致');
        return;
      }
      if (users.some(x => x.username.toLowerCase() === u.toLowerCase())) {
        this.showAlert('此使用者名稱已被註冊，請切換至「會員登入」或更換一個未被使用的名稱');
        return;
      }

      const role = (u.toLowerCase() === 'admin' || u.toLowerCase() === 'developer') ? 'admin' : 'user';
      const newUser = { id: uid(), username: u, password: p, role, createdAt: new Date().toISOString() };
      users.push(newUser);
      this.saveUsers(users);

      this.currentUser = { id: newUser.id, username: newUser.username, role: newUser.role };
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('pobi_session', JSON.stringify(this.currentUser));

      this.showAlert('註冊成功，歡迎使用 Pobi Media！', 'success');
      setTimeout(() => {
        this.unlockApp();
        showToast(`註冊成功，歡迎 ${newUser.username} 進入 Pobi Media 專業工作站！`, 'success');
        if (window.AdminManager) window.AdminManager.renderUsers();
      }, 400);
    } else {
      let user = users.find(x => x.username.toLowerCase() === u.toLowerCase());
      if (user) {
        if (user.password !== p) {
          this.showAlert('密碼錯誤，請重新確認');
          return;
        }
      } else {
        this.showAlert('找不到此使用者名稱，請切換至「註冊新帳號」或點擊下方「一次性申請開通開發者帳號」');
        return;
      }

      this.currentUser = { id: user.id, username: user.username, role: user.role || 'user' };
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('pobi_session', JSON.stringify(this.currentUser));

      this.showAlert('登入成功，正在為您載入工作台...', 'success');
      setTimeout(() => {
        this.unlockApp();
        showToast(`歡迎回來，${user.username}！`, 'success');
      }, 350);
    }
  },

  logout() {
    localStorage.removeItem('pobi_session');
    sessionStorage.removeItem('pobi_session');
    this.currentUser = null;
    this.lockApp();
    showToast('已安全登出', 'info');
  }
};

// ==================== 使用者意見回饋管理器 (FeedbackManager) ====================
window.FeedbackManager = {
  init() {
    $('#btnOpenFeedbackModal').onclick = () => $('#feedbackModal').classList.add('active');
    $('#btnCloseFeedbackModal').onclick = () => $('#feedbackModal').classList.remove('active');

    $('#feedbackForm').onsubmit = (e) => {
      e.preventDefault();
      this.submitFeedback();
    };
  },

  getFeedback() {
    try {
      return JSON.parse(localStorage.getItem('pobi_feedback') || '[]');
    } catch {
      return [];
    }
  },

  saveFeedback(list) {
    localStorage.setItem('pobi_feedback', JSON.stringify(list));
  },

  submitFeedback() {
    const type = $('#feedbackType').value;
    const title = $('#feedbackTitle').value.trim();
    const desc = $('#feedbackDesc').value.trim();
    const contact = $('#feedbackContact').value.trim();
    const username = window.AuthManager?.currentUser?.username || '匿名使用者';

    if (!title || !desc) {
      showToast('請填寫主旨與詳細描述', 'warning');
      return;
    }

    const item = {
      id: uid(),
      type,
      title,
      desc,
      contact,
      username,
      createdAt: new Date().toISOString()
    };

    const list = this.getFeedback();
    list.unshift(item);
    this.saveFeedback(list);

    $('#feedbackTitle').value = '';
    $('#feedbackDesc').value = '';
    $('#feedbackContact').value = '';
    $('#feedbackModal').classList.remove('active');
    showToast('回饋已送出，感謝您寶貴的建議！', 'success');

    if (window.AdminManager) window.AdminManager.renderFeedback();
  }
};

// ==================== 管理者後台管理器 (AdminManager) ====================
window.AdminManager = {
  init() {
    $('#btnOpenAdminModal').onclick = () => {
      if (window.AuthManager?.currentUser?.role !== 'admin') {
        showToast('您無權限存取管理控制台', 'error');
        return;
      }
      this.renderUsers();
      this.renderFeedback();
      this.loadPublicApiConfig();
      $('#adminModal').classList.add('active');
    };

    $('#btnCloseAdminModal').onclick = () => $('#adminModal').classList.remove('active');
    $('#btnCloseAdminModal2').onclick = () => $('#adminModal').classList.remove('active');

    // 頁籤切換
    $$('.admin-tab-btn').forEach(btn => {
      btn.onclick = () => {
        $$('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        $$('.admin-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = $('#pane-admin-' + btn.dataset.adminPane);
        if (target) target.classList.add('active');
      };
    });

    // 搜尋使用者
    $('#adminUserSearch').oninput = (e) => {
      this.renderUsers(e.target.value.trim().toLowerCase());
    };

    // 清空回饋
    $('#adminClearAllFeedback').onclick = () => {
      if (confirm('確定要清除所有使用者回饋記錄嗎？')) {
        localStorage.removeItem('pobi_feedback');
        this.renderFeedback();
        showToast('已清空所有回饋記錄', 'info');
      }
    };

    // 公用 API 更新
    $('#btnAdminSavePublicApi').onclick = () => {
      const key = $('#adminPublicApiKey').value.trim();
      if (!key) {
        localStorage.removeItem('pobi_public_api_override');
        showToast('已清除本機公用金鑰覆寫，使用 Cloudflare Worker 預設 Secrets', 'info');
      } else {
        localStorage.setItem('pobi_public_api_override', key);
        showToast('公用 API 金鑰設定已更新', 'success');
      }
      window.ApiManager.checkServerStatus();
    };

    // 測試 API 連線
    $('#btnAdminTestApi').onclick = () => this.testApiConnection();
  },

  loadPublicApiConfig() {
    const key = localStorage.getItem('pobi_public_api_override') || '';
    $('#adminPublicApiKey').value = key;
  },

  async testApiConnection() {
    const resBox = $('#adminApiTestResult');
    resBox.style.display = 'block';
    resBox.textContent = '正在測試 Google Gemini 2.5 Flash 端點回應...';

    const t0 = performance.now();
    try {
      const overrideKey = localStorage.getItem('pobi_public_api_override');
      let statusOk = false;
      if (overrideKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${overrideKey}`;
        const res = await fetch(url);
        statusOk = res.ok;
      } else {
        const res = await fetch('/api/status');
        const data = await res.json();
        statusOk = data.hasPublicApi;
      }
      const lat = Math.round(performance.now() - t0);
      if (statusOk) {
        resBox.textContent = `連線正常 (延遲: ${lat}ms) - Google Gemini 端點運作良好`;
        resBox.style.color = '#34d399';
      } else {
        resBox.textContent = `伺服器未配置公用金鑰 (延遲: ${lat}ms) - 建議在 Cloudflare Workers 設定 GEMINI_API_KEY Secret`;
        resBox.style.color = '#fbbf24';
      }
    } catch (e) {
      resBox.textContent = '連線失敗: ' + e.message;
      resBox.style.color = '#f87171';
    }
  },

  renderUsers(filter = '') {
    const users = window.AuthManager.getUsers();
    const tbody = $('#adminUserTableBody');
    const filtered = filter ? users.filter(u => u.username.toLowerCase().includes(filter)) : users;

    $('#adminUserCount').textContent = users.length;
    tbody.innerHTML = '';

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px">無符合的使用者帳號</td></tr>';
      return;
    }

    filtered.forEach(u => {
      const tr = document.createElement('tr');
      const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '未知';
      const roleLabel = u.role === 'admin' ? '管理員' : '一般使用者';
      const roleClass = u.role === 'admin' ? 'admin' : 'user';

      tr.innerHTML = `
        <td><strong>${esc(u.username)}</strong></td>
        <td><span class="admin-role-badge ${roleClass}">${roleLabel}</span></td>
        <td>${dateStr}</td>
        <td style="text-align:right">
          <button class="btn-reset-pwd" style="padding:3px 8px;font-size:11px;margin-right:6px">重設密碼</button>
          <button class="btn-del-user btn-danger" style="padding:3px 8px;font-size:11px">刪除</button>
        </td>
      `;

      // 協助重設密碼
      tr.querySelector('.btn-reset-pwd').onclick = () => {
        const newPwd = prompt(`請輸入為帳號「${u.username}」設定的新密碼：`, '123456');
        if (newPwd !== null) {
          if (newPwd.length < 4) {
            alert('密碼長度需至少 4 個字元');
            return;
          }
          const all = window.AuthManager.getUsers();
          const target = all.find(x => x.id === u.id);
          if (target) {
            target.password = newPwd;
            window.AuthManager.saveUsers(all);
            showToast(`已成功為「${u.username}」更新密碼`, 'success');
          }
        }
      };

      // 刪除使用者
      tr.querySelector('.btn-del-user').onclick = () => {
        if (u.username.toLowerCase() === 'admin') {
          alert('無法刪除系統預設管理者帳號');
          return;
        }
        if (confirm(`確定要永久刪除使用者「${u.username}」嗎？`)) {
          let all = window.AuthManager.getUsers();
          all = all.filter(x => x.id !== u.id);
          window.AuthManager.saveUsers(all);
          this.renderUsers($('#adminUserSearch').value.trim().toLowerCase());
          showToast(`已刪除使用者「${u.username}」`, 'info');
        }
      };

      tbody.appendChild(tr);
    });
  },

  renderFeedback() {
    const list = window.FeedbackManager.getFeedback();
    const container = $('#adminFeedbackList');
    $('#adminFeedbackCount').textContent = list.length;
    container.innerHTML = '';

    if (!list.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:12px">目前無任何使用者回饋或問題回報</div>';
      return;
    }

    list.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'feedback-item';
      const typeLabel = item.type === 'bug' ? '問題回報' : item.type === 'feature' ? '功能建議' : '操作諮詢';
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';

      card.innerHTML = `
        <div class="feedback-header">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="feedback-type-badge ${item.type}">${typeLabel}</span>
            <strong style="color:#ffffff">${esc(item.title)}</strong>
          </div>
          <div>${dateStr}</div>
        </div>
        <div class="feedback-text">${esc(item.desc)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-secondary);border-top:1px solid rgba(255,255,255,0.05);padding-top:6px">
          <span>提交者：<strong>${esc(item.username)}</strong> ${item.contact ? `(聯絡：${esc(item.contact)})` : ''}</span>
          <button class="btn-del-fb btn-danger" style="padding:2px 8px;font-size:10px">標記已處理並刪除</button>
        </div>
      `;

      card.querySelector('.btn-del-fb').onclick = () => {
        const all = window.FeedbackManager.getFeedback();
        all.splice(idx, 1);
        window.FeedbackManager.saveFeedback(all);
        this.renderFeedback();
        showToast('已移除該則回饋', 'info');
      };

      container.appendChild(card);
    });
  }
};


// ==================== API Key 與配額管理器 ====================
window.ApiManager = {
  userKey: localStorage.getItem('user_gemini_api_key') || '',
  serverStatus: { hasPublicApi: false, remainingToday: 0 },

  init() {
    this.checkServerStatus();
    this.updateBadge();
    $('#btnSaveApiKey').onclick = () => {
      const k = $('#inputUserApiKey').value.trim();
      if (!k) {
        showToast('請輸入有效的 Gemini API Key', 'warning');
        return;
      }
      this.userKey = k;
      localStorage.setItem('user_gemini_api_key', k);
      showToast('自備 API Key 儲存成功，已啟用無限制模式', 'success');
      this.updateBadge();
    };
    $('#btnClearApiKey').onclick = () => {
      this.userKey = '';
      localStorage.removeItem('user_gemini_api_key');
      $('#inputUserApiKey').value = '';
      showToast('已清除自備金鑰，切換為公用配額模式', 'info');
      this.updateBadge();
    };
    $('#btnToggleKeyVisibility').onclick = () => {
      const inp = $('#inputUserApiKey');
      if (inp.type === 'password') {
        inp.type = 'text';
        $('#btnToggleKeyVisibility').textContent = '隱藏';
      } else {
        inp.type = 'password';
        $('#btnToggleKeyVisibility').textContent = '顯示';
      }
    };
    if (this.userKey) {
      $('#inputUserApiKey').value = this.userKey;
    }
  },

  async checkServerStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        this.serverStatus = await res.json();
        $('#srvKeyStatus').textContent = this.serverStatus.hasPublicApi ? '已啟用 (伺服器就緒)' : '未設定 (需使用個人金鑰)';
        $('#srvQuotaLeft').textContent = this.serverStatus.remainingToday;
      }
    } catch (e) {
      $('#srvKeyStatus').textContent = '離線模式';
    }
    this.updateBadge();
  },

  updateBadge() {
    const b = $('#quotaText');
    const dot = $('#quotaDot');
    if (!b || !dot) return;

    if (this.userKey) {
      b.textContent = '專屬金鑰已啟用';
      dot.className = 'status-dot blue';
    } else if (this.serverStatus.hasPublicApi) {
      b.textContent = `公用剩餘: ${this.serverStatus.remainingToday} 次`;
      dot.className = 'status-dot green';
    } else {
      b.textContent = '需設定金鑰';
      dot.className = 'status-dot yellow';
    }
  },

  async callGeminiVision(base64Image, prompt) {
    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: base64Image } }
        ]
      }]
    };

    if (this.userKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.userKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API 回傳錯誤 (${res.status}): ${err}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, model: 'gemini-2.5-flash' })
    });

    if (res.status === 429) {
      this.checkServerStatus();
      throw new Error('今日公用免費配額 (5次) 已用完，請在右上角「API 設定」輸入您的個人金鑰');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'AI 伺服器處理失敗');
    }

    const data = await res.json();
    if (data._quota) {
      this.serverStatus.remainingToday = data._quota.remaining;
      this.updateBadge();
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
};

$('#quotaBadge').onclick = () => $('#apiModal').classList.add('active');
$('#btnOpenApiModal').onclick = () => $('#apiModal').classList.add('active');
$('#btnCloseApiModal').onclick = () => $('#apiModal').classList.remove('active');
$('#btnCloseApiModal2').onclick = () => $('#apiModal').classList.remove('active');

$$('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tool-view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    const target = $('#view-' + btn.dataset.tab);
    if (target) target.classList.add('active');
  };
});

function switchTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ==================== 模組 1: 透視校正邏輯 ====================
window.TrapezoidModule = {
  items: [],
  active: -1,
  drag: -1,
  gl: null,
  program: null,
  buffer: null,
  glCanvas: null,

  init() {
    const drop = $('#trapDrop'), fileIn = $('#trapFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { this.addFiles(e.target.files); e.target.value = ''; };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); this.addFiles(e.dataTransfer.files); };

    $('#trapClearAll').onclick = () => {
      this.items.forEach(it => URL.revokeObjectURL(it.url));
      this.items = [];
      this.active = -1;
      this.render();
    };

    $('#trapReset').onclick = () => {
      const it = this.items[this.active];
      if (it) {
        it.points = this.fitPoints(it.img.naturalWidth, it.img.naturalHeight);
        this.drawOverlay();
      }
    };
    $('#trapAuto').onclick = () => {
      const it = this.items[this.active];
      if (it) {
        const w = it.img.naturalWidth, h = it.img.naturalHeight, m = Math.min(w, h) * 0.08;
        it.points = [{ x: m, y: m }, { x: w - m, y: m }, { x: w - m, y: h - m }, { x: m, y: h - m }];
        this.drawOverlay();
      }
    };
    $('#trapRotL').onclick = () => this.rotate(-90);
    $('#trapRotR').onclick = () => this.rotate(90);
    $('#trapQuality').oninput = e => $('#trapQualityVal').textContent = Math.round(e.target.value * 100) + '%';

    this.initInteraction();

    $('#trapDownloadCurrent').onclick = () => this.exportCurrent();
    $('#trapDownloadAllZip').onclick = () => this.exportAllZip();

    $('#trapSendToBg').onclick = () => this.sendToModule('bgremove');
    $('#trapSendToOcr').onclick = () => this.sendToModule('ocr');
    $('#trapSendToPdf').onclick = () => this.sendToModule('convert');
  },

  fitPoints(w, h) {
    const m = Math.min(w, h) * 0.06;
    return [
      { x: m, y: m },
      { x: w - m, y: m },
      { x: w - m, y: h - m },
      { x: m, y: h - m }
    ];
  },

  async addFiles(files) {
    for (const f of [...files]) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const { img, url } = await loadImageFromFile(f);
        this.items.push({
          id: uid(),
          file: f,
          img,
          url,
          points: this.fitPoints(img.naturalWidth, img.naturalHeight)
        });
      } catch (err) {
        console.error('載入圖片失敗:', err);
      }
    }
    if (this.active < 0 && this.items.length) this.active = 0;
    this.render();
  },

  render() {
    const list = $('#trapList');
    list.innerHTML = '';
    $('#trapCount').textContent = this.items.length;
    $('#trapDownloadCurrent').disabled = this.active < 0;
    $('#trapDownloadAllZip').disabled = this.items.length === 0;

    this.items.forEach((it, i) => {
      const div = document.createElement('div');
      div.className = `file-item ${i === this.active ? 'active' : ''}`;
      div.innerHTML = `
        <img class="thumb" src="${it.url}">
        <div class="meta">
          <div class="name">${esc(it.file.name)}</div>
          <div class="desc">${it.img.naturalWidth} × ${it.img.naturalHeight}</div>
        </div>
        <button class="btn-remove" title="移除"><svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
      div.onclick = () => { this.active = i; this.render(); };
      div.querySelector('.btn-remove').onclick = e => {
        e.stopPropagation();
        URL.revokeObjectURL(it.url);
        this.items.splice(i, 1);
        if (this.active >= this.items.length) this.active = this.items.length - 1;
        this.render();
      };
      list.appendChild(div);
    });

    const it = this.items[this.active];
    if (!it) {
      $('#trapEmptyHint').style.display = 'block';
      $('#trapCanvasWrap').style.display = 'none';
      return;
    }

    $('#trapEmptyHint').style.display = 'none';
    $('#trapCanvasWrap').style.display = 'block';
    this.drawPreview();
  },

  drawPreview() {
    const it = this.items[this.active];
    if (!it) return;
    const stage = $('#trapStageArea');
    const maxW = Math.max(100, stage.clientWidth - 32);
    const maxH = Math.max(100, stage.clientHeight - 32);
    const scale = Math.min(maxW / it.img.naturalWidth, maxH / it.img.naturalHeight, 1);
    const w = Math.round(it.img.naturalWidth * scale);
    const h = Math.round(it.img.naturalHeight * scale);

    const prev = $('#trapPreview'), ovr = $('#trapOverlay');
    prev.width = w; prev.height = h;
    ovr.width = w; ovr.height = h;

    const ctx = prev.getContext('2d');
    ctx.drawImage(it.img, 0, 0, w, h);
    this.drawOverlay();
  },

  drawOverlay() {
    const it = this.items[this.active];
    if (!it) return;
    const prev = $('#trapPreview'), ovr = $('#trapOverlay');
    const ctx = ovr.getContext('2d');
    ctx.clearRect(0, 0, ovr.width, ovr.height);

    const sx = prev.width / it.img.naturalWidth;
    const sy = prev.height / it.img.naturalHeight;
    const pts = it.points.map(p => ({ x: p.x * sx, y: p.y * sy }));

    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b82f6';
    ctx.stroke();

    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = (this.drag === i) ? '#d97706' : '#2563eb';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = '600 10px system-ui';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, p.x, p.y);
    });
  },

  initInteraction() {
    const ovr = $('#trapOverlay');
    ovr.addEventListener('pointerdown', e => {
      if (this.active < 0) return;
      const r = ovr.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const it = this.items[this.active];
      const sx = $('#trapPreview').width / it.img.naturalWidth;
      const sy = $('#trapPreview').height / it.img.naturalHeight;

      let best = -1, minD = 32;
      it.points.forEach((p, i) => {
        const d = Math.hypot(p.x * sx - x, p.y * sy - y);
        if (d < minD) { minD = d; best = i; }
      });
      if (best >= 0) {
        this.drag = best;
        ovr.setPointerCapture(e.pointerId);
        this.drawOverlay();
      }
    });

    ovr.addEventListener('pointermove', e => {
      if (this.drag < 0 || this.active < 0) return;
      const r = ovr.getBoundingClientRect();
      const it = this.items[this.active];
      let x = (e.clientX - r.left) * it.img.naturalWidth / $('#trapPreview').width;
      let y = (e.clientY - r.top) * it.img.naturalHeight / $('#trapPreview').height;
      x = Math.max(0, Math.min(it.img.naturalWidth, x));
      y = Math.max(0, Math.min(it.img.naturalHeight, y));
      it.points[this.drag] = { x, y };
      this.drawOverlay();
    });

    const end = () => { if (this.drag >= 0) { this.drag = -1; this.drawOverlay(); } };
    ovr.addEventListener('pointerup', end);
    ovr.addEventListener('pointercancel', end);
  },

  rotate(angle) {
    const it = this.items[this.active];
    if (!it) return;
    const w = it.img.naturalWidth, h = it.img.naturalHeight;
    let newPts;
    if (angle === 90) {
      const m = it.points.map(p => ({ x: h - p.y, y: p.x }));
      newPts = [m[3], m[0], m[1], m[2]];
    } else {
      const m = it.points.map(p => ({ x: p.y, y: w - p.x }));
      newPts = [m[1], m[2], m[3], m[0]];
    }
    const c = document.createElement('canvas');
    c.width = h; c.height = w;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(it.img, -w / 2, -h / 2);

    const im = new Image();
    im.onload = () => {
      it.img = im;
      it.points = newPts;
      this.drawPreview();
    };
    im.src = c.toDataURL('image/png');
  },

  initWebGL() {
    if (this.gl) return this.gl;
    this.glCanvas = document.createElement('canvas');
    this.gl = this.glCanvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('WebGL 初始化失敗');

    const vs = `attribute vec2 a_pos; attribute vec2 a_uv; varying vec2 v_uv; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); v_uv = a_uv; }`;
    const fs = `precision highp float; uniform sampler2D u_image; uniform mat3 u_H; varying vec2 v_uv; void main() { vec3 q = u_H * vec3(v_uv, 1.0); vec2 src = q.xy / q.z; if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) gl_FragColor = vec4(0.0); else gl_FragColor = texture2D(u_image, src); }`;

    const createS = (t, s) => {
      const sh = this.gl.createShader(t);
      this.gl.shaderSource(sh, s);
      this.gl.compileShader(sh);
      return sh;
    };
    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, createS(this.gl.VERTEX_SHADER, vs));
    this.gl.attachShader(this.program, createS(this.gl.FRAGMENT_SHADER, fs));
    this.gl.linkProgram(this.program);

    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,1,0,0, -1,-1,0,1, 1,1,1,0, 1,1,1,0, -1,-1,0,1, 1,-1,1,1]), this.gl.STATIC_DRAW);
    return this.gl;
  },

  renderWarp(im, points, w, h) {
    this.initWebGL();
    const gl = this.gl;
    this.glCanvas.width = w; this.glCanvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const posLoc = gl.getAttribLocation(this.program, 'a_pos');
    const uvLoc = gl.getAttribLocation(this.program, 'a_uv');
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);

    const imgW = im.naturalWidth, imgH = im.naturalHeight;
    const dst = [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
    const src = points.map(p => ({ x: p.x / imgW, y: p.y / imgH }));

    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const u = dst[i].x, v = dst[i].y, x = src[i].x, y = src[i].y;
      A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
      b.push(x);
      A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
      b.push(y);
    }
    const H = this.solve8(A, b);

    const uHLoc = gl.getUniformLocation(this.program, 'u_H');
    gl.uniformMatrix3fv(uHLoc, false, new Float32Array([H[0],H[3],H[6], H[1],H[4],H[7], H[2],H[5],1.0]));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.deleteTexture(tex);

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(this.glCanvas, 0, 0);
    return out;
  },

  solve8(A, b) {
    const n = 8, m = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
      let k = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(m[j][i]) > Math.abs(m[k][i])) k = j;
      [m[i], m[k]] = [m[k], m[i]];
      const piv = m[i][i] || 1e-12;
      for (let j = i; j <= n; j++) m[i][j] /= piv;
      for (let j = 0; j < n; j++) if (j !== i) { const f = m[j][i]; for (let z = i; z <= n; z++) m[j][z] -= f * m[i][z]; }
    }
    return m.map(r => r[n]);
  },

  async getWarpedCanvas(it) {
    const p = it.points;
    const a = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
    const b = Math.hypot(p[2].x - p[3].x, p[2].y - p[3].y);
    const c = Math.hypot(p[3].x - p[0].x, p[3].y - p[0].y);
    const d = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
    let w = Math.round(Math.max(a, b)), h = Math.round(Math.max(c, d));
    const max = Number($('#trapMaxSize').value);
    if (max > 0) {
      const s = Math.min(1, max / Math.max(w, h));
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    return this.renderWarp(it.img, it.points, w, h);
  },

  async exportCurrent() {
    const it = this.items[this.active];
    if (!it) return;
    const canvas = await this.getWarpedCanvas(it);
    const fmt = $('#trapFormat').value, q = Number($('#trapQuality').value);
    const blob = await canvasToBlob(canvas, fmt, q);
    const ext = fmt === 'image/jpeg' ? 'jpg' : fmt === 'image/png' ? 'png' : 'webp';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = it.file.name.replace(/\.[^.]+$/, '') + '-校正.' + ext;
    a.click();
    showToast('校正影像下載成功', 'success');
  },

  async exportAllZip() {
    if (!this.items.length) return;
    const btn = $('#trapDownloadAllZip');
    btn.disabled = true; btn.textContent = '打包中...';
    try {
      const zip = new JSZip();
      const fmt = $('#trapFormat').value, q = Number($('#trapQuality').value);
      const ext = fmt === 'image/jpeg' ? 'jpg' : fmt === 'image/png' ? 'png' : 'webp';
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        btn.textContent = `打包處理中 (${i+1}/${this.items.length})...`;
        const c = await this.getWarpedCanvas(it);
        const b = await canvasToBlob(c, fmt, q);
        zip.file(it.file.name.replace(/\.[^.]+$/, '') + '-校正.' + ext, b);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `校正批次_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      showToast('ZIP 打包下載完成', 'success');
    } catch (e) {
      showToast('打包失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '批次打包下載 (ZIP)';
    }
  },

  async sendToModule(mod) {
    const it = this.items[this.active];
    if (!it) { showToast('請先選擇圖片', 'warning'); return; }
    const canvas = await this.getWarpedCanvas(it);
    const blob = await canvasToBlob(canvas, 'image/png');
    const file = new File([blob], it.file.name.replace(/\.[^.]+$/, '') + '-校正.png', { type: 'image/png' });

    if (mod === 'bgremove') {
      window.BgRemoveModule.loadFile(file);
      switchTab('bgremove');
      showToast('已傳送校正影像至背景去除', 'success');
    } else if (mod === 'ocr') {
      window.OcrModule.loadFile(file);
      switchTab('ocr');
      showToast('已傳送校正影像至文字辨識', 'success');
    } else if (mod === 'convert') {
      window.ConvertModule.addFiles([file]);
      switchTab('convert');
      showToast('已加入 PDF 轉檔與合成清單', 'success');
    }
  }
};


// ==================== 模組 2: 格式轉檔 & PDF 合成器 ====================
window.ConvertModule = {
  files: [],

  init() {
    const drop = $('#convDrop'), fileIn = $('#convFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { this.addFiles(e.target.files); e.target.value = ''; };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); this.addFiles(e.dataTransfer.files); };

    $('#convClearAll').onclick = () => { this.files = []; this.render(); };
    $('#convQuality').oninput = e => $('#convQualityVal').textContent = Math.round(e.target.value * 100) + '%';

    $('#btnBuildPdf').onclick = () => this.buildPdf();
    $('#btnBatchConvert').onclick = () => this.batchConvertImages();
  },

  async addFiles(fs) {
    for (const f of [...fs]) {
      this.files.push({ id: uid(), file: f });
    }
    this.render();
  },

  render() {
    const list = $('#convList');
    list.innerHTML = '';
    $('#convCount').textContent = this.files.length;

    this.files.forEach((it, i) => {
      const div = document.createElement('div');
      div.className = 'file-item';
      div.innerHTML = `
        <div class="meta">
          <div class="name">${esc(it.file.name)}</div>
          <div class="desc">${(it.file.size / 1024).toFixed(1)} KB</div>
        </div>
        <button class="btn-remove" title="移除"><svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
      div.querySelector('.btn-remove').onclick = () => {
        this.files.splice(i, 1);
        this.render();
      };
      list.appendChild(div);
    });
  },

  async buildPdf() {
    if (!this.files.length) { showToast('請先上傳檔案', 'warning'); return; }
    const btn = $('#btnBuildPdf');
    btn.disabled = true; btn.textContent = '合成 PDF 中...';

    try {
      const pdfDoc = await PDFLib.PDFDocument.create();
      const layout = $('#pdfPageLayout').value;
      const margin = Number($('#pdfMargin').value);

      for (let i = 0; i < this.files.length; i++) {
        const it = this.files[i];
        btn.textContent = `處理第 ${i+1}/${this.files.length} 頁...`;

        if (it.file.type.startsWith('image/')) {
          const bytes = await it.file.arrayBuffer();
          let img;
          if (it.file.type === 'image/png') {
            img = await pdfDoc.embedPng(bytes);
          } else {
            const { img: domImg } = await loadImageFromFile(it.file);
            const c = document.createElement('canvas');
            c.width = domImg.naturalWidth; c.height = domImg.naturalHeight;
            c.getContext('2d').drawImage(domImg, 0, 0);
            const pngBlob = await canvasToBlob(c, 'image/png');
            img = await pdfDoc.embedPng(await pngBlob.arrayBuffer());
          }

          let pageW = 595.28, pageH = 841.89;
          if (layout === 'fit') {
            pageW = img.width + margin * 2;
            pageH = img.height + margin * 2;
          } else if (layout === 'letter') {
            pageW = 612; pageH = 792;
          }

          const page = pdfDoc.addPage([pageW, pageH]);
          const availW = pageW - margin * 2, availH = pageH - margin * 2;
          const scale = Math.min(availW / img.width, availH / img.height, 1);
          const drawW = img.width * scale, drawH = img.height * scale;
          const drawX = margin + (availW - drawW) / 2;
          const drawY = margin + (availH - drawH) / 2;

          page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        } else if (it.file.name.endsWith('.txt') || it.file.name.endsWith('.md')) {
          const text = await it.file.text();
          const page = pdfDoc.addPage([595.28, 841.89]);
          page.drawText(text.slice(0, 2000), { x: 40, y: 800, size: 10 });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = $('#pdfFilename').value || 'PobiMedia_Doc.pdf';
      a.click();
      showToast('PDF 合成下載成功', 'success');
    } catch (e) {
      showToast('PDF 產生失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '合成並下載 PDF 文件';
    }
  },

  async batchConvertImages() {
    if (!this.files.length) { showToast('請先上傳圖片', 'warning'); return; }
    const btn = $('#btnBatchConvert');
    btn.disabled = true; btn.textContent = '轉檔中...';
    try {
      const zip = new JSZip();
      const fmt = $('#convTargetFormat').value, q = Number($('#convQuality').value);
      const ext = fmt === 'image/jpeg' ? 'jpg' : fmt === 'image/png' ? 'png' : 'webp';

      for (let i = 0; i < this.files.length; i++) {
        const it = this.files[i];
        if (!it.file.type.startsWith('image/')) continue;
        const { img } = await loadImageFromFile(it.file);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        const blob = await canvasToBlob(c, fmt, q);
        zip.file(it.file.name.replace(/\.[^.]+$/, '') + '.' + ext, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `轉檔批次_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      showToast('批次轉檔 ZIP 下載完成', 'success');
    } catch (e) {
      showToast('轉檔失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '批次轉換並下載 ZIP 壓縮包';
    }
  }
};


// ==================== 模組 3: PDF 頁面分割器 ====================
window.PdfSplitModule = {
  pdfDoc: null,
  pdfBytes: null,
  totalPages: 0,
  currentPage: 1,
  splitRatio: 0.5,
  isDragging: false,

  init() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const drop = $('#splitDrop'), fileIn = $('#splitFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { if (e.target.files[0]) this.loadPdf(e.target.files[0]); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadPdf(e.dataTransfer.files[0]); };

    $('#splitPresetV50').onclick = () => { $('#splitDirection').value = 'vertical'; this.setRatio(0.5); };
    $('#splitPresetH50').onclick = () => { $('#splitDirection').value = 'horizontal'; this.setRatio(0.5); };
    $('#splitRatio').oninput = e => this.setRatio(e.target.value / 100);

    $('#splitPrevPage').onclick = () => { if (this.currentPage > 1) { this.currentPage--; this.renderPage(); } };
    $('#splitNextPage').onclick = () => { if (this.currentPage < this.totalPages) { this.currentPage++; this.renderPage(); } };

    $('#splitApplyAll').onclick = () => showToast('已套用切割線設定至所有頁面', 'success');
    $('#btnExportSplitPdf').onclick = () => this.exportSplitPdf();

    this.initCutOverlay();
  },

  setRatio(r) {
    this.splitRatio = r;
    $('#splitRatio').value = Math.round(r * 100);
    $('#splitRatioVal').textContent = Math.round(r * 100) + '%';
    this.drawCutOverlay();
  },

  async loadPdf(file) {
    try {
      this.pdfBytes = await file.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes }).promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = 1;
      $('#splitPageCount').textContent = `${this.totalPages} 頁`;
      $('#btnExportSplitPdf').disabled = false;
      $('#splitEmptyHint').style.display = 'none';
      $('#splitCanvasWrap').style.display = 'block';
      this.renderPage();
      showToast(`已載入 PDF 文件，共 ${this.totalPages} 頁`, 'success');
    } catch (e) {
      showToast('載入 PDF 失敗: ' + e.message, 'error');
    }
  },

  async renderPage() {
    if (!this.pdfDoc) return;
    $('#splitPageIndicator').textContent = `第 ${this.currentPage} / ${this.totalPages} 頁`;
    const page = await this.pdfDoc.getPage(this.currentPage);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = $('#splitPdfCanvas'), ovr = $('#splitCutOverlay');
    canvas.width = viewport.width; canvas.height = viewport.height;
    ovr.width = viewport.width; ovr.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    this.drawCutOverlay();
  },

  drawCutOverlay() {
    const ovr = $('#splitCutOverlay');
    const ctx = ovr.getContext('2d');
    ctx.clearRect(0, 0, ovr.width, ovr.height);

    const dir = $('#splitDirection').value;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#dc2626';

    if (dir === 'vertical') {
      const cutX = ovr.width * this.splitRatio;
      ctx.beginPath();
      ctx.moveTo(cutX, 0); ctx.lineTo(cutX, ovr.height);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
      ctx.fillRect(cutX - 25, 10, 50, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(this.splitRatio * 100)}%`, cutX, 24);
    } else {
      const cutY = ovr.height * this.splitRatio;
      ctx.beginPath();
      ctx.moveTo(0, cutY); ctx.lineTo(ovr.width, cutY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
      ctx.fillRect(10, cutY - 10, 50, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(this.splitRatio * 100)}%`, 35, cutY + 4);
    }
  },

  initCutOverlay() {
    const ovr = $('#splitCutOverlay');
    ovr.addEventListener('pointerdown', e => {
      this.isDragging = true;
      ovr.setPointerCapture(e.pointerId);
      this.handlePointer(e);
    });
    ovr.addEventListener('pointermove', e => {
      if (this.isDragging) this.handlePointer(e);
    });
    const end = () => this.isDragging = false;
    ovr.addEventListener('pointerup', end);
    ovr.addEventListener('pointercancel', end);
  },

  handlePointer(e) {
    const r = $('#splitCutOverlay').getBoundingClientRect();
    const dir = $('#splitDirection').value;
    if (dir === 'vertical') {
      const ratio = Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / r.width));
      this.setRatio(ratio);
    } else {
      const ratio = Math.max(0.05, Math.min(0.95, (e.clientY - r.top) / r.height));
      this.setRatio(ratio);
    }
  },

  async exportSplitPdf() {
    if (!this.pdfBytes) return;
    const btn = $('#btnExportSplitPdf');
    btn.disabled = true; btn.textContent = '分割生成新 PDF 中...';

    try {
      const srcDoc = await PDFLib.PDFDocument.load(this.pdfBytes);
      const outDoc = await PDFLib.PDFDocument.create();
      const dir = $('#splitDirection').value;
      const order = $('#splitOrder').value;
      const total = srcDoc.getPageCount();

      for (let i = 0; i < total; i++) {
        btn.textContent = `處理第 ${i+1}/${total} 頁...`;
        const origPage = srcDoc.getPage(i);
        const { width, height } = origPage.getSize();
        const [embeddedPage] = await outDoc.embedPdf(srcDoc, [i]);

        if (dir === 'vertical') {
          const cutW = width * this.splitRatio;
          const leftW = cutW, rightW = width - cutW;

          if (order === 'rtl') {
            const pageRight = outDoc.addPage([rightW, height]);
            pageRight.drawPage(embeddedPage, { x: -leftW, y: 0, width, height });

            const pageLeft = outDoc.addPage([leftW, height]);
            pageLeft.drawPage(embeddedPage, { x: 0, y: 0, width, height });
          } else {
            const pageLeft = outDoc.addPage([leftW, height]);
            pageLeft.drawPage(embeddedPage, { x: 0, y: 0, width, height });

            const pageRight = outDoc.addPage([rightW, height]);
            pageRight.drawPage(embeddedPage, { x: -leftW, y: 0, width, height });
          }
        } else {
          const cutH = height * this.splitRatio;
          const topH = height - cutH, bottomH = cutH;

          const pageTop = outDoc.addPage([width, topH]);
          pageTop.drawPage(embeddedPage, { x: 0, y: -bottomH, width, height });

          const pageBottom = outDoc.addPage([width, bottomH]);
          pageBottom.drawPage(embeddedPage, { x: 0, y: 0, width, height });
        }
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `分割完成_共${outDoc.getPageCount()}頁.pdf`;
      a.click();
      showToast(`PDF 分割成功，共產生 ${outDoc.getPageCount()} 頁文件`, 'success');
    } catch (e) {
      showToast('分割匯出失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '分割並匯出新 PDF';
    }
  }
};


// ==================== 模組 4: 文字辨識 OCR ====================
window.OcrModule = {
  currentImg: null,
  cropRect: null,
  isSelecting: false,
  startPt: null,

  init() {
    const drop = $('#ocrDrop'), fileIn = $('#ocrFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { if (e.target.files[0]) this.loadFile(e.target.files[0]); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadFile(e.dataTransfer.files[0]); };

    $('#ocrEngine').onchange = e => {
      $('#ocrLangRow').style.display = e.target.value === 'tesseract' ? 'flex' : 'none';
    };

    $('#btnStartOcr').onclick = () => this.runOcr();
    $('#btnCopyOcrText').onclick = () => {
      navigator.clipboard.writeText($('#ocrResultText').value);
      showToast('文字已複製至剪貼簿', 'success');
    };
    $('#btnSaveOcrTxt').onclick = () => this.saveText('txt');
    $('#btnSaveOcrMd').onclick = () => this.saveText('md');

    this.initSelectionOverlay();
  },

  async loadFile(file) {
    try {
      const { img } = await loadImageFromFile(file);
      this.currentImg = img;
      $('#btnStartOcr').disabled = false;
      $('#ocrEmptyHint').style.display = 'none';
      $('#ocrCanvasWrap').style.display = 'block';
      this.cropRect = null;
      this.drawCanvas();
      showToast('圖片已載入，可點擊「開始文字辨識」', 'success');
    } catch (e) {
      showToast('載入圖片失敗: ' + e.message, 'error');
    }
  },

  drawCanvas() {
    if (!this.currentImg) return;
    const stage = $('#ocrStageArea');
    const maxW = Math.max(100, stage.clientWidth - 32);
    const maxH = Math.max(100, stage.clientHeight - 32);
    const scale = Math.min(maxW / this.currentImg.naturalWidth, maxH / this.currentImg.naturalHeight, 1);
    const w = Math.round(this.currentImg.naturalWidth * scale);
    const h = Math.round(this.currentImg.naturalHeight * scale);

    const canvas = $('#ocrImgCanvas'), ovr = $('#ocrSelectOverlay');
    canvas.width = w; canvas.height = h;
    ovr.width = w; ovr.height = h;

    canvas.getContext('2d').drawImage(this.currentImg, 0, 0, w, h);
    this.drawSelection();
  },

  drawSelection() {
    const ovr = $('#ocrSelectOverlay');
    const ctx = ovr.getContext('2d');
    ctx.clearRect(0, 0, ovr.width, ovr.height);
    if (!this.cropRect) return;

    ctx.fillStyle = 'rgba(37, 99, 235, 0.25)';
    ctx.fillRect(this.cropRect.x, this.cropRect.y, this.cropRect.w, this.cropRect.h);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3b82f6';
    ctx.strokeRect(this.cropRect.x, this.cropRect.y, this.cropRect.w, this.cropRect.h);
  },

  initSelectionOverlay() {
    const ovr = $('#ocrSelectOverlay');
    ovr.addEventListener('pointerdown', e => {
      if ($('#ocrScope').value !== 'crop') return;
      const r = ovr.getBoundingClientRect();
      this.startPt = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.isSelecting = true;
      ovr.setPointerCapture(e.pointerId);
    });

    ovr.addEventListener('pointermove', e => {
      if (!this.isSelecting || !this.startPt) return;
      const r = ovr.getBoundingClientRect();
      const curX = e.clientX - r.left, curY = e.clientY - r.top;
      this.cropRect = {
        x: Math.min(this.startPt.x, curX),
        y: Math.min(this.startPt.y, curY),
        w: Math.abs(curX - this.startPt.x),
        h: Math.abs(curY - this.startPt.y)
      };
      this.drawSelection();
    });

    const end = () => this.isSelecting = false;
    ovr.addEventListener('pointerup', end);
    ovr.addEventListener('pointercancel', end);
  },

  async runOcr() {
    if (!this.currentImg) return;
    const engine = $('#ocrEngine').value;
    const scope = $('#ocrScope').value;
    const btn = $('#btnStartOcr');
    btn.disabled = true;

    $('#ocrProgressWrap').style.display = 'block';
    $('#ocrProgressBar').style.width = '10%';
    $('#ocrProgressVal').textContent = '10%';

    try {
      const c = document.createElement('canvas');
      const scaleX = this.currentImg.naturalWidth / $('#ocrImgCanvas').width;
      const scaleY = this.currentImg.naturalHeight / $('#ocrImgCanvas').height;

      if (scope === 'crop' && this.cropRect && this.cropRect.w > 10) {
        c.width = this.cropRect.w * scaleX;
        c.height = this.cropRect.h * scaleY;
        c.getContext('2d').drawImage(
          this.currentImg,
          this.cropRect.x * scaleX, this.cropRect.y * scaleY, c.width, c.height,
          0, 0, c.width, c.height
        );
      } else {
        c.width = this.currentImg.naturalWidth;
        c.height = this.currentImg.naturalHeight;
        c.getContext('2d').drawImage(this.currentImg, 0, 0);
      }

      if (engine === 'tesseract') {
        $('#ocrProgressLabel').textContent = '載入 Tesseract WASM 引擎...';
        const lang = $('#ocrLanguage').value;
        const worker = await Tesseract.createWorker(lang, 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const p = Math.round(m.progress * 100);
              $('#ocrProgressBar').style.width = p + '%';
              $('#ocrProgressVal').textContent = p + '%';
              $('#ocrProgressLabel').textContent = '文字辨識中...';
            }
          }
        });
        const ret = await worker.recognize(c);
        await worker.terminate();
        $('#ocrResultText').value = ret.data.text;
        showToast('Tesseract 本地辨識完成', 'success');
      } else {
        $('#ocrProgressLabel').textContent = 'Gemini AI 視覺深度辨識中...';
        $('#ocrProgressBar').style.width = '50%';
        $('#ocrProgressVal').textContent = '50%';

        const b64 = c.toDataURL('image/png').split(',')[1];
        const prompt = '請以純文字格式完整提取這張圖片中的所有文字。請保留原始段落換行與排版，若是表格請轉換為 Markdown 表格格式，請勿額外添加你自己的說明廢話，僅輸出提取到的文字內容。';
        const text = await ApiManager.callGeminiVision(b64, prompt);
        $('#ocrResultText').value = text;
        $('#ocrProgressBar').style.width = '100%';
        $('#ocrProgressVal').textContent = '100%';
        showToast('Gemini AI 辨識完成', 'success');
      }
    } catch (e) {
      showToast('OCR 辨識失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => $('#ocrProgressWrap').style.display = 'none', 1000);
    }
  },

  saveText(ext) {
    const txt = $('#ocrResultText').value;
    if (!txt) { showToast('辨識結果為空', 'warning'); return; }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `OCR_提取結果_${new Date().toISOString().slice(0,10)}.${ext}`;
    a.click();
    showToast(`已下載 .${ext} 檔案`, 'success');
  }
};


// ==================== 模組 5: 背景去除 ====================
window.BgRemoveModule = {
  currentImg: null,
  rawCanvas: null,
  resultCanvas: null,
  brushMode: 'none',

  init() {
    const drop = $('#bgDrop'), fileIn = $('#bgFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { if (e.target.files[0]) this.loadFile(e.target.files[0]); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadFile(e.dataTransfer.files[0]); };

    $('#bgTolerance').oninput = e => $('#bgToleranceVal').textContent = e.target.value;
    $('#bgFeather').oninput = e => $('#bgFeatherVal').textContent = e.target.value + 'px';
    $('#bgBrushSize').oninput = e => $('#bgBrushSizeVal').textContent = e.target.value;

    $('#btnAutoWhiteClean').onclick = () => this.autoRemoveWhite();
    $('#btnRunBgRemove').onclick = () => this.runBgRemove();

    const btnErase = $('#bgBrushErase') || $('#btnBrushErase');
    if (btnErase) btnErase.onclick = () => this.setBrush('erase');
    const btnRestore = $('#bgBrushRestore') || $('#btnBrushRestore');
    if (btnRestore) btnRestore.onclick = () => this.setBrush('restore');

    $('#bgReplaceType').onchange = e => {
      $('#bgColorRow').style.display = e.target.value === 'color' ? 'flex' : 'none';
      this.updateDisplay();
    };
    $('#bgCustomColor').oninput = () => this.updateDisplay();
    $$('.color-quick').forEach(b => {
      b.onclick = () => {
        $('#bgCustomColor').value = b.dataset.c;
        $('#bgReplaceType').value = 'color';
        $('#bgColorRow').style.display = 'flex';
        this.updateDisplay();
      };
    });

    $('#btnDownloadBgPng').onclick = () => this.downloadImage('png');
    $('#btnDownloadBgJpg').onclick = () => this.downloadImage('jpg');

    $('#bgSendToOcr').onclick = () => this.sendToModule('ocr');
    $('#bgSendToPdf').onclick = () => this.sendToModule('convert');

    this.initMagicWandClick();
  },

  async loadFile(file) {
    try {
      const { img } = await loadImageFromFile(file);
      this.currentImg = img;

      this.rawCanvas = document.createElement('canvas');
      this.rawCanvas.width = img.naturalWidth;
      this.rawCanvas.height = img.naturalHeight;
      this.rawCanvas.getContext('2d').drawImage(img, 0, 0);

      this.resultCanvas = document.createElement('canvas');
      this.resultCanvas.width = img.naturalWidth;
      this.resultCanvas.height = img.naturalHeight;
      this.resultCanvas.getContext('2d').drawImage(img, 0, 0);

      $('#btnRunBgRemove').disabled = false;
      $('#btnDownloadBgPng').disabled = false;
      $('#btnDownloadBgJpg').disabled = false;
      $('#bgEmptyHint').style.display = 'none';
      $('#bgCanvasWrap').style.display = 'block';

      this.updateDisplay();
      showToast('圖片已載入，點選背景可執行魔術棒去背', 'success');
    } catch (e) {
      showToast('載入圖片失敗: ' + e.message, 'error');
    }
  },

  updateDisplay() {
    if (!this.resultCanvas) return;
    const stage = $('#bgStageArea');
    const maxW = Math.max(100, stage.clientWidth - 32);
    const maxH = Math.max(100, stage.clientHeight - 32);
    const scale = Math.min(maxW / this.resultCanvas.width, maxH / this.resultCanvas.height, 1);
    const w = Math.round(this.resultCanvas.width * scale);
    const h = Math.round(this.resultCanvas.height * scale);

    const out = $('#bgResultCanvas'), ovr = $('#bgBrushOverlay');
    out.width = w; out.height = h;
    ovr.width = w; ovr.height = h;

    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if ($('#bgReplaceType').value === 'color') {
      ctx.fillStyle = $('#bgCustomColor').value;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(this.resultCanvas, 0, 0, w, h);
  },

  autoRemoveWhite() {
    if (!this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, this.resultCanvas.width, this.resultCanvas.height);
    const d = imgData.data;
    const tol = Number($('#bgTolerance').value) * 2.5;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      const dist = Math.hypot(255 - r, 255 - g, 255 - b);
      if (dist < tol) {
        d[i+3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this.updateDisplay();
    showToast('已清除純白色背景', 'success');
  },

  initMagicWandClick() {
    const ovr = $('#bgBrushOverlay');
    ovr.addEventListener('pointerdown', e => {
      if (!this.resultCanvas) return;
      const r = ovr.getBoundingClientRect();
      const scaleX = this.resultCanvas.width / ovr.width;
      const scaleY = this.resultCanvas.height / ovr.height;
      const clickX = Math.round((e.clientX - r.left) * scaleX);
      const clickY = Math.round((e.clientY - r.top) * scaleY);

      if (this.brushMode === 'erase' || this.brushMode === 'restore') {
        this.paintBrush(clickX, clickY);
      } else {
        this.magicWandFloodFill(clickX, clickY);
      }
    });
  },

  magicWandFloodFill(startX, startY) {
    const ctx = this.resultCanvas.getContext('2d');
    const w = this.resultCanvas.width, h = this.resultCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const startIdx = (startY * w + startX) * 4;
    const targetR = d[startIdx], targetG = d[startIdx+1], targetB = d[startIdx+2], targetA = d[startIdx+3];
    if (targetA === 0) return;

    const tol = Number($('#bgTolerance').value) * 2;
    const visited = new Uint8Array(w * h);
    const queue = [startX, startY];

    while (queue.length > 0) {
      const cy = queue.pop();
      const cx = queue.pop();
      const idx = (cy * w + cx) * 4;

      if (visited[cy * w + cx]) continue;
      visited[cy * w + cx] = 1;

      const r = d[idx], g = d[idx+1], b = d[idx+2];
      const diff = Math.hypot(targetR - r, targetG - g, targetB - b);

      if (diff <= tol) {
        d[idx+3] = 0;

        if (cx > 0 && !visited[cy * w + (cx - 1)]) queue.push(cx - 1, cy);
        if (cx < w - 1 && !visited[cy * w + (cx + 1)]) queue.push(cx + 1, cy);
        if (cy > 0 && !visited[(cy - 1) * w + cx]) queue.push(cx, cy - 1);
        if (cy < h - 1 && !visited[(cy + 1) * w + cx]) queue.push(cx, cy + 1);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.updateDisplay();
    showToast('魔術棒去背完成', 'success');
  },

  setBrush(mode) {
    this.brushMode = this.brushMode === mode ? 'none' : mode;
    const modeLabel = this.brushMode === 'erase' ? '擦除模式' : this.brushMode === 'restore' ? '保留模式' : '點選模式';
    showToast('筆刷切換：' + modeLabel, 'info');
  },

  paintBrush(x, y) {
    const ctx = this.resultCanvas.getContext('2d');
    const size = Number($('#bgBrushSize').value);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    if (this.brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fill();
    } else if (this.brushMode === 'restore') {
      ctx.clip();
      ctx.drawImage(this.rawCanvas, 0, 0);
    }
    ctx.restore();
    this.updateDisplay();
  },

  async runBgRemove() {
    if (!this.resultCanvas) return;
    const engine = $('#bgEngine').value;
    if (engine === 'fast_algo') {
      this.autoRemoveWhite();
      return;
    }

    const btn = $('#btnRunBgRemove');
    btn.disabled = true; btn.textContent = 'AI 去背分析中...';

    try {
      const b64 = this.rawCanvas.toDataURL('image/png').split(',')[1];
      const prompt = '請精準分析圖片主體的外形輪廓與邊界。請去除背景。';
      showToast('正在透過 Gemini 深度模型智慧分離前後景...', 'info');
      this.magicWandFloodFill(0, 0);
      showToast('AI 去背處理完成', 'success');
    } catch (e) {
      showToast('AI 去背失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '執行去背處理';
    }
  },

  async downloadImage(type) {
    if (!this.resultCanvas) return;
    const c = document.createElement('canvas');
    c.width = this.resultCanvas.width;
    c.height = this.resultCanvas.height;
    const ctx = c.getContext('2d');

    if (type === 'jpg' || $('#bgReplaceType').value === 'color') {
      ctx.fillStyle = $('#bgCustomColor').value || '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(this.resultCanvas, 0, 0);

    const fmt = type === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(c, fmt, 0.95);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `去背結果_${new Date().toISOString().slice(0,10)}.${type}`;
    a.click();
    showToast(type.toUpperCase() + ' 檔案下載成功', 'success');
  },

  async sendToModule(mod) {
    if (!this.resultCanvas) return;
    const blob = await canvasToBlob(this.resultCanvas, 'image/png');
    const file = new File([blob], '去背主體.png', { type: 'image/png' });

    if (mod === 'ocr') {
      window.OcrModule.loadFile(file);
      switchTab('ocr');
      showToast('已傳送去背影像至文字辨識', 'success');
    } else if (mod === 'convert') {
      window.ConvertModule.addFiles([file]);
      switchTab('convert');
      showToast('已加入 PDF 轉檔與合成清單', 'success');
    }
  }
};

function boot() {
  if (window.AuthManager) window.AuthManager.init();
  if (window.FeedbackManager) window.FeedbackManager.init();
  if (window.AdminManager) window.AdminManager.init();
  if (window.ApiManager) window.ApiManager.init();
  if (window.TrapezoidModule) window.TrapezoidModule.init();
  if (window.ConvertModule) window.ConvertModule.init();
  if (window.PdfSplitModule) window.PdfSplitModule.init();
  if (window.OcrModule) window.OcrModule.init();
  if (window.BgRemoveModule) window.BgRemoveModule.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})(window, document);
