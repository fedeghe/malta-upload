const fs = require('fs'),
    http = require('http'),
    path = require('path');

let serverStarted = false;

function startServer(port, folder, options) {
    options = options || {};
    const pluginName = options.pluginName || 'malta-upload';

    if (serverStarted) return null;

    fs.mkdir(folder, { recursive: true }, () => {});

    const server = http.createServer((req, res) => {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Filename'
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, corsHeaders);
            res.end();
            return;
        }

        if (req.method !== 'POST') {
            res.writeHead(405, { ...corsHeaders, 'Content-Type': 'text/plain' });
            res.end('Method not allowed');
            return;
        }

        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const filename = path.basename(req.headers['x-filename']) || 'upload',
                dest = path.join(folder, filename);

            fs.writeFile(dest, Buffer.concat(body), err => {
                if (err) {
                    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'text/plain' });
                    res.end('Write failed');
                    console.log('[ERROR] '.red() + pluginName + ' save failed: ' + dest);
                    console.dir(err);
                    return;
                }

                res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/plain' });
                res.end('OK');
                console.log('[' + pluginName + '] saved upload: ' + dest);

                if (options.handler) {
                    let handler;
                    try {
                        handler = require(path.resolve(options.handler));
                        const uploadInfo = {
                            path: dest,
                            name: filename,
                            content: Buffer.concat(body)
                        };
                        if (typeof handler === 'function') {
                            handler(options.self || null, uploadInfo, options, null);
                        } else if (typeof handler.default === 'function') {
                            handler.default(options.self || null, uploadInfo, options, null);
                        }
                    } catch (e) {
                        console.log('[ERROR] '.red() + pluginName + ' handler failed:');
                        console.dir(e);
                    }
                }
            });
        });
    });

    server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
            console.log('[WARN] '.yellow() + pluginName + ' port ' + port + ' already in use');
        } else {
            console.log('[ERROR] '.red() + pluginName + ' server error:');
            console.dir(err);
        }
    });

    server.listen(port, '127.0.0.1', () => {
        serverStarted = true;
        console.log('[' + pluginName + '] upload server started on http://127.0.0.1:' + port);
    });

    return server;
}

module.exports = { startServer };
