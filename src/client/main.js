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
    const btnOpen = $('#btnOpenAdminModal');
    if (btnOpen) {
      btnOpen.onclick = () => {
        if (window.AuthManager?.currentUser?.role !== 'admin') {
          showToast('您無權限存取管理控制台', 'error');
          return;
        }
        this.renderUsers();
        this.renderFeedback();
        $('#adminModal').classList.add('active');
      };
    }

    const btnClose1 = $('#btnCloseAdminModal');
    const btnClose2 = $('#btnCloseAdminModal2');
    if (btnClose1) btnClose1.onclick = () => $('#adminModal').classList.remove('active');
    if (btnClose2) btnClose2.onclick = () => $('#adminModal').classList.remove('active');

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

    const btnRefresh = $('#btnAdminRefreshUsers');
    if (btnRefresh) btnRefresh.onclick = () => this.renderUsers();

    const btnExport = $('#btnAdminExportFeedback');
    if (btnExport) {
      btnExport.onclick = () => {
        const list = window.FeedbackManager.getFeedback();
        const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pobi_feedback_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        showToast('已匯出回饋資料', 'success');
      };
    }

    const btnClearFb = $('#btnAdminClearFeedback');
    if (btnClearFb) {
      btnClearFb.onclick = () => {
        if (confirm('確定要清除所有使用者回饋記錄嗎？')) {
          localStorage.removeItem('pobi_feedback');
          this.renderFeedback();
          showToast('已清空所有回饋記錄', 'info');
        }
      };
    }
  },

  renderUsers() {
    const users = window.AuthManager.getUsers();
    const tbody = $('#adminUserListBody');
    if (!tbody) return;

    const countEl = $('#adminUserCount');
    if (countEl) countEl.textContent = users.length;
    tbody.innerHTML = '';

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px">目前無其他註冊帳號</td></tr>';
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '未知';
      const lastLoginStr = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '未記錄';
      const roleLabel = u.role === 'admin' ? '管理員' : '一般會員';
      const roleClass = u.role === 'admin' ? 'admin' : 'user';

      tr.innerHTML = `
        <td><strong>${esc(u.username)}</strong></td>
        <td><span class="admin-role-badge ${roleClass}">${roleLabel}</span></td>
        <td>${dateStr}</td>
        <td>${lastLoginStr}</td>
        <td>
          <button class="btn-reset-pwd" style="padding:2px 8px;font-size:11px;margin-right:4px">重設密碼</button>
          <button class="btn-del-user btn-danger" style="padding:2px 8px;font-size:11px">刪除</button>
        </td>
      `;

      tr.querySelector('.btn-reset-pwd').onclick = () => {
        const newPwd = prompt(`請輸入為帳號「${u.username}」設定的新密碼：`, '123456');
        if (newPwd !== null) {
          if (newPwd.length < 4) {
            alert('密碼長度需至少 4 個字元');
            return;
          }
          const all = window.AuthManager.getUsers();
          const target = all.find(x => x.id === u.id || x.username === u.username);
          if (target) {
            target.password = newPwd;
            window.AuthManager.saveUsers(all);
            showToast(`已成功為「${u.username}」重設密碼`, 'success');
          }
        }
      };

      tr.querySelector('.btn-del-user').onclick = () => {
        if (u.username.toLowerCase() === 'admin' || u.username.toLowerCase() === 'developer') {
          alert('無法刪除預設管理者帳號');
          return;
        }
        if (confirm(`確定要刪除使用者「${u.username}」嗎？`)) {
          let all = window.AuthManager.getUsers();
          all = all.filter(x => x.id !== u.id && x.username !== u.username);
          window.AuthManager.saveUsers(all);
          this.renderUsers();
          showToast(`已刪除使用者「${u.username}」`, 'info');
        }
      };

      tbody.appendChild(tr);
    });
  },

  renderFeedback() {
    const list = window.FeedbackManager.getFeedback();
    const tbody = $('#adminFeedbackListBody');
    if (!tbody) return;

    const countEl = $('#adminFeedbackCount');
    if (countEl) countEl.textContent = list.length;
    tbody.innerHTML = '';

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;font-size:12px">目前無任何使用者回饋或問題回報</td></tr>';
      return;
    }

    list.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const typeLabel = item.type === 'bug' ? '問題回報' : item.type === 'feature' ? '功能建議' : '操作諮詢';
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';

      tr.innerHTML = `
        <td style="font-size:11px">${dateStr}</td>
        <td><span class="feedback-type-badge ${item.type}">${typeLabel}</span></td>
        <td><strong>${esc(item.title)}</strong></td>
        <td>${esc(item.username || '匿名')}</td>
        <td style="font-size:11px;max-width:240px;line-height:1.4">
          <div>${esc(item.desc)}</div>
          ${item.contact ? `<div style="color:var(--text-muted);margin-top:2px">聯絡：${esc(item.contact)}</div>` : ''}
        </td>
        <td>
          <button class="btn-del-fb btn-danger" style="padding:2px 6px;font-size:11px">刪除</button>
        </td>
      `;

      tr.querySelector('.btn-del-fb').onclick = () => {
        const all = window.FeedbackManager.getFeedback();
        all.splice(idx, 1);
        window.FeedbackManager.saveFeedback(all);
        this.renderFeedback();
        showToast('已移除該則回饋', 'info');
      };

      tbody.appendChild(tr);
    });
  }
};


