"use strict";


var buster = require("buster"),
    faye = require("faye"),
    Agent = require("../../lib/agent.js"),

    assert = buster.assert;

buster.testCase("buster-ci-agent", {

    tearDown: function (done) {
        this.agent.close(done);
    },

    "lists configured browsers at Welcome": function (done) {

        var config = {
            port: 8888,
            browsers: {
                "Chrome": {},
                "IE": {}
            },
            logLevel: 0
        };

        this.agent = new Agent(config);
        this.agent.listen(function () {
            var client = new faye.Client("http://localhost:" + config.port);

            client.subscribe("/messages", done(function (message) {
                assert.equals(message.browsers, config.browsers);
            }));

            client.publish("/messages", {
                command: "Welcome"
            });
        });
    }
});