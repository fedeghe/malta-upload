const fs = require("fs"),
    path = require("path"),
    http = require("http"),
    https = require("https"),
    { URL } = require("url");

let srv,
    uniqTpl = "ID_<uniq>";

const verbMap = {
        DELETE: "del",
        GET: "get",
        PATCH: "patch",
        PUT: "put",
        POST: "post",
        HEAD: "head",
    },
    CODES = {
        OK: 200,
        CREATED: 201,
        NO_CONTENT: 204,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
        NOT_ALLOWED_METHOD: 405,
        ERROR: 500,
    },
    uniqueID = new (function () {
        let count = +new Date();
        this.toString = function () {
            count += 1;
            return uniqTpl.match(/\<uniq\>/) ? uniqTpl.replace(/\<uniq\>/, count) : `${uniqTpl}-${count}`;
        };
    })(),
    sslPort = 443;

const requireUncached = (requiredModule) => {
        const mod = require.resolve(path.resolve(requiredModule));
        if (mod && mod in require.cache) {
            delete require.cache[mod];
        }
        const ret = require(path.resolve(requiredModule));
        return ret || [];
    },
    beautifyJson = (json) => JSON.stringify(json, null, 2),
    compileRoute = (routePath) => {
        const names = [];
        const escaped = routePath
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
                names.push(name);
                return "([^/]+)";
            });
        return {
            regex: new RegExp(`^${escaped}$`),
            names,
        };
    },
    parseBody = (req) =>
        new Promise((resolve) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => {
                const raw = Buffer.concat(chunks).toString();
                if (!raw) return resolve({});
                const contentType = (req.headers["content-type"] || "").toLowerCase();
                if (contentType.includes("application/x-www-form-urlencoded")) {
                    const out = {};
                    const params = new URLSearchParams(raw);
                    for (const [k, v] of params.entries()) out[k] = v;
                    return resolve(out);
                }
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    resolve({});
                }
            });
            req.on("error", () => resolve({}));
        }),
    applyDefaultHeaders = (res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
        res.setHeader("Server", "malta-restify");
    },
    createResponseWrapper = (res) => ({
        setHeader: (key, value) => res.setHeader(key, value),
        set: (headers) => Object.keys(headers).forEach((k) => res.setHeader(k, headers[k])),
        sendRaw: (code, payload, headers = {}) => {
            Object.keys(headers).forEach((k) => res.setHeader(k, headers[k]));
            if (!res.getHeader("content-type")) {
                res.setHeader("content-type", "text/plain; charset=utf-8");
            }
            res.statusCode = code;
            res.end(payload);
        },
        send: (code, payload, headers = {}) => {
            Object.keys(headers).forEach((k) => res.setHeader(k, headers[k]));
            res.statusCode = code;
            if (payload === undefined || payload === null) {
                return res.end();
            }
            if (typeof payload === "object") {
                if (!res.getHeader("content-type")) {
                    res.setHeader("content-type", "application/json; charset=utf-8");
                }
                return res.end(JSON.stringify(payload));
            }
            return res.end(String(payload));
        },
    }),
    fsActions = {
        // updateas it is can be used for PUT and PATCH
        put: ({ filePath, req, key }) => {
            const payload = req.body;

            try {
                const prev = requireUncached(filePath);
                const next = prev.filter((el) => req.params[key] !== el[key]);
                if (prev.length !== next.length) {
                    next.push({ ...payload, [key]: `${uniqueID}` });
                    fs.writeFileSync(filePath, beautifyJson(next));
                }
                return CODES.NO_CONTENT;
            } catch (e) {
                console.log({ Error: e });
                return CODES.NOT_FOUND;
            }
        },
        patch: ({ filePath, req, key }) => {
            const payload = req.body;
            try {
                const data = requireUncached(filePath).reduce((acc, el) => {
                    if (el[key] == req.params[key]) {
                        // do not reset others with
                        // el = {[k]: el[k]}
                        // could be an idea to make it optional with req.params.clean
                        for (let f in payload) {
                            //but not override the key
                            if (f !== key) {
                                el[f] = payload[f];
                            }
                        }
                    }
                    acc.push(el);
                    return acc;
                }, []);
                fs.writeFileSync(filePath, beautifyJson(data));
                return CODES.NO_CONTENT;
            } catch (e) {
                console.info({ Error: e });
                return CODES.NOT_FOUND;
            }
        },
        del: ({ filePath, req, key }) => {
            try {
                const data = requireUncached(filePath).filter((d) => d[key] != req.params[key]);
                fs.writeFileSync(filePath, beautifyJson(data));
                return CODES.NO_CONTENT;
            } catch (e) {
                console.log({ Error: e });
                return CODES.ERROR;
            }
        },
        // create
        post: ({ filePath, req, key }) => {
            const payload = req.body;
            try {
                let data = requireUncached(filePath);
                if (payload instanceof Array) {
                    data = data.concat(payload.map((record) => ({ ...record, [key]: `${uniqueID}` })));
                } else {
                    data.push({ ...payload, [key]: `${uniqueID}` });
                }
                fs.writeFileSync(filePath, beautifyJson(data));
                return CODES.CREATED;
            } catch (e) {
                console.log({ Error: e });
                return CODES.ERROR;
            }
        },

        head: ({ filePath, res, key, req }) => {
            const content = requireUncached(filePath),
                cnt = key ? content.filter((row) => row[key] == req.params[key]) : content;
            res.setHeader("content-length", cnt.toString().length);
            res.setHeader("content-type", "application/json");
            return CODES.OK;
        },

        get: ({ req, filePath, endpoint }) => {
            try {
                const r = requireUncached(filePath);
                let k = endpoint.key || "id",
                    set = r;

                if (k in req.params) {
                    set = r.filter((e) => e[k] == req.params[k]);
                    return { code: CODES.OK, res: set[0] || [] };
                }
                return { code: CODES.OK, res: r || [] };
            } catch (e) {
                return { code: CODES.ERROR, res: [] };
            }
        },
    },
    getConsumer =
        ({ verb, endpoint, authorization, handlers }) =>
        (req, res, next) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Server", "malta-restify");
            if (authorization) {
                if (!("authorization" in req.headers) || req.headers.authorization !== authorization) {
                    res.send(CODES.UNAUTHORIZED);
                    return next();
                }
            }
            if (endpoint.handler in handlers) {
                handlers[endpoint.handler]({
                    req,
                    res,
                    verb,
                    endpoint,
                });
            } else {
                res.send(CODES.NOT_ALLOWED_METHOD);
            }
            return next();
        },
    getResponder =
        ({ verb, filePath, endpoint, authorization }) =>
        (req, res, next) => {
            const key = endpoint.key || "id",
                responder = fsActions[verb];

            if (authorization) {
                if (!("authorization" in req.headers) || req.headers.authorization !== authorization) {
                    res.send(CODES.UNAUTHORIZED);
                    return next();
                }
            }

            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Server", "malta-restify");
            if (responder) {
                switch (verb) {
                    case "del":
                        key in req.params &&
                            res.send(
                                responder({
                                    filePath,
                                    req,
                                    key,
                                })
                            );
                        break;
                    case "get":
                        const r = responder({
                            filePath,
                            req,
                            endpoint,
                        });
                        res.send(r.code, r.res);
                        break;
                    case "head":
                        res.send(
                            responder({
                                filePath,
                                res,
                                req,
                                key: key in req.params && key,
                            })
                        );
                        break;
                    case "post": // create
                    case "put": // replace full
                    case "patch": // update
                        if (!req.is("application/json")) {
                            res.send(CODES.BAD_REQUEST, {
                                error: "Expects 'application/json'",
                            });
                            return next();
                        }
                        res.send(
                            responder({
                                filePath,
                                req,
                                key,
                            })
                        );
                        break;
                    default:
                        break;
                }
            } else {
                res.send(CODES.NOT_ALLOWED_METHOD);
            }
            return next();
        };

