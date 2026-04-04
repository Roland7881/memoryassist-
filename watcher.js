/**
 * MemoryAssist - WebSocket server
 *
 * Receives button clicks from index.html and broadcasts the
 * current sequence to all connected clients.
 *
 * Usage:  node watcher.js
 */

const http      = require('http');
const WebSocket = require('ws');

const PORT   = 8765;
const SHAPES = new Set(['TRIANGLE', 'DIAMOND', 'T', 'CIRCLE', 'X']);

let sequence = [];
let clients  = new Set();

function broadcast(msg) {
    const txt = JSON.stringify(msg);
    for (const ws of clients)
        if (ws.readyState === WebSocket.OPEN) ws.send(txt);
}

const server = http.createServer();
const wss    = new WebSocket.Server({ server });

wss.on('connection', ws => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'update', sequence: [...sequence] }));
    ws.isAlive = true;
    ws.on('pong',  () => { ws.isAlive = true; });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));

    ws.on('message', data => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'reset') {
                sequence = [];
                broadcast({ type: 'reset' });
                console.log('[reset]');
            } else if (msg.type === 'add') {
                const shape = (msg.shape || '').toUpperCase();
                if (!SHAPES.has(shape) || sequence.includes(shape) || sequence.length >= 5) return;
                sequence.push(shape);
                if (sequence.length === 4) {
                    const last = [...SHAPES].find(s => !sequence.includes(s));
                    if (last) sequence.push(last);
                }
                broadcast({ type: 'update', sequence: [...sequence] });
                console.log(`[add] ${shape}  =>  [${sequence.join(', ')}]`);
            }
        } catch (_) {}
    });
});

setInterval(() => {
    for (const ws of clients) {
        if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
        ws.isAlive = false;
        ws.ping();
    }
}, 20000);

server.listen(PORT, '127.0.0.1', () => {
    console.log(`MemoryAssist server running on ws://localhost:${PORT}`);
    console.log('Open web/index.html in your browser.');
});