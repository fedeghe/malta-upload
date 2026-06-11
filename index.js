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

        const s = server.startServer(port, folder, {
            pluginName: pluginName,
            handler: options.handler,
            self: self
        });

        if (s) {
            msg = 'plugin ' + pluginName.white() + ' upload server started on http://127.0.0.1:' + port;
        } else {
            msg = 'plugin ' + pluginName.white() + ' server already running on port ' + port;
        }

        solve(obj);
        self.notifyAndUnlock(start, msg);
    };
}

maltaUpload.ext = '*';

module.exports = maltaUpload;
