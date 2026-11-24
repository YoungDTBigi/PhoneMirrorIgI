// PhoneMirror.exe — okno jak „Klonowanie iPhone'a” na Macu: widać WYŁĄCZNIE telefon.
// Okno jest przezroczyste, a kliknięcia obok telefonu przechodzą do pulpitu.
const { app, BrowserWindow, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { start } = require('./server');

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

let win, engine, drag = null;
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
const loadWin = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };
const saveWin = patch => { try { fs.writeFileSync(stateFile(), JSON.stringify({ ...loadWin(), ...patch })); } catch {} };

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function pushState() {
  if (!win || !engine) return;
  engine.setWinState({ onTop: win.isAlwaysOnTop(), workArea: screen.getDisplayMatching(win.getBounds()).workArea });
}

// polecenia ze strony (przychodzą przez lokalny WebSocket)
function onWindow(m) {
  if (!win) return;
  switch (m.op) {
    case 'size': {
      const w = Math.round(m.w), h = Math.round(m.h), b = win.getBounds();
      let x = b.x, y = b.y;
      if (m.anchor === 'center') { x = Math.round(b.x + (b.width - w) / 2); y = Math.round(b.y + (b.height - h) / 2); }
      const wa = screen.getDisplayMatching(b).workArea;
      x = Math.min(Math.max(x, wa.x - w + 80), wa.x + wa.width - 80);
      y = Math.min(Math.max(y, wa.y - 40), wa.y + wa.height - 80);
      win.setBounds({ x, y, width: w, height: h });
      if (!win.isVisible()) win.show();
      break;
    }
    case 'dragStart': { const [x, y] = win.getPosition(); drag = { x, y, sx: m.sx, sy: m.sy }; break; }
    case 'dragMove':
      if (drag) win.setPosition(Math.round(drag.x + m.sx - drag.sx), Math.round(drag.y + m.sy - drag.sy));
      break;
    case 'ignore': win.setIgnoreMouseEvents(!!m.v, { forward: true }); break;
    case 'minimize': win.minimize(); break;
    case 'close': win.close(); break;
    case 'onTop': win.setAlwaysOnTop(!!m.v, 'floating'); saveWin({ onTop: !!m.v }); pushState(); break;
  }
}

app.whenReady().then(async () => {
  process.env.QUIET = '1';
  const engineDir = app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(__dirname, '..', 'engine');
  try {
    engine = await start({ port: 47820, engineDir, dataDir: app.getPath('userData'), onWindow });
  } catch (e) {
    dialog.showErrorBox('PhoneMirror', 'Nie udało się uruchomić odbiornika: ' + (e.message || e));
    app.quit(); return;
  }

  const saved = loadWin();
  win = new BrowserWindow({
    width: 380, height: 820, x: saved.x, y: saved.y,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, thickFrame: false,
    resizable: false, maximizable: false, minimizable: true, fullscreenable: false,
    alwaysOnTop: !!saved.onTop, title: 'PhoneMirror', show: false, skipTaskbar: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.setBackgroundColor('#00000000');
  if (saved.onTop) win.setAlwaysOnTop(true, 'floating');
  win.loadURL(`http://127.0.0.1:${engine.port}/?app=electron`);
  win.webContents.on('did-finish-load', pushState);
  setTimeout(() => win && !win.isVisible() && win.show(), 2500);   // na wszelki wypadek
  win.on('moved', () => { const [x, y] = win.getPosition(); saveWin({ x, y }); pushState(); });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${engine.port}/log`))
      return { action: 'allow', overrideBrowserWindowOptions: { width: 820, height: 600, autoHideMenuBar: true, frame: true, transparent: false, backgroundColor: '#ffffff' } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSavePath(path.join(app.getPath('pictures'), item.getFilename()));
    item.once('done', (_ev, st) => { if (st === 'completed') shell.showItemInFolder(item.getSavePath()); });
  });
});

app.on('window-all-closed', () => { if (engine) engine.shutdown(); app.quit(); });
app.on('before-quit', () => { if (engine) engine.shutdown(); });
