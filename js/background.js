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
    sessionLoadTime: 0,
    sessionBandwidth: 0,
    networkCount: 0,
    cacheCount: 0,
    blockCount: 0,

    firstPartyHostCount: 0,
    firstPartyScriptCount: 0,
    firstPartyCookieSentCount: 0,
    thirdPartyHostCount: 0,
    thirdPartyScriptCount: 0,
    thirdPartyCookieSentCount: 0,

    repeatCountdown: 0,
    resultStack: [],

    pageURL: '',

    devtoolPorts: {},
    portCount: 0,

    // so that I don't have to care for last comma
    dummy: 0
};

/******************************************************************************/

function startBenchmark(request, portName) {
    var sess = SessBench;
    if ( sess.state !== '' ) {
        return;
    }
    sess.portName = portName;
    sess.tabId = request.tabId;
    parsePlaylist(request.playlistRaw);
    sess.devtoolPorts[sess.portName].postMessage({ what: 'benchmarkStarted' });
    startSession();
}

function stopBenchmark() {
    var sess = SessBench;
    if ( sess.state === '' ) {
        return;
    }
    sess.state = '';
    results = processResults(sess.resultStack);
    results.what = 'benchmarkCompleted';
    sess.devtoolPorts[sess.portName].postMessage(results);
}

/******************************************************************************/

function startSession(request, portName) {
    var sess = SessBench;
    initSession();
    sess.devtoolPorts[sess.portName].postMessage({ what: 'sessionStarted' });
    executePlaylist();
}

function initSession() {
    var sess = SessBench;
    sess.playlistPtr = 0;
    sess.resultStack = [];
    sess.repeatCountdown = sess.repeat;
    sess.state = 'waiting';
}

function stopSession() {
    var sess = SessBench;
    if ( sess.state !== 'waiting' ) {
        return;
    }
    var results = {
        time: sess.sessionLoadTime,
        bandwidth: sess.sessionBandwidth,
        networkCount: sess.networkCount,
        cacheCount: sess.cacheCount,
        blockCount: sess.blockCount,
        firstPartyHostCount: sess.firstPartyHostCount,
        firstPartyScriptCount: sess.firstPartyScriptCount,
        firstPartyCookieSentCount: sess.firstPartyCookieSentCount,
        thirdPartyHostCount: sess.thirdPartyHostCount,
        thirdPartyScriptCount: sess.thirdPartyScriptCount,
        thirdPartyCookieSentCount: sess.thirdPartyCookieSentCount
    };
    sess.resultStack.push(results);
    results = processResults(sess.resultStack);
    sess.devtoolPorts[sess.portName].postMessage(results);
    sess.repeatCountdown--;
    if ( sess.repeatCountdown ) {
        sess.playlistPtr = 0;
        wait(0);
        return;
    }
    sess.state = '';
    sess.devtoolPorts[sess.portName].postMessage({ what: 'benchmarkCompleted' });
}

/******************************************************************************/

function processResults(entries) {
    var n = entries.length,
        i = n;
    var results = {
        what: 'sessionCompleted',
        repeatCount: n,
        time: 0,
        bandwidth: 0,
        networkCount: 0,
        cacheCount: 0,
        blockCount: 0,
        firstPartyHostCount: 0,
        firstPartyScriptCount: 0,
        firstPartyCookieSentCount: 0,
        thirdPartyHostCount: 0,
        thirdPartyScriptCount: 0,
        thirdPartyCookieSentCount: 0
    };
    var entry;
    while ( i-- ) {
        entry = entries[i];
        results.time += entry.time;
        results.bandwidth += entry.bandwidth;
        results.networkCount += entry.networkCount;
        results.cacheCount += entry.cacheCount;
        results.blockCount += entry.blockCount;
        results.firstPartyHostCount += entry.firstPartyHostCount;
        results.firstPartyScriptCount += entry.firstPartyScriptCount;
        results.firstPartyCookieSentCount += entry.firstPartyCookieSentCount;
        results.thirdPartyHostCount += entry.thirdPartyHostCount;
        results.thirdPartyScriptCount += entry.thirdPartyScriptCount;
        results.thirdPartyCookieSentCount += entry.thirdPartyCookieSentCount;
    }
    if ( n ) {
        results.time /= n;
        results.bandwidth /= n;
        results.networkCount /= n;
        results.cacheCount /= n;
        results.blockCount /= n;
        results.firstPartyHostCount /= n;
        results.firstPartyScriptCount /= n;
        results.firstPartyCookieSentCount /= n;
        results.thirdPartyHostCount /= n;
        results.thirdPartyScriptCount /= n;
        results.thirdPartyCookieSentCount /= n;
    }
    return results;
}

