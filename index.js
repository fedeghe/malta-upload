const path = require('path'),
    server = require('./server');

function maltaUpload(obj, options) {
    const self = this,
        start = new Date(),
        pluginName = path.basename(path.dirname(__filename));
    let msg;

    options = options || {};

    return (solve, reject) => {
        const port = parseInt(options.port, 10),
            folder = options.folder || options.dir;

        if (!port || !folder) {
            msg = 'plugin ' + pluginName.white() + ' skipped: port and folder are required';
            solve(obj);
            self.notifyAndUnlock(start, msg);
            return;
        }

        const host = options.host || '127.0.0.1';
        const protocol = options.ssl ? 'https' : 'http';

        const s = server.startServer(port, folder, {
            pluginName: pluginName,
            handler: options.handler,
            self: self,
            ssl: options.ssl,
            key: options.key,
            cert: options.cert,
            host: host,
            indexPath: path.resolve('index.html')
        });

        if (s) {
            msg = 'plugin ' + pluginName.white() + ' upload server started on ' + protocol + '://' + host + ':' + port;
        } else {
            msg = 'plugin ' + pluginName.white() + ' server already running on port ' + port;
        }

        solve(obj);
        self.notifyAndUnlock(start, msg);
    };
}

maltaUpload.ext = '*';

module.exports = maltaUpload;
