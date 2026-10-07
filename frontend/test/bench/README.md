# Bundle load benchmark

Measures how long the initial bundle takes to download, parse and run, so a
change to the chunk layout can be judged on time rather than on bytes alone.

Bytes and time disagree. A layout that ships fewer bytes can be slower to
execute, and one that splits work across files can compile faster while
transferring more. This harness reports the number that settles it.

## What it measures

`domContentLoadedEventEnd`. A `defer` script is guaranteed to have downloaded,
parsed and executed before DOMContentLoaded fires, so it brackets exactly the
work a chunk layout can move around.

Three states are reported, because a layout can help one and hurt another:

- **cold**, the first visit, with an empty cache,
- **warm**, the second visit, served from the HTTP cache but still compiled,
- **steady**, the visits after that, once V8 has cached the compiled code.

DOMContentLoaded is not the whole story, so the harness also reads the rest of
the load.

| Reading                  | Where it comes from        | What it says                                  |
| ------------------------ | -------------------------- | --------------------------------------------- |
| `ttfb`                   | `responseStart`            | The server started answering.                 |
| `firstContentfulPaint`   | paint entry                | The browser drew something.                   |
| `domContentLoaded`       | `domContentLoadedEventEnd` | The entry scripts downloaded, parsed and ran. |
| `appMounted`             | `mb:app-mounted` mark      | React committed the app shell.                |
| `largestContentfulPaint` | LCP entry                  | The biggest element was drawn.                |
| `pageReady`              | `mb:page-ready` mark       | The route has all its data.                   |
| `load`                   | `loadEventEnd`             | Everything the document referenced arrived.   |

A jar built before these marks existed reports `0` for both, and still produces
every other reading. The marks never gate a measurement.

`largestContentfulPaint` needs a `PerformanceObserver`, because these entries
never reach the performance timeline that every other reading comes from. The
harness installs one before the document runs. The browser keeps revising the
value until the user interacts, and the harness reads it once the page reports
ready, so it is a lower bound rather than the final figure.

The two marks come from the app, in
`frontend/src/metabase/utils/performance-marks.ts`. `mb:app-mounted` is recorded
in a layout effect inside the render tree, so every entry reports it.
`mb:page-ready` is opt-in per route, because only the route knows when it is
done: the dashboard records it from `loadingComplete`, where its last card
lands. A route that does not record it reports `0`, so a zero means "not
reported" rather than "instant".

Reading DOMContentLoaded alone understates a route in its own chunk, which is
requested only after the reading is taken. `pageReady` is the one that covers
it.

### One load per state

Each state reports the readings of a single load. It does not take a separate
median for each reading.

For cold and steady, the harness runs the page several times and then picks the
run whose DOMContentLoaded is the median of that series. Every reading in the
state comes from that one run. The second visit happens once per browser
profile, so that state is the run itself.

A separate median per reading describes a load that never happened. It can also
put the readings out of order, and print a page-ready that precedes the TTFB
beside it.

`Cold spread %` still comes from all the cold runs, because a spread is a
property of the series rather than of one load.

## How the network is shaped

The network comes from `tc netem` on the loopback interface, not from the
browser. Browser throttling is applied per request, so it charges every byte the
bandwidth rate wherever that byte sits in the response. A layout that pushes the
script tags past the initial congestion window costs a whole round trip instead,
and only packet-level shaping reproduces that. Measured on the slow condition,
the two models disagree by about 7x on a document that crosses the boundary.

This makes the harness Linux only, and it needs root for `tc`. CI runs on Ubuntu
with passwordless sudo, which is the only place it has to work.

Three details decide whether a reading means anything:

- **Loopback runs at a 65536-byte MTU.** The window is counted in segments, so
  at that MTU the initial ten-segment window holds about 640 kB. Every document
  fits in one flight and the reading comes out the same whatever the layout
  does. `measure.ts` forces `lo` to 1500 and puts it back on exit.
- **Only the backend port is shaped.** The harness drives Chrome over CDP on
  loopback as well. Delaying that channel would move the moment each reading is
  taken without moving the load the reading describes, so a `prio` qdisc and
  four `u32` filters scope netem to the port in the measured URL.
