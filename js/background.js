/*******************************************************************************

    sessbench - a Chromium browser extension to benchmark browser session.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/sessbench

*/

/******************************************************************************/

(function(){

/******************************************************************************/

var SessBench = {
    manifest: chrome.runtime.getManifest(),

    // session state can be:
    // {empty} = no ongoing session
    // 'loading'
    // 'waiting'
    state: '',
    portName: '',
    tabId: 0,
    playlistRaw: '',
    playlist: [],
    playlistPtr: 0,
    repeat: 1,
    wait: 1,
    sessionTime: 0,
    sessionBandwidth: 0,
    networkCount: 0,
    cacheCount: 0,
    repeatCountdown: 0,
    resultStack: [],

    pageStartTime: 0,

    devtoolPorts: {},
    portCount: 0,

    // so that I don't have to care for last comma
    dummy: 0
};

/******************************************************************************/

function startSession(request, portName) {
    var sess = SessBench;
    if ( sess.state !== '' ) {
        return;
    }
    sess.portName = portName;
    sess.tabId = request.tabId;
    parsePlaylist(request.playlistRaw);
    setupSession();
    executePlaylist();
}

function setupSession() {
    var sess = SessBench;
    sess.playlistPtr = 0;
    sess.resultStack = [];
    sess.repeatCountdown = sess.repeat;
}

function stopSession() {
    var sess = SessBench;
    if ( sess.state !== 'waiting' ) {
        return;
    }
    var results = {
        time: sess.sessionTime,
        bandwidth: sess.sessionBandwidth,
        networkCount: sess.networkCount,
        cacheCount: sess.cacheCount
    };
    sess.resultStack.push(results);
    sess.repeatCountdown--;
    if ( sess.repeatCountdown ) {
        sess.playlistPtr = 0;
        wait(0);
        return;
    }
    sess.state = '';
    results = processResults(sess.resultStack);
    results.what = 'sessionCompleted';
    sess.devtoolPorts[sess.portName].postMessage(results);
}

function processResults(entries) {
    var n = entries.length,
        i = n;
    var results = {
        repeatCount: n,
        time: 0,
        bandwidth: 0,
        networkCount: 0,
        cacheCount: 0
    };
    var entry;
    while ( i-- ) {
        entry = entries[i];
        results.time += entry.time;
        results.bandwidth += entry.bandwidth;
        results.networkCount += entry.networkCount;
        results.cacheCount += entry.cacheCount;
    }
    if ( n ) {
        results.time /= n;
        results.bandwidth /= n;
        results.networkCount /= n;
        results.cacheCount /= n;
    }
    return results;
}

function executePlaylist() {
    var sess = SessBench;

    // wrap-up?
    if ( sess.playlistPtr === sess.playlist.length ) {
        stopSession();
        return;
    }

    // set-up?
    if ( sess.playlistPtr === 0 ) {
        sess.sessionTime = 0;
        sess.sessionBandwidth = 0;
        sess.networkCount = 0;
        sess.cacheCount = 0;
        sess.state = 'waiting';
    }

    var entry;
    while ( sess.playlistPtr < sess.playlist.length ) {
        entry = sess.playlist[sess.playlistPtr];
        sess.playlistPtr++;

        if ( entry === 'clear cache' ) {
            clearCache();
            return;
        }

        if ( entry.indexOf('http') === 0 ) {
            loadPage(entry);
            return;
        }
    }

    // Should not be reached with a valid playlist
    wait(1);
}

/******************************************************************************/

function wait(s) {
    setTimeout(waitCallback, s * 1000);
}

function waitCallback() {
    executePlaylist();
}

/******************************************************************************/

function clearCache() {
    chrome.browsingData.removeCache({ since: 0 }, clearCacheCallback);
}

function clearCacheCallback() {
    executePlaylist();
}

/******************************************************************************/

function loadPage(url) {
    chrome.tabs.update(SessBench.tabId, { url: url });
}

function loadPageCallback(details) {
    if ( details.frameId ) {
        return;
    }
    var sess = SessBench;
    if ( details.tabId !== sess.tabId ) {
        return;
    }
    if ( sess.state !== 'loading' ) {
        return;
    }
    sess.sessionTime += Date.now() - sess.pageStartTime;
    sess.state = 'waiting';
    wait(sess.wait);
}

/******************************************************************************/

function onBeforeRequestHandler(details) {
    if ( details.parentFrameId >= 0 ) {
        return;
    }
    var sess = SessBench;
    if ( details.tabId !== sess.tabId ) {
        return;
    }
    if ( sess.state !== 'waiting' ) {
        return;
    }
    sess.pageStartTime = Date.now();
    sess.state = 'loading';
}

/******************************************************************************/

function processNetworkRequest(details, portName) {
    var sess = SessBench;
    if ( sess.portName !== portName ) {
        return;
    }
    if ( sess.state !== 'loading' ) {
        return;
    }
    sess.sessionBandwidth += details.uploadSize;
    sess.sessionBandwidth += details.downloadSize;
    if ( details.fromCache ) {
        sess.cacheCount++;
    } else {
        sess.networkCount++;
    }
}

/******************************************************************************/

function onPortMessageHandler(request, port) {
    if ( !request || !request.what ) {
        return;
    }
    switch ( request.what ) {

    case 'getPlaylist':
        port.postMessage({ what: 'setPlaylist', playlist: SessBench.playlist });
        break;

    case 'startSession':
        startSession(request, port.name);
        break;

    case 'networkRequest':
        processNetworkRequest(request, port.name);
        break;

    default:
        break;
    }
}

function onPortDisonnectHandler(port) {
    var sess = SessBench;
    var port = sess.devtoolPorts[port.name];
    if ( port ) {
        port.onMessage.removeListener(onPortMessageHandler);
        sess.portCount--;
        delete sess.devtoolPorts[port.name];
        if ( sess.portCount === 0 ) {
            stopPageListeners();
        }
    }
}

function onPortConnectHandler(port) {
    var sess = SessBench;
    if ( sess.devtoolPorts[port.name] ) {
        return;
    }
    sess.devtoolPorts[port.name] = port;
    sess.portCount++;
    if ( sess.portCount === 1 ) {
        startPageListeners();
    }
    port.onMessage.addListener(onPortMessageHandler);
    port.onDisconnect.addListener(onPortDisonnectHandler);
}
chrome.runtime.onConnect.addListener(onPortConnectHandler);

/******************************************************************************/

function startPageListeners() {
    chrome.webRequest.onBeforeRequest.addListener(
        onBeforeRequestHandler,
        {
            "urls": [
                "http://*/*",
                "https://*/*",
            ],
            "types": [
                "main_frame"
            ]
        },
        [ "blocking" ]
    );
    chrome.webNavigation.onCompleted.addListener(loadPageCallback);
}

function stopPageListeners() {
    chrome.webNavigation.onCompleted.removeListener(loadPageCallback);
    chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestHandler);
}

/******************************************************************************/

function parsePlaylist(text) {
    var sess = SessBench;
    sess.playlist = [];
    sess.playlistPtr = 0;
    sess.repeat = 1;
    sess.wait = 1;

    var lines = text.split(/\n+/);
    var n = lines.length;
    var pl = [];
    var plPtr = 0;
    var line, matches, x;
    for ( var i = 0; i < n; i++ ) {
        line = lines[i].trim();

        // repeat directive valid only as first directive
        matches = line.match(/^repeat +(\d+)$/i);
        if ( matches ) {
            x = parseInt(matches[1], 10);
            if ( isNaN(x) ) {
                continue;
            }
            sess.repeat = Math.max(Math.min(x, 50), 1);
            continue;
        }

        // wait directive
        matches = line.match(/^wait +(\d+)$/i);
        if ( matches ) {
            x = parseInt(matches[1], 10);
            if ( isNaN(x) ) {
                continue;
            }
            sess.wait = Math.max(Math.min(x, 60), 1);
            continue;
        }

        // clear cache directive
        matches = line.match(/^clear +cache$/i);
        if ( matches ) {
            sess.playlist[sess.playlistPtr] = 'clear cache';
            sess.playlistPtr++;
            continue;
        }

        // URL directive
        matches = line.match(/^https?:\/\/[a-z0-9]/);
        if ( matches ) {
            sess.playlist[sess.playlistPtr] = line;
            sess.playlistPtr++;
            continue;
        }

        // Ignore whatever else
    }
}

/******************************************************************************/

})();