class Server {
    constructor(sslOpts = {}) {
        this.srv = null;
        this.dir = null;
        this.name = path.basename(path.dirname(__filename));
        this.started = false;
        this.malta = null;
        this.handlers = {};
        this.sslOpts = sslOpts;
        this.verbose = true;
        this.routes = [];
    }
    init({ port, host, folder, authorization, handlers, delay }) {
        var self = this;
        this.started = true;
        this.authorization = authorization;
        this.malta.log_info(`> ${this.name.blue()} started on port # ${port} (http://${host}:${port})`);
        authorization && this.malta.log_info(` with authorization token \`${authorization}\``);
        handlers && this.malta.log_info(` with extra handlers \`${handlers}\``);
        this.malta.log_info(`> webroot is ${folder}`.blue());
        this.dir = process.cwd();
        this.routes = [];
        const requestListener = async (req, res) => {
            const startedAt = Date.now();
            const reqUrl = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
            const pathname = reqUrl.pathname;
            const route = this.routes.find(
                (r) =>
                    (r.method === req.method || (req.method === "OPTIONS" && r.regex.test(pathname))) &&
                    r.regex.test(pathname)
            );
            if (!route) {
                res.statusCode = CODES.NOT_FOUND;
                return res.end();
            }
            applyDefaultHeaders(res);
            if (req.method === "OPTIONS") {
                const requestedHeaders = req.headers["access-control-request-headers"];
                if (requestedHeaders) {
                    res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
                }
                res.statusCode = CODES.NO_CONTENT;
                return res.end();
            }

            const match = pathname.match(route.regex);
            const params = {};
            route.names.forEach((name, idx) => {
                params[name] = match[idx + 1];
            });
            req.params = params;
            req.query = Object.fromEntries(reqUrl.searchParams.entries());
            req.body = await parseBody(req);
            req.is = (type) => (req.headers["content-type"] || "").toLowerCase().includes(type.toLowerCase());
            req.time = () => startedAt;

            const wrappedRes = createResponseWrapper(res);
            const next = () => {};

            try {
                if (delay > 0) {
                    await new Promise((solve) => setTimeout(solve, delay));
                }
                await route.handler(req, wrappedRes, next);
                if (self.verbose) {
                    const fullPath = route.path.replace(/\:([A-Za-z]*)/, ($1, $2) =>
                        $2 in req.params ? req.params[$2] : $2
                    );
                    self.malta.log_info(
                        [req.method, fullPath, `(took ${Date.now() - req.time() - delay}ms + ${delay}ms delay)`].join(
                            " "
                        )
                    );
                }
            } catch (e) {
                res.statusCode = CODES.ERROR;
                res.end();
                this.malta.log_err("Error", e);
            }
        };

        this.srv = this.sslOpts.ssl
            ? https.createServer(
                  {
                      key: fs.readFileSync(this.sslOpts.sslKeyPath),
                      cert: fs.readFileSync(this.sslOpts.sslCrtPath),
                  },
                  requestListener
              )
            : http.createServer(requestListener);
        this.srv.name = this.sslOpts.ssl ? "malta-restify-ssl" : "malta-restify";

        return this;
    }
    start({ port, host, folder, endpoints, authorization, handlers, delay, idTpl, malta, verbose }) {
        const self = this;
        if (this.started) return;
        this.verbose = verbose;
        this.malta = malta;
        this.init({
            port,
            host,
            folder,
            authorization,
            handlers,
            delay,
        });
        if (handlers) {
            this.handlers = requireUncached(handlers);
        }
        try {
            fs.readFile(path.resolve(folder, endpoints), "utf8", (err, data) => {
                if (err) this.malta.log_err("Error reading endpoint file");
                const endpointsJson = JSON.parse(data);

                if (idTpl) uniqTpl = idTpl;

                Object.keys(endpointsJson).forEach((verb) =>
                    endpointsJson[verb].forEach((endpoint) => {
                        const mappedVerb = verbMap[verb];
                        try {
                            const base = {
                                    verb: mappedVerb,
                                    endpoint,
                                    authorization,
                                },
                                reqHandler =
                                    "handler" in endpoint && endpoint.handler in self.handlers
                                        ? getConsumer({
                                              handlers: self.handlers,
                                              ...base,
                                          })
                                        : getResponder({
                                              filePath: path.join(folder, endpoint.source),
                                              ...base,
                                          });

                            const routePath = endpoint.path.replace(/\:id/, `:${endpoint.key}`);
                            const { regex, names } = compileRoute(routePath);
                            self.routes.push({
                                method: verb,
                                path: routePath,
                                regex,
                                names,
                                handler: reqHandler,
                            });
                        } catch (e) {
                            this.malta.log_err("Error", e);
                        }
                    })
                );
                this.srv.on("error", (err) => {
                    this.malta.log_err(`server listen error: ${err && err.code ? err.code : err}`);
                    if (err && err.message) {
                        this.malta.log_err(err.message);
                    }
                });
                this.srv.listen(port, host, () => {
                    this.srv.url = `http://${host}:${port}`;
                    this.malta.log_info(`- ${this.srv.name} listening at ${this.srv.url}`);
                });
                this.malta.log_info("- start server");
            });
        } catch (e) {
            malta.log_err(e);
        }
    }
}
module.exports = {
    getServer: (sslOpts) => {
        if (!srv) {
            srv = new Server(sslOpts);
        }
        return srv;
    },
};