// ==================== 核心模組: 透視校正與 PDF/ZIP 匯出引擎 ====================
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
    if (drop && fileIn) {
      drop.onclick = () => fileIn.click();
      fileIn.onchange = e => { this.addFiles(e.target.files); e.target.value = ''; };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
      drop.ondragleave = () => drop.classList.remove('dragover');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); this.addFiles(e.dataTransfer.files); };
    }

    const btnClear = $('#trapClearAll');
    if (btnClear) {
      btnClear.onclick = () => {
        this.items.forEach(it => URL.revokeObjectURL(it.url));
        this.items = [];
        this.active = -1;
        this.render();
      };
    }

    const btnReset = $('#trapReset');
    if (btnReset) {
      btnReset.onclick = () => {
        const it = this.items[this.active];
        if (it) {
          it.points = this.fitPoints(it.img.naturalWidth, it.img.naturalHeight);
          this.drawOverlay();
        }
      };
    }

    const btnAuto = $('#trapAuto');
    if (btnAuto) {
      btnAuto.onclick = () => {
        const it = this.items[this.active];
        if (it) {
          const w = it.img.naturalWidth, h = it.img.naturalHeight, m = Math.min(w, h) * 0.08;
          it.points = [{ x: m, y: m }, { x: w - m, y: m }, { x: w - m, y: h - m }, { x: m, y: h - m }];
          this.drawOverlay();
        }
      };
    }

    const btnRotL = $('#trapRotL');
    if (btnRotL) btnRotL.onclick = () => this.rotate(-90);
    const btnRotR = $('#trapRotR');
    if (btnRotR) btnRotR.onclick = () => this.rotate(90);

    const qualitySlider = $('#trapQuality');
    if (qualitySlider) {
      qualitySlider.oninput = e => {
        const valEl = $('#trapQualityVal');
        if (valEl) valEl.textContent = Math.round(e.target.value * 100) + '%';
      };
    }

    this.initInteraction();

    const btnDlCurr = $('#trapDownloadCurrent');
    if (btnDlCurr) btnDlCurr.onclick = () => this.exportCurrent();

    const btnDlZip = $('#trapDownloadAllZip');
    if (btnDlZip) btnDlZip.onclick = () => this.exportAllZip();

    const btnExportPdf = $('#trapExportPdf');
    if (btnExportPdf) btnExportPdf.onclick = () => this.exportAsPdf(this.items);
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
    if (!files || !files.length) return;
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
    if (!list) return;
    list.innerHTML = '';
    const countEl = $('#trapCount');
    if (countEl) countEl.textContent = this.items.length;

    const btnDlCurr = $('#trapDownloadCurrent');
    if (btnDlCurr) btnDlCurr.disabled = this.active < 0;

    const btnDlZip = $('#trapDownloadAllZip');
    if (btnDlZip) btnDlZip.disabled = this.items.length === 0;

    const btnExportPdf = $('#trapExportPdf');
    if (btnExportPdf) btnExportPdf.disabled = this.items.length === 0;

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
    const hint = $('#trapEmptyHint');
    const wrap = $('#trapCanvasWrap');
    if (!it) {
      if (hint) hint.style.display = 'block';
      if (wrap) wrap.style.display = 'none';
      return;
    }

    if (hint) hint.style.display = 'none';
    if (wrap) wrap.style.display = 'block';
    this.drawPreview();
  },

  drawPreview() {
    const it = this.items[this.active];
    if (!it) return;
    const stage = $('#trapStageArea');
    if (!stage) return;
    const maxW = Math.max(100, stage.clientWidth - 32);
    const maxH = Math.max(100, stage.clientHeight - 32);
    const scale = Math.min(maxW / it.img.naturalWidth, maxH / it.img.naturalHeight, 1);
    const w = Math.round(it.img.naturalWidth * scale);
    const h = Math.round(it.img.naturalHeight * scale);

    const prev = $('#trapPreview'), ovr = $('#trapOverlay');
    if (!prev || !ovr) return;
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
    if (!prev || !ovr) return;
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
    if (!ovr) return;
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
      showToast('目前清單中無任何圖片', 'warning');
      return;
    }
    const btn = $('#trapExportPdf') || $('#trapDownloadCurrent');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '合成 PDF 中...'; }

    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF 處理函式庫尚未載入完成，請稍候重試');
      }
      const pdfDoc = await PDFLib.PDFDocument.create();
      const q = Number($('#trapQuality').value) || 0.92;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (btn) btn.textContent = `處理第 ${i+1}/${items.length} 頁...`;
        const c = await this.getWarpedCanvas(it);
        const b = await canvasToBlob(c, 'image/jpeg', q);
        const arrayBuf = await b.arrayBuffer();
        const embedded = await pdfDoc.embedJpg(arrayBuf);
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
      console.error('PDF 匯出失敗:', e);
    } finally {
      if (btn) { btn.disabled = !this.items.length; btn.textContent = origText || '批次合併匯出為多頁 PDF'; }
    }
  }
};

function boot() {
  if (window.AuthManager) window.AuthManager.init();
  if (window.HelpManager) window.HelpManager.init();
  if (window.FeedbackManager) window.FeedbackManager.init();
  if (window.AdminManager) window.AdminManager.init();
  if (window.TrapezoidModule) window.TrapezoidModule.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})(window, document);

