/**
 * SSE (Server-Sent Events) 推送模块
 */
function createSseManager(STATE) {
  function addSseClient(res) {
    STATE.sseClients.push(res);
    res.on('close', () => {
      STATE.sseClients = STATE.sseClients.filter(c => c !== res);
    });
  }

  function broadcastSse(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    STATE.sseClients.forEach(res => {
      try { res.write(msg); } catch (e) {}
    });
  }

  return { addSseClient, broadcastSse };
}

module.exports = { createSseManager };
