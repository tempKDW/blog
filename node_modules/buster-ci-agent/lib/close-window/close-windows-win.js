"use strict";

var ffi = require('ffi');
var ref = require('ref');

var MAX_TITLE_SIZE = 200;

var lpctstr = {
    name: 'lpctstr',
    indirection: 1,
    size: ref.sizeof.pointer,
    get: function (buffer, offset) {
        var buf = buffer.readPointer(offset);
        if (buf.isNull()) {
            return null;
        }
        return buf.readCString(0);
    },
    set: function (buffer, offset, value) {
        var buf = ref.allocCString(value, 'ucs2');
        return buffer.writePointer(buf, offset);
    },
    ffi_type: ffi.types.CString.ffi_type
};

var lpdwordPtr = ref.refType(ref.types.ulong);

var user32 = ffi.Library('user32', {
	EnumWindows: ['bool', ['pointer', 'int']],
	GetWindowTextW: ['int', ['int', 'pointer', 'int']],
    SendMessageW: ['int', ['int', 'int', 'int', 'int']]
});

function getWindowList(windowTitle) {

    function strOfLength(size) {
        var str = "";
        var i;
        for (i = 0; i < size; i++) {
            str += " ";
        }
        return str;
    }

    var windows = [];
    var titleBuffer = ref.alloc('String', strOfLength(MAX_TITLE_SIZE * 2));
    var lpEnumFunc = ffi.Callback('bool', ['int', 'int'],
        function (hwnd, lParam) {
            var titleLength = user32.GetWindowTextW(hwnd,
                titleBuffer, MAX_TITLE_SIZE);
            var title =
                titleBuffer.reinterpret(titleLength * 2).toString('ucs2');
            if (title === windowTitle) {
                windows.push(hwnd);
            }
            return true;
        });

    user32.EnumWindows(lpEnumFunc, 0);

    return windows;
}

function closeWindows(windowTitle) {

    var windows = getWindowList(windowTitle);

    var i;
    for (i = 0; i < windows.length; i++) {
        user32.SendMessageW(windows[i], 16, null, null);
    }
}

module.exports = closeWindows;
