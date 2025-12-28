const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("soma", {
  send: (text) => ipcRenderer.invoke("soma:send", text),
  snapshot: () => ipcRenderer.invoke("soma:snapshot"),
  stop: () => ipcRenderer.invoke("soma:stop"),
  mute: (val) => ipcRenderer.invoke("soma:mute", val),
  startRecording: () => ipcRenderer.invoke("soma:startRecording"),
  stopRecording: () => ipcRenderer.invoke("soma:stopRecording"),
  cancelRecording: () => ipcRenderer.invoke("soma:cancelRecording"),
  getSTTStatus: () => ipcRenderer.invoke("soma:getSTTStatus"),
  onVoiceHotkey: (callback) => ipcRenderer.on('voice-hotkey-pressed', callback),
});
