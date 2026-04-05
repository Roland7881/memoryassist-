/**
 * MemoryAssist - SSE + HTTP POST server
 *
 * Clients receive updates via Server-Sent Events (GET /events).
 * The overlay sends shape presses via HTTP POST (/add, /reset).
 *
 * Usage:  node watcher.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const MIME   = { '.html':'text/html', '.png':'image/png', '.jpg':'image/jpeg', '.js':'text/javascript', '.css':'text/css' };
const PORT   = process.env.PORT || 8765;
const SHAPES  = new Set(['TRIANGLE', 'DIAMOND', 'T', 'CIRCLE', 'X']);
const ROOM_RE = /^[a-zA-Z0-9_-]{1,50}$/;
const DEF_ROOM = 'default';

// rooms: id -> { sequence: [], clients: [], leaderKey: string|null }
const rooms = new Map();

function getRoom(id) {
    if (!rooms.has(id)) rooms.set(id, { sequence: [], clients: [], leaderKey: null });
    return rooms.get(id);
}

function getPath(url) {
    const q = url.indexOf('?');
    return q === -1 ? url : url.slice(0, q);
}

function parseQuery(url) {
    const idx = url.indexOf('?');
    if (idx === -1) return {};
    try { return Object.fromEntries(new URLSearchParams(url.slice(idx + 1))); } catch (_) { return {}; }
}

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function broadcast(roomId, msg) {
    const room = rooms.get(roomId);
    if (!room) return;
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    room.clients = room.clients.filter(res => {
        try { res.write(data); return true; } catch (_) { return false; }
    });
}

const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS); res.end(); return;
    }

    const urlPath = getPath(req.url);
    const query   = parseQuery(req.url);
    const rawRoom = query.room || DEF_ROOM;

    if (!ROOM_RE.test(rawRoom)) {
        res.writeHead(400, CORS); res.end('Invalid room ID'); return;
    }
    const roomId = rawRoom;

    // SSE stream — clients subscribe here
    if (req.method === 'GET' && urlPath === '/events') {
        const room = getRoom(roomId);
        res.writeHead(200, {
            ...CORS,
            'Content-Type':      'text/event-stream',
            'Cache-Control':     'no-cache',
            'Connection':        'keep-alive',
            'X-Accel-Buffering': 'no',   // disable nginx buffering on Render
        });
        res.flushHeaders();
        // Send current state immediately on connect
        res.write(`data: ${JSON.stringify({ type: 'update', sequence: [...room.sequence] })}\n\n`);
        room.clients.push(res);
        req.on('close', () => { room.clients = room.clients.filter(c => c !== res); });
        return;
    }

    // POST /add — overlay sends a shape press
    if (req.method === 'POST' && urlPath === '/add') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const parsed    = JSON.parse(body);
                const shape     = ((parsed.shape) || '').toUpperCase();
                const leaderKey = parsed.leaderKey || null;
                const room      = getRoom(roomId);

                // Leader-key auth
                if (room.leaderKey !== null) {
                    if (leaderKey !== room.leaderKey) {
                        res.writeHead(403, CORS); res.end('Forbidden'); return;
                    }
                } else if (leaderKey) {
                    room.leaderKey = leaderKey;   // first caller with a key claims leadership
                    console.log(`[room:${roomId}] leader key claimed`);
                }

                if (!SHAPES.has(shape) || room.sequence.includes(shape) || room.sequence.length >= 5) {
                    res.writeHead(200, CORS); res.end(); return;
                }
                room.sequence.push(shape);
                if (room.sequence.length === 4) {
                    const last = [...SHAPES].find(s => !room.sequence.includes(s));
                    if (last) room.sequence.push(last);
                }
                broadcast(roomId, { type: 'update', sequence: [...room.sequence] });
                console.log(`[room:${roomId}] add ${shape}  =>  [${room.sequence.join(', ')}]`);
            } catch (_) {}
            res.writeHead(200, CORS); res.end();
        });
        return;
    }

    // POST /reset — overlay resets the sequence
    if (req.method === 'POST' && urlPath === '/reset') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const parsed    = body ? JSON.parse(body) : {};
                const leaderKey = parsed.leaderKey || null;
                const room      = getRoom(roomId);

                if (room.leaderKey !== null && leaderKey !== room.leaderKey) {
                    res.writeHead(403, CORS); res.end('Forbidden'); return;
                }

                room.sequence = [];
                broadcast(roomId, { type: 'reset' });
                console.log(`[room:${roomId}] reset`);
            } catch (_) {}
            res.writeHead(200, CORS); res.end();
        });
        return;
    }

    // Static files (path-traversal safe)
    const filePath = urlPath === '/' ? path.join(__dirname, 'index.html')
                                     : path.join(__dirname, urlPath);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(__dirname) + path.sep)) {
        res.writeHead(403, CORS); res.end(); return;
    }
    fs.readFile(resolved, (err, data) => {
        if (err) { res.writeHead(404, CORS); res.end(); return; }
        const ext = path.extname(resolved);
        res.writeHead(200, { ...CORS, 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`MemoryAssist server  →  http://localhost:${PORT}`);
});