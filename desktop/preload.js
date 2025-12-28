const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("soma", {
  send: (text) => ipcRenderer.invoke("soma:send", text),
  snapshot: () => ipcRenderer.invoke("soma:snapshot"),
  stop: () => ipcRenderer.invoke("soma:stop"),
  mute: (val) => ipcRenderer.invoke("soma:mute", val),
  getSessionInfo: () => ipcRenderer.invoke("soma:session-info"),
  getHistory: () => ipcRenderer.invoke("soma:get-history"),
  newSession: () => ipcRenderer.invoke("soma:new-session"),
});

