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

window.addEventListener('load', function() {

/******************************************************************************/

function elemById(id) {
    return document.getElementById(id);
}

var backgroundPagePort = chrome.runtime.connect({
    name: 'devtools-panel-' + chrome.devtools.inspectedWindow.tabId
    });

function postPageStats(details) {
    chrome.devtools.network.getHAR(function(harLog) {
        var msg = {
            what: 'pageStats',
            loadTime: 0,
            networkCount: 0,
            cacheCount: 0,
            cookieSentCount: 0,
            scriptCount: 0
        };

        // Find page URL reference
        var pageref = '';
        var i = harLog.pages.length;
        var page;
        while ( i-- ) {
            page = harLog.pages[i];
            if ( page.title === details.pageURL ) {
                pageref = harLog.pages[i].id;
                msg.loadTime = page.pageTimings.onLoad;
                break;
            }
        }
        if ( pageref === '' ) {
            backgroundPagePort.postMessage(msg);
            return;
        }

        var bandwidth = 0;
        var networkCount = 0;
        var cacheCount = 0;
        var scriptCount = 0;
        var cookieSentCount = 0;

        var entries = harLog.entries;
        var i = entries.length;
        var entry, request, response, mimeType;
        while ( i-- ) {
            entry = entries[i];
            if ( entry.pageref !== pageref ) {
                continue;
            }
            request = entry.request;
            response = entry.response;
            if ( entry.connection ) {
                networkCount++;
                if ( request.headerSize ) {
                    bandwidth += request.headerSize;
                }
                if ( request.bodySize ) {
                    bandwidth += request.bodySize;
                }
                if ( response.headerSize ) {
                    bandwidth += response.headerSize;
                }
                if ( response.bodySize ) {
                    bandwidth += response.bodySize;
                }
                cookieSentCount += request.cookies.length;
            } else {
                cacheCount++;
            }
            mimeType = response.content.mimeType;
            if ( mimeType && mimeType.indexOf('script') >= 0 ) {
                scriptCount++;
            }
        }
        msg.bandwidth = bandwidth;
        msg.networkCount = networkCount;
        msg.cacheCount = cacheCount;
        msg.cookieSentCount = cookieSentCount;
        msg.scriptCount = scriptCount;
        backgroundPagePort.postMessage(msg);
    });
}

function onMessageHandler(request) {
    if ( request && request.what ) {
        switch ( request.what ) {

        case 'playlist':
            elemById('playlistRaw').value = request.playlist.join('\n\n');
            break;

        case 'sessionStarted':
            sessionStarted(request);
            break;

        case 'sessionCompleted':
            sessionCompleted(request);
            break;

        case 'getPageStats':
            postPageStats(request);
            break;

        default:
            break;
        }
    }
}
backgroundPagePort.onMessage.addListener(onMessageHandler);

function renderNumber(value) {
    if ( +value > 1000 ) {
        value = value.toString();
        var i = value.length - 3;
        while ( i > 0 ) {
            value = value.slice(0, i) + ',' + value.slice(i);
            i -= 3;
        }
    }
    return value;
}

function startSession() {
    backgroundPagePort.postMessage({
        what: 'startSession',
        tabId: chrome.devtools.inspectedWindow.tabId,
        playlistRaw: elemById('playlistRaw').value
    });
}

function sessionStarted() {
    elemById('startButton').style.display = 'none';
    elemById('stopButton').style.display = '';
    elemById('sessionRepeat').innerHTML = '&mdash;';
    elemById('sessionTime').innerHTML = '&mdash;';
    elemById('sessionBandwidth').innerHTML = '&mdash;';
    elemById('sessionNetworkCount').innerHTML = '&mdash;';
    elemById('sessionCacheCount').innerHTML = '&mdash;';
    elemById('sessionCookieSentCount').innerHTML = '&mdash;';
    elemById('sessionScriptCount').innerHTML = '&mdash;';
}

function stopSession() {
    backgroundPagePort.postMessage({
        what: 'abortSession',
        tabId: chrome.devtools.inspectedWindow.tabId
    });
}

function sessionCompleted(details) {
    elemById('sessionRepeat').innerHTML = details.repeatCount;
    elemById('sessionTime').innerHTML = (details.time / 1000).toFixed(3) + ' sec';
    elemById('sessionBandwidth').innerHTML = renderNumber(details.bandwidth.toFixed(0)) + ' bytes';
    elemById('sessionNetworkCount').innerHTML = renderNumber(details.networkCount.toFixed(0));
    elemById('sessionCacheCount').innerHTML = renderNumber(details.cacheCount.toFixed(0));
    elemById('sessionCookieSentCount').innerHTML = details.cookieSentCount.toFixed(1);
    elemById('sessionScriptCount').innerHTML = details.scriptCount.toFixed(1);
    elemById('stopButton').style.display = 'none';
    elemById('startButton').style.display = '';
}

backgroundPagePort.postMessage({ what: 'getPlaylist' });

elemById('startButton').addEventListener('click', startSession);
elemById('stopButton').addEventListener('click', stopSession);

/******************************************************************************/

});
