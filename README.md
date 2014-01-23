# Browser session benchmarker

A developer tool benchmark realistic browser sessions for Chromium-based browsers in
order to extract privacy-releated stats.

This has been created in order to obtain objective numbers for measuring the
impact of browser extensions known as blockers. The original motivation
was [issue #151 of HTTP Switchboard](https://github.com/gorhill/httpswitchboard/issues/151).

This developer tool is rather bare. I keep the output results as simple as can
be because I plan to use these numbers for end users. Streams of statistical
numbers would not be useful to the end-user.

If you want to improve, just fork, or ask for a pull request.

## Usage

Open your browser developer tools. Click the *Browser benchmark*  tab.

On the right there is a text area where you will enter directives. Valid directives
are:
- `clear cache`: empty the browser cache.
- `clear cookie`: remove all cookies.
- `wait n`: wait n seconds between each page load. Default to 1 second.
- `repeat n`: repeat the benchmark n times, return averaged results. Default to 1.
- URL: a URL which will be benchmarked. Must start with `http://` or `https://`.

The results are displayed on the left when the benchmark complete:
- *Bandwidth*: the aggregate of the bandwidth used by *all* URLs in the list.
- *Network hits*: the aggregate number of network hits as a result loading the the URLs in the browser.
- *Cache hits*: the aggregate number of cache hits as a result of loading the URLs in the browser.
- *Hosts*: the aggregate number of hosts.
- *Scripts*: the aggregate number of scripts.
- *Outbound cookies*: the aggregate number of cookies.

Some stats above are also split in *1st* and *3rd* party figures:
- 1st-party: a hostname for which the domain is the same as the domain of the URL of the page. Example: `blarg.foo.com` is 1st party to `www.foo.com`.
- 3rd-party: a hostname for which the domain is different than the domain of the URL of the page. Example: `blarg.bar.com` is 3rd partyto `www.foo.com`.

When the whole benchmark is repeated more than once, all the above values will
be the average of the aggregated measurements.

## Example

    repeat 5
    clear cache
    clear cookies
    http://news.yahoo.com/
    http://www.huffingtonpost.com/
    http://www.cnn.com/
    http://news.google.com/
    http://www.nytimes.com/
    http://www.foxnews.com/
    http://www.theguardian.com/
    http://www.nbcnews.com/
    http://www.dailymail.co.uk/
    http://www.usatoday.com/
    http://www.washingtonpost.com/
    http://www.wsj.com/
    http://www.abcnews.go.com/
    http://news.bbc.co.uk/
    http://www.latimes.com/

And here are [typical results](http://www.wilderssecurity.com/showthread.php?p=2331907#post2331907).

