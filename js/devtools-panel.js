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

/******************************************************************************/

var backgroundPagePort = chrome.runtime.connect({
    name: 'devtools-panel-' + chrome.devtools.inspectedWindow.tabId
    });

/******************************************************************************/

function postPageStats(details) {
    // HAR 1.2 Spec
    // http://www.softwareishard.com/blog/har-12-spec/
    chrome.devtools.network.getHAR(function(harLog) {

        var headerFromHeaders = function(key, headers) {
            if ( !key || !headers ) {
                return null;
            }
            key = key.toLowerCase();
            var i = headers.length;
            var header;
            while ( i-- ) {
                header = headers[i];
                if ( header.name.toLowerCase() === key ) {
                    return header;
                }
            }
            return null;
        };

        var hostFromHeaders = function(headers) {
            var header = headerFromHeaders('Host', headers);
            if ( header ) {
                return header.value;
            }
            return '';
        };

        var extractCookiesToDict = function(cookies, cookieDict) {
            var i = cookies.length;
            var cookie;
            if ( i-- ) {
                cookie = cookies[i];
                if ( cookie.name ) {
                    cookieDict[cookie.name] = true;
                }
            }
        };

        var msg = {
            what: 'pageStats',
            loadTime: 0,
            networkCount: 0,
            cacheCount: 0,
            firstPartyScriptCount: 0,
            firstPartyCookieSentCount: 0,
            thirdPartyHostCount: 0
            thirdPartyScriptCount: 0,
            thirdPartyCookieSentCount: 0,
        };
        var entries = harLog.entries;
        var entry, header, reqhost;
        var i, n = harLog.entries.length;

        // Find page URL reference
        var pagehost = '';
        var pageref = '';
        for ( i = 0; i < n; i++ ) {
            entry = entries[i];
            if ( entry.request.url === details.pageURL ) {
                pageref = entry.pageref;
                pagehost = hostFromHeaders(entry.request.headers);
                break;
            }
        }
        if ( pageref === '' ) {
            backgroundPagePort.postMessage(msg);
            return;
        }

        // Find page load time
        var pages = harLog.pages;
        var page;
        i = pages.length;
        while ( i-- ) {
            page = pages[i];
            if ( page.id === pageref ) {
                msg.loadTime = page.pageTimings.onLoad;
            }
        }

        var bandwidth = 0;
        var networkCount = 0;
        var cacheCount = 0;
        var firstPartyScriptCount = 0;
        var thirdPartyScriptCount = 0;
        var firstPartyCookies = {};
        var thirdPartyCookies = {};
        var thirdPartyHosts = {};

        var request, response, mimeType;
        for ( i = 0; i < n; i++ ) {
            entry = entries[i];
            if ( entry.pageref !== pageref ) {
                continue;
            }
            request = entry.request;
            response = entry.response;
            reqhost = hostFromHeaders(request.headers);
            thirdPartyHost = pagehost && reqhost && reqhost !== pagehost;
            if ( thirdPartyHost ) {
                thirdPartyHosts[reqhost] = true;
            }
            if ( reqhost ) {
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
                extractCookiesToDict(request.cookies, thirdPartyHost ? thirdPartyCookies : firstPartyCookies);
            } else {
                cacheCount++;
                console.assert(hostFromHeaders(request.headers) === '', 'NOT FROM CACHE!');
            }
            mimeType = response.content.mimeType;
            if ( mimeType && mimeType.indexOf('script') >= 0 ) {
                if ( thirdPartyHost ) {
                    thirdPartyScriptCount++;
                } else {
                    firstPartyScriptCount++;
                }
            }
        }
        msg.bandwidth = bandwidth;
        msg.networkCount = networkCount;
        msg.cacheCount = cacheCount;
        msg.firstPartyCookieSentCount = Object.keys(firstPartyCookies).length;
        msg.thirdPartyCookieSentCount = Object.keys(thirdPartyCookies).length;
        msg.firstPartyScriptCount = firstPartyScriptCount;
        msg.thirdPartyHostCount = Object.keys(thirdPartyHosts).length;
        msg.thirdPartyScriptCount = thirdPartyScriptCount;
        backgroundPagePort.postMessage(msg);
    });
}

/******************************************************************************/

function onMessageHandler(request) {
    if ( request && request.what ) {
        switch ( request.what ) {

        case 'playlist':
            elemById('playlistRaw').value = request.playlist.join('\n');
            break;

        case 'benchmarkStarted':
            benchmarkStarted(request);
            break;

        case 'benchmarkCompleted':
            benchmarkCompleted();
            break;

        case 'sessionStarted':
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

/******************************************************************************/

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

function refreshResults(details) {
    elemById('sessionRepeat').innerHTML = details.repeatCount;
    elemById('sessionBandwidth').innerHTML = renderNumber(details.bandwidth.toFixed(0)) + ' bytes';
    elemById('sessionNetworkCount').innerHTML = renderNumber(details.networkCount.toFixed(0));
    elemById('sessionCacheCount').innerHTML = renderNumber(details.cacheCount.toFixed(0));
    elemById('sessionFirstPartyScriptCount').innerHTML = details.firstPartyScriptCount.toFixed(1);
    elemById('sessionThirdPartyHostCount').innerHTML = details.thirdPartyHostCount.toFixed(1);
    elemById('sessionFirstPartyCookieSentCount').innerHTML = details.firstPartyCookieSentCount.toFixed(1);
    elemById('sessionThirdPartyCookieSentCount').innerHTML = details.thirdPartyCookieSentCount.toFixed(1);
}

/******************************************************************************/

function startBenchmark() {
    backgroundPagePort.postMessage({
        what: 'startBenchmark',
        tabId: chrome.devtools.inspectedWindow.tabId,
        playlistRaw: elemById('playlistRaw').value
    });
}

function benchmarkStarted() {
    elemById('startButton').style.display = 'none';
    elemById('stopButton').style.display = '';
    elemById('sessionRepeat').innerHTML = '&mdash;';
    //elemById('sessionTime').innerHTML = '&mdash;';
    elemById('sessionBandwidth').innerHTML = '&mdash;';
    elemById('sessionNetworkCount').innerHTML = '&mdash;';
    elemById('sessionCacheCount').innerHTML = '&mdash;';
    elemById('sessionFirstPartyScriptCount').innerHTML = '&mdash;';
    elemById('sessionThirdPartyHostCount').innerHTML = '&mdash;';
    elemById('sessionFirstPartyCookieSentCount').innerHTML = '&mdash;';
    elemById('sessionThirdPartyCookieSentCount').innerHTML = '&mdash;';
}

function stopBenchmark() {
    backgroundPagePort.postMessage({
        what: 'stopBenchmark',
        tabId: chrome.devtools.inspectedWindow.tabId
    });
}

function benchmarkCompleted() {
    elemById('stopButton').style.display = 'none';
    elemById('startButton').style.display = '';
}

function sessionCompleted(details) {
    refreshResults(details);
}

/******************************************************************************/

backgroundPagePort.postMessage({ what: 'getPlaylist' });

elemById('startButton').addEventListener('click', startBenchmark);
elemById('stopButton').addEventListener('click', stopBenchmark);

/******************************************************************************/

});
