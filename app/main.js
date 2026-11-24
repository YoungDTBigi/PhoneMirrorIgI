// PhoneMirror.exe — okno w stylu „Klonowanie iPhone'a” z macOS:
// bez ramki systemowej, przezroczyste, widać tylko telefon.
const { app, BrowserWindow, shell, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { start } = require('./server');

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

let win, engine;
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
const loadWin = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };
const saveWin = patch => { try { fs.writeFileSync(stateFile(), JSON.stringify({ ...loadWin(), ...patch })); } catch {} };

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  process.env.QUIET = '1';
  const engineDir = app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(__dirname, '..', 'engine');
  try {
    engine = await start({ port: 47820, engineDir, dataDir: app.getPath('userData') });
  } catch (e) {
    dialog.showErrorBox('PhoneMirror', 'Nie udało się uruchomić odbiornika: ' + (e.message || e));
    app.quit(); return;
  }

  const saved = loadWin();
  win = new BrowserWindow({
    width: 420, height: 860, x: saved.x, y: saved.y,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: !!saved.onTop, title: 'PhoneMirror', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (saved.onTop) win.setAlwaysOnTop(true, 'floating');
  win.loadURL(`http://127.0.0.1:${engine.port}/?app=electron`);
  win.once('ready-to-show', () => win.show());
  win.on('moved', () => { const [x, y] = win.getPosition(); saveWin({ x, y }); });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${engine.port}/log`)) return { action: 'allow', overrideBrowserWindowOptions: { width: 820, height: 600, autoHideMenuBar: true, frame: true, transparent: false } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSavePath(path.join(app.getPath('pictures'), item.getFilename()));
    item.once('done', (_ev, st) => { if (st === 'completed') shell.showItemInFolder(item.getSavePath()); });
  });
});

// ---- sterowanie oknem z poziomu strony ----
ipcMain.on('win:size', (_e, w, h, anchor) => {
  if (!win) return;
  w = Math.round(w); h = Math.round(h);
  const b = win.getBounds();
  let x = b.x, y = b.y;
  if (anchor === 'center') { x = Math.round(b.x + (b.width - w) / 2); y = Math.round(b.y + (b.height - h) / 2); }
  const wa = screen.getDisplayMatching(b).workArea;
  x = Math.min(Math.max(x, wa.x - w + 80), wa.x + wa.width - 80);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - 60);
  win.setBounds({ x, y, width: w, height: h });
});
ipcMain.handle('win:workArea', () => {
  const b = win ? win.getBounds() : { x: 0, y: 0, width: 1, height: 1 };
  return screen.getDisplayMatching(b).workArea;
});
ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:close', () => win && win.close());
ipcMain.handle('win:onTop', (_e, v) => {
  if (!win) return false;
  if (typeof v === 'boolean') { win.setAlwaysOnTop(v, 'floating'); saveWin({ onTop: v }); }
  return win.isAlwaysOnTop();
});

app.on('window-all-closed', () => { if (engine) engine.shutdown(); app.quit(); });
app.on('before-quit', () => { if (engine) engine.shutdown(); });
