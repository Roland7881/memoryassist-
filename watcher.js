
const http = require('http');
const fs   = require('fs');
const path = require('path');

const MIME   = { '.html':'text/html', '.png':'image/png', '.jpg':'image/jpeg', '.js':'text/javascript', '.css':'text/css' };
const PORT   = process.env.PORT || 8765;
const SHAPES = new Set(['TRIANGLE', 'DIAMOND', 'T', 'CIRCLE', 'X']);

let sequence = [];
let clients  = [];   // SSE response objects

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    clients = clients.filter(res => {
        try { res.write(data); return true; } catch (_) { return false; }
    });
}

const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS); res.end(); return;
    }

    // SSE stream — clients subscribe here
    if (req.method === 'GET' && req.url === '/events') {
        res.writeHead(200, {
            ...CORS,
            'Content-Type':      'text/event-stream',
            'Cache-Control':     'no-cache',
            'Connection':        'keep-alive',
            'X-Accel-Buffering': 'no',   // disable nginx buffering on Render
        });
        res.flushHeaders();
        // Send current state immediately on connect
        res.write(`data: ${JSON.stringify({ type: 'update', sequence: [...sequence] })}\n\n`);
        clients.push(res);
        req.on('close', () => { clients = clients.filter(c => c !== res); });
        return;
    }

    // POST /add — overlay sends a shape press
    if (req.method === 'POST' && req.url === '/add') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const shape = ((JSON.parse(body).shape) || '').toUpperCase();
                if (!SHAPES.has(shape) || sequence.includes(shape) || sequence.length >= 5) {
                    res.writeHead(200, CORS); res.end(); return;
                }
                sequence.push(shape);
                if (sequence.length === 4) {
                    const last = [...SHAPES].find(s => !sequence.includes(s));
                    if (last) sequence.push(last);
                }
                broadcast({ type: 'update', sequence: [...sequence] });
                console.log(`[add] ${shape}  =>  [${sequence.join(', ')}]`);
            } catch (_) {}
            res.writeHead(200, CORS); res.end();
        });
        return;
    }

    // POST /reset — overlay resets the sequence
    if (req.method === 'POST' && req.url === '/reset') {
        sequence = [];
        broadcast({ type: 'reset' });
        console.log('[reset]');
        res.writeHead(200, CORS); res.end(); return;
    }

    // Static files
    const filePath = req.url === '/' ? path.join(__dirname, 'index.html')
                                     : path.join(__dirname, req.url);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404, CORS); res.end(); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { ...CORS, 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`MemoryAssist server  →  http://localhost:${PORT}`);
});
