// PhoneMirror — odbiornik AirPlay (jak LonelyScreen) z ramką telefonu.
//
//  iPhone ──AirPlay "Klonowanie ekranu"──▶ uxplay.exe (silnik AirPlay, w tle)
//            uxplay -vrtp ──RTP/H.264 (127.0.0.1)──▶ ten serwer ──WebSocket──▶ okno (WebCodecs)
//
// Zero zależności npm. Node 18+.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const { spawn } = require('child_process');

const PUB = path.join(__dirname, 'public');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const isLocal = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
const START = Buffer.from([0, 0, 0, 1]);
const log = (...a) => { if (!process.env.QUIET) console.log(...a); };

// ---------------- ustawienia ----------------
const CONFIG_FILE = path.join(os.homedir(), '.phonemirror.json');
const DEFAULTS = { name: 'PhoneMirror', quality: 'hd', audio: true };
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
function saveConfig(c) { try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); } catch {} }

// ---------------- minimalny WebSocket ----------------
class WSConn {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = null; this.open = true;
    sock.setNoDelay(true);
    sock.on('data', d => this._data(d));
    sock.on('end', () => sock.destroy());
    sock.on('close', () => { if (this.open) { this.open = false; this.onclose && this.onclose(); } });
    sock.on('error', () => sock.destroy());
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return this.close();
      const maskAt = off; if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let p = Buffer.from(this.buf.subarray(off, off + len));
      if (masked) { const m = this.buf.subarray(maskAt, maskAt + 4); for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(off + len);
      if (op === 8) return this.close();
      if (op === 9) { this._raw(10, p); continue; }
      if (op === 0) { if (this.frag) { this.frag.push(p); if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.onmessage && this.onmessage(all.toString('utf8')); } } continue; }
      if (op === 1) { if (!fin) this.frag = [p]; else this.onmessage && this.onmessage(p.toString('utf8')); }
    }
  }
  _raw(op, p) {
    if (!this.open || this.sock.destroyed) return;
    const n = p.length; let h;
    if (n < 126) h = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    this.sock.write(h); this.sock.write(p);
  }
  get backlog() { return this.sock.writableLength; }
  send(d) { typeof d === 'string' ? this._raw(1, Buffer.from(d)) : this._raw(2, d); }
  json(o) { this.send(JSON.stringify(o)); }
  close() { if (!this.open) return; try { this._raw(8, Buffer.alloc(0)); } catch {} this.sock.end(); setTimeout(() => this.sock.destroy(), 300); }
}

// ---------------- RTP H.264 → Annex-B access units ----------------
class H264Depacketizer {
  constructor(onAU) {
    this.onAU = onAU; this.nals = []; this.key = false; this.ts = null; this.seq = null; this.fu = null;
  }
  push(msg) {
    if (msg.length < 12 || (msg[0] >> 6) !== 2) return;
    const pad = msg[0] & 0x20, ext = msg[0] & 0x10, cc = msg[0] & 0x0f;
    const marker = (msg[1] & 0x80) !== 0;
    const seq = msg.readUInt16BE(2), ts = msg.readUInt32BE(4);
    let off = 12 + cc * 4;
    if (ext) { if (msg.length < off + 4) return; off += 4 + msg.readUInt16BE(off + 2) * 4; }
    let end = msg.length; if (pad) end -= msg[end - 1];
    if (off >= end) return;
    if (this.seq !== null && ((this.seq + 1) & 0xffff) !== seq) this.fu = null; // utracony pakiet
    this.seq = seq;
    if (this.ts !== null && ts !== this.ts && this.nals.length) this.flush();
    this.ts = ts;

    const p = msg.subarray(off, end);
    const type = p[0] & 0x1f;
    if (type >= 1 && type <= 23) this.nal(p);
    else if (type === 24) { // STAP-A
      let i = 1;
      while (i + 2 <= p.length) { const n = p.readUInt16BE(i); i += 2; if (i + n > p.length) break; this.nal(p.subarray(i, i + n)); i += n; }
    } else if (type === 28) { // FU-A
      const fu = p[1];
      if (fu & 0x80) this.fu = [Buffer.from([(p[0] & 0xe0) | (fu & 0x1f)]), p.subarray(2)];
      else if (this.fu) this.fu.push(p.subarray(2));
      if ((fu & 0x40) && this.fu) { this.nal(Buffer.concat(this.fu)); this.fu = null; }
    }
    if (marker) this.flush();
  }
  nal(n) {
    const t = n[0] & 0x1f;
    if (t === 9) return; // AUD – niepotrzebny
    if (t === 5) this.key = true;
    this.nals.push(START, n);
  }
  flush() {
    if (!this.nals.length) return;
    const au = Buffer.concat(this.nals);
    const key = this.key;
    this.nals = []; this.key = false;
    this.onAU(au, key);
  }
}

