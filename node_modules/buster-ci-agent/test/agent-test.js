"use strict";

var buster = require("buster"),
    events = require("events"),

    proxyquire = require("proxyquire"),
    httpStub = {},
    childProcessStub = {},
    closeWindowsStub = buster.sinon.stub(),
    Agent = proxyquire("../lib/agent.js", {
        "http": httpStub,
        "child_process": childProcessStub,
        "./close-windows": closeWindowsStub
    }),

    assert = buster.assert,
    refute = buster.refute,
    match = buster.sinon.match;


buster.testCase("buster-ci-agent", {

    setUp: function () {
        this.server = httpStub.createServer();
        this.stub(this.server, "listen");
        // this.stub(server, "close") doesn't work, because stub will be removed
        // before the call of this.agent.close() in tearDown
        this.server.close = this.stub();
        this.stub(httpStub, "createServer").returns(this.server);

        this.processStub = {
            create: function () {

                var stub = new events.EventEmitter();
                stub.stdout = {
                    on: this.stub()
                };
                stub.stderr = {
                    on: this.stub()
                };
                stub.kill = this.stub();

                return stub;
            }.bind(this)
        }
        this.stub(childProcessStub, "spawn").returns(
            this.processStub.create()
        );
        this.stub(childProcessStub, "exec");
        process.setMaxListeners(0);
    },

    tearDown: function () {
        this.agent.close(function () {});
    },

    "listens on specified port": function () {

        var config = {
            port: 8888,
            logLevel: 0
        };

        this.agent = new Agent(config);
        this.agent.listen();

        assert.calledWith(this.server.listen, 8888);
    },

    handleRequest: {

        "lists configured browsers at Welcome": function () {

            var config = {
                port: 8888,
                browsers: {
                    "Chrome": {},
                    "IE": {}
                },
                logLevel: 0
            };

            this.agent = new Agent(config);
            var response = this.agent._handleRequest({ command: "Welcome" });

            assert.equals(response.browsers, config.browsers);
        },

        "starts specified browsers": {
            "with startArgs": function () {

                var config = {
                    port: 8888,
                    browsers: {
                        "Chrome": {
                            start: "chromium-browser",
                            startArgs: ["--new-window"]
                        },
                        "IE": {
                            start: "iexplore"
                        },
                        "FF": {
                            start: "firefox"
                        }
                    },
                    logLevel: 0
                };

                this.agent = new Agent(config);
                this.agent._handleRequest({
                    command: "start",
                    browsers: {
                        "Chrome": {},
                        "IE": {}
                    }
                });

                assert.calledWith(
                    childProcessStub.spawn,
                    config.browsers.Chrome.start,
                    match(config.browsers.Chrome.startArgs)
                );
                assert.calledWith(
                    childProcessStub.spawn,
                    config.browsers.IE.start
                );
                refute.calledWith(
                    childProcessStub.spawn,
                    config.browsers.FF.start
                );
            },

            "with capture url": function () {
                var config = {
                    port: 8888,
                    browsers: {
                        "Chrome": {
                            start: "chromium-browser",
                            startArgs: ["--new-window"]
                        }
                    },
                    logLevel: 0
                };
                var captureUrl = "http://host:port/capture";

                this.agent = new Agent(config);
                this.agent._handleRequest({
                    command: "start",
                    browsers: { "Chrome": {} },
                    url: captureUrl
                });

                assert.calledWith(
                    childProcessStub.spawn,
                    config.browsers.Chrome.start,
                    config.browsers.Chrome.startArgs.concat(captureUrl)
                );
            },

            "with specified ids": function () {

                var config = {
                    port: 8888,
                    browsers: {
                        "Chrome": {
                            start: "chromium-browser"
                        },
                        "IE": {
                            start: "iexplore"
                        }
                    },
                    logLevel: 0
                };
                var captureUrl = "http://host:port/capture";
                var idChrome = 123;
                var idIE = 456;

                this.agent = new Agent(config);
                this.agent._handleRequest({
                    command: "start",
                    browsers: {
                        "Chrome": {
                            id: idChrome
                        },
                        "IE": {
                            id: idIE
                        }
                    },
                    url: captureUrl
                });

                assert.calledWith(
                    childProcessStub.spawn,
                    config.browsers.Chrome.start,
                    [captureUrl + "?id=" + idChrome]
                );
                assert.calledWith(
                    childProcessStub.spawn,
                    config.browsers.IE.start,
                    [captureUrl + "?id=" + idIE]
                );
            },

            "runs prepareStart before start": function () {

                var config = {
                    port: 8888,
                    browsers: {
                        "Chrome": {
                            prepareStart:
                                "cp d:/temp/prefs_template.js d:/temp/prefs.js",
                            start: "chromium-browser"
                        }
                    },
                    logLevel: 0
                };

                this.agent = new Agent(config);
                this.agent._handleRequest({
                    command: "start",
                    browsers: {
                        "Chrome": {}
                    }
                });

                assert.calledWith(
                    childProcessStub.exec,
                    config.browsers.Chrome.prepareStart
                );
                assert(
                    childProcessStub.exec.calledBefore(childProcessStub.spawn)
                );
            }
        },

        "kills specified browsers": function () {

            var config = {
                port: 8888,
                browsers: {
                    "Chrome": {
                        start: "chromium-browser"
                    },
                    "IE": {
                        start: "iexplore"
                    }
                },
                logLevel: 0
            };
            var processChrome = this.processStub.create();
            var processIE = this.processStub.create();
            childProcessStub.spawn.withArgs(config.browsers.Chrome.start)
                .returns(processChrome);
            childProcessStub.spawn.withArgs(config.browsers.IE.start)
                .returns(processIE);

            this.agent = new Agent(config);
            this.agent._handleRequest({
                command: "start",
                browsers: {
                    "Chrome": {},
                    "IE": {}
                }
            });
            this.agent._handleRequest({
                command: "stop",
                browsers: {
                    "Chrome": {},
                    "IE": {}
                }
            });

            assert.called(processChrome.kill);
            assert.called(processIE.kill);
        },

        "kills specified browsers by provided command": function () {

            var config = {
                port: 8888,
                browsers: {
                    "IE": {
                        start: "iexplore",
                        stop: {
                            command: "commandToStop"
                        }
                    }
                },
                logLevel: 0
            };
            var processIE = this.processStub.create();
            childProcessStub.spawn.withArgs(config.browsers.IE.start)
                .returns(processIE);
            childProcessStub.exec.withArgs(config.browsers.IE.stop.command)
                .returns(processIE);

            this.agent = new Agent(config);
            this.agent._handleRequest({
                command: "start",
                browsers: {
                    "IE": {}
                }
            });
            this.agent._handleRequest({
                command: "stop",
                browsers: {
                    "IE": {}
                }
            });

            refute.called(processIE.kill);
            assert.calledWith(childProcessStub.exec, "commandToStop");
        },

        "replaces place holder for pid in provided command": function () {

            var config = {
                port: 8888,
                browsers: {
                    "IE": {
                        start: "iexplore",
                        stop: {
                            command: "commandToStop ${PID}"
                        }
                    }
                },
                logLevel: 0
            };
            var processIE = this.processStub.create();
            processIE.pid = 1234;
            childProcessStub.spawn.withArgs(config.browsers.IE.start)
                .returns(processIE);
            childProcessStub.exec.withArgs("commandToStop 1234")
                .returns(processIE);

            this.agent = new Agent(config);
            this.agent._handleRequest({
                command: "start",
                browsers: {
                    "IE": {}
                }
            });
            this.agent._handleRequest({
                command: "stop",
                browsers: {
                    "IE": {}
                }
            });

            refute.called(processIE.kill);
            assert.calledWith(childProcessStub.exec, "commandToStop 1234");
        },

        "kills browsers by provided window title": function () {
            var config = {
                port: 8888,
                browsers: {
                    "IE": {
                        start: "iexplore",
                        stop: {
                            windowTitle: "Buster - Windows Internet Explorer"
                        }
                    }
                },
                logLevel: 0
            };
            var processIE = this.processStub.create();
            processIE.pid = 1234;
            childProcessStub.spawn.withArgs(config.browsers.IE.start)
                .returns(processIE);

            this.agent = new Agent(config);
            this.agent._handleRequest({
                command: "start",
                browsers: {
                    "IE": {}
                }
            });
            this.agent._handleRequest({
                command: "stop",
                browsers: {
                    "IE": {}
                }
            });

            refute.called(processIE.kill);
            assert.calledWith(
                closeWindowsStub,
                config.browsers.IE.stop.windowTitle
            );
        },

        "kills all running browsers on close": function () {
            var config = {
                port: 8888,
                browsers: {
                    IE: {
                        start: "iexplore"
                    },
                    Chrome: {
                        start: "chromium-browser",
                        startArgs: ["--new-window"]
                    },
                    FF: {
                        start: "firefox"
                    }
                },
                logLevel: 0
            };
            var processIE = this.processStub.create();
            processIE.pid = 1234;
            childProcessStub.spawn.withArgs(config.browsers.IE.start)
                .returns(processIE);
            childProcessStub.spawn.withArgs(config.browsers.IE.stop)
            .returns(processIE);
            var processChrome = this.processStub.create();
            processIE.pid = 5678;
            childProcessStub.spawn.withArgs(config.browsers.Chrome.start)
                .returns(processChrome);
            var processFF = this.processStub.create();
            processFF.pid = 1111;
            childProcessStub.spawn.withArgs(config.browsers.FF.start)
                .returns(processFF);

            this.agent = new Agent(config);
            this.agent._handleRequest({
                command: "start",
                browsers: {
                    IE: {},
                    Chrome: {}
                }
            });
            this.agent.close();

            assert.calledOnce(processIE.kill);
            assert.calledOnce(processChrome.kill);
            refute.called(processFF.kill);
        },

        "calls callback of close after browsers are closed": function () {
            var config = {
                port: 8888,
                browsers: {
                    IE: {
                        start: "iexplore"
                    },
                    Chrome: {
                        start: "chromium-browser",
                        startArgs: ["--new-window"]
                    },
                    FF: {
                        start: "firefox"
                    }
                },
                logLevel: 0
            };
            this.server.close.callsArg(0);
            this.agent = new Agent(config);
            this.stub(this.agent, "_stopBrowser");
            var callback = this.stub();
            this.agent.close(callback);

            var cb1 = this.agent._stopBrowser.getCall(0).args[2];
            var cb2 = this.agent._stopBrowser.getCall(1).args[2];
            var cb3 = this.agent._stopBrowser.getCall(2).args[2];

            refute.called(callback);
            cb1();
            refute.called(callback);
            cb2();
            refute.called(callback);
            cb3();
            assert.calledOnce(callback);
        }
    },

    "calls callback of close even if server.close throws":
        function () {

            this.server.close.throws(new Error("Not running"));
            this.agent = new Agent({});
            var callback = this.stub();

            this.agent.close(callback);

            assert.calledOnce(callback);
        }
});
