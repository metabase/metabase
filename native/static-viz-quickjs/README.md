# static-viz-quickjs

`libstaticviz` is a small native library that renders static visualizations by
running the static-viz JS bundle (`lib-static-viz.bundle.js`) on [QuickJS-ng].
Loaded into the JVM via JNA, it is the engine behind the `quickjs` static-viz
renderer (`metabase.channel.render.js.quickjs`), an alternative to the GraalVM
renderer that keeps the JS memory off the JVM heap.

## Design

The library exposes a five-function C API (`svq_*`, see `staticviz.c`) around
a QuickJS runtime with the bundle evaluated into it:

- **Memory** — QuickJS allocates through plain malloc: native memory, invisible
  to `-Xmx` and the GC. Each context caps its JS heap (default 512MB) and
  stack (8MB). The backend pools contexts and shrinks the pool to zero when
  idle, so the memory returns to the OS between rendering bursts.
- **Timeouts** — the engine's interrupt handler enforces a wall-clock deadline
  per call; a timed-out or heap-exhausted context is destroyed, not reused.
- **Sandbox** — the engine exposes only ECMAScript intrinsics: no filesystem,
  network, timers, or module loader. Nothing beyond the `svq_*` surface is
  reachable from JS.
- **Bytecode** — `svq_compile` precompiles the bundle to QuickJS bytecode,
  cutting per-context bundle evaluation from ~750ms to ~300ms. Bytecode is
  only valid for the exact engine build that produced it, so the backend
  compiles at runtime with the same library that executes it.

Handles are not thread-safe; the backend holds each one exclusively per
render via a pool.

## Building

```
./build.sh          # current platform
./build.sh --all    # every supported platform, from one machine
```

Fetches QuickJS-ng at the pinned tag, compiles it in directly, runs
`smoke_test.c` against the result, and installs the library to
`resources/static-viz-quickjs/<os>-<arch>/libstaticviz.{dylib,so}`, where
`metabase.channel.render.js.quickjs` finds it on the classpath. QuickJS is
the default renderer wherever a library build exists;
`MB_STATIC_VIZ_RENDERER=graal` selects GraalVM, which is also the fallback
without one. `MB_STATIC_VIZ_LIBRARY_PATH` overrides the classpath lookup.

`--all` (macOS host) cross-compiles both Mac architectures with Apple clang
and both Linux architectures with `zig cc` against glibc 2.17, so a jar
built on one machine carries a working library for every supported platform.
The smoke test executes against the host-platform library — the host can't
run the others; CI's native runners execution-test those.

The engine requires no Intl support: the bundle carries spec-compliant
`@formatjs` polyfills (see `frontend/src/metabase/static-viz/polyfill.ts`)
that install themselves only on engines without native `Intl`.

[QuickJS-ng]: https://github.com/quickjs-ng/quickjs
