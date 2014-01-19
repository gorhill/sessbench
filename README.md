# Browser session benchmarker

A developer tool to benchmark (timing, bandwidth) realistic browser sessions
for Chromium-based browsers.

"Realistic" as the type of performance a user could typically experience.

This has been created in order to obtain objective numbers from measuring the
impact of browser extensions known as blockers. The original motivation
was [issue #151 of HTTP Switchboard](https://github.com/gorhill/httpswitchboard/issues/151).

This developer tool is rather bare. I keep the output results as simple as can
be because I plan to use these numbers for end users. Streams of statistical
numbers would not be useful to the end-user. Consider the results approximate,
given that I use Chomium APIs which purpose is not intented for accurate
measurement. But I think the results are still valid and representative especially
when used to compare one blocker to another.

If you want to improve, just fork.


## Usage

Open your browser developer tools. Click the *Browser benchmark*  tab.

On the right there is a text area where you will enter directives. Valid directives
are:
- `clear cache`: empty the browser cache.
- `wait n`: wait n seconds between each page load. Default to 1 second.
- `repeat n`: repeat the benchmark n times, return averaged results. Default to 1.
- URL: a URL which will be benchmarked. Must start with `http://` or `https://`.

The results are displayed on the left when the benchmark complete:
- *Load time*: the aggregate of the load time of *all* URLs in the list.
- *Bandwidth*: the aggregate of the bandwidth used by *all* URLs in the list.
- *Network hits*: the aggregate number of network hits as a result loading the the URLs in the browser.
- *Cache hits*: the aggregate number of cache hits as a result of loading the URLs in the browser.

When the whole benchmark is repeated more than once, all the above values will
be the average of the aggregated measurements.

### Example

```
clear cache
repeat 5

https://news.ycombinator.com/

http://haufler.org/2014/01/19/i-hope-i-dont-get-kicked-out-of-yale-for-this/

http://www.nytimes.com/2014/01/19/opinion/sunday/for-the-love-of-money.html

http://jameso.be/2014/01/19/lisp.html

http://www.asciiflow.com/

http://ftp.freebsd.org/pub/FreeBSD/releases/amd64/amd64/ISO-IMAGES/10.0/

http://opinionator.blogs.nytimes.com/2014/01/18/what-happens-when-the-poor-receive-a-stipend/

http://emacsredux.com/blog/2014/01/19/a-peek-at-emacs-24-dot-4-auto-indentation-by-default/
```
