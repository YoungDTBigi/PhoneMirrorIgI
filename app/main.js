// PhoneMirror.exe — natywne okno (Electron) + odbiornik AirPlay w tle.
const { app, BrowserWindow, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const { start } = require('./server');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win, engine;
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
  const mac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1240, height: 880, minWidth: 760, minHeight: 600,
    title: 'PhoneMirror',
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e22' : '#f3f3f5',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.loadURL(`http://127.0.0.1:${engine.port}/?app=electron${mac ? '&mac=1' : ''}`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${engine.port}/`)) return { action: 'allow', overrideBrowserWindowOptions: { width: 800, height: 600, autoHideMenuBar: true } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSavePath(path.join(app.getPath('pictures'), item.getFilename()));
    item.once('done', (_ev, state) => { if (state === 'completed') shell.showItemInFolder(item.getSavePath()); });
  });
});

app.on('window-all-closed', () => { if (engine) engine.shutdown(); app.quit(); });
app.on('before-quit', () => { if (engine) engine.shutdown(); });
