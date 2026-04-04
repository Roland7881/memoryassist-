/**
 * MemoryAssist - WebSocket server
 *
 * Receives button clicks from index.html and broadcasts the
 * current sequence to all connected clients.
 *
 * Usage:  node watcher.js
 */

const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const WebSocket = require('ws');

const MIME = { '.html':'text/html', '.png':'image/png', '.jpg':'image/jpeg', '.js':'text/javascript', '.css':'text/css' };

const PORT   = process.env.PORT || 8765;
const SHAPES = new Set(['TRIANGLE', 'DIAMOND', 'T', 'CIRCLE', 'X']);

let sequence = [];
let clients  = new Set();

function broadcast(msg) {
    const txt = JSON.stringify(msg);
    for (const ws of clients)
        if (ws.readyState === WebSocket.OPEN) ws.send(txt);
}

const server = http.createServer((req, res) => {
    // Serve index.html at / and static assets (textures) from parent folder
    let filePath = req.url === '/' ? path.join(__dirname, 'index.html')
                                   : path.join(__dirname, req.url);
    // Allow texture files from parent addon folder (../circle.png etc.)
    if (req.url.startsWith('/..')) {
        filePath = path.resolve(__dirname, '..', req.url.replace(/^\/\.\.\//, ''));
    }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});
const wss    = new WebSocket.Server({ server, path: '/ws' });

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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`MemoryAssist server  →  http://localhost:${PORT}`);
    console.log(`Local network        →  http://<your-ip>:${PORT}`);
    console.log(`WebSocket            →  ws://localhost:${PORT}`);
});