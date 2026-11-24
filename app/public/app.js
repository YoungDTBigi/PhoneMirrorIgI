(() => {
  'use strict';
  const { MODELS, PALETTES, GROUPS, resolve } = window.Devices;
  const $ = id => document.getElementById(id);
  const app = $('app'), stage = $('stage'), device = $('device'), cv = $('cv');
  const ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
  const qs = new URLSearchParams(location.search);
  if (qs.get('app') === 'electron') document.body.classList.add('electron');
  if (qs.get('mac') === '1') document.body.classList.add('mac');

  // ---------- ustawienia wyglądu (lokalnie) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('pm.' + k, JSON.stringify(v)); } catch {} },
  };
  const S = {
    model: store.get('model', 'auto'), colors: store.get('colors', {}), bg: store.get('bg', 'auto'),
    frame: store.get('frame', true), side: store.get('side', true), lastId: store.get('lastId', null),
  };
  const R = {
    ws: null, config: null, engine: 'starting', engineMsg: '',
    phone: null, detected: null, streaming: false, hasImage: false, paused: false,
    frameW: 0, frameH: 0, flip: false, manualLand: false, frames: 0, rec: null,
    crop: null, lastCropCheck: 0,
  };

  // ---------- kontrolki ----------
  const sel = $('modelSel');
  sel.innerHTML = '<option value="auto">Automatycznie</option>' + GROUPS.map(([g, keys]) =>
    `<optgroup label="${g}">${keys.map(k => `<option value="${k}">${MODELS[k].name}</option>`).join('')}</optgroup>`).join('');
  sel.value = S.model;
  sel.onchange = () => { S.model = sel.value; store.set('model', S.model); applyModel(); };
  const bgSeg = $('bgSeg');
  bgSeg.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.bg = b.dataset.v; store.set('bg', S.bg); applyBg(); };
  $('tFrame').checked = S.frame;
  $('tFrame').onchange = e => { S.frame = e.target.checked; store.set('frame', S.frame); applyModel(); };

  // ustawienia odbiornika (zapisywane na serwerze, restartują silnik)
  const sendCfg = patch => R.ws && R.ws.readyState === 1 && R.ws.send(JSON.stringify({ type: 'config', ...patch }));
  const nameIn = $('recvName');
  const commitName = () => { const v = nameIn.value.trim(); if (v && R.config && v !== R.config.name) { sendCfg({ name: v }); toast('Zmieniono nazwę odbiornika'); } };
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('blur', commitName);
  $('qualSel').onchange = e => sendCfg({ quality: e.target.value });
  $('tAudio').onchange = e => sendCfg({ audio: e.target.checked });
  $('bRestart').onclick = () => R.ws && R.ws.send(JSON.stringify({ type: 'restart' }));

  // ---------- model / ramka ----------
  function currentKey() {
    if (S.model !== 'auto') return S.model;
    if (R.detected) return R.detected;
    if (R.frameW && R.frameH) {             // bez identyfikatora: zgadnij po proporcjach obrazu
      const a = Math.min(R.frameW, R.frameH) / Math.max(R.frameW, R.frameH);
      if (Math.abs(a - 0.5625) < 0.012) return 'se3';
    }
    if (S.lastId && resolve({ id: S.lastId })) return resolve({ id: S.lastId });
    return '14';
  }
  const currentModel = () => MODELS[currentKey()];

  function applyBg() {
    stage.classList.remove('bg-auto', 'bg-light', 'bg-dark', 'bg-aurora');
    stage.classList.add('bg-' + S.bg);
    [...bgSeg.children].forEach(b => b.classList.toggle('sel', b.dataset.v === S.bg));
    const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
    stage.classList.toggle('dark-ui', S.bg === 'dark' || S.bg === 'aurora' || (S.bg === 'auto' && sysDark));
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyBg);
  const px = v => v + 'px';

  function applyModel() {
    const key = currentKey(), m = currentModel();
    const pal = PALETTES[m.pal] || PALETTES.android;
    const ci = Math.min(S.colors[key] ?? 0, pal.length - 1);
    const style = m.style;
    let bz = m.bz, bzt = m.bz, bzb = m.bz, bd = m.bd, r = m.r, rz, rb;
    if (style === 'home') { bz = 26; bzt = bzb = 104; bd = 3.6; r = 0; rz = 58; rb = 61.6; }
    else { rz = r + bz; rb = rz + bd; }
    const d = device.style;
    const set = (k, v) => d.setProperty(k, v);
    set('--w', px(m.w)); set('--h', px(m.h)); set('--r', px(r));
    set('--bz', px(bz)); set('--bzt', px(bzt)); set('--bzb', px(bzb));
    set('--bd', px(bd)); set('--rz', px(rz)); set('--rb', px(rb)); set('--c', pal[ci][1]);
    set('--nw', px(m.nw || 160)); set('--nh', px(m.nh || 32));
    set('--iw', px(m.iw || 126)); set('--ih', px(m.ih || 37)); set('--it', px(m.it || 11));
    device.className = `device s-${style} f-${m.finish || 'alu'}${S.frame ? '' : ' bare'}`;

    const H = m.h + bzt + bzb + 2 * bd;
    const B = style === 'home'
      ? { sw: [.135, .033, 'l'], vu: [.205, .06, 'l'], vd: [.28, .06, 'l'], pw: [.205, .07, 'r'] }
      : style === 'punch' ? { pw: [.24, .07, 'r'], vu: [.35, .14, 'r'] }
      : { sw: m.btn === 'action' ? [.145, .042, 'l'] : [.152, .033, 'l'], vu: [.232, .072, 'l'], vd: [.322, .072, 'l'], pw: [.25, .115, 'r'], ...(m.cc ? { cc: [.6, .06, 'r'] } : {}) };
    for (const k of ['sw', 'vu', 'vd', 'pw', 'cc']) {
      const el = device.querySelector('.b-' + k), b = B[k];
      el.className = `btn b-${k}` + (b ? ` ${b[2]}` : ' hide') + (k === 'cc' ? ' cc' : '');
      if (b) { el.style.top = px(b[0] * H); el.style.height = px(b[1] * H); }
    }
    $('colorName').textContent = pal[ci][0];
    const sw = $('swatches');
    sw.innerHTML = pal.map(([n, c], i) => `<button title="${n}" style="--c:${c}" class="${i === ci ? 'sel' : ''}" data-i="${i}"></button>`).join('');
    sw.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.colors[key] = +b.dataset.i; store.set('colors', S.colors); applyModel(); };
    $('iModel').textContent = R.phone ? m.name + (R.detected || S.model !== 'auto' ? '' : ' (?)') : '—';
    updateStatus();
    layout();
  }

  function layout() {
    const m = currentModel();
    const land = R.hasImage ? R.frameW > R.frameH : R.manualLand;
    document.body.classList.toggle('landscape', land);
    const dr = land ? (R.flip ? 90 : -90) : 0;
    device.style.setProperty('--dr', dr + 'deg');
    device.style.setProperty('--cr', -dr + 'deg');
    device.style.setProperty('--cw', px(land ? m.h : m.w));
    device.style.setProperty('--ch', px(land ? m.w : m.h));
    const bw = device.offsetWidth, bh = device.offsetHeight;
    const W = land ? bh : bw, Hh = land ? bw : bh;
    const s = Math.max(.2, Math.min((stage.clientWidth - 64) / W, (stage.clientHeight - 110) / Hh, 1.6));
    device.style.setProperty('--s', s.toFixed(4));
    device.style.top = (stage.clientHeight / 2 + 18) + 'px';
  }
  new ResizeObserver(layout).observe(stage);

  // ---------- status ----------
  function updateStatus() {
    const dot = $('dot'), txt = $('statusText');
    const name = (R.config && R.config.name) || 'PhoneMirror';
    let k = 'wait', t = 'Uruchamianie…', lk = 'Uruchamianie odbiornika…';
    if (R.engine === 'missing' || R.engine === 'crashed') { k = 'off'; t = 'Silnik AirPlay nie działa'; lk = 'Odbiornik niedostępny'; }
    else if (R.engine === 'disconnected') { k = 'off'; t = 'Brak połączenia z aplikacją'; lk = t; }
    else if (R.hasImage) { k = 'on'; t = 'Klonowanie · ' + currentModel().name; }
    else if (R.engine === 'running') { k = 'wait'; t = 'Gotowy — czekam na iPhone\'a'; lk = 'Gotowy do połączenia'; }
    dot.className = 'dot' + (k === 'on' ? ' on' : k === 'off' ? ' off' : '');
    txt.textContent = t;
    $('lkStatus').textContent = lk;
    $('lkName').textContent = name; $('helpName').textContent = name;
    const bad = R.engine === 'missing' || R.engine === 'crashed';
    $('engineBox').hidden = !bad;
    $('engineMsg').textContent = R.engineMsg || '';
  }

  function onState(m) {
    R.config = m.config; R.engine = m.engine; R.engineMsg = m.engineMsg;
    if (document.activeElement !== nameIn) nameIn.value = m.config.name;
    $('qualSel').value = m.config.quality; $('tAudio').checked = !!m.config.audio;
    if (m.phone) onPhone(m.phone); else updateStatus();
  }
  function onPhone(dev) {
    R.phone = dev || {};
    R.detected = resolve(R.phone);
    if (R.phone.id && R.detected) { S.lastId = R.phone.id; store.set('lastId', S.lastId); }
    applyModel();
  }
  function onPhoneLeft() {
    R.phone = null; R.detected = null; R.hasImage = false; R.flip = false; R.crop = null; R.frameW = R.frameH = 0;
    stage.classList.remove('streaming');
    $('iRes').textContent = '—'; $('iFps').textContent = '—';
    if (R.rec) R.rec.stop();
    resetDecoder();
    applyModel();
  }

  // ---------- dekodowanie H.264 (WebCodecs, sprzętowo) ----------
  let dec = null, decCodec = '', ts = 0, waitKey = true;
  function findNal(d, type) {
    for (let i = 0; i + 4 < d.length; i++) {
      if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 1) { if ((d[i + 3] & 0x1f) === type) return d.subarray(i + 3); i += 2; }
    }
    return null;
  }
  const hex = b => b.toString(16).padStart(2, '0');
  function resetDecoder() { try { if (dec && dec.state !== 'closed') dec.close(); } catch {} dec = null; waitKey = true; }
  function makeDecoder(codec) {
    resetDecoder();
    decCodec = codec;
    dec = new VideoDecoder({
      output: onVideoFrame,
      error: e => { console.warn('Dekoder:', e); dec = null; waitKey = true; },
    });
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
    if (!key && dec.decodeQueueSize > 24) { waitKey = true; return; }
    try { dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: (ts++) * 16667, data })); }
    catch (e) { console.warn(e); waitKey = true; }
  }

  // Wykrywanie czarnych pasów (iOS czasem wysyła pionowy ekran w poziomej klatce).
  const probe = document.createElement('canvas'); probe.width = probe.height = 96;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  function detectCrop(frame) {
    const W = frame.displayWidth, H = frame.displayHeight;
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
    if (r - l < 8 || b - t < 8) return R.crop; // prawie czarny obraz – zostaw jak było
    const sym = (a, c) => Math.abs(a - c) <= 3;
    // proporcje ekranu wybranego modelu – siatka 96 px jest zgrubna, więc dociągamy do nich
    const m = currentModel(), target = m.w / m.h;
    const snap = (len, other) => { const want = other * target; return Math.abs(len - want) / want < 0.12 ? Math.round(want) : len; };
    let crop = null;
    if (l > 3 && sym(l, 95 - r)) {          // pasy po bokach
      const w = snap(Math.round((r - l + 1) / 96 * W), H);
      const a = w / H; if (a > .42 && a < .6) crop = { x: Math.round((W - w) / 2), y: 0, w, h: H };
    } else if (t > 3 && sym(t, 95 - b)) {   // pasy u góry i dołu (telefon poziomo)
      const h = snap(Math.round((b - t + 1) / 96 * H), W);
      const a = h / W; if (a > .42 && a < .6) crop = { x: 0, y: Math.round((H - h) / 2), w: W, h };
    }
    return crop;
  }

  function onVideoFrame(frame) {
    try {
      const now = performance.now();
      if (now - R.lastCropCheck > 700) { R.lastCropCheck = now; R.crop = detectCrop(frame); }
      const c = R.crop || { x: 0, y: 0, w: frame.displayWidth, h: frame.displayHeight };
      if (cv.width !== c.w || cv.height !== c.h) { cv.width = c.w; cv.height = c.h; }
      ctx.drawImage(frame, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      R.frames++;
      const changed = R.frameW !== c.w || R.frameH !== c.h;
      R.frameW = c.w; R.frameH = c.h;
      if (!R.hasImage) { R.hasImage = true; stage.classList.add('streaming'); if (!R.phone) R.phone = {}; applyModel(); }
      if (changed) { $('iRes').textContent = `${c.w} × ${c.h}`; applyModel(); }
    } finally { frame.close(); }
  }
  setInterval(() => { if (R.hasImage) $('iFps').textContent = `${R.frames} kl./s`; R.frames = 0; }, 1000);

  // ---------- pasek narzędzi ----------
  function applySide() { app.classList.toggle('noside', !S.side); setTimeout(layout, 360); }
  $('bSide').onclick = () => { S.side = !S.side; store.set('side', S.side); applySide(); };
  $('bRotate').onclick = () => { if (R.hasImage) R.flip = !R.flip; else R.manualLand = !R.manualLand; layout(); };
  $('bFull').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.(); };
  $('bShot').onclick = screenshot;
  $('bRec').onclick = toggleRec;
  addEventListener('keydown', e => {
    if (e.target.matches('input, select')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); screenshot(); }
    else if (!mod && k === 'r') $('bRotate').click();
    else if (!mod && k === 'f') $('bFull').click();
  });
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} o ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function screenshot() {
    if (!R.hasImage) return toast('Brak obrazu z telefonu');
    cv.toBlob(b => { download(b, `Zrzut ekranu ${stamp()}.png`); toast('Zapisano zrzut ekranu'); }, 'image/png');
  }
  function toggleRec() {
    if (R.rec) { R.rec.stop(); return; }
    if (!R.hasImage) return toast('Brak obrazu z telefonu');
    const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(cv.captureStream(60), type ? { mimeType: type, videoBitsPerSecond: 10e6 } : {});
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      R.rec = null; $('bRec').classList.remove('rec');
      const t = rec.mimeType || 'video/webm';
      download(new Blob(chunks, { type: t }), `Nagranie ekranu ${stamp()}.${t.includes('mp4') ? 'mp4' : 'webm'}`);
      toast('Zapisano nagranie');
    };
    rec.start(1000); R.rec = rec; $('bRec').classList.add('rec'); toast('Nagrywanie… kliknij ponownie, aby zakończyć');
  }
  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // zegar na ekranie blokady
  function tick() {
    const d = new Date();
    const hm = d.toLocaleTimeString('pl-PL', { hour: 'numeric', minute: '2-digit' });
    $('lkClock').textContent = hm; $('sbTime').textContent = hm;
    $('lkDate').textContent = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tick(); setInterval(tick, 5000);

  // ---------- połączenie z serwerem ----------
  let retry = 400;
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    R.ws = ws;
    ws.onopen = () => { retry = 400; };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') return onAU(e.data);
      const m = JSON.parse(e.data);
      if (m.type === 'state') onState(m);
      else if (m.type === 'phone') onPhone(m.device);
      else if (m.type === 'phone-left') onPhoneLeft();
    };
    ws.onclose = () => {
      R.engine = 'disconnected'; updateStatus();
      setTimeout(connect, retry); retry = Math.min(retry * 1.6, 4000);
    };
  }

  if (!window.VideoDecoder) setTimeout(() => toast('Ta przeglądarka nie obsługuje WebCodecs — użyj aplikacji PhoneMirror.exe'), 800);
  window.PhoneMirror = { R, S, layout };
  applyBg(); applySide(); applyModel();
  connect();
})();
