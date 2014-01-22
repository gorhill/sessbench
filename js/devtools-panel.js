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

// Initialize domain handler

function readLocalTextFile(path) {
    // If location is local, assume local directory
    var url = path;
    if ( url.search(/^https?:\/\//) < 0 ) {
        url = chrome.runtime.getURL(path);
    }
    // console.log('HTTP Switchboard > readLocalTextFile > "%s"', url);

    // rhill 2013-10-24: Beware, our own requests could be blocked by our own
    // behind-the-scene requests processor.
    var text = null;
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'text';
    xhr.open('GET', url, false);
    xhr.send();
    if ( xhr.status === 200 ) {
        text = xhr.responseText;
    }
    return text;
}

(function(){
    var list = readLocalTextFile('/lib/effective_tld_names.dat');
    window.publicSuffixList.parse(list, punycode.toASCII);
})();

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
            blockCount: 0,
            firstPartyHostCount: 0,
            firstPartyScriptCount: 0,
            firstPartyCookieSentCount: 0,
            thirdPartyHostCount: 0,
            thirdPartyScriptCount: 0,
            thirdPartyCookieSentCount: 0
        };
        var entries = harLog.entries;
        var entry, header;
        var reqHost, reqDomain;
        var i, n = harLog.entries.length;

        // Find page URL reference
        var pageHost = '';
        var pageDomain = '';
        var pageref = '';
        for ( i = 0; i < n; i++ ) {
            entry = entries[i];
            if ( entry.request.url === details.pageURL ) {
                pageref = entry.pageref;
                pageHost = hostFromHeaders(entry.request.headers);
                pageDomain = window.publicSuffixList.getDomain(pageHost);
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
        var blockCount = 0;
        var firstPartyHosts = {};
        var firstPartyScriptCount = 0;
        var firstPartyCookies = {};
        var thirdPartyHosts = {};
        var thirdPartyScriptCount = 0;
        var thirdPartyCookies = {};

        var request, response, mimeType;
        for ( i = 0; i < n; i++ ) {
            entry = entries[i];
            if ( entry.pageref !== pageref ) {
                continue;
            }
            request = entry.request;
            response = entry.response;
            reqHost = hostFromHeaders(request.headers);
            if ( reqHost.length ) {
                reqDomain = window.publicSuffixList.getDomain(reqHost);
                thirdPartyHost = pageDomain && reqDomain && reqDomain !== pageDomain;
                if ( thirdPartyHost ) {
                    thirdPartyHosts[reqHost] = true;
                } else {
                    firstPartyHosts[reqHost] = true;
                }
            }
            // Not blocked
            if ( response.status ) {
                // Not from cache
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
                    extractCookiesToDict(request.cookies, thirdPartyHost ? thirdPartyCookies : firstPartyCookies);
                }
                // From cache
                else {
                    cacheCount++;
                }
            }
            // Blocked
            else {
                blockCount++;
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
        msg.blockCount = blockCount;
        msg.firstPartyHostCount = Object.keys(firstPartyHosts).length;
        msg.firstPartyScriptCount = firstPartyScriptCount;
        msg.firstPartyCookieSentCount = Object.keys(firstPartyCookies).length;
        msg.thirdPartyHostCount = Object.keys(thirdPartyHosts).length;
        msg.thirdPartyScriptCount = thirdPartyScriptCount;
        msg.thirdPartyCookieSentCount = Object.keys(thirdPartyCookies).length;
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

function renderIntToCeil(value) {
    return Math.ceil(value);
}

function refreshResults(details) {
    elemById('sessionRepeat').innerHTML = details.repeatCount;
    elemById('sessionBandwidth').innerHTML = renderNumber(Math.ceil(details.bandwidth)) + ' bytes';
    elemById('sessionRequestCount').innerHTML = renderNumber(Math.ceil(details.networkCount + details.cacheCount));
    elemById('sessionNetworkCount').innerHTML = renderNumber(Math.ceil(details.networkCount));
    elemById('sessionCacheCount').innerHTML = renderNumber(Math.ceil(details.cacheCount));
    elemById('sessionBlockCount').innerHTML = renderNumber(Math.ceil(details.blockCount));
    elemById('sessionHostCount').innerHTML = Math.ceil(details.firstPartyHostCount + details.thirdPartyHostCount);
    elemById('sessionFirstPartyHostCount').innerHTML = Math.ceil(details.firstPartyHostCount);
    elemById('sessionThirdPartyHostCount').innerHTML = Math.ceil(details.thirdPartyHostCount);
    elemById('sessionScriptCount').innerHTML = Math.ceil(details.firstPartyScriptCount + details.thirdPartyScriptCount);
    elemById('sessionFirstPartyScriptCount').innerHTML = Math.ceil(details.firstPartyScriptCount);
    elemById('sessionThirdPartyScriptCount').innerHTML = Math.ceil(details.thirdPartyScriptCount);
    elemById('sessionCookieSentCount').innerHTML = Math.ceil(details.firstPartyCookieSentCount + details.thirdPartyCookieSentCount);
    elemById('sessionFirstPartyCookieSentCount').innerHTML = Math.ceil(details.firstPartyCookieSentCount);
    elemById('sessionThirdPartyCookieSentCount').innerHTML = Math.ceil(details.thirdPartyCookieSentCount);
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
    elemById('sessionRequestCount').innerHTML = '&mdash;';
    elemById('sessionNetworkCount').innerHTML = '&mdash;';
    elemById('sessionCacheCount').innerHTML = '&mdash;';
    elemById('sessionBlockCount').innerHTML = '&mdash;';
    elemById('sessionHostCount').innerHTML = '&mdash;';
    elemById('sessionFirstPartyHostCount').innerHTML = '&mdash;';
    elemById('sessionScriptCount').innerHTML = '&mdash;';
    elemById('sessionFirstPartyScriptCount').innerHTML = '&mdash;';
    elemById('sessionCookieSentCount').innerHTML = '&mdash;';
    elemById('sessionFirstPartyCookieSentCount').innerHTML = '&mdash;';
    elemById('sessionThirdPartyHostCount').innerHTML = '&mdash;';
    elemById('sessionThirdPartyScriptCount').innerHTML = '&mdash;';
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
