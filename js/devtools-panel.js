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
    function elemById(id) {
        return document.getElementById(id);
    }

    var backgroundPagePort = chrome.runtime.connect({
        name: 'devtools-panel-' + chrome.devtools.inspectedWindow.tabId
        });

    function onMessageHandler(request) {
        if ( request && request.what ) {
            switch ( request.what ) {

            case 'setPlaylist':
                elemById('playlistRaw').value = request.playlist.join('\n\n');
                break;

            case 'sessionCompleted':
                sessionCompleted(request);
                break;

            default:
                break;
            }
        }
    }
    backgroundPagePort.onMessage.addListener(onMessageHandler);

    function onRequestFinishedHandler(details) {
        var uploadSize = 0;
        var downloadSize = 0;
        var cookieSentCount = 0;
        var fromCache = !details.connection;
        var request = details.request;
        var response = details.response;
        if ( !fromCache ) {
            if ( request.headerSize ) {
                uploadSize += request.headerSize;
            }
            if ( request.bodySize ) {
                uploadSize += request.bodySize;
            }
            if ( response.headerSize ) {
                downloadSize += response.headerSize;
            }
            if ( response.bodySize ) {
                downloadSize += response.bodySize;
            }
            cookieSentCount = request.cookies.length;
        }
        var msg = {
            what: 'networkRequest',
            uploadSize: uploadSize,
            downloadSize: downloadSize,
            fromCache: fromCache,
            cookieSentCount: cookieSentCount,
            isScript: response.content.mimeType && response.content.mimeType.indexOf('script') >= 0
        };
        backgroundPagePort.postMessage(msg);
    }
    chrome.devtools.network.onRequestFinished.addListener(onRequestFinishedHandler);

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

    function sessionCompleted(details) {
        elemById('sessionRepeat').innerHTML = details.repeatCount;
        elemById('sessionTime').innerHTML = (details.time / 1000).toFixed(3) + ' sec';
        elemById('sessionBandwidth').innerHTML = renderNumber(details.bandwidth.toFixed(0)) + ' bytes';
        elemById('sessionNetworkCount').innerHTML = renderNumber(details.networkCount.toFixed(0));
        elemById('sessionCacheCount').innerHTML = renderNumber(details.cacheCount.toFixed(0));
        elemById('sessionCookieSentCount').innerHTML = details.cookieSentCount.toFixed(1);
        elemById('sessionScriptCount').innerHTML = details.scriptCount.toFixed(1);
        elemById('startButton').disabled = false;
        elemById('startButton').innerHTML = 'Start benchmark';
    }

    function startSession() {
        elemById('startButton').innerHTML = 'Benchmarking...';
        elemById('startButton').disabled = true;
        elemById('sessionRepeat').innerHTML = '&mdash;';
        elemById('sessionTime').innerHTML = '&mdash;';
        elemById('sessionBandwidth').innerHTML = '&mdash;';
        elemById('sessionNetworkCount').innerHTML = '&mdash;';
        elemById('sessionCacheCount').innerHTML = '&mdash;';
        elemById('sessionCookieSentCount').innerHTML = '&mdash;';
        elemById('sessionScriptCount').innerHTML = '&mdash;';
        backgroundPagePort.postMessage({
            what: 'startSession',
            tabId: chrome.devtools.inspectedWindow.tabId,
            playlistRaw: elemById('playlistRaw').value
        });
    }

    backgroundPagePort.postMessage({ what: 'getPlaylist' });

    document.getElementById('startButton').addEventListener('click', startSession);
});