// ---------------- silnik UxPlay ----------------
function findEngine(engineDir) {
  const exe = process.platform === 'win32' ? 'uxplay.exe' : 'uxplay';
  const cands = [
    process.env.UXPLAY_PATH,
    engineDir && path.join(engineDir, 'bin', exe),
    path.join(__dirname, '..', 'engine', 'bin', exe),
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  // z PATH (np. brew install uxplay / apt install uxplay)
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const c = path.join(dir, exe);
    if (dir && fs.existsSync(c)) return c;
  }
  return null;
}

function engineEnv(exe, dataDir) {
  const env = { ...process.env };
  const root = path.dirname(path.dirname(exe));
  const plugins = path.join(root, 'lib', 'gstreamer-1.0');
  if (fs.existsSync(plugins)) {
    // Silnik spakowany razem z aplikacją: używaj tylko własnego GStreamera.
    env.PATH = path.join(root, 'bin') + path.delimiter + (env.PATH || '');
    env.GST_PLUGIN_SYSTEM_PATH_1_0 = plugins;
    env.GST_PLUGIN_PATH_1_0 = plugins;
    const scanner = path.join(root, 'libexec', 'gstreamer-1.0', process.platform === 'win32' ? 'gst-plugin-scanner.exe' : 'gst-plugin-scanner');
    if (fs.existsSync(scanner)) env.GST_PLUGIN_SCANNER_1_0 = scanner;
    env.GST_REGISTRY_1_0 = path.join(dataDir, 'gst-registry.bin');
  }
  return env;
}

const QUALITY = { sd: '1280x720', hd: '1920x1080', qhd: '2560x1440' };

