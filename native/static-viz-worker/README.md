# static-viz-worker

A small native executable that renders static visualizations by running the
static-viz JS bundle (`lib-static-viz.bundle.js`) on [QuickJS-ng]. It is the
engine behind the `quickjs` static-viz renderer
(`metabase.channel.render.js.quickjs`), the default renderer, which unlike
the in-process GraalVM renderer keeps the JS heap out of the JVM entirely.

## Design

One render per process. The backend spawns a worker, writes the render input
(JSON) to its stdin, reads the result (JSON) from its stdout, and the process
exits. That gives:

- **Memory isolation** — the ~250MB JS working set lives in a short-lived OS
  process, not the JVM heap, and is fully reclaimed after every render.
- **Security isolation** — the engine exposes only ECMAScript intrinsics: no
  filesystem, network, timers, or module loader. The OS process boundary
  contains any engine-level failure, and the JVM side enforces a wall-clock
  timeout by killing the process.
- **Crash isolation** — a pathological input can at worst fail its own
  render.

To skip re-parsing the bundle on every render, the worker can precompile it
to QuickJS bytecode (`compile` mode). The backend does this once per bundle
and caches the result; bytecode is only valid for the exact engine build that
produced it, so caches are keyed on `version` output.

## Commands

```
static-viz-worker version                          # engine build id, for cache keys
static-viz-worker compile <in.js> <out.qbc>        # bundle -> bytecode
static-viz-worker render <bundle.js|.qbc> <fn>     # stdin JSON -> stdout JSON
```

`render` evaluates the bundle and calls `MetabaseStaticViz.<fn>` (e.g.
`renderChart`, `getCellBackgroundColors`) with stdin as its single string
argument. Exit codes: 0 success, 1 JS error (details on stderr), 2 usage/IO
error.

Limits are set per process and configurable via environment:
`STATIC_VIZ_WORKER_MEMORY_LIMIT_MB` (default 512),
`STATIC_VIZ_WORKER_STACK_LIMIT_MB` (default 8).

## Building

```
./build.sh
```

Fetches QuickJS-ng at the pinned tag, links it statically, and installs the
binary to `resources/static-viz-worker/<os>-<arch>/static-viz-worker`, where
`metabase.channel.render.js.quickjs` finds it on the classpath. The backend
uses it by default where a binary is available; `MB_STATIC_VIZ_RENDERER=graal`
selects the GraalVM renderer instead.

The engine requires no Intl support: the bundle carries spec-compliant
`@formatjs` polyfills (see `frontend/src/metabase/static-viz/polyfill.ts`)
that install themselves only on engines without native `Intl`.

[QuickJS-ng]: https://github.com/quickjs-ng/quickjs