/******************************************************************************/

function executePlaylist() {
    var sess = SessBench;

    if ( sess.state === '' ) {
        return;
    }

    // wrap-up?
    if ( sess.playlistPtr === sess.playlist.length ) {
        stopSession();
        return;
    }

    // set-up?
    if ( sess.playlistPtr === 0 ) {
        sess.sessionLoadTime = 0;
        sess.sessionBandwidth = 0;
        sess.networkCount = 0;
        sess.cacheCount = 0;
        sess.blockCount = 0;
        sess.firstPartyHostCount = 0;
        sess.firstPartyScriptCount = 0;
        sess.firstPartyCookieSentCount = 0;
        sess.thirdPartyHostCount = 0;
        sess.thirdPartyScriptCount = 0;
        sess.thirdPartyCookieSentCount = 0;
    }

    var entry;
    while ( sess.playlistPtr < sess.playlist.length ) {
        entry = sess.playlist[sess.playlistPtr];
        sess.playlistPtr++;

        if ( entry === 'clear cache' ) {
            clearCache();
            return;
        }

        if ( entry === 'clear cookies' ) {
            clearCookies();
            return;
        }

        if ( entry.indexOf('http') === 0 ) {
            pageStart(entry);
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

function clearCookies() {
    chrome.browsingData.removeCookies({ since: 0 }, clearCookiesCallback);
}

function clearCookiesCallback() {
    executePlaylist();
}

/******************************************************************************/

function pageStart(url) {
    chrome.tabs.update(SessBench.tabId, { url: url });
}

function pageStartCallback(details) {
    if ( details.frameId ) {
        return;
    }
    var sess = SessBench;
    if ( details.tabId !== sess.tabId ) {
        return;
    }
    if ( sess.state !== 'waiting' ) {
        return;
    }
    sess.pageURL = details.url;
    sess.state = 'loading';
}

/******************************************************************************/

function pageStopCallback(details) {
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
    sess.state = 'waiting';
    getPageStats(sess.pageURL)
}

function pageErrorCallback(details) {
    var sess = SessBench;
    if ( details.tabId !== sess.tabId ) {
        return;
    }
    if ( sess.state !== 'loading' ) {
        return;
    }
    sess.state = 'waiting';
    getPageStats(sess.pageURL)
}

/******************************************************************************/

function getPageStats(pageURL) {
    var sess = SessBench;
    sess.devtoolPorts[sess.portName].postMessage({
        what: 'getPageStats',
        pageURL: pageURL
    });
}

function getPageStatsCallback(details) {
    // aggregate stats
    var sess = SessBench;
    sess.sessionLoadTime += details.loadTime;
    sess.sessionBandwidth += details.bandwidth;
    sess.cacheCount += details.cacheCount;
    sess.blockCount += details.blockCount;
    sess.networkCount += details.networkCount;
    sess.firstPartyHostCount += details.firstPartyHostCount;
    sess.firstPartyScriptCount += details.firstPartyScriptCount;
    sess.firstPartyCookieSentCount += details.firstPartyCookieSentCount;
    sess.thirdPartyHostCount += details.thirdPartyHostCount;
    sess.thirdPartyScriptCount += details.thirdPartyScriptCount;
    sess.thirdPartyCookieSentCount += details.thirdPartyCookieSentCount;
    wait(sess.wait);
}

/******************************************************************************/

function onPortMessageHandler(request, port) {
    if ( !request || !request.what ) {
        return;
    }
    switch ( request.what ) {

    case 'getPlaylist':
        port.postMessage({ what: 'playlist', playlist: SessBench.playlist });
        break;

    case 'startBenchmark':
        startBenchmark(request, port.name);
        break;

    case 'stopBenchmark':
        stopBenchmark(request, port.name);
        break;

    case 'pageStats':
        getPageStatsCallback(request);
        break;

    default:
        break;
    }
}

/******************************************************************************/

function startPageListeners() {
    chrome.webNavigation.onBeforeNavigate.addListener(pageStartCallback);
    chrome.webNavigation.onCompleted.addListener(pageStopCallback);
    chrome.webNavigation.onErrorOccurred.addListener(pageErrorCallback);
}

function stopPageListeners() {
    chrome.webNavigation.onBeforeNavigate.removeListener(pageStartCallback);
    chrome.webNavigation.onCompleted.removeListener(pageStopCallback);
    chrome.webNavigation.onErrorOccurred.removeListener(pageErrorCallback);
}

/******************************************************************************/

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

        // clear cookies
        matches = line.match(/^clear +cookies$/i);
        if ( matches ) {
            sess.playlist[sess.playlistPtr] = 'clear cookies';
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
