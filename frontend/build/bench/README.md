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
the load. Each is a median over the runs.

| Reading                  | Where it comes from        | What it says                                  |
| ------------------------ | -------------------------- | --------------------------------------------- |
| `ttfb`                   | `responseStart`            | The server started answering.                 |
| `firstContentfulPaint`   | paint entry                | The browser drew something.                   |
| `domContentLoaded`       | `domContentLoadedEventEnd` | The entry scripts downloaded, parsed and ran. |
| `appMounted`             | `mb:app-mounted` mark      | React committed the app shell.                |
| `largestContentfulPaint` | LCP entry                  | The biggest element was drawn.                |
| `pageReady`              | `mb:page-ready` mark       | The route has all its data.                   |
| `load`                   | `loadEventEnd`             | Everything the document referenced arrived.   |

A jar built before these marks existed reports `0` for both, so a backfill over
older commits still produces every other reading. The marks never gate a
measurement.

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

## Running it against a real Metabase

This is what CI does, and it is the accurate option. The document is 136 kb, most
of it the inline settings JSON that precedes the script tags, and only a real
backend produces it.

Start a build, sign in, and measure:

```
MB_DB_FILE=/tmp/bench.db MB_JETTY_PORT=4000 java -jar target/uberjar/metabase.jar &
SESSION_COOKIE=$(node frontend/build/bench/sign-in.js http://localhost:4000) \
  node frontend/build/bench/matrix.js http://localhost:4000/ 8
```

`sign-in.js` creates the first user on a blank instance and signs that user in on
a later run, so it is safe to run again while the backend is up. It seeds no
content, because `index.html` is built from settings and the user alone.

## Running it against a built tree

Use this to compare two chunk layouts without booting a backend. It understates
the cold reading, because the stub document is 2.7 kb rather than 136 kb.

```
bun run build-release:js
cp -R resources/frontend_client /tmp/bench-before
node frontend/build/bench/serve.js /tmp/bench-before 8099 &
node frontend/build/bench/matrix.js http://127.0.0.1:8099/ 8
```

`serve.js` fills in the index template, serves a `.br` beside a file when the
client accepts it, and answers every API call with `{}`. The app fails to render
on that, which does not matter: the measurement is finished before the first API
response would have been used.

To measure one condition rather than the four, call `measure.js` directly:

```
WARM=1 CPU_THROTTLE=4 node frontend/build/bench/measure.js http://127.0.0.1:8099/ 8
```

## Options

`matrix.js` sets the first four itself, one condition at a time. Pass them to
`measure.js` when you call it directly.

| variable          | default      | what it does                                             |
| ----------------- | ------------ | -------------------------------------------------------- |
| `CPU_THROTTLE`    | `4`          | CPU slowdown, so a laptop stands in for a slower machine |
| `NETWORK_MBPS`    | `10`         | throughput, `0` to leave the network alone               |
| `NETWORK_LATENCY` | `40`         | added latency in ms                                      |
| `WARM`            | unset        | keep the cache between runs, to measure a returning user |
| `SESSION_COOKIE`  | unset        | `metabase.SESSION`, to load the page signed in           |
| `PORT_OFFSET`     | `0`          | added to the debugging port `9222`                       |
| `CHROME_PATH`     | macOS Chrome | the browser binary                                       |

## What CI records

`.github/workflows/bundle-load-stats.yml` runs the matrix on every master merge
and appends one row per condition to the `bundle_load_times` table.

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

`bundle-load-stats-backfill.yml` measures recent master commits on demand, so
the chart reads as a trend before the per-merge job has built one. Uberjars are
kept for 30 days, and a commit older than that is skipped. Every backfilled point
comes from one machine in one run, while the live series takes one point a day
from a different runner each time, so the backfilled stretch looks steadier than
what follows it.