- **A packet crosses `lo` egress once per direction**, so netem is given half of
  `NETWORK_LATENCY`. The variable stays a round trip, the same thing it meant
  when the browser supplied it.

`measure.ts` reads back the MTU and the qdisc after it applies them, and exits
non-zero when either is missing. An unshaped run still reports plausible times,
so a silent failure would be read as a result.

## Running it against a real Metabase

This is what CI does, and it is the accurate option. The document is 136 kb, most
of it the inline settings JSON that precedes the script tags, and only a real
backend produces it.

Start a build, sign in, and measure:

```
MB_DB_FILE=/tmp/bench.db MB_JETTY_PORT=4000 java -jar target/uberjar/metabase.jar &
SESSION_COOKIE=$(bun frontend/test/bench/sign-in.ts http://localhost:4000) \
  bun frontend/test/bench/matrix.ts http://localhost:4000/ 8
```

`sign-in.js` creates the first user on a blank instance and signs that user in on
a later run, so it is safe to run again while the backend is up. It seeds no
content, because `index.html` is built from settings and the user alone.

It sets the site locale to German, so the document carries a translation
catalogue. The user sets no locale of their own and falls back to the site's,
so `index.html` inlines the catalogue twice: once for the user and once for the
site. A change to how locales load shows up in the numbers, where an English
site would hide it.

## Running it against a built tree

Use this to compare two chunk layouts without booting a backend. It understates
the cold reading, because the stub document is 2.7 kb rather than 136 kb.

```
bun run build-release:js
cp -R resources/frontend_client /tmp/bench-before
bun frontend/test/bench/serve.ts /tmp/bench-before 8099 &
bun frontend/test/bench/matrix.ts http://127.0.0.1:8099/ 8
```

`serve.js` fills in the index template, serves a `.br` beside a file when the
client accepts it, and answers every API call with `{}`. The app fails to render
on that, which does not matter: the measurement is finished before the first API
response would have been used.

To measure one condition rather than the four, call `measure.js` directly:

```
WARM=1 CPU_THROTTLE=4 bun frontend/test/bench/measure.ts http://127.0.0.1:8099/ 8
```

## Options

`matrix.js` sets the first four itself, one condition at a time. Pass them to
`measure.js` when you call it directly.

| variable          | default      | what it does                                             |
| ----------------- | ------------ | -------------------------------------------------------- |
| `CPU_THROTTLE`    | `4`          | CPU slowdown, so a laptop stands in for a slower machine |
| `NETWORK_MBPS`    | `10`         | throughput, `0` to leave the network alone               |
| `NETWORK_LATENCY` | `40`         | added round trip in ms, split half per direction         |
| `WARM`            | unset        | keep the cache between runs, to measure a returning user |
| `SESSION_COOKIE`  | unset        | `metabase.SESSION`, to load the page signed in           |
| `PORT_OFFSET`     | `0`          | added to the debugging port `9222`                       |
| `CHROME_PATH`     | macOS Chrome | the browser binary                                       |

Setting `NETWORK_MBPS=0` leaves the network alone, which also leaves the MTU
alone. Those numbers answer a question about parse and execute, and they cannot
be compared against a shaped run.

## What CI records

`.github/workflows/test.bundle-load-stats.yml` runs the matrix on every master
merge and appends one row per condition to the `bundle_load_times` table.

That table has to exist in eng-stats-importer before the first run. The importer
does not create one on demand, and a push to a table it does not know returns a
4xx. The upload treats any failure as a warning and leaves the run green, so a
missing table shows up as an empty chart rather than a red build.

The conditions are a fast and a slow network crossed with a fast and a slow CPU.
The split matters: a slow network dominates the cold reading, because that is
bytes on the wire, and a slow CPU dominates the warm one, because that is parse
and execute. A change that trades bytes for execution moves one and not the
other.

Times are relative to the machine that runs them. A CI runner is slower than a
laptop, so read a number against the same runner's history and not against a
number from anywhere else. Each row carries `Cold spread %`, the interquartile
spread of its cold runs, which is what tells a real regression from a busy
runner.
