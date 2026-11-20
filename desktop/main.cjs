const { app, BrowserWindow, dialog, protocol, session } = require('electron');
const { mkdirSync, mkdtempSync, rmdirSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const scheme = 'crystallab';
const startUrl = `${scheme}://notebook/`;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/presets.js', ['presets.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

protocol.registerSchemesAsPrivileged([
  { scheme, privileges: { standard: true, secure: true } }
]);

function configureStorage() {
  const programFolder = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  const dataPath = app.isPackaged
    ? path.join(programFolder, 'CrystalLab-Data')
    : path.join(app.getAppPath(), '.build-tools', 'desktop-profile');
  mkdirSync(dataPath, { recursive: true });
  const check = mkdtempSync(path.join(dataPath, '.write-check-'));
  rmdirSync(check);
  app.setPath('userData', dataPath);
  app.setPath('sessionData', dataPath);
}

async function serveAsset(request) {
  const url = new URL(request.url);
  const asset = url.hostname === 'notebook' && assets.get(url.pathname);
  if (!asset) return new Response(null, { status: 404 });

  const [filename, contentType] = asset;
  const body = await readFile(path.join(app.getAppPath(), 'web', filename));
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'"
    }
  });
}

async function openNotebook() {
  protocol.handle(scheme, serveAsset);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: '保存实验数据',
      defaultPath: path.join(app.getPath('documents'), item.getFilename())
    });
  });

  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: '#f5f7fc',
    title: '晶研实验簿',
    icon: path.join(app.getAppPath(), 'desktop', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  window.removeMenu();
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await window.loadURL(startUrl);
}

function start() {
  try {
    configureStorage();
  } catch {
    dialog.showErrorBox('晶研实验簿', '无法写入数据目录。请将程序移到有写入权限的文件夹后再打开。');
    app.exit(1);
    return;
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.setAppUserModelId('cn.pvlab.notebook.desktop');
  app.commandLine.appendSwitch('disable-background-networking');
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(openNotebook).catch(error => {
    dialog.showErrorBox('晶研实验簿', `无法打开应用窗口。\n${error.message}`);
    app.exit(1);
  });
}

start();
