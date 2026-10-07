'use strict';
/* Google Drive senkronu: giriş (Google Identity Services), kaydet / aç / çakışma çözümü / otomatik senkron.
   Yalnızca "drive.file" izni kullanılır: uygulama sadece kendi oluşturduğu dosyaları görebilir. */
(function (global) {
  const App = global.App;
  const { Store, UI, U } = App;
  const $t = App.$t;
  const h = U.h;
  const locale = () => App.I18n.locale();

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FIELDS = 'id,name,modifiedTime,version,size';
  const K = { token: 'umlstudio.gtoken', link: 'umlstudio.driveLink', client: 'umlstudio.gclient', folder: 'umlstudio.gfolder', auto: 'umlstudio.driveAuto' };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* yok say */ } },
    json(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  };

  const state = {
    token: null, expiresAt: 0, user: null,
    link: null,          // { id, name, version, modifiedTime, dirty }
    status: 'off',       // off | signedout | ready | idle | saving | saved | conflict | expired | error
    error: null, lastSync: null, saving: false, pending: false,
    auto: ls.get(K.auto) !== '0',
  };

  /* ---------- kalıcılık ---------- */
  function restore() {
    const t = ls.json(K.token);
    if (t && t.token && t.expiresAt > Date.now() + 60000) { state.token = t.token; state.expiresAt = t.expiresAt; state.user = t.user || null; }
    else if (t && t.user) state.user = t.user;
    state.link = ls.json(K.link);
  }
  function persistToken() {
    ls.set(K.token, JSON.stringify({ token: state.token, expiresAt: state.expiresAt, user: state.user }));
  }
  function persistLink() { ls.set(K.link, state.link ? JSON.stringify(state.link) : null); }
  function setLink(meta, dirty) {
    state.link = meta ? { id: meta.id, name: meta.name, version: String(meta.version), modifiedTime: meta.modifiedTime, dirty: !!dirty } : null;
    persistLink();
  }

  const emit = () => Store.emit('drive');
  function setStatus(s, err) { state.status = s; state.error = err || null; emit(); }

  /* ---------- yapılandırma ---------- */
  function clientId() {
    const c = ((global.UMLSTUDIO_CONFIG && global.UMLSTUDIO_CONFIG.googleClientId) || '').trim();
    return c || (ls.get(K.client) || '').trim();
  }
  const supported = () => /^https?:$/.test(location.protocol);
  const hasToken = () => !!state.token && Date.now() < state.expiresAt - 60000;

  /* ---------- Google Identity Services ---------- */
  let gisPromise = null;
  function loadGis() {
    if (global.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!gisPromise) {
      gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gisPromise = null; reject(new Error($t('Google giriş betiği yüklenemedi. İnternet bağlantınızı kontrol edin.'))); };
        document.head.appendChild(s);
      });
    }
    return gisPromise;
  }

  let tokenClient = null, tokenCb = null;
  async function signIn(opts) {
    opts = opts || {};
    if (!supported()) { showSetup('file'); throw quiet($t('Drive için uygulamayı http(s) üzerinden açın')); }
    const cid = clientId();
    if (!cid) { showSetup('client'); throw quiet($t('Client ID gerekli')); }
    await loadGis();
    if (!tokenClient || tokenClient.__cid !== cid) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cid, scope: SCOPE,
        callback: (r) => tokenCb && tokenCb(r),
        error_callback: (err) => tokenCb && tokenCb({ error: (err && err.type) || 'popup_failed' }),
      });
      tokenClient.__cid = cid;
    }
    const resp = await new Promise((resolve) => {
      tokenCb = resolve;
      const o = { prompt: opts.selectAccount ? 'select_account' : '' };
      if (state.user && state.user.emailAddress && !opts.selectAccount) o.login_hint = state.user.emailAddress;
      tokenClient.requestAccessToken(o);
    });
    if (resp.error) {
      const msg = resp.error === 'popup_closed' ? $t('Giriş penceresi kapatıldı')
        : resp.error === 'popup_failed_to_open' ? $t('Giriş penceresi açılamadı (açılır pencere engelleyicisini kontrol edin)')
        : $t('Google girişi başarısız: {msg}', { msg: resp.error });
      throw new Error(msg);
    }
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) throw new Error($t('Google Drive izni verilmedi'));
    state.token = resp.access_token;
    state.expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
    persistToken();
    try {
      const a = await api('/about?fields=user(displayName,emailAddress,photoLink)');
      state.user = a.user;
      persistToken();
    } catch (e) { /* kullanıcı bilgisi isteğe bağlı */ }
    setStatus(state.link ? 'idle' : 'ready');
    UI.toast($t('Google Drive bağlandı') + (state.user ? ': ' + state.user.emailAddress : ''), 'ok');
    await checkRemote();
    return true;
  }
  function quiet(msg) { const e = new Error(msg); e.quiet = true; return e; }

  async function ensureToken() { if (!hasToken()) await signIn(); }

  function signOut() {
    if (state.token && global.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(state.token, () => {}); } catch (e) { /* yok say */ }
    }
    state.token = null; state.expiresAt = 0; state.user = null;
    ls.set(K.token, null);
    setStatus('signedout');
    UI.toast($t('Google Drive oturumu kapatıldı'));
  }

  /* ---------- REST ---------- */
  async function api(url, opts) {
    opts = opts || {};
    if (!hasToken()) { setStatus('expired'); const e = new Error($t('Drive oturumunun süresi doldu, yeniden giriş yapın')); e.code = 'AUTH'; throw e; }
    const full = url.startsWith('http') ? url : API + url;
    let res;
    try {
      res = await fetch(full, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + state.token }, opts.headers || {}) }));
    } catch (e) {
      const err = new Error($t('Drive\'a ulaşılamadı (çevrimdışı olabilirsiniz)')); err.code = 'NET'; throw err;
    }
    if (res.status === 401) {
      state.token = null; persistToken(); setStatus('expired');
      const e = new Error($t('Drive oturumunun süresi doldu, yeniden giriş yapın')); e.code = 'AUTH'; throw e;
    }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error.message; } catch (e) { /* yok say */ }
      const e = new Error($t('Drive hatası ({status}): {msg}', { status: res.status, msg })); e.code = res.status; throw e;
    }
    if (opts.raw) return res.text();
    if (res.status === 204) return null;
    return res.json();
  }

  async function folderId() {
    let id = ls.get(K.folder);
    if (id) {
      try { const f = await api(`/files/${id}?fields=id,trashed`); if (!f.trashed) return id; }
      catch (e) { if (e.code === 'AUTH' || e.code === 'NET') throw e; }
    }
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='UML Studio' and trashed=false");
    const r = await api(`/files?q=${q}&fields=files(id)&spaces=drive`);
    if (r.files && r.files.length) id = r.files[0].id;
    else {
      id = (await api('/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'UML Studio', mimeType: 'application/vnd.google-apps.folder' }) })).id;
    }
    ls.set(K.folder, id);
    return id;
  }

  async function list() {
    const q = encodeURIComponent("appProperties has { key='umlstudio' and value='1' } and trashed=false");
    const r = await api(`/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=200&spaces=drive&fields=files(${FIELDS})`);
    return r.files || [];
  }

  function upload(content, meta, fileId) {
    const b = 'umlstudio' + Math.random().toString(36).slice(2);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${b}--`;
    const url = fileId ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=${FIELDS}` : `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`;
    return api(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
  }

  const content = () => JSON.stringify(Store.doc);
  const fileNameFor = (name) => U.safeFileName(name || Store.doc.name, 'diagram') + '.uml.json';

  /* ---------- işlemler ---------- */
  async function saveAs(name, opts) {
    opts = opts || {};
    try {
      await ensureToken();
      if (name == null) {
        name = await UI.prompt($t('Drive\'daki dosya adı'), Store.doc.name || $t('Adsız'), { title: $t('Drive\'a kaydet'), ok: $t('Kaydet') });
        if (name == null) return false;
      }
      name = String(name).trim() || $t('Adsız');
      // Drive dosya adı = belge adı (sonraki kayıtlarda ad korunur, belge yeniden adlandırılırsa dosya da adlanır)
      if (Store.doc.name !== name && !opts.copy) { Store.doc.name = name; Store.emit('docName'); }
      setStatus('saving');
      const parent = await folderId();
      const f = await upload(content(), { name: fileNameFor(name), mimeType: 'application/json', parents: [parent], appProperties: { umlstudio: '1' } });
      setLink(f, false);
      state.lastSync = Date.now();
      Store.dirty = false; Store.emit('saved');
      setStatus('saved');
      UI.toast($t('Drive\'a kaydedildi: {path}', { path: 'UML Studio/' + f.name }), 'ok');
      return true;
    } catch (e) { fail(e, false); return false; }
  }

  async function save(opts) {
    opts = opts || {};
    if (!state.link) return opts.silent ? false : saveAs();
    if (!hasToken()) {
      if (opts.silent) { setStatus('expired'); return false; }
      try { await signIn(); } catch (e) { fail(e, false); return false; }
      if (!state.link) return false; // checkRemote bağlantıyı kaldırmış olabilir
    }
    if (state.saving) { state.pending = true; return false; }
    state.saving = true;
    setStatus('saving');
    try {
      const meta = await api(`/files/${state.link.id}?fields=${FIELDS},trashed`);
      if (meta.trashed) throw Object.assign(new Error($t('Bağlı Drive dosyası çöp kutusuna taşınmış')), { code: 404 });
      if (String(meta.version) !== state.link.version && !opts.force) {
        state.saving = false;
        setStatus('conflict');
        if (!opts.silent) await resolveConflict(meta);
        else UI.toast($t('Drive\'daki dosya başka bir cihazda değişmiş'), 'warn', { action: { label: $t('Çöz'), fn: () => resolveConflict(meta) } });
        return false;
      }
      const f = await upload(content(), { name: fileNameFor() }, state.link.id);
      setLink(f, false);
      state.lastSync = Date.now();
      Store.dirty = false; Store.emit('saved');
      setStatus('saved');
      if (!opts.silent) UI.toast($t('Drive\'a kaydedildi'), 'ok');
      return true;
    } catch (e) {
      if (e.code === 404) {
        setLink(null);
        UI.toast($t('Bağlı Drive dosyası bulunamadı. Yeni dosya olarak kaydedebilirsiniz.'), 'warn', { action: { label: $t('Kaydet'), fn: () => saveAs() } });
        setStatus(hasToken() ? 'ready' : 'signedout');
      } else fail(e, opts.silent);
      return false;
    } finally {
      state.saving = false;
      if (state.pending) { state.pending = false; autoSync(); }
    }
  }

  function fail(e, silent) {
    if (e && e.quiet) return;
    console.warn(e);
    setStatus(e.code === 'AUTH' ? 'expired' : 'error', e.message);
    if (!silent) UI.toast(e.message, 'error');
  }

  let loadingFromDrive = false;
  async function open(id, opts) {
    opts = opts || {};
    try {
      await ensureToken();
      setStatus('saving');
      const meta = await api(`/files/${id}?fields=${FIELDS}`);
      const text = await api(`/files/${id}?alt=media`, { raw: true });
      const doc = JSON.parse(text);
      loadingFromDrive = true;
      try { Store.load(doc); } finally { loadingFromDrive = false; }
      App.IO.resetHandle();
      setLink(meta, false);
      state.lastSync = Date.now();
      setStatus('saved');
      App.Editor.fitView();
      UI.toast(opts.message || $t('Drive\'dan açıldı: {name}', { name: meta.name }), 'ok');
      return true;
    } catch (e) {
      if (e instanceof SyntaxError) e = new Error($t('Dosya okunamadı (geçerli bir UML Studio belgesi değil)'));
      fail(e, false);
      return false;
    }
  }

  /* Uzak dosya başka cihazda değişti mi? Yerelde değişiklik yoksa otomatik yükle. */
  async function checkRemote() {
    if (!state.link || !hasToken()) return;
    try {
      const meta = await api(`/files/${state.link.id}?fields=${FIELDS},trashed`);
      if (meta.trashed) throw Object.assign(new Error('trashed'), { code: 404 });
      if (String(meta.version) === state.link.version) { setStatus('saved'); return; }
      if (!state.link.dirty) {
        await open(meta.id, { message: $t('Drive\'daki güncel sürüm yüklendi ({date})', { date: fmtDate(meta.modifiedTime) }) });
      } else {
        setStatus('conflict');
        UI.toast($t('Bu belge hem burada hem başka bir cihazda değişti'), 'warn', { action: { label: $t('Çöz'), fn: () => resolveConflict(meta) } });
      }
    } catch (e) {
      if (e.code === 404) { setLink(null); setStatus('ready'); UI.toast($t('Bağlı Drive dosyası artık yok; belge yalnızca bu cihazda.'), 'warn'); }
      else fail(e, true);
    }
  }

  function resolveConflict(meta) {
    return new Promise((resolve) => {
      UI.modal({
        title: $t('Senkron çakışması'),
        body: h('div', null,
          h('p', { class: 'modal-text' }, $t('"{name}" Drive\'da başka bir cihazdan değiştirilmiş ({date}). Bu cihazda da kaydedilmemiş değişiklikler var.', { name: meta.name, date: fmtDate(meta.modifiedTime) })),
          h('p', { class: 'p-hint' }, $t('Hiçbir şey kaybolmasın istiyorsanız "Benimkini kopya olarak kaydet" seçeneğini kullanın.'))),
        buttons: [
          { label: $t('Drive\'dakini aç'), action: () => { open(meta.id).then(resolve); } },
          { spacer: true },
          { label: $t('Üzerine yaz'), danger: true, action: () => { save({ force: true }).then(resolve); } },
          { label: $t('Benimkini kopya olarak kaydet'), primary: true, action: () => { saveAs($t('{name} (çakışma {date})', { name: Store.doc.name || $t('Adsız'), date: new Date().toLocaleString(locale()) }), { copy: true }).then(resolve); } },
        ],
        onClose: () => resolve(false),
      });
    });
  }

  async function rename(file) {
    const base = file.name.replace(/\.uml\.json$/i, '').replace(/\.json$/i, '');
    const v = await UI.prompt($t('Yeni ad'), base, { title: $t('Yeniden adlandır') });
    if (!v || !v.trim()) return false;
    try {
      const f = await api(`/files/${file.id}?fields=${FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fileNameFor(v.trim()) }) });
      if (state.link && state.link.id === file.id) setLink(f, state.link.dirty);
      return true;
    } catch (e) { fail(e, false); return false; }
  }

  async function trash(file) {
    if (!(await UI.confirm($t('"{name}" Drive çöp kutusuna taşınsın mı? (Drive\'dan 30 gün içinde geri alınabilir)', { name: file.name }), { ok: $t('Çöpe taşı'), danger: true }))) return false;
    try {
      await api(`/files/${file.id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      if (state.link && state.link.id === file.id) { setLink(null); setStatus('ready'); }
      return true;
    } catch (e) { fail(e, false); return false; }
  }

  function unlink() { setLink(null); setStatus(hasToken() ? 'ready' : 'signedout'); UI.toast($t('Belge Drive dosyasından ayrıldı')); }

  /* ---------- otomatik senkron ---------- */
  const autoSync = U.debounce(() => {
    if (state.auto && state.link && state.link.dirty && hasToken() && navigator.onLine !== false) save({ silent: true });
  }, 2500);

  function setAuto(v) { state.auto = !!v; ls.set(K.auto, v ? '1' : '0'); emit(); if (v) autoSync(); }

  /* ---------- arayüz ---------- */
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    return same ? $t('bugün {time}', { time: d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })
      : d.toLocaleString(locale(), { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtSize(n) { n = Number(n) || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  function statusInfo() {
    const s = state.status;
    if (!state.link) {
      if (hasToken()) return { text: 'Drive', cls: 'ok', title: $t('Drive bağlı: {email}', { email: state.user ? state.user.emailAddress : '' }) + '\n' + $t('Bu belge henüz Drive\'a kaydedilmedi.') };
      return { text: 'Drive', cls: 'off', title: $t('Google Drive ile senkronize et') };
    }
    const name = state.link.name.replace(/\.uml\.json$/i, '');
    switch (s) {
      case 'saving': return { text: $t('Kaydediliyor…'), cls: 'busy', title: name };
      case 'conflict': return { text: $t('Çakışma!'), cls: 'warn', title: $t('Dosya başka cihazda değişti. Tıklayıp çözün.') };
      case 'expired': case 'signedout': return { text: $t('Giriş gerekli'), cls: 'warn', title: $t('Drive senkronu için yeniden giriş yapın') };
      case 'error': return { text: $t('Senkron hatası'), cls: 'err', title: state.error || '' };
      default:
        if (state.link.dirty) return { text: state.auto && hasToken() ? $t('Senkron bekliyor') : $t('Drive\'a kaydedilmedi'), cls: 'warn', title: name };
        return { text: $t('Senkronize'), cls: 'ok', title: name + (state.lastSync ? '\n' + $t('Son senkron: {time}', { time: new Date(state.lastSync).toLocaleTimeString(locale()) }) : '') };
    }
  }

  function menuItems() {
    const items = [];
    const signed = hasToken();
    if (state.user && signed) items.push({ header: state.user.emailAddress });
    if (state.link) items.push({ label: $t('Bağlı dosya: {name}', { name: state.link.name }), disabled: true, icon: 'cloud' });
    if (!signed) {
      items.push({ label: state.user ? $t('Yeniden giriş yap') : $t('Google ile giriş yap'), icon: 'cloud', action: () => signIn().catch((e) => fail(e, false)) });
    }
    items.push(
      { label: $t('Drive\'a kaydet'), icon: 'cloudUp', shortcut: state.link ? 'Ctrl+S' : '', action: () => save() },
      { label: $t('Drive\'a yeni dosya olarak kaydet…'), action: () => saveAs() },
      { label: $t('Drive\'dan aç…'), icon: 'cloudDown', action: () => openDialog() },
      { sep: true },
      { label: $t('Otomatik senkron'), checked: state.auto, action: () => setAuto(!state.auto) },
    );
    if (state.link) {
      items.push({ label: $t('Drive\'ı şimdi kontrol et'), icon: 'refresh', action: () => (hasToken() ? checkRemote() : signIn()).catch((e) => fail(e, false)) });
      items.push({ label: $t('Belgeyi Drive dosyasından ayır'), action: unlink });
    }
    items.push({ sep: true });
    if (signed) items.push({ label: $t('Hesap değiştir'), action: () => signIn({ selectAccount: true }).catch((e) => fail(e, false)) }, { label: $t('Çıkış yap'), icon: 'logout', action: signOut });
    items.push({ label: $t('Drive ayarları (Client ID)…'), action: () => showSetup('settings') });
    return items;
  }

  async function openDialog() {
    try { await ensureToken(); } catch (e) { fail(e, false); return; }
    const listEl = h('div', { class: 'drive-list' }, h('div', { class: 'p-hint pad' }, $t('Yükleniyor…')));
    const search = h('input', { class: 'input', type: 'search', placeholder: $t('Dosya ara…') });
    let files = [];
    const render = () => {
      const q = search.value.trim().toLocaleLowerCase('tr');
      const shown = files.filter((f) => !q || f.name.toLocaleLowerCase('tr').includes(q));
      if (!shown.length) { listEl.replaceChildren(h('div', { class: 'p-hint pad' }, files.length ? $t('Sonuç yok') : $t('Drive\'da henüz UML Studio dosyası yok. "Bu belgeyi kaydet" ile ilk dosyanızı oluşturun.'))); return; }
      listEl.replaceChildren(...shown.map((f) => {
        const current = state.link && state.link.id === f.id;
        const row = h('div', { class: 'drive-row' + (current ? ' current' : ''), tabindex: 0 },
          h('span', { class: 'drive-ico', html: UI.icon('file', 18) }),
          h('div', { class: 'drive-main' },
            h('div', { class: 'drive-name' }, f.name.replace(/\.uml\.json$/i, ''), current ? h('span', { class: 'drive-badge' }, $t('açık')) : null),
            h('div', { class: 'drive-meta' }, fmtDate(f.modifiedTime) + ' · ' + fmtSize(f.size))),
          h('button', { class: 'icon-btn', title: $t('Yeniden adlandır'), html: UI.icon('edit', 16), onclick: async (e) => { e.stopPropagation(); if (await rename(f)) refresh(); } }),
          h('button', { class: 'icon-btn danger', title: $t('Çöpe taşı'), html: UI.icon('trash', 16), onclick: async (e) => { e.stopPropagation(); if (await trash(f)) refresh(); } }));
        const go = async () => {
          if (Store.dirty && !(state.link && state.link.id === f.id && !state.link.dirty) && Store.tab.nodes.length &&
            !(await UI.confirm($t('Mevcut belgedeki kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?'), { ok: $t('Aç') }))) return;
          m.close();
          open(f.id);
        };
        row.addEventListener('click', go);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        return row;
      }));
    };
    const refresh = async () => {
      listEl.replaceChildren(h('div', { class: 'p-hint pad' }, $t('Yükleniyor…')));
      try { files = await list(); render(); }
      catch (e) { listEl.replaceChildren(h('div', { class: 'p-hint pad' }, e.message)); }
    };
    search.addEventListener('input', render);
    const m = UI.modal({
      title: $t('Google Drive — UML Studio dosyaları'), wide: true,
      body: h('div', null,
        h('div', { class: 'p-row', style: { marginBottom: '10px', alignItems: 'center' } }, search,
          h('button', { class: 'icon-btn', title: $t('Yenile'), html: UI.icon('refresh', 17), onclick: refresh })),
        listEl,
        h('p', { class: 'p-hint', style: { marginTop: '10px' } }, $t('Dosyalar Drive\'ınızdaki "UML Studio" klasöründe saklanır. Uygulama yalnızca kendi oluşturduğu dosyalara erişebilir.'))),
      buttons: [
        state.user ? { label: state.user.emailAddress, icon: 'cloud', action: () => false } : null,
        { spacer: true },
        { label: $t('Bu belgeyi Drive\'a kaydet'), primary: true, icon: 'cloudUp', action: () => { saveAs(); } },
      ].filter(Boolean),
      noFocus: true,
    });
    refresh();
  }

  function showSetup(reason) {
    const origin = supported() ? location.origin : $t('(file:// — desteklenmiyor)');
    const inp = h('input', { class: 'input mono', type: 'text', value: clientId(), placeholder: '1234567890-abc...apps.googleusercontent.com', spellcheck: false });
    const fromConfig = !!((global.UMLSTUDIO_CONFIG && global.UMLSTUDIO_CONFIG.googleClientId) || '').trim();
    const body = h('div', null,
      reason === 'file' ? h('div', { class: 'callout warn' }, $t('Uygulama şu an file:// ile açık. Google girişi yalnızca http(s) adreslerinde çalışır: GitHub Pages\'te yayınlayın ya da yerelde "python -m http.server 8000" ile açın.')) : null,
      h('p', { class: 'modal-text' }, $t('Drive senkronu için kendi Google Cloud projenizde ücretsiz bir OAuth Client ID oluşturmanız gerekir (bir kerelik, ~5 dakika).')),
      h('ol', { class: 'setup-steps' },
        h('li', null, h('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener' }, 'Google Cloud Console'), $t('\'da yeni bir proje oluşturun.')),
        h('li', null, h('a', { href: 'https://console.cloud.google.com/apis/library/drive.googleapis.com', target: '_blank', rel: 'noopener' }, 'Google Drive API'), $t('\'yi etkinleştirin.')),
        h('li', null, $t('OAuth izin ekranını (Google Auth Platform) "External" olarak yapılandırın, kendi e-postanızı test kullanıcısı olarak ekleyin.')),
        h('li', null, h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', rel: 'noopener' }, $t('Kimlik bilgileri')), $t(' → OAuth istemci kimliği → '), h('b', null, $t('Web uygulaması')), $t('. "Yetkili JavaScript kaynakları"na şunu ekleyin:'),
          h('div', { class: 'origin-box' }, h('code', null, origin), h('button', { class: 'link-btn', onclick: () => UI.copyText(origin) }, $t('kopyala')))),
        h('li', null, $t('Oluşan Client ID\'yi aşağıya yapıştırın (veya kalıcı olarak js/config.js dosyasına yazın).'))),
      h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, 'OAuth Client ID' + (fromConfig ? ' ' + $t('(config.js içinde tanımlı)') : '')), inp));
    UI.modal({
      title: $t('Google Drive kurulumu'), wide: true, body,
      buttons: [{ spacer: true }, { label: $t('Kapat') }, {
        label: $t('Kaydet ve giriş yap'), primary: true, icon: 'cloud', action: () => {
          const v = inp.value.trim();
          if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { UI.toast($t('Client ID ".apps.googleusercontent.com" ile bitmeli'), 'error'); return false; }
          ls.set(K.client, v || null);
          tokenClient = null;
          if (v && supported()) setTimeout(() => signIn().catch((e) => fail(e, false)), 50);
        },
      }],
      noFocus: true,
    });
  }

  /* ---------- başlatma ---------- */
  function init() {
    restore();
    if (state.link) state.status = hasToken() ? 'idle' : 'expired';
    else state.status = hasToken() ? 'ready' : 'off';
    Store.on('change', () => {
      if (!state.link) return;
      if (!state.link.dirty) { state.link.dirty = true; persistLink(); emit(); }
      autoSync();
    });
    // başka kaynaktan belge yüklendiğinde (yeni, yerel dosya, örnek) Drive bağlantısı kalkar
    Store.on('load', () => { if (!loadingFromDrive && state.link) { setLink(null); setStatus(hasToken() ? 'ready' : 'off'); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSync.flush(); else if (state.link && hasToken() && !state.saving) checkRemote(); });
    window.addEventListener('online', () => { if (state.link && state.link.dirty) autoSync(); });
    emit();
    if (state.link && hasToken()) checkRemote();
  }

  App.Drive = {
    init, signIn: () => signIn().catch((e) => fail(e, false)), signOut, save, saveAs, open, openDialog, list, checkRemote, showSetup, menuItems, statusInfo,
    get linked() { return !!state.link; }, get signedIn() { return hasToken(); }, state,
    _api: api, _setToken(t, exp, user) { state.token = t; state.expiresAt = exp; state.user = user || null; persistToken(); emit(); },
  };
})(window);
