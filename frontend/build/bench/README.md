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

- the first load, with an empty cache,
- the second load, served from the HTTP cache but with V8's code cache cold,
- the loads after that, which are the steady state a returning user sees.

## Running it

Build the variants you want to compare, and keep a copy of each build:

```
bun run build-release:js
cp -R resources/frontend_client /tmp/bench-before
```

Serve each copy and measure it:

```
node frontend/build/bench/serve.js /tmp/bench-before 8099 &
node frontend/build/bench/measure.js http://127.0.0.1:8099/ 8
```

Compare a second variant on another port, with `PORT_OFFSET` so the two runs do
not share a debugging port:

```
node frontend/build/bench/serve.js /tmp/bench-after 8100 &
PORT_OFFSET=1 node frontend/build/bench/measure.js http://127.0.0.1:8100/ 8
```

## Options

| variable | default | what it does |
| -- | -- | -- |
| `CPU_THROTTLE` | `4` | CPU slowdown, so a laptop stands in for a slower machine |
| `NETWORK_MBPS` | `10` | throughput, `0` to leave the network alone |
| `NETWORK_LATENCY` | `40` | added latency in ms |
| `WARM` | unset | keep the cache between runs, to measure a returning user |
| `PORT_OFFSET` | `0` | added to the debugging port `9222` |
| `CHROME_PATH` | macOS Chrome | the browser binary |
| `PRELOAD_PRIORITY` | `low` | `off`, `low` or `high`, for the route preload hints |

## Route preload hints

When the served tree has an `app/dist/route-preloads.json`, `serve.js` injects the
hints for the URL being loaded, matching its patterns the way the backend does.
`PRELOAD_PRIORITY` switches them off or changes their priority, so the choice can
be measured rather than argued.

`measure.js` then reports two times rather than one:

- `medianEntryReadyMs`, when the entry scripts have arrived,
- `medianPreloadReadyMs`, when the page's own chunk has arrived.

The entry scripts are preloaded too, by the build, so they are excluded from the
second number.

## What it does not need

A running Metabase. `serve.js` fills in the index template and answers every API
call with `{}`. The app fails to render on that, which does not matter: the
measurement is finished before the first API response would have been used.
