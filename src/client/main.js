(function(window, document) {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

window.resetAllModules = function() {
  if (window.TrapezoidModule && window.TrapezoidModule.clear) window.TrapezoidModule.clear();
  if (window.ConvertModule && window.ConvertModule.clear) window.ConvertModule.clear();
  if (window.PdfSplitModule && window.PdfSplitModule.clear) window.PdfSplitModule.clear();
  if (window.OcrModule && window.OcrModule.clear) window.OcrModule.clear();
  if (window.BgRemoveModule && window.BgRemoveModule.clear) window.BgRemoveModule.clear();
};

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
      // 確保跨裝置、本機與雲端唯一：全系統僅存在唯一 developer 與 admin 帳號
      const seen = new Set();
      users = users.filter(u => {
        const uname = (u.username || '').toLowerCase();
        if (seen.has(uname)) return false;
        seen.add(uname);
        return true;
      });

      if (!users.some(u => u.username.toLowerCase() === 'admin')) {
        users.unshift({
          id: 'admin-root',
          username: 'admin',
          password: 'admin888',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
      }
      if (!users.some(u => u.username.toLowerCase() === 'developer')) {
        users.push({
          id: 'dev-root',
          username: 'developer',
          password: 'dev888',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
      }
      localStorage.setItem('pobi_users', JSON.stringify(users));
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
    if (window.resetAllModules) window.resetAllModules();
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
    if (window.resetAllModules) window.resetAllModules();
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

  async setupDeveloperAccount() {
    this.showAlert('正在開通並同步開發者管理員帳號...', 'info');
    try {
      const res = await fetch('/api/auth/dev-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          this.currentUser = data.user;
          localStorage.setItem('pobi_session', JSON.stringify(this.currentUser));
          this.showAlert('開發者管理員帳號 (developer) 已快速開通並雲端同步登入！', 'success');
          setTimeout(() => {
            this.unlockApp();
            showToast('歡迎開發者 developer！具備完整多媒體與後台最高管理權限。', 'success');
            if (window.AdminManager) window.AdminManager.renderUsers();
          }, 350);
          return;
        }
      }
    } catch {}

    // 本機備援
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

  async handleSubmit() {
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

    if (this.mode === 'register') {
      const cp = $('#authConfirmPassword')?.value;
      if (p !== cp) {
        this.showAlert('兩次輸入的密碼不一致');
        return;
      }

      this.showAlert('正在向雲端註冊帳號並同步...', 'info');

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          this.currentUser = data.user;
          const storage = remember ? localStorage : sessionStorage;
          storage.setItem('pobi_session', JSON.stringify(this.currentUser));

          // 同步到本地備份
          const users = this.getUsers();
          if (!users.some(x => x.username.toLowerCase() === u.toLowerCase())) {
            users.push({ id: data.user.id, username: u, password: p, role: data.user.role, createdAt: new Date().toISOString() });
            this.saveUsers(users);
          }

          this.showAlert('註冊成功並已同步至雲端，歡迎使用 Pobi Media！', 'success');
          setTimeout(() => {
            this.unlockApp();
            showToast(`註冊成功，歡迎 ${data.user.username} 進入 Pobi Media 專業工作站！`, 'success');
            if (window.AdminManager) window.AdminManager.renderUsers();
          }, 400);
          return;
        } else {
          this.showAlert(data.error || '註冊失敗，請重試');
          return;
        }
      } catch {
        // 離線/本地備援註冊
        const users = this.getUsers();
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
      }
    } else {
      this.showAlert('正在驗證跨裝置雲端帳號...', 'info');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          this.currentUser = data.user;
          const storage = remember ? localStorage : sessionStorage;
          storage.setItem('pobi_session', JSON.stringify(this.currentUser));

          // 同步到本地備份
          const users = this.getUsers();
          let localUser = users.find(x => x.username.toLowerCase() === u.toLowerCase());
          if (!localUser) {
            users.push({ id: data.user.id, username: u, password: p, role: data.user.role, createdAt: new Date().toISOString() });
            this.saveUsers(users);
          }

          this.showAlert('登入成功，正在為您載入工作台...', 'success');
          setTimeout(() => {
            this.unlockApp();
            showToast(`歡迎回來，${data.user.username}！`, 'success');
          }, 350);
          return;
        } else {
          this.showAlert(data.error || '登入失敗，請確認帳號與密碼');
          return;
        }
      } catch {
        // 離線/本地備援登入
        const users = this.getUsers();
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

// ==================== 全功能使用說明與手冊管理器 (HelpManager) ====================
window.HelpManager = {
  init() {
    const btnOpen = $('#btnOpenHelpModal');
    const modal = $('#helpModal');
    const btnClose1 = $('#btnCloseHelpModal');
    const btnClose2 = $('#btnCloseHelpModal2');

    if (btnOpen && modal) {
      btnOpen.onclick = () => modal.classList.add('active');
    }
    if (btnClose1 && modal) {
      btnClose1.onclick = () => modal.classList.remove('active');
    }
    if (btnClose2 && modal) {
      btnClose2.onclick = () => modal.classList.remove('active');
    }

    // 分頁標籤切換
    $$('.help-tab-btn').forEach(btn => {
      btn.onclick = () => {
        $$('.help-tab-btn').forEach(b => b.classList.remove('active'));
        $$('.help-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = $('#pane-help-' + btn.dataset.helpPane);
        if (target) target.classList.add('active');
      };
    });
  }
};

// ==================== 使用者意見回饋管理器 (FeedbackManager) ====================
window.FeedbackManager = {
  init() {
    const el__btnOpenFeedbackModal = $('#btnOpenFeedbackModal'); if (el__btnOpenFeedbackModal) el__btnOpenFeedbackModal.onclick = () => $('#feedbackModal').classList.add('active');
    const el__btnCloseFeedbackModal = $('#btnCloseFeedbackModal'); if (el__btnCloseFeedbackModal) el__btnCloseFeedbackModal.onclick = () => $('#feedbackModal').classList.remove('active');

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
    const el__btnOpenAdminModal = $('#btnOpenAdminModal'); if (el__btnOpenAdminModal) el__btnOpenAdminModal.onclick = () => {
      if (window.AuthManager?.currentUser?.role !== 'admin') {
        showToast('您無權限存取管理控制台', 'error');
        return;
      }
      this.renderUsers();
      this.renderFeedback();
      this.loadPublicApiConfig();
      $('#adminModal').classList.add('active');
    };

    const el__btnCloseAdminModal = $('#btnCloseAdminModal'); if (el__btnCloseAdminModal) el__btnCloseAdminModal.onclick = () => $('#adminModal').classList.remove('active');
    const el__btnCloseAdminModal2 = $('#btnCloseAdminModal2'); if (el__btnCloseAdminModal2) el__btnCloseAdminModal2.onclick = () => $('#adminModal').classList.remove('active');

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
    const searchEl = $('#adminUserSearch'); if (searchEl) searchEl.oninput = (e) => {
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
    const el__btnAdminSavePublicApi = $('#btnAdminSavePublicApi'); if (el__btnAdminSavePublicApi) el__btnAdminSavePublicApi.onclick = () => {
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
    const el__btnAdminTestApi = $('#btnAdminTestApi'); if (el__btnAdminTestApi) el__btnAdminTestApi.onclick = () => this.testApiConnection();
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
    const el__btnSaveApiKey = $('#btnSaveApiKey'); if (el__btnSaveApiKey) el__btnSaveApiKey.onclick = () => {
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
    const el__btnClearApiKey = $('#btnClearApiKey'); if (el__btnClearApiKey) el__btnClearApiKey.onclick = () => {
      this.userKey = '';
      localStorage.removeItem('user_gemini_api_key');
      $('#inputUserApiKey').value = '';
      showToast('已清除自備金鑰，切換為公用配額模式', 'info');
      this.updateBadge();
    };
    const el__btnToggleKeyVisibility = $('#btnToggleKeyVisibility'); if (el__btnToggleKeyVisibility) el__btnToggleKeyVisibility.onclick = () => {
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
    if (window.location.protocol === 'file:') {
      this.serverStatus = {
        hasPublicApi: false,
        dailyLimitPerUser: 5,
        remainingToday: 0,
        isAvailable: true
      };
      const srvKey = $('#srvKeyStatus');
      if (srvKey) srvKey.textContent = '本機單機模式 (可使用離線 OCR 或輸入個人金鑰)';
      const srvQuota = $('#srvQuotaLeft');
      if (srvQuota) srvQuota.textContent = '無限制 (離線/自備)';
      this.updateBadge();
      return;
    }

    try {
      const res = await fetch('/api/status');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        this.serverStatus = await res.json();
        const srvKey = $('#srvKeyStatus');
        if (srvKey) srvKey.textContent = this.serverStatus.hasPublicApi ? '已啟用 (伺服器就緒)' : '未配置 (請使用離線 OCR 或輸入個人金鑰)';
        const srvQuota = $('#srvQuotaLeft');
        if (srvQuota) srvQuota.textContent = this.serverStatus.hasPublicApi ? this.serverStatus.remainingToday : 0;
      } else {
        const srvKey = $('#srvKeyStatus');
        if (srvKey) srvKey.textContent = '純前端模式 (請使用離線 OCR 或貼上個人金鑰)';
      }
    } catch (e) {
      const srvKey = $('#srvKeyStatus');
      if (srvKey) srvKey.textContent = '離線 / 本地單機模式';
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

    if (this.userKey && this.userKey.trim().length > 0) {
      const cleanKey = this.userKey.trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(cleanKey)}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${res.status}`;
          throw new Error(`Google Gemini 官方回傳錯誤: ${errMsg}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (netErr) {
        if (netErr.message.includes('Google Gemini 官方回傳錯誤')) throw netErr;
        throw new Error(`連線至 Google 官方伺服器失敗 (${netErr.message})。請檢查網路或 API Key 是否正確。`);
      }
    }

    if (window.location.protocol === 'file:' || !this.serverStatus.hasPublicApi) {
      $('#apiModal')?.classList.add('active');
      throw new Error('尚未設定 Gemini API Key。請在彈出的視窗中貼上您的 Google Gemini API Key（支援新版 AQ. 前綴），或切換至「Tesseract 離線引擎」進行免費辨識！');
    }

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, model: 'gemini-3.6-flash' })
      });

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        $('#apiModal')?.classList.add('active');
        throw new Error('伺服器尚未配置公用金鑰。請在設定中輸入您的個人 Gemini API Key，或直接使用「Tesseract 本機離線 OCR」！');
      }

      if (res.status === 429) {
        this.checkServerStatus();
        throw new Error('今日公用免費配額已用完，請在右上角「AI 設定」輸入您的個人金鑰');
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
    } catch (e) {
      if (e.message.includes('尚未設定') || e.message.includes('公用免費配額') || e.message.includes('伺服器尚未配置')) {
        throw e;
      }
      throw new Error('無法連線至 AI 代理伺服器。建議點選右上角輸入自備 Gemini API Key 直接連線 Google 官方！');
    }
  }
};

$('#quotaBadge').onclick = () => $('#apiModal').classList.add('active');
const el__btnOpenApiModal = $('#btnOpenApiModal'); if (el__btnOpenApiModal) el__btnOpenApiModal.onclick = () => $('#apiModal').classList.add('active');
const el__btnCloseApiModal = $('#btnCloseApiModal'); if (el__btnCloseApiModal) el__btnCloseApiModal.onclick = () => $('#apiModal').classList.remove('active');
const el__btnCloseApiModal2 = $('#btnCloseApiModal2'); if (el__btnCloseApiModal2) el__btnCloseApiModal2.onclick = () => $('#apiModal').classList.remove('active');

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

    const el__trapClearAll = $('#trapClearAll'); if (el__trapClearAll) el__trapClearAll.onclick = () => {
      this.items.forEach(it => URL.revokeObjectURL(it.url));
      this.items = [];
      this.active = -1;
      this.render();
    };

    const el__trapReset = $('#trapReset'); if (el__trapReset) el__trapReset.onclick = () => {
      const it = this.items[this.active];
      if (it) {
        it.points = this.fitPoints(it.img.naturalWidth, it.img.naturalHeight);
        this.drawOverlay();
      }
    };
    const el__trapAuto = $('#trapAuto'); if (el__trapAuto) el__trapAuto.onclick = () => {
      const it = this.items[this.active];
      if (it) {
        const w = it.img.naturalWidth, h = it.img.naturalHeight, m = Math.min(w, h) * 0.08;
        it.points = [{ x: m, y: m }, { x: w - m, y: m }, { x: w - m, y: h - m }, { x: m, y: h - m }];
        this.drawOverlay();
      }
    };
    const el__trapRotL = $('#trapRotL'); if (el__trapRotL) el__trapRotL.onclick = () => this.rotate(-90);
    const el__trapRotR = $('#trapRotR'); if (el__trapRotR) el__trapRotR.onclick = () => this.rotate(90);
    const trapQ = $('#trapQuality'); if (trapQ) trapQ.oninput = e => $('#trapQualityVal').textContent = Math.round(e.target.value * 100) + '%';

    this.initInteraction();

    const el__trapDownloadCurrent = $('#trapDownloadCurrent'); if (el__trapDownloadCurrent) el__trapDownloadCurrent.onclick = () => this.exportCurrent();
    const btnExportPdf = $('#trapExportPdf');
    if (btnExportPdf) btnExportPdf.onclick = () => this.exportAsPdf(this.items);
    const el__trapDownloadAllZip = $('#trapDownloadAllZip'); if (el__trapDownloadAllZip) el__trapDownloadAllZip.onclick = () => this.exportAllZip();

    const el__trapSendToBg = $('#trapSendToBg'); if (el__trapSendToBg) el__trapSendToBg.onclick = () => this.sendToModule('bgremove');
    const el__trapSendToOcr = $('#trapSendToOcr'); if (el__trapSendToOcr) el__trapSendToOcr.onclick = () => this.sendToModule('ocr');
    const el__trapSendToPdf = $('#trapSendToPdf'); if (el__trapSendToPdf) el__trapSendToPdf.onclick = () => this.sendToModule('convert');
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
    const fmt = $('#trapFormat').value;
    if (fmt === 'application/pdf') {
      await this.exportAsPdf([it]);
      return;
    }
    const canvas = await this.getWarpedCanvas(it);
    const q = Number($('#trapQuality').value) || 0.92;
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
      const fmt = $('#trapFormat').value;
      const targetFmt = fmt === 'application/pdf' ? 'image/jpeg' : fmt;
      const q = Number($('#trapQuality').value) || 0.92;
      const ext = targetFmt === 'image/jpeg' ? 'jpg' : targetFmt === 'image/png' ? 'png' : 'webp';
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        btn.textContent = `打包處理中 (${i+1}/${this.items.length})...`;
        const c = await this.getWarpedCanvas(it);
        const b = await canvasToBlob(c, targetFmt, q);
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

  async exportAsPdf(items) {
    if (!items || !items.length) {
      showToast('請先加入並選擇圖片', 'warning');
      return;
    }
    const btn = $('#trapExportPdf') || $('#trapDownloadCurrent');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '合成 PDF 中...'; }

    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF 處理函式庫尚未載入完成');
      }
      const pdfDoc = await PDFLib.PDFDocument.create();
      const q = Number($('#trapQuality').value) || 0.92;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (btn) btn.textContent = `處理第 ${i+1}/${items.length} 頁...`;
        const c = await this.getWarpedCanvas(it);
        const b = await canvasToBlob(c, 'image/jpeg', q);
        const embedded = await pdfDoc.embedJpg(await b.arrayBuffer());
        const page = pdfDoc.addPage([embedded.width, embedded.height]);
        page.drawImage(embedded, {
          x: 0,
          y: 0,
          width: embedded.width,
          height: embedded.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const filename = items.length === 1
        ? items[0].file.name.replace(/\.[^.]+$/, '') + '-校正.pdf'
        : `PobiMedia_校正多頁文件_${new Date().toISOString().slice(0,10)}.pdf`;
      a.download = filename;
      a.click();
      showToast('PDF 匯出下載成功', 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF 匯出失敗: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText || '批次合併匯出為多頁 PDF'; }
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

    const el__convClearAll = $('#convClearAll'); if (el__convClearAll) el__convClearAll.onclick = () => { this.files = []; this.render(); };
    const convQ = $('#convQuality'); if (convQ) convQ.oninput = e => $('#convQualityVal').textContent = Math.round(e.target.value * 100) + '%';

    const el__btnBuildPdf = $('#btnBuildPdf'); if (el__btnBuildPdf) el__btnBuildPdf.onclick = () => this.buildPdf();
    const el__btnBatchConvert = $('#btnBatchConvert'); if (el__btnBatchConvert) el__btnBatchConvert.onclick = () => this.batchConvertImages();
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
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF 處理函式庫尚未載入完成，請稍候重試');
      }
      const pdfDoc = await PDFLib.PDFDocument.create();
      const layout = $('#pdfPageLayout').value;
      const margin = Number($('#pdfMargin').value) || 0;

      for (let i = 0; i < this.files.length; i++) {
        const it = this.files[i];
        btn.textContent = `處理第 ${i+1}/${this.files.length} 頁...`;

        let imgCanvas = null;

        if (it.file.type.startsWith('image/')) {
          const { img: domImg } = await loadImageFromFile(it.file);
          imgCanvas = document.createElement('canvas');
          imgCanvas.width = domImg.naturalWidth;
          imgCanvas.height = domImg.naturalHeight;
          imgCanvas.getContext('2d').drawImage(domImg, 0, 0);
        } else if (it.file.name.endsWith('.txt') || it.file.name.endsWith('.md')) {
          const text = await it.file.text();
          imgCanvas = document.createElement('canvas');
          imgCanvas.width = 1200;
          imgCanvas.height = 1697; // A4 aspect ratio
          const ctx = imgCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 1200, 1697);
          ctx.fillStyle = '#111827';
          ctx.font = '26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif';

          const lines = text.split('\n');
          let y = 100;
          for (const line of lines) {
            if (y > 1600) break;
            ctx.fillText(line.slice(0, 70), 80, y);
            y += 38;
          }
        }

        if (imgCanvas) {
          const b = await canvasToBlob(imgCanvas, 'image/jpeg', 0.92);
          const embedded = await pdfDoc.embedJpg(await b.arrayBuffer());

          let pageW = 595.28, pageH = 841.89; // Standard A4
          if (layout === 'fit') {
            pageW = embedded.width + margin * 2;
            pageH = embedded.height + margin * 2;
          } else if (layout === 'letter') {
            pageW = 612; pageH = 792;
          }

          const page = pdfDoc.addPage([pageW, pageH]);
          const availW = Math.max(10, pageW - margin * 2);
          const availH = Math.max(10, pageH - margin * 2);
          const scale = Math.min(availW / embedded.width, availH / embedded.height, 1);
          const drawW = embedded.width * scale, drawH = embedded.height * scale;
          const drawX = margin + (availW - drawW) / 2;
          const drawY = margin + (availH - drawH) / 2;

          page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
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
      console.error(e);
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

  clear() {
    this.pdfDoc = null;
    this.pdfBytes = null;
    this.totalPages = 0;
    this.currentPage = 1;
    const fileIn = $('#splitFileIn');
    if (fileIn) fileIn.value = '';
    const canvas = $('#splitPdfCanvas'), ovr = $('#splitCutOverlay');
    if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    if (ovr) { const ctx = ovr.getContext('2d'); ctx.clearRect(0, 0, ovr.width, ovr.height); }
    const wrap = $('#splitCanvasWrap');
    if (wrap) wrap.style.display = 'none';
    const hint = $('#splitEmptyHint');
    if (hint) hint.style.display = 'block';
    const pageCnt = $('#splitPageCount');
    if (pageCnt) pageCnt.textContent = '0 頁';
    const btnExp = $('#btnExportSplitPdf');
    if (btnExp) btnExp.disabled = true;
    showToast('已清空 PDF 檔案', 'info');
  },

  init() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const drop = $('#splitDrop'), fileIn = $('#splitFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { if (e.target.files[0]) this.loadPdf(e.target.files[0]); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadPdf(e.dataTransfer.files[0]); };

    const el__splitPresetV50 = $('#splitPresetV50'); if (el__splitPresetV50) el__splitPresetV50.onclick = () => { $('#splitDirection').value = 'vertical'; this.setRatio(0.5); };
    const el__splitPresetH50 = $('#splitPresetH50'); if (el__splitPresetH50) el__splitPresetH50.onclick = () => { $('#splitDirection').value = 'horizontal'; this.setRatio(0.5); };
    const splitR = $('#splitRatio'); if (splitR) splitR.oninput = e => this.setRatio(e.target.value / 100);

    const el__splitPrevPage = $('#splitPrevPage'); if (el__splitPrevPage) el__splitPrevPage.onclick = () => { if (this.currentPage > 1) { this.currentPage--; this.renderPage(); } };
    const el__splitNextPage = $('#splitNextPage'); if (el__splitNextPage) el__splitNextPage.onclick = () => { if (this.currentPage < this.totalPages) { this.currentPage++; this.renderPage(); } };

    const el__splitApplyAll = $('#splitApplyAll'); if (el__splitApplyAll) el__splitApplyAll.onclick = () => showToast('已套用切割線設定至所有頁面', 'success');
    const el__btnExportSplitPdf = $('#btnExportSplitPdf'); if (el__btnExportSplitPdf) el__btnExportSplitPdf.onclick = () => this.exportSplitPdf();
    const btnClrSplit = $('#btnClearPdfSplit');
    if (btnClrSplit) btnClrSplit.onclick = () => this.clear();

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
    if (!this.pdfBytes || !this.pdfDoc) return;
    const btn = $('#btnExportSplitPdf');
    btn.disabled = true; btn.textContent = '分割生成新 PDF 中...';

    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF 處理函式庫尚未載入完成');
      }
      const outDoc = await PDFLib.PDFDocument.create();
      const dir = $('#splitDirection').value;
      const order = $('#splitOrder').value;
      const total = this.pdfDoc.numPages;

      for (let i = 1; i <= total; i++) {
        btn.textContent = `處理第 ${i}/${total} 頁...`;
        const page = await this.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // 2x resolution
        const c = document.createElement('canvas');
        c.width = viewport.width;
        c.height = viewport.height;
        const ctx = c.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (dir === 'vertical') {
          const cutX = Math.round(c.width * this.splitRatio);
          const wLeft = cutX, wRight = c.width - cutX;

          const cLeft = document.createElement('canvas');
          cLeft.width = wLeft; cLeft.height = c.height;
          cLeft.getContext('2d').drawImage(c, 0, 0, wLeft, c.height, 0, 0, wLeft, c.height);

          const cRight = document.createElement('canvas');
          cRight.width = wRight; cRight.height = c.height;
          cRight.getContext('2d').drawImage(c, cutX, 0, wRight, c.height, 0, 0, wRight, c.height);

          const bLeft = await canvasToBlob(cLeft, 'image/jpeg', 0.92);
          const bRight = await canvasToBlob(cRight, 'image/jpeg', 0.92);

          const embLeft = await outDoc.embedJpg(await bLeft.arrayBuffer());
          const embRight = await outDoc.embedJpg(await bRight.arrayBuffer());

          const first = (order === 'rtl') ? embRight : embLeft;
          const second = (order === 'rtl') ? embLeft : embRight;

          const p1 = outDoc.addPage([first.width / 2, first.height / 2]);
          p1.drawImage(first, { x: 0, y: 0, width: first.width / 2, height: first.height / 2 });

          const p2 = outDoc.addPage([second.width / 2, second.height / 2]);
          p2.drawImage(second, { x: 0, y: 0, width: second.width / 2, height: second.height / 2 });
        } else {
          const cutY = Math.round(c.height * this.splitRatio);
          const hTop = cutY, hBot = c.height - cutY;

          const cTop = document.createElement('canvas');
          cTop.width = c.width; cTop.height = hTop;
          cTop.getContext('2d').drawImage(c, 0, 0, c.width, hTop, 0, 0, c.width, hTop);

          const cBot = document.createElement('canvas');
          cBot.width = c.width; cBot.height = hBot;
          cBot.getContext('2d').drawImage(c, 0, cutY, c.width, hBot, 0, 0, c.width, hBot);

          const bTop = await canvasToBlob(cTop, 'image/jpeg', 0.92);
          const bBot = await canvasToBlob(cBot, 'image/jpeg', 0.92);

          const embTop = await outDoc.embedJpg(await bTop.arrayBuffer());
          const embBot = await outDoc.embedJpg(await bBot.arrayBuffer());

          const p1 = outDoc.addPage([embTop.width / 2, embTop.height / 2]);
          p1.drawImage(embTop, { x: 0, y: 0, width: embTop.width / 2, height: embTop.height / 2 });

          const p2 = outDoc.addPage([embBot.width / 2, embBot.height / 2]);
          p2.drawImage(embBot, { x: 0, y: 0, width: embBot.width / 2, height: embBot.height / 2 });
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
      console.error(e);
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

  clear() {
    this.currentImg = null;
    this.cropRect = null;
    const fileIn = $('#ocrFileIn');
    if (fileIn) fileIn.value = '';
    const c1 = $('#ocrImgCanvas'), c2 = $('#ocrSelectOverlay');
    if (c1) { const ctx = c1.getContext('2d'); ctx.clearRect(0, 0, c1.width, c1.height); }
    if (c2) { const ctx = c2.getContext('2d'); ctx.clearRect(0, 0, c2.width, c2.height); }
    const wrap = $('#ocrCanvasWrap');
    if (wrap) wrap.style.display = 'none';
    const hint = $('#ocrEmptyHint');
    if (hint) hint.style.display = 'block';
    const res = $('#ocrResultText');
    if (res) res.value = '';
    const btn = $('#btnStartOcr');
    if (btn) btn.disabled = true;
    const prog = $('#ocrProgressWrap');
    if (prog) prog.style.display = 'none';
    showToast('已清除 OCR 圖片與辨識結果', 'info');
  },

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

    const el__btnStartOcr = $('#btnStartOcr'); if (el__btnStartOcr) el__btnStartOcr.onclick = () => this.runOcr();
    const btnClrOcr = $('#btnClearOcr');
    if (btnClrOcr) btnClrOcr.onclick = () => this.clear();

    const el__btnCopyOcrText = $('#btnCopyOcrText'); if (el__btnCopyOcrText) el__btnCopyOcrText.onclick = () => {
      const txt = $('#ocrResultText').value;
      if (!txt) { showToast('辨識結果為空', 'warning'); return; }
      navigator.clipboard.writeText(txt);
      showToast('文字已複製至剪貼簿', 'success');
    };
    const el__btnSaveOcrTxt = $('#btnSaveOcrTxt'); if (el__btnSaveOcrTxt) el__btnSaveOcrTxt.onclick = () => this.saveText('txt');
    const el__btnSaveOcrMd = $('#btnSaveOcrMd'); if (el__btnSaveOcrMd) el__btnSaveOcrMd.onclick = () => this.saveText('md');

    this.initSelectionOverlay();
  },

  async loadSample() {
    const c = document.createElement('canvas');
    c.width = 680; c.height = 360;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 680, 360);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('電子發票證明聯 / 收據測試樣張', 40, 50);

    ctx.font = '18px monospace';
    ctx.fillStyle = '#334155';
    ctx.fillText('發票號碼: AB-99882233', 40, 90);
    ctx.fillText('開立日期: 2026-08-30 12:00:00', 40, 120);
    ctx.fillText('品名規格              數量    單價    金額', 40, 160);
    ctx.fillText('------------------------------------------', 40, 185);
    ctx.fillText('拿鐵咖啡 (大杯/冰)      2     $120   $240', 40, 215);
    ctx.fillText('法式可頌麵包            1      $65    $65', 40, 245);
    ctx.fillText('------------------------------------------', 40, 275);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('應付總額: NT$ 305 元', 40, 315);

    c.toBlob(blob => {
      const file = new File([blob], '發票收據測試樣張.png', { type: 'image/png' });
      this.loadFile(file);
      showToast('已載入發票收據測試範例圖', 'success');
    }, 'image/png');
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
    ctx.lineWidth = 2;
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

      if (scope === 'crop' && this.cropRect && this.cropRect.w > 10 && this.cropRect.h > 10) {
        c.width = Math.round(this.cropRect.w * scaleX);
        c.height = Math.round(this.cropRect.h * scaleY);
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
        $('#ocrProgressLabel').textContent = '載入 Tesseract 離線引擎...';
        const lang = $('#ocrLanguage').value || 'chi_tra';

        const worker = await Tesseract.createWorker(lang, 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const p = Math.round((m.progress || 0) * 100);
              $('#ocrProgressBar').style.width = p + '%';
              $('#ocrProgressVal').textContent = p + '%';
              $('#ocrProgressLabel').textContent = `文字辨識中 (${p}%)...`;
            } else {
              $('#ocrProgressLabel').textContent = m.status || '處理中...';
            }
          }
        });

        const ret = await worker.recognize(c);
        await worker.terminate();
        $('#ocrResultText').value = ret.data.text.trim();
        $('#ocrProgressBar').style.width = '100%';
        $('#ocrProgressVal').textContent = '100%';
        showToast('Tesseract 本地離線辨識完成', 'success');
      } else {
        $('#ocrProgressLabel').textContent = 'Google Gemini AI 智慧排版分析中...';
        $('#ocrProgressBar').style.width = '45%';
        $('#ocrProgressVal').textContent = '45%';

        const b64 = c.toDataURL('image/png').split(',')[1];
        const prompt = '請以純文字格式完整提取這張圖片中的所有文字。請保留原始段落換行與排版，若是表格請轉換為 Markdown 表格格式，請勿額外添加說明廢話，僅輸出提取到的文字內容。';

        const text = await ApiManager.callGeminiVision(b64, prompt);
        $('#ocrResultText').value = text.trim();
        $('#ocrProgressBar').style.width = '100%';
        $('#ocrProgressVal').textContent = '100%';
        showToast('Gemini AI 辨識完成', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('OCR 辨識失敗: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        const wrap = $('#ocrProgressWrap');
        if (wrap) wrap.style.display = 'none';
      }, 1200);
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
  isPainting: false,

  clear() {
    this.currentImg = null;
    this.rawCanvas = null;
    this.resultCanvas = null;
    const fileIn = $('#bgFileIn');
    if (fileIn) fileIn.value = '';
    const wrap = $('#bgCanvasWrap');
    if (wrap) wrap.style.display = 'none';
    const hint = $('#bgEmptyHint');
    if (hint) hint.style.display = 'block';
    const btnRun = $('#btnRunBgRemove');
    if (btnRun) btnRun.disabled = true;
    const btnReset = $('#btnResetBg');
    if (btnReset) btnReset.disabled = true;
    const dlPng = $('#btnDownloadBgPng'), dlJpg = $('#btnDownloadBgJpg');
    if (dlPng) dlPng.disabled = true;
    if (dlJpg) dlJpg.disabled = true;
    showToast('已清除去背圖片', 'info');
  },

  init() {
    const drop = $('#bgDrop'), fileIn = $('#bgFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { if (e.target.files[0]) this.loadFile(e.target.files[0]); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadFile(e.dataTransfer.files[0]); };

    const bgTol = $('#bgTolerance'); if (bgTol) bgTol.oninput = e => $('#bgToleranceVal').textContent = e.target.value;
    const bgFea = $('#bgFeather'); if (bgFea) bgFea.oninput = e => $('#bgFeatherVal').textContent = e.target.value + 'px';
    const bgBrush = $('#bgBrushSize'); if (bgBrush) bgBrush.oninput = e => $('#bgBrushSizeVal').textContent = e.target.value;

    const btnAuto = $('#btnAutoWhiteClean');
    if (btnAuto) btnAuto.onclick = () => this.autoRemoveWhite();

    const btnRun = $('#btnRunBgRemove');
    if (btnRun) btnRun.onclick = () => this.runBgRemove();
    const btnClrBg = $('#btnClearBgRemove');
    if (btnClrBg) btnClrBg.onclick = () => this.clear();

    const btnReset = $('#btnResetBg');
    if (btnReset) btnReset.onclick = () => this.resetImage();

    const btnErase = $('#bgBrushErase');
    if (btnErase) btnErase.onclick = () => this.setBrush('erase');

    const btnRestore = $('#bgBrushRestore');
    if (btnRestore) btnRestore.onclick = () => this.setBrush('restore');

    $('#bgReplaceType').onchange = e => {
      $('#bgColorRow').style.display = e.target.value === 'color' ? 'flex' : 'none';
      this.updateDisplay();
    };
    const bgCol = $('#bgCustomColor'); if (bgCol) bgCol.oninput = () => this.updateDisplay();
    $$('.color-quick').forEach(b => {
      b.onclick = () => {
        $('#bgCustomColor').value = b.dataset.c;
        $('#bgReplaceType').value = 'color';
        $('#bgColorRow').style.display = 'flex';
        this.updateDisplay();
      };
    });

    const el__btnDownloadBgPng = $('#btnDownloadBgPng'); if (el__btnDownloadBgPng) el__btnDownloadBgPng.onclick = () => this.downloadImage('png');
    const el__btnDownloadBgJpg = $('#btnDownloadBgJpg'); if (el__btnDownloadBgJpg) el__btnDownloadBgJpg.onclick = () => this.downloadImage('jpg');

    $('#bgSendToOcr').onclick = () => this.sendToModule('ocr');
    $('#bgSendToPdf').onclick = () => this.sendToModule('convert');

    this.initCanvasInteractions();
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

      const btnRun = $('#btnRunBgRemove');
      if (btnRun) btnRun.disabled = false;
      const btnReset = $('#btnResetBg');
      if (btnReset) btnReset.disabled = false;
      $('#btnDownloadBgPng').disabled = false;
      $('#btnDownloadBgJpg').disabled = false;
      $('#bgEmptyHint').style.display = 'none';
      $('#bgCanvasWrap').style.display = 'block';

      this.updateDisplay();
      showToast('圖片已載入，點選「一鍵執行智慧去背」或點擊背景進行魔術棒去背', 'success');
    } catch (e) {
      showToast('載入圖片失敗: ' + e.message, 'error');
    }
  },

  resetImage() {
    if (!this.rawCanvas || !this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.resultCanvas.width, this.resultCanvas.height);
    ctx.drawImage(this.rawCanvas, 0, 0);
    this.updateDisplay();
    showToast('已還原為原始圖片', 'info');
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
    out.style.width = w + 'px'; out.style.height = h + 'px';
    ovr.style.width = w + 'px'; ovr.style.height = h + 'px';

    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if ($('#bgReplaceType').value === 'color') {
      ctx.fillStyle = $('#bgCustomColor').value || '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(this.resultCanvas, 0, 0, w, h);
  },

  initCanvasInteractions() {
    const ovr = $('#bgBrushOverlay');

    const getPos = e => {
      const r = ovr.getBoundingClientRect();
      const scaleX = this.resultCanvas.width / r.width;
      const scaleY = this.resultCanvas.height / r.height;
      return {
        x: Math.max(0, Math.min(this.resultCanvas.width - 1, Math.round((e.clientX - r.left) * scaleX))),
        y: Math.max(0, Math.min(this.resultCanvas.height - 1, Math.round((e.clientY - r.top) * scaleY))),
        screenX: e.clientX - r.left,
        screenY: e.clientY - r.top
      };
    };

    ovr.addEventListener('pointerdown', e => {
      if (!this.resultCanvas) return;
      ovr.setPointerCapture(e.pointerId);
      const pos = getPos(e);

      if (this.brushMode === 'erase' || this.brushMode === 'restore') {
        this.isPainting = true;
        this.paintBrush(pos.x, pos.y);
      } else {
        this.magicWandFloodFill(pos.x, pos.y);
      }
    });

    ovr.addEventListener('pointermove', e => {
      if (!this.resultCanvas) return;
      const pos = getPos(e);

      // Draw cursor ring
      const ctx = ovr.getContext('2d');
      ctx.clearRect(0, 0, ovr.width, ovr.height);

      if (this.brushMode === 'erase' || this.brushMode === 'restore') {
        const r = ovr.getBoundingClientRect();
        const displayScale = r.width / this.resultCanvas.width;
        const size = Number($('#bgBrushSize').value) * displayScale;

        ctx.beginPath();
        ctx.arc(pos.screenX, pos.screenY, size, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.brushMode === 'erase' ? '#ef4444' : '#22c55e';
        ctx.stroke();

        if (this.isPainting) {
          this.paintBrush(pos.x, pos.y);
        }
      } else {
        // Crosshair cursor dot for magic wand
        ctx.beginPath();
        ctx.arc(pos.screenX, pos.screenY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    const end = () => {
      this.isPainting = false;
    };
    ovr.addEventListener('pointerup', end);
    ovr.addEventListener('pointercancel', end);
    ovr.addEventListener('pointerleave', () => {
      const ctx = ovr.getContext('2d');
      ctx.clearRect(0, 0, ovr.width, ovr.height);
      this.isPainting = false;
    });
  },

  setBrush(mode) {
    if (this.brushMode === mode) {
      this.brushMode = 'none';
      $('#bgBrushErase')?.classList.remove('active');
      $('#bgBrushRestore')?.classList.remove('active');
      showToast('已切換為魔術棒點選模式（點擊任何背景處可直接去除）', 'info');
    } else {
      this.brushMode = mode;
      $('#bgBrushErase')?.classList.toggle('active', mode === 'erase');
      $('#bgBrushRestore')?.classList.toggle('active', mode === 'restore');
      const label = mode === 'erase' ? '擦除背景筆刷 (拖曳塗抹)' : '保留主體筆刷 (拖曳修補)';
      showToast('筆刷切換：' + label, 'info');
    }
  },

  paintBrush(x, y) {
    if (!this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    const size = Number($('#bgBrushSize').value);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    if (this.brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000000';
      ctx.fill();
    } else if (this.brushMode === 'restore') {
      ctx.clip();
      ctx.drawImage(this.rawCanvas, 0, 0);
    }
    ctx.restore();
    this.updateDisplay();
  },

  magicWandFloodFill(startX, startY) {
    if (!this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    const w = this.resultCanvas.width, h = this.resultCanvas.height;
    if (startX < 0 || startX >= w || startY < 0 || startY >= h) return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const startIdx = (startY * w + startX) * 4;
    const startR = d[startIdx], startG = d[startIdx+1], startB = d[startIdx+2], startA = d[startIdx+3];
    if (startA === 0) return;

    const tol = (Number($('#bgTolerance')?.value) || 35) * 2.2;
    const visited = new Uint8Array(w * h);
    const queue = [startX, startY];

    while (queue.length > 0) {
      const cy = queue.pop();
      const cx = queue.pop();
      const pos = cy * w + cx;

      if (visited[pos]) continue;
      visited[pos] = 1;

      const idx = pos * 4;
      const r = d[idx], g = d[idx+1], b = d[idx+2];
      const diff = Math.hypot(startR - r, startG - g, startB - b);

      if (diff <= tol) {
        d[idx+3] = 0;

        if (cx > 0 && !visited[pos - 1]) queue.push(cx - 1, cy);
        if (cx < w - 1 && !visited[pos + 1]) queue.push(cx + 1, cy);
        if (cy > 0 && !visited[pos - w]) queue.push(cx, cy - 1);
        if (cy < h - 1 && !visited[pos + w]) queue.push(cx, cy + 1);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.applyFeather(imgData, Number($('#bgFeather')?.value) || 2);
    ctx.putImageData(imgData, 0, 0);

    this.updateDisplay();
    showToast('點選區域已清除', 'success');
  },

  autoRemoveWhite() {
    if (!this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    const w = this.resultCanvas.width, h = this.resultCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const tol = (Number($('#bgTolerance')?.value) || 35) * 2.5;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      // Check brightness & saturation
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const diffWhite = Math.hypot(255 - r, 255 - g, 255 - b);

      if (diffWhite <= tol || (lum >= 255 - tol * 1.5 && sat <= 18)) {
        d[i+3] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.applyFeather(imgData, Number($('#bgFeather')?.value) || 2);
    ctx.putImageData(imgData, 0, 0);

    this.updateDisplay();
    showToast('純白背景已清除', 'success');
  },

  smartAutoEdgeBgRemove() {
    if (!this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    const w = this.resultCanvas.width, h = this.resultCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Collect 32 border samples along outer perimeter
    const borderSamples = [];
    const stepX = Math.max(1, Math.floor(w / 8));
    const stepY = Math.max(1, Math.floor(h / 8));

    for (let x = 0; x < w; x += stepX) {
      const topIdx = (0 * w + x) * 4;
      const botIdx = ((h - 1) * w + x) * 4;
      borderSamples.push({ r: d[topIdx], g: d[topIdx+1], b: d[topIdx+2] });
      borderSamples.push({ r: d[botIdx], g: d[botIdx+1], b: d[botIdx+2] });
    }
    for (let y = 0; y < h; y += stepY) {
      const lIdx = (y * w + 0) * 4;
      const rIdx = (y * w + (w - 1)) * 4;
      borderSamples.push({ r: d[lIdx], g: d[lIdx+1], b: d[lIdx+2] });
      borderSamples.push({ r: d[rIdx], g: d[rIdx+1], b: d[rIdx+2] });
    }

    const tol = (Number($('#bgTolerance')?.value) || 35) * 2.4;
    const visited = new Uint8Array(w * h);
    const queue = [];

    // Initialize queue with all 4 boundary lines
    for (let x = 0; x < w; x++) {
      queue.push(x, 0);
      queue.push(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      queue.push(0, y);
      queue.push(w - 1, y);
    }

    while (queue.length > 0) {
      const cy = queue.pop();
      const cx = queue.pop();
      const pos = cy * w + cx;

      if (visited[pos]) continue;
      visited[pos] = 1;

      const idx = pos * 4;
      const r = d[idx], g = d[idx+1], b = d[idx+2];

      // Minimum distance to any border color sample
      let minDist = Infinity;
      for (let i = 0; i < borderSamples.length; i++) {
        const s = borderSamples[i];
        const dist = Math.hypot(s.r - r, s.g - g, s.b - b);
        if (dist < minDist) minDist = dist;
      }

      if (minDist <= tol) {
        d[idx+3] = 0;

        if (cx > 0 && !visited[pos - 1]) queue.push(cx - 1, cy);
        if (cx < w - 1 && !visited[pos + 1]) queue.push(cx + 1, cy);
        if (cy > 0 && !visited[pos - w]) queue.push(cx, cy - 1);
        if (cy < h - 1 && !visited[pos + w]) queue.push(cx, cy + 1);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.applyFeather(imgData, Number($('#bgFeather')?.value) || 2);
    ctx.putImageData(imgData, 0, 0);

    this.updateDisplay();
  },

  applyFeather(imgData, radius) {
    if (radius <= 0) return;
    const d = imgData.data;
    const w = imgData.width, h = imgData.height;
    const alphaMap = new Uint8Array(w * h);

    for (let i = 0; i < w * h; i++) {
      alphaMap[i] = d[i * 4 + 3];
    }

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (alphaMap[idx] === 0) continue;

        const isBorder =
          alphaMap[idx - 1] === 0 ||
          alphaMap[idx + 1] === 0 ||
          alphaMap[idx - w] === 0 ||
          alphaMap[idx + w] === 0;

        if (isBorder) {
          d[idx * 4 + 3] = Math.round(d[idx * 4 + 3] * 0.45);
        }
      }
    }
  },

  async runBgRemove() {
    if (!this.resultCanvas || !this.rawCanvas) {
      showToast('請先載入欲去背的圖片', 'warning');
      return;
    }
    const btn = $('#btnRunBgRemove');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'AI 深度輪廓分析中...';
    }

    try {
      showToast('正在透過 Gemini 深度視覺模型辨識主體輪廓...', 'info');

      const w = this.rawCanvas.width, h = this.rawCanvas.height;
      let aiSuccess = false;

      // 1. Attempt AI Vision Polygon Segmentation
      try {
        const thumbCanvas = document.createElement('canvas');
        const maxDim = 600;
        const scale = Math.min(maxDim / w, maxDim / h, 1);
        thumbCanvas.width = Math.round(w * scale);
        thumbCanvas.height = Math.round(h * scale);
        thumbCanvas.getContext('2d').drawImage(this.rawCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

        const b64 = thumbCanvas.toDataURL('image/png').split(',')[1];
        const prompt = 'Identify the primary foreground subject (person, animal, product, vehicle, food, main object) in this image. Return a JSON object with: 1. "polygon": [[y1, x1], [y2, x2], ...] an ordered array of 30 to 80 coordinate points (normalized 0 to 1000) closely tracing the subject outline. 2. "subjectBox": [ymin, xmin, ymax, xmax] (0-1000). Return JSON ONLY without markdown.';

        const aiText = await window.ApiManager.callGeminiVision(b64, prompt);
        if (aiText) {
          const cleanJson = aiText.replace(/```json|```/g, '').trim();
          const match = cleanJson.match(/\{[\s\S]*\}/);
          if (match) {
            const aiData = JSON.parse(match[0]);
            if (aiData.polygon && Array.isArray(aiData.polygon) && aiData.polygon.length >= 3) {
              const maskCanvas = document.createElement('canvas');
              maskCanvas.width = w; maskCanvas.height = h;
              const mCtx = maskCanvas.getContext('2d');
              mCtx.fillStyle = '#ffffff';
              mCtx.beginPath();

              const pts = aiData.polygon;
              mCtx.moveTo((pts[0][1] / 1000) * w, (pts[0][0] / 1000) * h);
              for (let i = 1; i < pts.length; i++) {
                mCtx.lineTo((pts[i][1] / 1000) * w, (pts[i][0] / 1000) * h);
              }
              mCtx.closePath();
              mCtx.fill();

              const resCtx = this.resultCanvas.getContext('2d');
              resCtx.clearRect(0, 0, w, h);
              resCtx.drawImage(this.rawCanvas, 0, 0);
              resCtx.globalCompositeOperation = 'destination-in';
              resCtx.drawImage(maskCanvas, 0, 0);
              resCtx.globalCompositeOperation = 'source-over';

              const imgData = resCtx.getImageData(0, 0, w, h);
              this.applyFeather(imgData, 2);
              resCtx.putImageData(imgData, 0, 0);

              this.updateDisplay();
              aiSuccess = true;
            }
          }
        }
      } catch (aiErr) {
        console.warn('AI Vision call info:', aiErr.message);
      }

      // 2. Fallback to smart edge flood-fill if AI Vision was not available or no polygon
      if (!aiSuccess) {
        this.smartAutoEdgeBgRemove();
      }

      $('#btnDownloadBgPng').disabled = false;
      $('#btnDownloadBgJpg').disabled = false;
      showToast('AI 智慧去背完成！您可使用筆刷修補或直接下載', 'success');
    } catch (e) {
      console.error(e);
      showToast('去背處理異常: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '開始 AI 智慧去背';
      }
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
  if (window.HelpManager) window.HelpManager.init();
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
