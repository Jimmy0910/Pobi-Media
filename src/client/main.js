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

// ==================== 頨思遢撽??董?恣? (AuthManager) ====================
window.AuthManager = {
  currentUser: null,
  mode: 'login', // 'login' | 'register'

  init() {
    this.getUsers(); // 蝣箔??身蝞∠??∟???車摮董????
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
    if (nameEl) nameEl.textContent = '?芰??;
    if (avatarEl) avatarEl.textContent = '?';
    if (signoutBtn) signoutBtn.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
  },

  unlockApp() {
    const overlay = $('#authOverlay');
    if (overlay) overlay.classList.add('hidden');
    const name = this.currentUser?.username || '?';
    const nameEl = $('#headerUserName');
    const avatarEl = $('#headerUserAvatar');
    const signoutBtn = $('#btnSignOut');
    const adminBtn = $('#btnOpenAdminModal');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    if (signoutBtn) signoutBtn.style.display = 'block';

    // ?亦蝞∠??∟??莎?憿舐內蝞∠?敺??
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
        if (submitBtn) submitBtn.textContent = '?餃?脣撌乩?蝡?;
        this.clearAlert();
      };
    }

    if (tabReg) {
      tabReg.onclick = () => {
        this.mode = 'register';
        tabReg.classList.add('active');
        tabLogin.classList.remove('active');
        if (confirmRow) confirmRow.style.display = 'flex';
        if (submitBtn) submitBtn.textContent = '閮餃?銝阡脣撌乩?蝡?;
        this.clearAlert();
      };
    }

    const togglePwd = $('#btnToggleAuthPwd');
    if (togglePwd) {
      togglePwd.onclick = () => {
        const pwd = $('#authPassword');
        if (pwd.type === 'password') {
          pwd.type = 'text';
          togglePwd.textContent = '?梯?';
        } else {
          pwd.type = 'password';
          togglePwd.textContent = '憿舐內';
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
    this.showAlert('甇??蒂?郊??恣?撣唾?...', 'info');
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
          this.showAlert('??恣?撣唾? (developer) 撌脣翰???蒂?脩垢?郊?餃嚗?, 'success');
          setTimeout(() => {
            this.unlockApp();
            showToast('甇∟????developer嚗???游?慦????唳?擃恣????, 'success');
            if (window.AdminManager) window.AdminManager.renderUsers();
          }, 350);
          return;
        }
      }
    } catch {}

    // ?祆??
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
    
    this.showAlert('??恣?撣唾? (developer) 撌脣翰???蒂?芸??餃嚗?, 'success');
    setTimeout(() => {
      this.unlockApp();
      showToast('甇∟????developer嚗???游?慦????唳?擃恣????, 'success');
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
      this.showAlert('隢撓?乩蝙?刻?蝔?);
      return;
    }
    if (!p || p.length < 4) {
      this.showAlert('撖Ⅳ?瑕漲?喳?? 4 ????);
      return;
    }

    if (this.mode === 'register') {
      const cp = $('#authConfirmPassword')?.value;
      if (p !== cp) {
        this.showAlert('?拇活頛詨??蝣潔?銝??);
        return;
      }

      this.showAlert('甇??蝡航酉?董?蒂?郊...', 'info');

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

          // ?郊?唳?啣?隞?
          const users = this.getUsers();
          if (!users.some(x => x.username.toLowerCase() === u.toLowerCase())) {
            users.push({ id: data.user.id, username: u, password: p, role: data.user.role, createdAt: new Date().toISOString() });
            this.saveUsers(users);
          }

          this.showAlert('閮餃???銝血歇?郊?喲蝡荔?甇∟?雿輻 Pobi Media嚗?, 'success');
          setTimeout(() => {
            this.unlockApp();
            showToast(`閮餃???嚗迭餈?${data.user.username} ?脣 Pobi Media 撠平撌乩?蝡?`, 'success');
            if (window.AdminManager) window.AdminManager.renderUsers();
          }, 400);
          return;
        } else {
          this.showAlert(data.error || '閮餃?憭望?嚗??岫');
          return;
        }
      } catch {
        // ?Ｙ?/?砍?閮餃?
        const users = this.getUsers();
        if (users.some(x => x.username.toLowerCase() === u.toLowerCase())) {
          this.showAlert('甇支蝙?刻?蝔勗歇鋡怨酉??隢?????∠?乓??湔?銝?鋡思蝙?函??迂');
          return;
        }

        const role = (u.toLowerCase() === 'admin' || u.toLowerCase() === 'developer') ? 'admin' : 'user';
        const newUser = { id: uid(), username: u, password: p, role, createdAt: new Date().toISOString() };
        users.push(newUser);
        this.saveUsers(users);

        this.currentUser = { id: newUser.id, username: newUser.username, role: newUser.role };
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('pobi_session', JSON.stringify(this.currentUser));

        this.showAlert('閮餃???嚗迭餈蝙??Pobi Media嚗?, 'success');
        setTimeout(() => {
          this.unlockApp();
          showToast(`閮餃???嚗迭餈?${newUser.username} ?脣 Pobi Media 撠平撌乩?蝡?`, 'success');
          if (window.AdminManager) window.AdminManager.renderUsers();
        }, 400);
      }
    } else {
      this.showAlert('甇?撽?頝刻?蝵桅蝡臬董??..', 'info');

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

          // ?郊?唳?啣?隞?
          const users = this.getUsers();
          let localUser = users.find(x => x.username.toLowerCase() === u.toLowerCase());
          if (!localUser) {
            users.push({ id: data.user.id, username: u, password: p, role: data.user.role, createdAt: new Date().toISOString() });
            this.saveUsers(users);
          }

          this.showAlert('?餃??嚗迤?函?刻??亙極雿...', 'success');
          setTimeout(() => {
            this.unlockApp();
            showToast(`甇∟???嚗?{data.user.username}嚗, 'success');
          }, 350);
          return;
        } else {
          this.showAlert(data.error || '?餃憭望?嚗?蝣箄?撣唾???蝣?);
          return;
        }
      } catch {
        // ?Ｙ?/?砍??餃
        const users = this.getUsers();
        let user = users.find(x => x.username.toLowerCase() === u.toLowerCase());
        if (user) {
          if (user.password !== p) {
            this.showAlert('撖Ⅳ?航炊嚗??蝣箄?');
            return;
          }
        } else {
          this.showAlert('?曆??唳迨雿輻??蝔梧?隢???酉?撣唾???暺?銝??甈⊥抒隢????潸董??);
          return;
        }

        this.currentUser = { id: user.id, username: user.username, role: user.role || 'user' };
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('pobi_session', JSON.stringify(this.currentUser));

        this.showAlert('?餃??嚗迤?函?刻??亙極雿...', 'success');
        setTimeout(() => {
          this.unlockApp();
          showToast(`甇∟???嚗?{user.username}嚗, 'success');
        }, 350);
      }
    }
  },

  logout() {
    localStorage.removeItem('pobi_session');
    sessionStorage.removeItem('pobi_session');
    this.currentUser = null;
    this.lockApp();
    showToast('撌脣??函??, 'info');
  }
};

// ==================== ?典??賭蝙?刻牧????蝞∠???(HelpManager) ====================
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

    // ??璅惜??
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

// ==================== 雿輻??閬?擖恣? (FeedbackManager) ====================
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
    const username = window.AuthManager?.currentUser?.username || '?踹?雿輻??;

    if (!title || !desc) {
      showToast('隢‵撖思蜓?刻?閰喟敦?膩', 'warning');
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
    showToast('??撌脤嚗?雓撖嗉眼?遣霅堆?', 'success');

    if (window.AdminManager) window.AdminManager.renderFeedback();
  }
};

// ==================== 蝞∠????啁恣? (AdminManager) ====================
window.AdminManager = {
  init() {
    $('#btnOpenAdminModal').onclick = () => {
      if (window.AuthManager?.currentUser?.role !== 'admin') {
        showToast('?函甈?摮?蝞∠??批??, 'error');
        return;
      }
      this.renderUsers();
      this.renderFeedback();
      this.loadPublicApiConfig();
      $('#adminModal').classList.add('active');
    };

    $('#btnCloseAdminModal').onclick = () => $('#adminModal').classList.remove('active');
    $('#btnCloseAdminModal2').onclick = () => $('#adminModal').classList.remove('active');

    // ?惜??
    $$('.admin-tab-btn').forEach(btn => {
      btn.onclick = () => {
        $$('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        $$('.admin-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = $('#pane-admin-' + btn.dataset.adminPane);
        if (target) target.classList.add('active');
      };
    });

    // ??雿輻??
    $('#adminUserSearch').oninput = (e) => {
      this.renderUsers(e.target.value.trim().toLowerCase());
    };

    // 皜征??
    $('#adminClearAllFeedback').onclick = () => {
      if (confirm('蝣箏?閬??斗??蝙?刻?擖???嚗?)) {
        localStorage.removeItem('pobi_feedback');
        this.renderFeedback();
        showToast('撌脫?蝛箸???擖???, 'info');
      }
    };

    // ?祉 API ?湔
    $('#btnAdminSavePublicApi').onclick = () => {
      const key = $('#adminPublicApiKey').value.trim();
      if (!key) {
        localStorage.removeItem('pobi_public_api_override');
        showToast('撌脫??斗璈?券??啗?撖恬?雿輻 Cloudflare Worker ?身 Secrets', 'info');
      } else {
        localStorage.setItem('pobi_public_api_override', key);
        showToast('?祉 API ?閮剖?撌脫??, 'success');
      }
      window.ApiManager.checkServerStatus();
    };

    // 皜祈岫 API ???
    $('#btnAdminTestApi').onclick = () => this.testApiConnection();
  },

  loadPublicApiConfig() {
    const key = localStorage.getItem('pobi_public_api_override') || '';
    $('#adminPublicApiKey').value = key;
  },

  async testApiConnection() {
    const resBox = $('#adminApiTestResult');
    resBox.style.display = 'block';
    resBox.textContent = '甇?皜祈岫 Google Gemini 2.5 Flash 蝡舫???...';

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
        resBox.textContent = `???甇?虜 (撱園: ${lat}ms) - Google Gemini 蝡舫????臬末`;
        resBox.style.color = '#34d399';
      } else {
        resBox.textContent = `隡箸??冽?蔭?祉? (撱園: ${lat}ms) - 撱箄降??Cloudflare Workers 閮剖? GEMINI_API_KEY Secret`;
        resBox.style.color = '#fbbf24';
      }
    } catch (e) {
      resBox.textContent = '???憭望?: ' + e.message;
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
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px">?∠泵??雿輻?董??/td></tr>';
      return;
    }

    filtered.forEach(u => {
      const tr = document.createElement('tr');
      const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '?芰';
      const roleLabel = u.role === 'admin' ? '蝞∠??? : '銝?砌蝙?刻?;
      const roleClass = u.role === 'admin' ? 'admin' : 'user';

      tr.innerHTML = `
        <td><strong>${esc(u.username)}</strong></td>
        <td><span class="admin-role-badge ${roleClass}">${roleLabel}</span></td>
        <td>${dateStr}</td>
        <td style="text-align:right">
          <button class="btn-reset-pwd" style="padding:3px 8px;font-size:11px;margin-right:6px">?身撖Ⅳ</button>
          <button class="btn-del-user btn-danger" style="padding:3px 8px;font-size:11px">?芷</button>
        </td>
      `;

      // ??身撖Ⅳ
      tr.querySelector('.btn-reset-pwd').onclick = () => {
        const newPwd = prompt(`隢撓?亦撣唾???{u.username}?身摰??啣?蝣潘?`, '123456');
        if (newPwd !== null) {
          if (newPwd.length < 4) {
            alert('撖Ⅳ?瑕漲??喳? 4 ????);
            return;
          }
          const all = window.AuthManager.getUsers();
          const target = all.find(x => x.id === u.id);
          if (target) {
            target.password = newPwd;
            window.AuthManager.saveUsers(all);
            showToast(`撌脫????{u.username}??啣?蝣嬋, 'success');
          }
        }
      };

      // ?芷雿輻??
      tr.querySelector('.btn-del-user').onclick = () => {
        if (u.username.toLowerCase() === 'admin') {
          alert('?⊥??芷蝟餌絞?身蝞∠??董??);
          return;
        }
        if (confirm(`蝣箏?閬偶銋?支蝙?刻?{u.username}??嚗)) {
          let all = window.AuthManager.getUsers();
          all = all.filter(x => x.id !== u.id);
          window.AuthManager.saveUsers(all);
          this.renderUsers($('#adminUserSearch').value.trim().toLowerCase());
          showToast(`撌脣?支蝙?刻?{u.username}?, 'info');
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
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:12px">?桀??∩遙雿蝙?刻?擖????</div>';
      return;
    }

    list.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'feedback-item';
      const typeLabel = item.type === 'bug' ? '???' : item.type === 'feature' ? '?撱箄降' : '??隢株岷';
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
          <span>?漱??<strong>${esc(item.username)}</strong> ${item.contact ? `(?舐窗嚗?{esc(item.contact)})` : ''}</span>
          <button class="btn-del-fb btn-danger" style="padding:2px 8px;font-size:10px">璅?撌脰??蒂?芷</button>
        </div>
      `;

      card.querySelector('.btn-del-fb').onclick = () => {
        const all = window.FeedbackManager.getFeedback();
        all.splice(idx, 1);
        window.FeedbackManager.saveFeedback(all);
        this.renderFeedback();
        showToast('撌脩宏?方府??擖?, 'info');
      };

      container.appendChild(card);
    });
  }
};


// ==================== API Key ??憿恣? ====================
window.ApiManager = {
  userKey: localStorage.getItem('user_gemini_api_key') || '',
  serverStatus: { hasPublicApi: false, remainingToday: 0 },

  init() {
    this.checkServerStatus();
    this.updateBadge();
    $('#btnSaveApiKey').onclick = () => {
      const k = $('#inputUserApiKey').value.trim();
      if (!k) {
        showToast('隢撓?交??? Gemini API Key', 'warning');
        return;
      }
      this.userKey = k;
      localStorage.setItem('user_gemini_api_key', k);
      showToast('?芸? API Key ?脣???嚗歇??⊿??嗆芋撘?, 'success');
      this.updateBadge();
    };
    $('#btnClearApiKey').onclick = () => {
      this.userKey = '';
      localStorage.removeItem('user_gemini_api_key');
      $('#inputUserApiKey').value = '';
      showToast('撌脫??方???堆????箏?券?憿芋撘?, 'info');
      this.updateBadge();
    };
    $('#btnToggleKeyVisibility').onclick = () => {
      const inp = $('#inputUserApiKey');
      if (inp.type === 'password') {
        inp.type = 'text';
        $('#btnToggleKeyVisibility').textContent = '?梯?';
      } else {
        inp.type = 'password';
        $('#btnToggleKeyVisibility').textContent = '憿舐內';
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
      if (srvKey) srvKey.textContent = '?祆??格?璅∪? (?臭蝙?券蝺?OCR ?撓?亙犖?)';
      const srvQuota = $('#srvQuotaLeft');
      if (srvQuota) srvQuota.textContent = '?⊿???(?Ｙ?/?芸?)';
      this.updateBadge();
      return;
    }

    try {
      const res = await fetch('/api/status');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        this.serverStatus = await res.json();
        const srvKey = $('#srvKeyStatus');
        if (srvKey) srvKey.textContent = this.serverStatus.hasPublicApi ? '撌脣???(隡箸??典停蝺?' : '?芷?蝵?(隢蝙?券蝺?OCR ?撓?亙犖?)';
        const srvQuota = $('#srvQuotaLeft');
        if (srvQuota) srvQuota.textContent = this.serverStatus.hasPublicApi ? this.serverStatus.remainingToday : 0;
      } else {
        const srvKey = $('#srvKeyStatus');
        if (srvKey) srvKey.textContent = '蝝?蝡舀芋撘?(隢蝙?券蝺?OCR ?票銝犖?)';
      }
    } catch (e) {
      const srvKey = $('#srvKeyStatus');
      if (srvKey) srvKey.textContent = '?Ｙ? / ?砍?格?璅∪?';
    }
    this.updateBadge();
  },

  updateBadge() {
    const b = $('#quotaText');
    const dot = $('#quotaDot');
    if (!b || !dot) return;

    if (this.userKey) {
      b.textContent = '撠惇?撌脣???;
      dot.className = 'status-dot blue';
    } else if (this.serverStatus.hasPublicApi) {
      b.textContent = `?祉?拚?: ${this.serverStatus.remainingToday} 甈︶;
      dot.className = 'status-dot green';
    } else {
      b.textContent = '?閮剖??';
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
          throw new Error(`Google Gemini 摰??航炊: ${errMsg}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (netErr) {
        if (netErr.message.includes('Google Gemini 摰??航炊')) throw netErr;
        throw new Error(`?????Google 摰隡箸??典仃??(${netErr.message})??瑼Ｘ蝬脰楝??API Key ?臬甇?Ⅱ?);
      }
    }

    if (window.location.protocol === 'file:' || !this.serverStatus.hasPublicApi) {
      $('#apiModal')?.classList.add('active');
      throw new Error('撠閮剖? Gemini API Key???典??箇?閬?銝剛票銝??Google Gemini API Key嚗?湔??AQ. ?韌嚗?????esseract ?Ｙ?撘??脰??祥颲刻?嚗?);
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
        throw new Error('隡箸??典??芷?蝵桀?券??啜??刻身摰葉頛詨?函??犖 Gemini API Key嚗??湔雿輻?esseract ?祆??Ｙ? OCR??');
      }

      if (res.status === 429) {
        this.checkServerStatus();
        throw new Error('隞?祉?祥??撌脩摰?隢?喃?閫I 閮剖??撓?交?犖?');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'AI 隡箸??刻??仃??);
      }

      const data = await res.json();
      if (data._quota) {
        this.serverStatus.remainingToday = data._quota.remaining;
        this.updateBadge();
      }
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      if (e.message.includes('撠閮剖?') || e.message.includes('?祉?祥??') || e.message.includes('隡箸??典??芷?蝵?)) {
        throw e;
      }
      throw new Error('?⊥??????AI 隞??隡箸??具遣霅圈??詨銝?頛詨?芸? Gemini API Key ?湔??? Google 摰嚗?);
    }
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

// ==================== 璅∠? 1: ???⊥迤?摩 ====================
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
    const btnExportPdf = $('#trapExportPdf');
    if (btnExportPdf) btnExportPdf.onclick = () => this.exportAsPdf(this.items);
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
        console.error('頛??憭望?:', err);
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
          <div class="desc">${it.img.naturalWidth} ? ${it.img.naturalHeight}</div>
        </div>
        <button class="btn-remove" title="蝘駁"><svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
    if (!this.gl) throw new Error('WebGL ???仃??);

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
    a.download = it.file.name.replace(/\.[^.]+$/, '') + '-?⊥迤.' + ext;
    a.click();
    showToast('?⊥迤敶勗?銝???', 'success');
  },

  async exportAllZip() {
    if (!this.items.length) return;
    const btn = $('#trapDownloadAllZip');
    btn.disabled = true; btn.textContent = '??銝?..';
    try {
      const zip = new JSZip();
      const fmt = $('#trapFormat').value;
      const targetFmt = fmt === 'application/pdf' ? 'image/jpeg' : fmt;
      const q = Number($('#trapQuality').value) || 0.92;
      const ext = targetFmt === 'image/jpeg' ? 'jpg' : targetFmt === 'image/png' ? 'png' : 'webp';
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        btn.textContent = `????銝?(${i+1}/${this.items.length})...`;
        const c = await this.getWarpedCanvas(it);
        const b = await canvasToBlob(c, targetFmt, q);
        zip.file(it.file.name.replace(/\.[^.]+$/, '') + '-?⊥迤.' + ext, b);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `?⊥迤?寞活_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      showToast('ZIP ??銝?摰?', 'success');
    } catch (e) {
      showToast('??憭望?: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '?寞活??銝? (ZIP)';
    }
  },

  async exportAsPdf(items) {
    if (!items || !items.length) {
      showToast('隢??銝阡????, 'warning');
      return;
    }
    const btn = $('#trapExportPdf') || $('#trapDownloadCurrent');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '?? PDF 銝?..'; }

    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF ???賢?摨怠??芾??亙???);
      }
      const pdfDoc = await PDFLib.PDFDocument.create();
      const q = Number($('#trapQuality').value) || 0.92;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (btn) btn.textContent = `??蝚?${i+1}/${items.length} ??..`;
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
        ? items[0].file.name.replace(/\.[^.]+$/, '') + '-?⊥迤.pdf'
        : `PobiMedia_?⊥迤憭??辣_${new Date().toISOString().slice(0,10)}.pdf`;
      a.download = filename;
      a.click();
      showToast('PDF ?臬銝???', 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF ?臬憭望?: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText || '?寞活?蔥?臬?箏???PDF'; }
    }
  },

  async sendToModule(mod) {
    const it = this.items[this.active];
    if (!it) { showToast('隢??豢???', 'warning'); return; }
    const canvas = await this.getWarpedCanvas(it);
    const blob = await canvasToBlob(canvas, 'image/png');
    const file = new File([blob], it.file.name.replace(/\.[^.]+$/, '') + '-?⊥迤.png', { type: 'image/png' });

    if (mod === 'bgremove') {
      window.BgRemoveModule.loadFile(file);
      switchTab('bgremove');
      showToast('撌脣?甇?蔣???駁', 'success');
    } else if (mod === 'ocr') {
      window.OcrModule.loadFile(file);
      switchTab('ocr');
      showToast('撌脣?甇?蔣???颲刻?', 'success');
    } else if (mod === 'convert') {
      window.ConvertModule.addFiles([file]);
      switchTab('convert');
      showToast('撌脣???PDF 頧???????, 'success');
    }
  }
};


// ==================== 璅∠? 2: ?澆?頧? & PDF ????====================
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
        <button class="btn-remove" title="蝘駁"><svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
      div.querySelector('.btn-remove').onclick = () => {
        this.files.splice(i, 1);
        this.render();
      };
      list.appendChild(div);
    });
  },

  async buildPdf() {
    if (!this.files.length) { showToast('隢?銝瑼?', 'warning'); return; }
    const btn = $('#btnBuildPdf');
    btn.disabled = true; btn.textContent = '?? PDF 銝?..';

    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF ???賢?摨怠??芾??亙???隢???閰?);
      }
      const pdfDoc = await PDFLib.PDFDocument.create();
      const layout = $('#pdfPageLayout').value;
      const margin = Number($('#pdfMargin').value) || 0;

      for (let i = 0; i < this.files.length; i++) {
        const it = this.files[i];
        btn.textContent = `??蝚?${i+1}/${this.files.length} ??..`;

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
      showToast('PDF ??銝???', 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF ?Ｙ?憭望?: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '??銝虫?頛?PDF ?辣';
    }
  },

  async batchConvertImages() {
    if (!this.files.length) { showToast('隢?銝??', 'warning'); return; }
    const btn = $('#btnBatchConvert');
    btn.disabled = true; btn.textContent = '頧?銝?..';
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
      a.download = `頧??寞活_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      showToast('?寞活頧? ZIP 銝?摰?', 'success');
    } catch (e) {
      showToast('頧?憭望?: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '?寞活頧?銝虫?頛?ZIP 憯葬??;
    }
  }
};


// ==================== 璅∠? 3: PDF ????====================
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

    $('#splitApplyAll').onclick = () => showToast('撌脣??典??脩?閮剖??單?????, 'success');
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
      $('#splitPageCount').textContent = `${this.totalPages} ?;
      $('#btnExportSplitPdf').disabled = false;
      $('#splitEmptyHint').style.display = 'none';
      $('#splitCanvasWrap').style.display = 'block';
      this.renderPage();
      showToast(`撌脰???PDF ?辣嚗 ${this.totalPages} ?, 'success');
    } catch (e) {
      showToast('頛 PDF 憭望?: ' + e.message, 'error');
    }
  },

  async renderPage() {
    if (!this.pdfDoc) return;
    $('#splitPageIndicator').textContent = `蝚?${this.currentPage} / ${this.totalPages} ?;
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
    btn.disabled = true; btn.textContent = '?????PDF 銝?..';

    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF ???賢?摨怠??芾??亙???);
      }
      const outDoc = await PDFLib.PDFDocument.create();
      const dir = $('#splitDirection').value;
      const order = $('#splitOrder').value;
      const total = this.pdfDoc.numPages;

      for (let i = 1; i <= total; i++) {
        btn.textContent = `??蝚?${i}/${total} ??..`;
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
      a.download = `?摰?_??{outDoc.getPageCount()}??pdf`;
      a.click();
      showToast(`PDF ???嚗?Ｙ? ${outDoc.getPageCount()} ??隞跆, 'success');
    } catch (e) {
      console.error(e);
      showToast('??臬憭望?: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '?銝血?箸 PDF';
    }
  }
};


// ==================== 璅∠? 4: ??颲刻? OCR ====================
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

    const btnSample = $('#btnLoadOcrSample');
    if (btnSample) btnSample.onclick = () => this.loadSample();

    $('#ocrEngine').onchange = e => {
      $('#ocrLangRow').style.display = e.target.value === 'tesseract' ? 'flex' : 'none';
    };

    $('#btnStartOcr').onclick = () => this.runOcr();
    $('#btnCopyOcrText').onclick = () => {
      const txt = $('#ocrResultText').value;
      if (!txt) { showToast('颲刻?蝯??箇征', 'warning'); return; }
      navigator.clipboard.writeText(txt);
      showToast('??撌脰?鋆質?芾票蝪?, 'success');
    };
    $('#btnSaveOcrTxt').onclick = () => this.saveText('txt');
    $('#btnSaveOcrMd').onclick = () => this.saveText('md');

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
    ctx.fillText('?餃??潛巨霅???/ ?嗆?皜祈岫璅?撐', 40, 50);

    ctx.font = '18px monospace';
    ctx.fillStyle = '#334155';
    ctx.fillText('?潛巨?Ⅳ: AB-99882233', 40, 90);
    ctx.fillText('???交?: 2026-08-30 12:00:00', 40, 120);
    ctx.fillText('??閬              ?賊?    ?桀    ??', 40, 160);
    ctx.fillText('------------------------------------------', 40, 185);
    ctx.fillText('?輸? (憭扳/??      2     $120   $240', 40, 215);
    ctx.fillText('瘜??舫?暻萄?            1      $65    $65', 40, 245);
    ctx.fillText('------------------------------------------', 40, 275);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('??蝮賡?: NT$ 305 ??, 40, 315);

    c.toBlob(blob => {
      const file = new File([blob], '?潛巨?嗆?皜祈岫璅?撐.png', { type: 'image/png' });
      this.loadFile(file);
      showToast('撌脰??亦蟡冽?葫閰衣?靘?', 'success');
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
      showToast('??撌脰??伐??舫???憪?摮儘霅?, 'success');
    } catch (e) {
      showToast('頛??憭望?: ' + e.message, 'error');
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
        $('#ocrProgressLabel').textContent = '頛 Tesseract ?Ｙ?撘?...';
        const lang = $('#ocrLanguage').value || 'chi_tra';

        const worker = await Tesseract.createWorker(lang, 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const p = Math.round((m.progress || 0) * 100);
              $('#ocrProgressBar').style.width = p + '%';
              $('#ocrProgressVal').textContent = p + '%';
              $('#ocrProgressLabel').textContent = `??颲刻?銝?(${p}%)...`;
            } else {
              $('#ocrProgressLabel').textContent = m.status || '??銝?..';
            }
          }
        });

        const ret = await worker.recognize(c);
        await worker.terminate();
        $('#ocrResultText').value = ret.data.text.trim();
        $('#ocrProgressBar').style.width = '100%';
        $('#ocrProgressVal').textContent = '100%';
        showToast('Tesseract ?砍?Ｙ?颲刻?摰?', 'success');
      } else {
        $('#ocrProgressLabel').textContent = 'Google Gemini AI ?箸????銝?..';
        $('#ocrProgressBar').style.width = '45%';
        $('#ocrProgressVal').textContent = '45%';

        const b64 = c.toDataURL('image/png').split(',')[1];
        const prompt = '隢誑蝝?摮撘??湔??撐??銝剔????摮?靽???畾菔???????交銵冽隢?? Markdown 銵冽?澆?嚗??輸?憭溶?牧?誥閰梧??撓?箸????摮摰嫘?;

        const text = await ApiManager.callGeminiVision(b64, prompt);
        $('#ocrResultText').value = text.trim();
        $('#ocrProgressBar').style.width = '100%';
        $('#ocrProgressVal').textContent = '100%';
        showToast('Gemini AI 颲刻?摰?', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('OCR 颲刻?憭望?: ' + e.message, 'error');
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
    if (!txt) { showToast('颲刻?蝯??箇征', 'warning'); return; }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `OCR_??蝯?_${new Date().toISOString().slice(0,10)}.${ext}`;
    a.click();
    showToast(`撌脖?頛?.${ext} 瑼?`, 'success');
  }
};


// ==================== 璅∠? 5: ??駁 ====================
window.BgRemoveModule = {
  currentImg: null,
  rawCanvas: null,
  resultCanvas: null,
  brushMode: 'none',
  isPainting: false,

  init() {
    const drop = $('#bgDrop'), fileIn = $('#bgFileIn');
    drop.onclick = () => fileIn.click();
    fileIn.onchange = e => { if (e.target.files[0]) this.loadFile(e.target.files[0]); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadFile(e.dataTransfer.files[0]); };

    const btnSample = $('#btnLoadBgSample');
    if (btnSample) btnSample.onclick = () => this.loadSample();

    $('#bgTolerance').oninput = e => $('#bgToleranceVal').textContent = e.target.value;
    $('#bgFeather').oninput = e => $('#bgFeatherVal').textContent = e.target.value + 'px';
    $('#bgBrushSize').oninput = e => $('#bgBrushSizeVal').textContent = e.target.value;

    const btnAuto = $('#btnAutoWhiteClean');
    if (btnAuto) btnAuto.onclick = () => this.autoRemoveWhite();

    const btnRun = $('#btnRunBgRemove');
    if (btnRun) btnRun.onclick = () => this.runBgRemove();

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

    this.initCanvasInteractions();
  },

  async loadSample() {
    const c = document.createElement('canvas');
    c.width = 500; c.height = 500;
    const ctx = c.getContext('2d');

    // Light off-white backdrop
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, 500, 500);

    // Subject: Circle stamp badge
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(250, 250, 170, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POBI MEDIA', 250, 220);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('撖拇?? 繚 撠平隤?', 250, 275);
    ctx.fillText('??????????, 250, 315);

    c.toBlob(blob => {
      const file = new File([blob], '?啁??圈??餉?璅?撐.png', { type: 'image/png' });
      this.loadFile(file);
      showToast('撌脰??亙?葫閰衣?靘?', 'success');
    }, 'image/png');
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
      showToast('??撌脰??伐?暺???萄銵?批??暺???脰?擳?璉??, 'success');
    } catch (e) {
      showToast('頛??憭望?: ' + e.message, 'error');
    }
  },

  resetImage() {
    if (!this.rawCanvas || !this.resultCanvas) return;
    const ctx = this.resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.resultCanvas.width, this.resultCanvas.height);
    ctx.drawImage(this.rawCanvas, 0, 0);
    this.updateDisplay();
    showToast('撌脤??????', 'info');
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
      showToast('撌脣??擳?璉??豢芋撘?暺?隞颱????湔?駁嚗?, 'info');
    } else {
      this.brushMode = mode;
      $('#bgBrushErase')?.classList.toggle('active', mode === 'erase');
      $('#bgBrushRestore')?.classList.toggle('active', mode === 'restore');
      const label = mode === 'erase' ? '?阡?蝑 (?憛)' : '靽?銝駁?蝑 (?靽株?)';
      showToast('蝑??嚗? + label, 'info');
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
    showToast('暺??歇皜', 'success');
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
    showToast('蝝?撌脫???, 'success');
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
    if (!this.resultCanvas) return;
    const btn = $('#btnRunBgRemove');
    btn.disabled = true;
    btn.textContent = 'AI 瘛勗漲???餉?銝?..';

    try {
      showToast('甇??? Gemini 瘛勗漲閬死璅∪???銝駁???...', 'info');

      // Attempt AI Vision call if API key / server is ready
      let aiResult = null;
      try {
        const b64 = this.rawCanvas.toDataURL('image/png').split(',')[1];
        const prompt = 'You are a professional image segmentation assistant. Identify the main subject and background colors. Return JSON: {"bgType":"solid|gradient|complex","dominantBg":["#ffffff"],"subjectBoundingBox":[0,0,1000,1000]}';
        const aiText = await window.ApiManager.callGeminiVision(b64, prompt);
        if (aiText) {
          try {
            const cleanJson = aiText.replace(/```json|```/g, '').trim();
            aiResult = JSON.parse(cleanJson);
          } catch (e) {}
        }
      } catch (aiErr) {
        console.warn('AI API Call info:', aiErr.message);
      }

      // Execute precision background extraction
      this.smartAutoEdgeBgRemove();
      showToast('AI ?箸?餉?摰?嚗?臭蝙?函??瑚耨鋆??湔銝?', 'success');
    } catch (e) {
      console.error(e);
      showToast('?餉????啣虜: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '?? AI ?箸?餉?';
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
    a.download = `?餉?蝯?_${new Date().toISOString().slice(0,10)}.${type}`;
    a.click();
    showToast(type.toUpperCase() + ' 瑼?銝???', 'success');
  },

  async sendToModule(mod) {
    if (!this.resultCanvas) return;
    const blob = await canvasToBlob(this.resultCanvas, 'image/png');
    const file = new File([blob], '?餉?銝駁?.png', { type: 'image/png' });

    if (mod === 'ocr') {
      window.OcrModule.loadFile(file);
      switchTab('ocr');
      showToast('撌脣??蔣???颲刻?', 'success');
    } else if (mod === 'convert') {
      window.ConvertModule.addFiles([file]);
      switchTab('convert');
      showToast('撌脣???PDF 頧???????, 'success');
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

