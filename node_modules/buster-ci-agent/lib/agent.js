"use strict";

var http  = require("http"),
    faye  = require("faye"),
    cp = require("child_process"),
    formatio = require("formatio"),
    logger = require("evented-logger"),
    closeWindows = require("./close-windows"),
    async = require("async");


function processLog(error, stdout, stderr) {
    /*jshint validthis: true */
    if (stdout) {
        this._logger.debug(stdout);
    }
    if (stderr) {
        this._logger.error(stderr);
    }
    if (error) {
        this._logger.error(error);
    }
}

function Agent(config) {
    this._config = config;
    this._server = http.createServer();
    this._bayeux = new faye.NodeAdapter({mount: "/"});
    this._client = this._bayeux.getClient();
    var levels = ["error", "warn", "log", "info", "debug"];
    this._logger = logger.create({ levels: levels });
    var localReporter = {
        log: process.stdout,
        info: process.stdout,
        debug: process.stdout,
        warn: process.stderr,
        error: process.stderr
    };
    this._logger.on("log", function (msg) {
        localReporter[msg.level].write(msg.message + "\n");
        this._client.publish("/messages", msg);
    }.bind(this));
    this._logger.level = this._config.logLevel !== undefined
        ? this._config.logLevel
        : "info";

    this._bayeux.attach(this._server);
    process.on("SIGINT", function () {
        this.close(function () { process.exit(0); });
    }.bind(this));
}

Agent.prototype = {

    listen: function (cb) {
        this._server.listen(this._config.port);
        if (typeof cb === "function") {
            this._server.on("listening", cb);
        }

        this._client.subscribe("/messages", function (request) {
            if (!request.command) {
                return;
            }
            var response = this._handleRequest(request);
            if (response) {
                this._client.publish("/messages", response);
            }
        }.bind(this));

        this._logger.info("Agent Running, waiting for commands on port " +
            this._config.port);
    },

    _handleRequest: function (request) {
        var browser;
        this._logger.debug("received command: " + formatio.ascii(request));
        switch (request.command) {
        case "Welcome":
            return {
                browsers: this._config.browsers
            };
        case "start":
            for (browser in request.browsers) {
                if (request.browsers.hasOwnProperty(browser)) {
                    this._startBrowser.call(this,
                        browser,
                        this._config.browsers[browser],
                        request.url,
                        request.browsers[browser].id
                    );
                }
            }
            break;
        case "stop":
            for (browser in request.browsers) {
                if (request.browsers.hasOwnProperty(browser)) {
                    this._stopBrowser.call(this,
                        browser, this._config.browsers[browser]);
                }
            }
            break;

        default:
            break;
        }
    },

    _startBrowser: function (browserName, browser, url, id) {

        var logger = this._logger;

        if (browser.prepareStart) {
            logger.info("prepare start");
            var prepareStartCommand = browser.prepareStart;
            logger.debug(prepareStartCommand);
            cp.exec(
                prepareStartCommand,
                processLog.bind(this)
            );
        }

        var startCommand = browser.start;
        var startArgs = browser.startArgs;
        startArgs = startArgs ? startArgs.slice(0) : [];
        if (url) {
            url = id ? url + "?id=" + id : url;
            startArgs.push(url);
        }

        logger.info("start browser " + browserName);

        var process = cp.spawn(startCommand, startArgs);
        process.stdout.on('data', function (buffer) {
            logger.debug(buffer.toString('utf8'))
        });
        process.stderr.on('data', function (buffer) {
            logger.error(buffer.toString('utf8'))
        });
        browser.process = process;
    },

    _stopBrowser: function (browserName, browser, cb) {
        cb = cb || function () {};
        if (!browser.process) {
            return cb();
        }
        if (browser.stop) {
            if (browser.stop.command) {
                this._logger.info("stop browser " +
                    browserName + " by command");
                var command = browser.stop.command.replace(/\$\{PID\}/g,
                    browser.process.pid
                );
                this._logger.debug(command);
                var process = cp.exec(command, processLog.bind(this));
                process.on("exit", cb);
            }
            if (browser.stop.windowTitle) {
                this._logger.info("stop browser " + browserName
                    + " by closing window");
                try {
                    closeWindows(browser.stop.windowTitle);
                    cb();
                } catch (err) {
                    this._logger.error(err.message);
                }
            }
        } else {
            this._logger.info("stop browser " + browserName);
            browser.process.kill();
            cb();
        }
        delete browser.process;
    },

    _stopAllBrowsers: function (cb) {
        var browserName;
        var browser;
        var tasks = [];
        for (browserName in this._config.browsers) {
            if (this._config.browsers.hasOwnProperty(browserName)) {
                browser = this._config.browsers[browserName];
                tasks.push(this._stopBrowser.bind(this, browserName, browser));
            }
        }
        async.parallel(tasks, cb);
    },

    close: function (cb) {
        this._stopAllBrowsers(function () {
            if (this._bayeux) {
                this._bayeux.close();
            }
            if (this._server) {
                try {
                    this._server.close(cb);
                } catch (e) {
                    cb();
                }
            }
        }.bind(this));
    }
};

module.exports = Agent;
