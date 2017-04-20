"use strict";

var isWin = /^win/.test(process.platform);

function closeWindows(windowTitle) {
    
    if (isWin) {
        require("./close-window/close-windows-win")(windowTitle);
    } else {
        require("./close-window/close-windows-xlib.js")(windowTitle);
    }
}
module.exports = closeWindows;