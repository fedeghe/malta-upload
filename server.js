const fs = require('fs'),
    http = require('http'),
    https = require('https'),
    path = require('path');

let serverStarted = false;

function uploadHandler(folder, pluginName, options) {
    return (req, res) => {
        console.log(`[${pluginName}] ${req.method} ${req.url}`);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Filename, Access-Control-Allow-Origin, Access-Control-Allow-Headers'
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, corsHeaders);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url === '/' && options.indexPath) {
            fs.readFile(options.indexPath, (err, data) => {
                if (err) {
                    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain' });
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html' });
                res.end(data);
            });
            return;
        }

        if (req.method !== 'POST' && req.method !== 'PUT') {
            res.writeHead(405, { ...corsHeaders, 'Content-Type': 'text/plain' });
            res.end('Method not allowed');
            return;
        }

        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const filename = path.basename(req.headers['x-filename'] || req.url) || 'upload',
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
    };
}

function startServer(port, folder, options) {
    options = options || {};
    const pluginName = options.pluginName || 'malta-upload';

    if (serverStarted) return null;

    fs.mkdir(folder, { recursive: true }, () => {});

    let server;
    if (options.ssl) {
        let sslOptions;
        try {
            if (options.key && options.cert) {
                sslOptions = {
                    key: fs.readFileSync(path.resolve(options.key)),
                    cert: fs.readFileSync(path.resolve(options.cert))
                };
            } else {
                const selfsigned = require('selfsigned');
                const attrs = [{ name: 'commonName', value: options.host || 'localhost' }];
                const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048 });
                sslOptions = {
                    key: pems.private,
                    cert: pems.cert
                };
                console.log('[' + pluginName + '] generated self-signed SSL certificate');
            }
            server = https.createServer(sslOptions, uploadHandler(folder, pluginName, options));
        } catch (e) {
            console.log('[ERROR] '.red() + pluginName + ' failed to start HTTPS server:');
            console.dir(e);
            return null;
        }
    } else {
        server = http.createServer(uploadHandler(folder, pluginName, options));
    }

    server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
            console.log('[WARN] '.yellow() + pluginName + ' port ' + port + ' already in use');
        } else {
            console.log('[ERROR] '.red() + pluginName + ' server error:');
            console.dir(err);
        }
    });

    const protocol = options.ssl ? 'https' : 'http';
    const host = options.host || '127.0.0.1';

    server.listen(port, host, () => {
        serverStarted = true;
        console.log('[' + pluginName + '] upload server started on ' + protocol + '://' + host + ':' + port);
    });
    return server;
}

module.exports = { startServer };
