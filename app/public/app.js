(() => {
  'use strict';
  const { MODELS, PALETTES, GROUPS, resolve } = window.Devices;
  const $ = id => document.getElementById(id);
  const stage = $('stage'), device = $('device'), cv = $('cv');
  const ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
  const W = window.pmWindow || null;              // dostępne tylko w aplikacji (Electron)
  const APP = !!W;
  document.body.classList.add(APP ? 'electron' : 'browser');
  const PAD = 24, TOP = 44;                        // margines na cień i na pasek u góry

  // ---------- ustawienia lokalne ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('pm.' + k, JSON.stringify(v)); } catch {} },
  };
  const S = {
    model: store.get('model', 'auto'), colors: store.get('colors', {}), frame: store.get('frame', true),
    lastId: store.get('lastId', null), scale: store.get('scale', 0), vol: store.get('vol', 0.75), muted: store.get('muted', false),
  };
  const R = {
    ws: null, config: null, engine: 'starting', engineMsg: '', phone: null, detected: null,
    hasImage: false, live: false, frameW: 0, frameH: 0, flip: false, manualLand: false,
    decoded: 0, rec: null, crop: null, cropChecks: [], land: false,
  };

  // =====================================================================
  //  Model i obudowa
  // =====================================================================
  function currentKey() {
    if (S.model !== 'auto') return S.model;
    if (R.detected) return R.detected;
    if (R.frameW && R.frameH) {
      const a = Math.min(R.frameW, R.frameH) / Math.max(R.frameW, R.frameH);
      if (Math.abs(a - 0.5625) < 0.012) return 'se3';
    }
    const last = S.lastId && resolve({ id: S.lastId });
    return last || '14';
  }
  const currentModel = () => MODELS[currentKey()];
  const px = v => v + 'px';

  function applyModel() {
    const key = currentKey(), m = currentModel();
    const pal = PALETTES[m.pal] || PALETTES.android;
    const ci = Math.min(S.colors[key] ?? 0, pal.length - 1);
    const style = m.style;
    let bz = m.bz, bzt = m.bz, bzb = m.bz, bd = m.bd, r = m.r, rz, rb;
    if (style === 'home') { bz = 26; bzt = bzb = 104; bd = 3.6; r = 0; rz = 58; rb = 61.6; }
    else { rz = r + bz; rb = rz + bd; }
    const set = (k, v) => device.style.setProperty(k, v);
    set('--w', px(m.w)); set('--h', px(m.h)); set('--r', px(r));
    set('--bz', px(bz)); set('--bzt', px(bzt)); set('--bzb', px(bzb));
    set('--bd', px(bd)); set('--rz', px(rz)); set('--rb', px(rb)); set('--c', pal[ci][1]);
    set('--nw', px(m.nw || 160)); set('--nh', px(m.nh || 32));
    set('--iw', px(m.iw || 126)); set('--ih', px(m.ih || 37)); set('--it', px(m.it || 11));
    device.className = `device s-${style} f-${m.finish || 'alu'}${S.frame ? '' : ' bare'}`;

    const H = m.h + bzt + bzb + 2 * bd;
    const B = style === 'home'
      ? { sw: [.135, .033, 'l'], vu: [.205, .06, 'l'], vd: [.28, .06, 'l'], pw: [.205, .07, 'r'] }
      : style === 'punch' ? { pw: [.24, .07, 'r'], vu: [.35, .07, 'r'], vd: [.42, .07, 'r'] }
      : { sw: m.btn === 'action' ? [.145, .042, 'l'] : [.152, .033, 'l'], vu: [.232, .072, 'l'], vd: [.322, .072, 'l'], pw: [.25, .115, 'r'], ...(m.cc ? { cc: [.6, .06, 'r'] } : {}) };
    const titles = { sw: m.btn === 'action' ? 'Przycisk Czynność: wycisz' : 'Przełącznik: wycisz', vu: 'Głośniej', vd: 'Ciszej', pw: 'Zrzut ekranu', cc: 'Nagrywanie' };
    for (const k of ['sw', 'vu', 'vd', 'pw', 'cc']) {
      const el = device.querySelector('.b-' + k), b = B[k];
      el.className = `btn b-${k}` + (b ? ` ${b[2]}` : ' hide') + (k === 'cc' ? ' cc' : '');
      el.title = titles[k];
      if (b) { el.style.top = px(b[0] * H); el.style.height = px(b[1] * H); }
    }

    // arkusz ustawień
    $('colorName').textContent = 'Kolor: ' + pal[ci][0];
    $('swatches').innerHTML = pal.map(([n, c], i) => `<button title="${n}" style="--c:${c}" class="${i === ci ? 'sel' : ''}" data-i="${i}"></button>`).join('');
    $('swatches').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.colors[key] = +b.dataset.i; store.set('colors', S.colors); applyModel(); };
    $('iModel').textContent = R.phone ? (R.phone.name ? R.phone.name + ' · ' : '') + m.name : '—';
    $('tbTitle').textContent = R.hasImage ? m.name : 'PhoneMirror';
    updateStatus();
    layout();
  }

  // =====================================================================
  //  Układ i rozmiar okna
  // =====================================================================
  let lastWin = '';
  function layout(anchor = 'tl') {
    const m = currentModel();
    const land = R.hasImage ? R.frameW > R.frameH : R.manualLand;
    const turned = land !== R.land; R.land = land;
    document.body.classList.toggle('landscape', land);
    const dr = land ? (R.flip ? 90 : -90) : 0;
    device.style.setProperty('--dr', dr + 'deg');
    device.style.setProperty('--cr', -dr + 'deg');
    device.style.setProperty('--cw', px(land ? m.h : m.w));
    device.style.setProperty('--ch', px(land ? m.w : m.h));
    const bw = device.offsetWidth, bh = device.offsetHeight;
    const DW = land ? bh : bw, DH = land ? bw : bh;

    let s;
    if (APP) {
      s = S.scale || 0.8;
      const ww = Math.round(DW * s + 2 * PAD), wh = Math.round(DH * s + TOP + PAD);
      const key = ww + 'x' + wh;
      if (key !== lastWin) { lastWin = key; W.setSize(ww, wh, turned ? 'center' : anchor); }
      device.style.left = (ww / 2) + 'px';
      device.style.top = (TOP + DH * s / 2) + 'px';
    } else {
      const fit = Math.min((innerWidth - 2 * PAD) / DW, (innerHeight - TOP - PAD) / DH);
      s = Math.max(.2, Math.min(S.scale || fit, fit));
      device.style.left = (innerWidth / 2) + 'px';
      device.style.top = (TOP + (innerHeight - TOP - PAD) / 2) + 'px';
    }
    device.style.setProperty('--s', s.toFixed(4));
    R.DH = DH;
    $('sizeRange').value = Math.round((S.scale || s) * 100);
    $('sizeVal').textContent = Math.round((S.scale || s) * 100) + '%';
  }
  addEventListener('resize', () => { if (!APP) layout(); });

  let badgeT;
  function setScale(s, anchor = 'tl') {
    S.scale = Math.max(0.3, Math.min(2.2, s));
    store.set('scale', S.scale);
    layout(anchor);
    const b = $('sizeBadge'); b.textContent = Math.round(S.scale * 100) + '%'; b.classList.add('show');
    clearTimeout(badgeT); badgeT = setTimeout(() => b.classList.remove('show'), 900);
  }

  // uchwyt w rogu
  const grip = $('grip');
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const start = { x: e.screenX, y: e.screenY, s: S.scale || 0.8, h: R.DH };
    let raf = 0, last = e;
    const move = ev => {
      last = ev; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const d = Math.max(last.screenY - start.y, (last.screenX - start.x) * 0.5);
        setScale(start.s * (1 + d / (start.h * start.s)), 'tl');
      });
    };
    const up = () => { grip.removeEventListener('pointermove', move); document.body.classList.remove('resizing'); };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });
  // Ctrl + kółko
  addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setScale((S.scale || 0.8) * Math.exp(-e.deltaY * 0.0015), 'center');
  }, { passive: false });
  $('sizeRange').oninput = e => setScale(e.target.value / 100, 'center');

  // =====================================================================
  //  Pasek u góry
  // =====================================================================
  $('bClose').onclick = () => W && W.close();
  $('bMin').onclick = () => W && W.minimize();
  $('bShot').onclick = screenshot;
  $('bRec').onclick = toggleRec;
  $('bRotate').onclick = () => { if (R.hasImage) R.flip = !R.flip; else R.manualLand = !R.manualLand; R.land = !R.land; layout('center'); };
  $('bSettings').onclick = () => toggleSheet();
  $('lkGear').onclick = () => toggleSheet(true);
  async function syncOnTop(v) {
    if (!W) return;
    const on = await W.onTop(v);
    $('bPin').classList.toggle('on', on); $('tOnTop').checked = on;
  }
  $('bPin').onclick = () => syncOnTop(!$('bPin').classList.contains('on'));
  $('tOnTop').onchange = e => syncOnTop(e.target.checked);
  if (!APP) $('onTopRow').style.display = 'none';
  syncOnTop();

  // =====================================================================
  //  Arkusz ustawień
  // =====================================================================
  function toggleSheet(open) {
    const o = open ?? !document.body.classList.contains('sheet-open');
    document.body.classList.toggle('sheet-open', o);
    if (!o) commitName();
  }
  $('sheetDone').onclick = () => toggleSheet(false);
  $('sheetBg').onclick = () => toggleSheet(false);

  const sel = $('modelSel');
  sel.innerHTML = '<option value="auto">Automatycznie</option>' + GROUPS.map(([g, keys]) =>
    `<optgroup label="${g}">${keys.map(k => `<option value="${k}">${MODELS[k].name}</option>`).join('')}</optgroup>`).join('');
  sel.value = S.model;
  sel.onchange = () => { S.model = sel.value; store.set('model', S.model); applyModel(); };
  $('tFrame').checked = S.frame;
  $('tFrame').onchange = e => { S.frame = e.target.checked; store.set('frame', S.frame); applyModel(); };

  const sendCfg = patch => R.ws && R.ws.readyState === 1 && R.ws.send(JSON.stringify({ type: 'config', ...patch }));
  const nameIn = $('recvName');
  function commitName() { const v = nameIn.value.trim(); if (v && R.config && v !== R.config.name) { sendCfg({ name: v }); pill('Zmieniono nazwę odbiornika', 'ok'); } }
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('blur', commitName);
  $('qualSeg').onclick = e => { const b = e.target.closest('button'); if (b) sendCfg({ quality: b.dataset.v }); };
  $('tAudio').onchange = e => sendCfg({ audio: e.target.checked });
  $('bRestart').onclick = e => { e.preventDefault(); R.ws && R.ws.send(JSON.stringify({ type: 'restart' })); };

  // =====================================================================
  //  Przyciski na obudowie
  // =====================================================================
  const ICONS = {
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    bellOff: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 9.4-4.9M18 11v5l1.5 2H8"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M3 3l18 18"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5L16 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>',
  };
  let pillT;
  function pill(text, icon = 'ok', red = false) {
    const p = $('pill'); p.innerHTML = (ICONS[icon] || '') + `<span>${text}</span>`;
    p.classList.toggle('red', red); p.classList.add('show');
    clearTimeout(pillT); pillT = setTimeout(() => p.classList.remove('show'), 1600);
  }

  let hudT;
  function showVolume() {
    const h = $('vhud');
    $('vfill').style.height = (S.vol * 100) + '%';
    h.classList.toggle('muted', S.muted); h.classList.toggle('low', S.vol < 0.12);
    h.classList.add('show');
    clearTimeout(hudT); hudT = setTimeout(() => h.classList.remove('show'), 1500);
  }
  function setVolume(v) {
    S.vol = Math.round(Math.max(0, Math.min(1, v)) * 16) / 16;
    if (S.muted && v > 0) { S.muted = false; store.set('muted', false); }
    store.set('vol', S.vol); applyGain(); showVolume();
  }
  function toggleMute() {
    S.muted = !S.muted; store.set('muted', S.muted); applyGain();
    pill(S.muted ? 'Tryb cichy włączony' : 'Tryb cichy wyłączony', S.muted ? 'bellOff' : 'bell', S.muted);
  }
  function press(el) { el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 140); }
  const ACT = { vu: () => setVolume(S.vol + 1 / 16), vd: () => setVolume(S.vol - 1 / 16), sw: toggleMute, pw: screenshot, cc: toggleRec };
  device.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn'); if (!b || e.button !== 0) return;
    const k = [...b.classList].find(c => c.startsWith('b-')).slice(2);
    press(b); ACT[k] && ACT[k]();
    if (k === 'vu' || k === 'vd') {   // przytrzymanie = powtarzanie
      let rep = setTimeout(function again() { ACT[k](); press(b); rep = setTimeout(again, 110); }, 420);
      const stop = () => { clearTimeout(rep); removeEventListener('pointerup', stop); };
      addEventListener('pointerup', stop);
    }
  });
  device.addEventListener('wheel', e => {
    if (e.ctrlKey || !e.target.closest('.b-vu, .b-vd')) return;
    e.preventDefault(); setVolume(S.vol + (e.deltaY < 0 ? 1 : -1) / 16);
  }, { passive: false });

  addEventListener('keydown', e => {
    if (e.target.matches('input, select')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); screenshot(); }
    else if (mod && (k === '=' || k === '+')) { e.preventDefault(); setScale((S.scale || .8) * 1.1, 'center'); }
    else if (mod && k === '-') { e.preventDefault(); setScale((S.scale || .8) / 1.1, 'center'); }
    else if (mod && k === '0') { e.preventDefault(); setScale(1, 'center'); }
    else if (mod) return;
    else if (k === 'arrowup') { e.preventDefault(); setVolume(S.vol + 1 / 16); }
    else if (k === 'arrowdown') { e.preventDefault(); setVolume(S.vol - 1 / 16); }
    else if (k === 'm') toggleMute();
    else if (k === 'r') $('bRotate').click();
    else if (k === 'escape') toggleSheet(false);
  });
  addEventListener('contextmenu', e => { e.preventDefault(); toggleSheet(); });

  // =====================================================================
  //  Status
  // =====================================================================
  function updateStatus() {
    const name = (R.config && R.config.name) || 'PhoneMirror';
    let lk = 'Uruchamianie…', eng = 'uruchamianie';
    const bad = R.engine === 'missing' || R.engine === 'crashed';
    if (bad) { lk = 'Odbiornik nie działa — otwórz Ustawienia'; eng = 'błąd'; }
    else if (R.engine === 'disconnected') { lk = 'Brak połączenia z aplikacją'; eng = '—'; }
    else if (R.engine === 'running') { lk = 'Gotowy do połączenia'; eng = 'działa'; }
    $('lkStatus').textContent = lk; $('lkStatus').classList.toggle('lk-err', bad);
    $('lkName').textContent = name; $('iEngine').textContent = eng;
    $('engineMsg').textContent = bad ? (R.engineMsg || '') : '';
  }
  function onState(m) {
    R.config = m.config; R.engine = m.engine; R.engineMsg = m.engineMsg;
    if (document.activeElement !== nameIn) nameIn.value = m.config.name;
    [...$('qualSeg').children].forEach(b => b.classList.toggle('sel', b.dataset.v === m.config.quality));
    $('tAudio').checked = !!m.config.audio;
    if (m.phone) onPhone(m.phone); else updateStatus();
  }
  function onPhone(dev) {
    R.phone = dev || {};
    R.detected = resolve(R.phone);
    if (R.phone.id && R.detected) { S.lastId = R.phone.id; store.set('lastId', S.lastId); }
    applyModel();
  }
  function setLive(on) {
    R.live = on; stage.classList.toggle('streaming', on); device.classList.toggle('streaming', on);
    document.body.classList.toggle('streaming', on);
  }
  function onPhoneLeft() {
    R.phone = null; R.detected = null; R.hasImage = false; R.flip = false; R.crop = null; R.frameW = R.frameH = 0;
    setLive(false); $('iRes').textContent = '—'; $('iFps').textContent = '—';
    if (R.rec) R.rec.stop();
    resetDecoder(); flushAudio();
    applyModel();
  }

  // =====================================================================
  //  Wideo: H.264 → WebCodecs → płynne rysowanie z odświeżaniem ekranu
  // =====================================================================
  let dec = null, decCodec = '', ts = 0, waitKey = true, pendingFrame = null, resyncAt = 0;
  function findNal(d, type) {
    for (let i = 0; i + 4 < d.length; i++) {
      if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 1) { if ((d[i + 3] & 0x1f) === type) return d.subarray(i + 3); i += 2; }
    }
    return null;
  }
  const hex = b => b.toString(16).padStart(2, '0');
  function resetDecoder() { try { if (dec && dec.state !== 'closed') dec.close(); } catch {} dec = null; waitKey = true; }
  function decoderFailed(e) {
    console.warn('Dekoder:', e); dec = null; waitKey = true;
    // poproś serwer o powtórzenie klatek od ostatniej kluczowej – bez czekania na telefon
    const now = performance.now();
    if (now - resyncAt > 1000 && R.ws && R.ws.readyState === 1) { resyncAt = now; R.ws.send('{"type":"resync"}'); }
  }
  function makeDecoder(codec) {
    resetDecoder();
    decCodec = codec;
    dec = new VideoDecoder({ output: onVideoFrame, error: decoderFailed });
    dec.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'no-preference' });
  }
  function onAU(buf) {
    if (!window.VideoDecoder) return;
    const u8 = new Uint8Array(buf);
    const key = u8[1] === 1, data = u8.subarray(2);
    if (key) {
      const sps = findNal(data, 7);
      if (sps) {
        const codec = 'avc1.' + hex(sps[1]) + hex(sps[2]) + hex(sps[3]);
        if (!dec || dec.state === 'closed' || codec !== decCodec) makeDecoder(codec);
      }
      if (!dec) return;
      waitKey = false;
    }
    if (!dec || dec.state !== 'configured' || waitKey) return;
    try { dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: (ts++) * 16667, data })); }
    catch (e) { decoderFailed(e); }
  }
  function onVideoFrame(frame) {
    R.decoded++;
    if (pendingFrame) pendingFrame.close();     // zawsze tylko najnowsza klatka – brak opóźnień
    pendingFrame = frame;
  }

  // wykrywanie czarnych pasów: tylko po zmianie rozmiaru obrazu i rzadko (odczyt z GPU kosztuje)
  const probe = document.createElement('canvas'); probe.width = probe.height = 96;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  function detectCrop(frame) {
    const FW = frame.displayWidth, FH = frame.displayHeight;
    pctx.drawImage(frame, 0, 0, 96, 96);
    const d = pctx.getImageData(0, 0, 96, 96).data;
    const lit = (x, y) => { const i = (y * 96 + x) * 4; return d[i] + d[i + 1] + d[i + 2] > 36; };
    const colLit = x => { for (let y = 0; y < 96; y += 2) if (lit(x, y)) return true; return false; };
    const rowLit = y => { for (let x = 0; x < 96; x += 2) if (lit(x, y)) return true; return false; };
    let l = 0, r = 95, t = 0, b = 95;
    while (l < 95 && !colLit(l)) l++;
    while (r > l && !colLit(r)) r--;
    while (t < 95 && !rowLit(t)) t++;
    while (b > t && !rowLit(b)) b--;
    if (r - l < 8 || b - t < 8) return R.crop;
    const sym = (a, c) => Math.abs(a - c) <= 3;
    const m = currentModel(), target = m.w / m.h;
    const snap = (len, other) => { const want = other * target; return Math.abs(len - want) / want < 0.12 ? Math.round(want) : len; };
    if (l > 3 && sym(l, 95 - r)) {
      const w = snap(Math.round((r - l + 1) / 96 * FW), FH);
      if (w / FH > .42 && w / FH < .6) return { x: Math.round((FW - w) / 2), y: 0, w, h: FH };
    } else if (t > 3 && sym(t, 95 - b)) {
      const h = snap(Math.round((b - t + 1) / 96 * FH), FW);
      if (h / FW > .42 && h / FW < .6) return { x: 0, y: Math.round((FH - h) / 2), w: FW, h };
    }
    return null;
  }
  let srcW = 0, srcH = 0;
  function render(now) {
    requestAnimationFrame(render);
    const f = pendingFrame; if (!f) return;
    pendingFrame = null;
    try {
      if (f.displayWidth !== srcW || f.displayHeight !== srcH) {
        srcW = f.displayWidth; srcH = f.displayHeight; R.crop = null;
        R.cropChecks = [now, now + 600, now + 2000, now + 5000];
      }
      if (R.cropChecks.length && now >= R.cropChecks[0]) { R.cropChecks.shift(); R.crop = detectCrop(f); if (!R.cropChecks.length) R.cropChecks.push(now + 15000); }
      const c = R.crop || { x: 0, y: 0, w: srcW, h: srcH };
      if (cv.width !== c.w || cv.height !== c.h) { cv.width = c.w; cv.height = c.h; }
      ctx.drawImage(f, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      if (!R.live) setLive(true);
      const changed = R.frameW !== c.w || R.frameH !== c.h;
      R.frameW = c.w; R.frameH = c.h;
      if (!R.hasImage) { R.hasImage = true; if (!R.phone) R.phone = {}; applyModel(); }
      else if (changed) applyModel();
      if (changed) $('iRes').textContent = `${c.w} × ${c.h}`;
    } finally { f.close(); }
  }
  requestAnimationFrame(render);
  setInterval(() => { if (R.hasImage) $('iFps').textContent = `${R.decoded} kl./s`; R.decoded = 0; }, 1000);

  // =====================================================================
  //  Dźwięk: PCM z silnika → AudioWorklet → głośność z przycisków
  // =====================================================================
  let actx = null, anode = null, gain = null, aRate = 0, aStarting = false, recDest = null;
  async function startAudio(rate) {
    aStarting = true;
    try {
      if (actx) await actx.close();
      actx = new AudioContext({ sampleRate: rate, latencyHint: 'interactive' });
      await actx.audioWorklet.addModule('pcm-worklet.js');
      anode = new AudioWorkletNode(actx, 'pcm', { outputChannelCount: [2] });
      gain = actx.createGain();
      recDest = actx.createMediaStreamDestination();
      anode.connect(gain); gain.connect(actx.destination); gain.connect(recDest);
      aRate = rate; applyGain();
      if (actx.state !== 'running') actx.resume().catch(() => {});
    } catch (e) { console.warn('Audio:', e); actx = null; }
    aStarting = false;
  }
  addEventListener('pointerdown', () => { if (actx && actx.state !== 'running') actx.resume(); }, true);
  function applyGain() {
    if (!gain) return;
    const g = S.muted ? 0 : Math.pow(S.vol, 1.7);
    gain.gain.setTargetAtTime(g, actx.currentTime, 0.03);
  }
  function flushAudio() { if (anode) anode.port.postMessage('flush'); }
  function onAudio(buf) {
    const dv = new DataView(buf);
    const ch = dv.getUint8(1), rate = dv.getUint32(2);
    if (rate !== aRate || !actx) { if (!aStarting) startAudio(rate); return; }
    if (!anode) return;
    const n = (buf.byteLength - 6) >> 1, frames = ch === 1 ? n : n >> 1;
    const out = new Float32Array(frames * 2);
    if (ch === 1) for (let i = 0; i < n; i++) { const v = dv.getInt16(6 + i * 2) / 32768; out[2 * i] = v; out[2 * i + 1] = v; }
    else for (let i = 0; i < frames * 2; i++) out[i] = dv.getInt16(6 + i * 2) / 32768;
    anode.port.postMessage(out, [out.buffer]);
  }

  // =====================================================================
  //  Zrzut ekranu i nagrywanie
  // =====================================================================
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} o ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function screenshot() {
    if (!R.hasImage) return pill('Brak obrazu z telefonu', 'cam');
    const fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    cv.toBlob(b => { download(b, `Zrzut ekranu ${stamp()}.png`); pill('Zapisano zrzut ekranu', 'cam'); }, 'image/png');
  }
  function toggleRec() {
    if (R.rec) { R.rec.stop(); return; }
    if (!R.hasImage) return pill('Brak obrazu z telefonu', 'rec');
    const stream = cv.captureStream(60);
    if (recDest) recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12e6 } : {});
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      R.rec = null; $('bRec').classList.remove('rec');
      const t = rec.mimeType || 'video/webm';
      download(new Blob(chunks, { type: t }), `Nagranie ekranu ${stamp()}.${t.includes('mp4') ? 'mp4' : 'webm'}`);
      pill('Zapisano nagranie', 'rec');
    };
    rec.start(1000); R.rec = rec; $('bRec').classList.add('rec'); pill('Nagrywanie…', 'rec', true);
  }

  // zegar na ekranie blokady
  function tick() {
    const d = new Date();
    const hm = d.toLocaleTimeString('pl-PL', { hour: 'numeric', minute: '2-digit' });
    $('lkClock').textContent = hm; $('sbTime').textContent = hm;
    $('lkDate').textContent = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tick(); setInterval(tick, 5000);

  // =====================================================================
  //  Połączenie z silnikiem
  // =====================================================================
  let retry = 400;
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    R.ws = ws;
    ws.onopen = () => { retry = 400; };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') {
        const t = new Uint8Array(e.data, 0, 1)[0];
        return t === 1 ? onAU(e.data) : t === 2 ? onAudio(e.data) : null;
      }
      const m = JSON.parse(e.data);
      if (m.type === 'state') onState(m);
      else if (m.type === 'phone') onPhone(m.device);
      else if (m.type === 'phone-left') onPhoneLeft();
      else if (m.type === 'idle') { setLive(false); flushAudio(); }
    };
    ws.onclose = () => {
      R.engine = 'disconnected'; updateStatus();
      setTimeout(connect, retry); retry = Math.min(retry * 1.6, 4000);
    };
  }

  // pierwszy start aplikacji: telefon na ~80% wysokości ekranu
  (async () => {
    if (APP && !S.scale) {
      const wa = await W.workArea();
      const m = currentModel();
      const h = (m.style === 'home' ? m.h + 216 : m.h + 2 * (m.bz + m.bd));
      S.scale = Math.max(.4, Math.min(1.4, (wa.height * 0.82 - TOP - PAD) / h));
      store.set('scale', S.scale);
    }
    applyModel();
  })();
  window.PhoneMirror = { R, S, layout, setScale, setVolume, toggleSheet, audio: () => actx && { state: actx.state, rate: aRate, gain: gain && gain.gain.value } };
  connect();
})();
