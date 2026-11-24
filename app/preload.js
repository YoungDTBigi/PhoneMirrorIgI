const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pmWindow', {
  setSize: (w, h, anchor) => ipcRenderer.send('win:size', w, h, anchor),
  workArea: () => ipcRenderer.invoke('win:workArea'),
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  onTop: v => ipcRenderer.invoke('win:onTop', v),
});
