# static-viz-escargot

`libstaticviz` is a native library that renders static visualizations by
running the static-viz JS bundle (`lib-static-viz.bundle.js`) on
[Escargot], Samsung's lightweight embedded JavaScript engine. Loaded into
the JVM via JNA, it is the engine behind the default static-viz renderer
(`metabase.channel.render.js.escargot`), an alternative to the GraalVM
renderer that keeps the JS memory off the JVM heap.

Escargot was chosen over other small engines (QuickJS and its forks) because
it is the only one in its weight class with a complete, native, ICU-backed
ECMA-402 `Intl` implementation: charts format numbers, currencies, and
timezone-aware dates exactly as browsers do, with no polyfill riding along
in the JS bundle.

## Design

The library exposes a five-function C API (`svq_*`, see `staticviz.cpp`)
around an Escargot VM with the bundle evaluated into it:

- **Memory** — the engine allocates native memory, invisible to `-Xmx` and
  the JVM GC. The backend pools contexts and shrinks the pool to zero when
  idle, so the memory returns to the OS between rendering bursts.
- **Intl / ICU** — the engine's Intl is backed by real ICU. On Linux the
  library loads the distribution's `libicu` at runtime via Escargot's
  bundled runtime binder (nothing ICU-related is needed at build time); on
  macOS it links against Homebrew's `icu4c`.
- **Sandbox** — the engine exposes only ECMAScript intrinsics plus a
  stderr-backed `console`: no filesystem, network, timers, or module loader.
- **Threads** — handles are not thread-safe; the backend holds each one
  exclusively per render via a pool, and any JVM thread touching the engine
  is registered with its GC on first use.

## Building

```
./build.sh
```

Fetches Escargot at the pinned commit, links it statically, runs
`smoke_test.c` against the result (including Intl and timezone assertions),
and installs the library to
`resources/static-viz-escargot/<os>-<arch>/libstaticviz.{dylib,so}`, where
`metabase.channel.render.js.escargot` finds it on the classpath. Escargot
is the default renderer wherever a library build exists;
`MB_STATIC_VIZ_RENDERER=graal` selects GraalVM, which is also the fallback
without one. `MB_STATIC_VIZ_LIBRARY_PATH` overrides the classpath lookup.

Requires `cmake`, `ninja`, and a C++17 compiler; macOS additionally needs
`brew install icu4c pkgconf`.

[Escargot]: https://github.com/Samsung/escargot