function start({ port = +process.env.PORT || 8420, engineDir = null, dataDir = os.tmpdir(), onWindow = null } = {}) {
  let winState = null;   // stan okna aplikacji (zawsze na wierzchu, obszar ekranu) – od Electrona
  let config = loadConfig();
  const viewers = new Set();
  const S = {
    engine: 'starting', engineMsg: '', enginePath: null,
    streaming: false, phone: null, lastPacket: 0, width: 0, height: 0,
  };
  const logTail = [];
  let gop = [];          // klatki od ostatniej klatki kluczowej (dla nowych okien i po błędzie dekodera)
  let gopBytes = 0, gopFull = false;
  const GOP_MAX_BYTES = 160e6, GOP_MAX_FRAMES = 12000;

  const state = () => ({
    type: 'state', config, engine: S.engine, engineMsg: S.engineMsg, enginePath: S.enginePath,
    streaming: S.streaming, phone: S.phone, host: os.hostname(), ips: lanIPs(),
  });
  const toViewers = o => { const s = JSON.stringify(o); for (const v of viewers) v.send(s); };

  // ---- wideo: RTP H.264 ----
  // Uwaga: NIE odrzucamy klatek i NIE czekamy na klatkę kluczową — iOS wysyła je bardzo rzadko,
  // a czekanie na nią wyglądało jak zerwane połączenie.
  const depay = new H264Depacketizer((au, key) => {
    const msg = Buffer.concat([Buffer.from([1, key ? 1 : 0]), au]);
    if (key) { gop = []; gopBytes = 0; gopFull = false; }
    if (!gopFull) {
      gop.push(msg); gopBytes += msg.length;
      if (gop.length > GOP_MAX_FRAMES || gopBytes > GOP_MAX_BYTES) { gopFull = true; gop = []; gopBytes = 0; }
    }
    for (const v of viewers) v.send(msg);
  });
  const udp = dgram.createSocket({ type: 'udp4', recvBufferSize: 16 * 1024 * 1024 });
  udp.on('message', (m, rinfo) => {
    if (!isLocal(rinfo.address)) return;
    S.lastPacket = Date.now();
    if (!S.streaming) { S.streaming = true; toViewers({ type: 'stream', on: true }); log('▶︎ Odbieram obraz'); }
    depay.push(m);
  });

  // ---- dźwięk: RTP L16 (PCM 16 bit big-endian) ----
  const audio = dgram.createSocket({ type: 'udp4', recvBufferSize: 4 * 1024 * 1024 });
  let aPrevTs = null, aPrevSamples = 0, aCh = 2, aRate = 44100, aT0 = 0, aTs0 = null;
  audio.on('message', (m, rinfo) => {
    if (!isLocal(rinfo.address) || m.length < 12 || (m[0] >> 6) !== 2) return;
    const cc = m[0] & 0x0f, ext = m[0] & 0x10, pad = m[0] & 0x20;
    let off = 12 + cc * 4;
    if (ext) { if (m.length < off + 4) return; off += 4 + m.readUInt16BE(off + 2) * 4; }
    let end = m.length; if (pad) end -= m[end - 1];
    if (end <= off) return;
    const ts = m.readUInt32BE(4), bytes = end - off, now = Date.now();
    // liczba kanałów i częstotliwość z samych znaczników czasu RTP
    if (aPrevTs !== null) {
      const d = (ts - aPrevTs) >>> 0;
      if (d > 0 && d < 20000 && aPrevSamples) { const ch = Math.round(aPrevSamples / 2 / d); if (ch === 1 || ch === 2) aCh = ch; }
    }
    aPrevTs = ts; aPrevSamples = bytes;
    if (aTs0 === null || now - aT0 > 30000) { aTs0 = ts; aT0 = now; }
    else if (now - aT0 > 5000) {
      // AirPlay prawie zawsze daje 44,1 kHz; zmieniamy tylko przy wyraźnym dowodzie (pomiar z ≥5 s)
      const r = ((ts - aTs0) >>> 0) / ((now - aT0) / 1000);
      const hit = [44100, 48000, 32000, 22050, 16000].find(c => Math.abs(r - c) / c < 0.02);
      if (hit) aRate = hit;
    }
    const head = Buffer.alloc(6); head[0] = 2; head[1] = aCh; head.writeUInt32BE(aRate, 2);
    const msg = Buffer.concat([head, m.subarray(off, end)]);
    for (const v of viewers) v.send(msg);
  });

  // Brak pakietów przez dłuższy czas = klonowanie zakończone (okno pokaże ekran oczekiwania,
  // ale dekoder zostaje gotowy, więc gdy obraz wróci, pojawi się od razu).
  setInterval(() => {
    if (S.streaming && Date.now() - S.lastPacket > 30000) {
      S.streaming = false; toViewers({ type: 'idle' }); log('… brak obrazu od 30 s');
    }
  }, 2000);

  // ---- uxplay ----
  let proc = null, restartTimer = null, backoff = 1000, stopping = false, rtpPort = 0, audioPort = 0;
  const phoneLeft = () => {
    S.phone = null; S.streaming = false; gop = []; gopBytes = 0; gopFull = false;
    toViewers({ type: 'phone-left' });
  };
  let tail = '';
  const onOutput = chunk => {
    const text = chunk.toString('utf8');
    tail = (tail + text).slice(-6000);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      logTail.push(line); if (logTail.length > 200) logTail.shift();
    }
    // model urządzenia, np. iPhone14,7, i nazwa z plisty klienta
    const id = text.match(/\b(iPhone|iPad|iPod)\d{1,2},\d{1,2}\b/);
    const nm = tail.match(/<key>name<\/key>\s*<string>([^<]{1,80})<\/string>/) || tail.match(/[Cc]onnection request from ([^\n(]{1,60})/);
    if (id || (nm && S.phone && !S.phone.name)) {
      const dev = { ...(S.phone || {}), ...(id ? { id: id[0] } : {}), ...(nm ? { name: nm[1].trim().replace(/^"|"$/g, '') } : {}) };
      if (JSON.stringify(dev) !== JSON.stringify(S.phone)) { S.phone = dev; toViewers({ type: 'phone', device: dev }); log('📱', dev.name || '', dev.id || ''); }
    }
  };

  function launch() {
    clearTimeout(restartTimer);
    const exe = findEngine(engineDir);
    S.enginePath = exe;
    if (!exe) {
      S.engine = 'missing';
      S.engineMsg = 'Nie znaleziono silnika AirPlay (uxplay). Zbuduj aplikację skryptem build-windows.ps1 albo zainstaluj uxplay.';
      toViewers(state()); log('✗', S.engineMsg); return;
    }
    const args = [
      '-n', config.name || 'PhoneMirror', '-nh',
      '-s', QUALITY[config.quality] || QUALITY.hd,
      '-fps', '60',
      '-vrtp', `config-interval=1 ! udpsink host=127.0.0.1 port=${rtpPort} sync=false`,
      '-d', '1',                      // 1 = bez zrzutów pakietów (pełny -d zalewał wyjście i blokował silnik)
    ];
    if (config.audio) args.push('-artp', `pt=96 ! udpsink host=127.0.0.1 port=${audioPort} sync=false`);
    else args.push('-as', '0');
    if (process.env.UXPLAY_ARGS) args.push(...process.env.UXPLAY_ARGS.split(' ').filter(Boolean));
    log('⚙︎ Silnik:', exe, args.join(' '));
    S.engine = 'starting'; S.engineMsg = ''; toViewers(state());
    const env = engineEnv(exe, dataDir);
    try {
      proc = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { S.engine = 'crashed'; S.engineMsg = String(e.message || e); toViewers(state()); return; }
    const me = proc;
    proc.stdout.on('data', onOutput); proc.stderr.on('data', onOutput);
    proc.on('spawn', () => {
      setTimeout(() => { if (proc === me && S.engine === 'starting') { S.engine = 'running'; backoff = 1000; toViewers(state()); } }, 1200);
    });
    proc.on('error', e => { S.engine = 'crashed'; S.engineMsg = e.message; toViewers(state()); });
    proc.on('exit', code => {
      if (proc !== me) return;
      proc = null; phoneLeft();
      if (stopping) return;
      S.engine = 'crashed';
      S.engineMsg = `Silnik AirPlay zakończył działanie (kod ${code}). ${logTail.slice(-3).join(' | ')}`;
      toViewers(state()); log('✗', S.engineMsg);
      restartTimer = setTimeout(launch, backoff); backoff = Math.min(backoff * 2, 30000);
    });
  }
  function restartEngine() {
    if (proc) { const p = proc; proc = null; p.removeAllListeners('exit'); p.kill(); }
    phoneLeft(); setTimeout(launch, 400);
  }
  function shutdown() { stopping = true; if (proc) proc.kill(); }
  process.on('exit', shutdown);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { shutdown(); process.exit(0); });

  // ---- HTTP / WS ----
  const server = http.createServer((req, res) => {
    if (!isLocal(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/log') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(logTail.join('\n')); }
    const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    const f = path.normalize(path.join(PUB, p));
    if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  server.on('upgrade', (req, sock) => {
    const u = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    if (u.pathname !== '/ws' || !key || !isLocal(req.socket.remoteAddress)) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c = new WSConn(sock);
    viewers.add(c);
    c.json(state());
    if (winState) c.json({ type: 'win-state', ...winState });
    for (const m of gop) c.send(m); // od razu pokaż aktualny obraz
    c.onclose = () => viewers.delete(c);
    c.onmessage = txt => {
      let m; try { m = JSON.parse(txt); } catch { return; }
      if (m.type === 'config') {
        const next = { ...config };
        if (typeof m.name === 'string') next.name = m.name.trim().slice(0, 40) || DEFAULTS.name;
        if (QUALITY[m.quality]) next.quality = m.quality;
        if (typeof m.audio === 'boolean') next.audio = m.audio;
        const changed = JSON.stringify(next) !== JSON.stringify(config);
        config = next; saveConfig(config);
        toViewers(state());
        if (changed) restartEngine();
      } else if (m.type === 'restart') restartEngine();
      else if (m.type === 'resync') { for (const f of gop) c.send(f); }
      else if (m.type === 'win' && onWindow) onWindow(m);   // sterowanie oknem (przez WebSocket – bez preload)
    };
  });

  return new Promise((resolve, reject) => {
    udp.once('error', reject);
    const tryBind = p => {
      udp.removeAllListeners('error');
      udp.once('error', e => (e.code === 'EADDRINUSE' && p < 5700 ? tryBind(p + 2) : reject(e)));
      udp.bind(p, '127.0.0.1', () => {
        rtpPort = p;
        audio.bind(0, '127.0.0.1', () => {
          audioPort = audio.address().port;
          server.once('error', e => {
            if (e.code === 'EADDRINUSE' && port !== 0) { port = 0; server.listen(0, '127.0.0.1'); } else reject(e);
          });
          server.listen(port, '127.0.0.1', () => {
            launch();
            resolve({ port: server.address().port, rtpPort, audioPort, restartEngine, shutdown,
              setWinState: o => { winState = { ...(winState || {}), ...o }; toViewers({ type: 'win-state', ...winState }); } });
          });
        });
      });
    };
    tryBind(+process.env.RTP_PORT || 5600);
  });
}

function lanIPs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  return out;
}

module.exports = { start, H264Depacketizer };

if (require.main === module) {
  start().then(({ port }) => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`\n  PhoneMirror — odbiornik AirPlay\n  Okno: ${url}\n`);
    if (!process.env.NO_OPEN) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
      require('child_process').exec(`${cmd} "${url}"`, () => {});
    }
  }).catch(e => { console.error(e.code === 'EADDRINUSE' ? 'Port zajęty — uruchom z PORT=8500' : e); process.exit(1); });
}
