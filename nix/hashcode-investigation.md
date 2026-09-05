# Clojure AOT Classloader Split in Nix-Built JARs

## Summary

Nix-built Metabase JARs crash at startup because Clojure's `RT.load()` loads namespaces from `.cljc` source instead of AOT-compiled `__init.class` files. This creates a classloader split that breaks protocol dispatch.

**Root cause**: Clojure 1.12's `RT.load()` uses `classTime > sourceTime` (strict greater-than, not `>=`) to decide between AOT class and source. In a Nix sandbox, all file timestamps are normalized to the same value. When timestamps are equal, Clojure loads from source — using the `DynamicClassLoader` — while AOT-compiled `reify`/`proxy` objects reference protocol interfaces loaded by the `AppClassLoader`. The `satisfies?` check fails because the two `IntoSchema` interface classes are different objects from different classloaders.

**Fix**: Strip `.clj`/`.cljc` source files from the uberjar when a corresponding `__init.class` exists (`nix/derivation/uberjar.nix`).

## Symptom

Every Nix-built Metabase JAR (full, core, OCI, bare binary) crashes immediately:

```
Exception in thread "main" java.lang.ExceptionInInitializerError
Caused by: clojure.lang.ExceptionInfo: :malli.core/invalid-schema
  {:form [:ref :metabase.lib.schema.binning/strategy]}
```

The official Metabase build produces working JARs from the same source.

## The Error Chain (What We Observed)

1. `metabase.legacy_mbql.schema` loads and calls `resolve-schema` on `::lib.schema.metadata/column`
2. `resolve-schema` walks the schema tree via `mc/walk` with `{::mc/walk-schema-refs true}`
3. Encounters `[:ref :metabase.lib.schema.binning/strategy]` inside the `::binning` schema
4. Malli's `:ref` schema type tries to resolve this reference
5. The lookup fails — even though the schema IS registered in the atom

## Root Cause Analysis

### Step 1: Schemas ARE registered — the lookup is broken

Loading `metabase.lib.schema.binning` directly and checking the registry confirms all 5 schemas (`::strategy`, `::binning`, `::num-bins`, `::bin-width`, `::binning-option`) are present. Even pre-loading binning before `legacy_mbql.schema` doesn't fix the crash.

### Step 2: Protocol dispatch fails

```clojure
(mc/into-schema? cached-ref-schema)  ;; => false!
(satisfies? malli.core/IntoSchema cached-ref-schema)  ;; => false!
```

The `cached-ref-schema` (from `metabase.util.malli.registry`) implements `malli.core/IntoSchema`, but `satisfies?` returns `false`.

### Step 3: Classloader split

```
cached-ref-schema classloader: AppClassLoader
malli.core.IntoSchema classloader: DynamicClassLoader
Same classloader?: false
```

The `IntoSchema` interface exists TWICE:
1. First loaded via `__JVM_DefineClass__` (DynamicClassLoader, compiled from source at 3.5s)
2. Then loaded from JAR (AppClassLoader at 6.3s)

The `cached-ref-schema` reify (AOT, AppClassLoader) implements the AppClassLoader's `IntoSchema`. But protocol dispatch checks against the DynamicClassLoader's `IntoSchema`. Different class objects → `satisfies?` returns false.

### Step 4: Why source loading happens

Clojure 1.12 `RT.load()` bytecode (decompiled from `clojure.lang.RT`):

```java
// offset 120-134 in RT.load(String, boolean)
classTime = lastModified(classURL, classfile);  // from __init.class ZIP entry
sourceTime = lastModified(cljURL, cljfile);      // from .cljc ZIP entry
if (classTime > sourceTime) {                    // STRICT greater-than!
    // load from AOT class
}
// else: fall through to source loading
```

The comparison is `classTime > sourceTime`, NOT `>=`. When timestamps are equal, **source wins**.

### Step 5: Nix normalizes all timestamps

In a Nix sandbox, all file timestamps are set to epoch (or 1980-01-01 in ZIP format). Both `malli/core__init.class` and `malli/core.cljc` have identical timestamps:

```
147444 Tue Jan 01 04:01:00 PST 1980 malli/core.cljc
118563 Tue Jan 01 04:01:00 PST 1980 malli/core__init.class
```

Since `classTime == sourceTime`, and `classTime > sourceTime` is false, Clojure loads from source.

### Why the official build works

The official Metabase build doesn't normalize timestamps. The `__init.class` files are generated AFTER source files are copied, so `classTime > sourceTime` is true, and Clojure correctly uses the AOT class.

## What We Ruled Out

| Hypothesis | Test | Result |
|---|---|---|
| `-XX:hashCode=3` corrupts bytecode | Rebuilt with `JAVA_TOOL_OPTIONS=""` | Same crash. hashCode is NOT the cause. |
| `stripJavaArchivesHook` reorders entries | Rebuilt with `dontStripJavaArchives = true` | Same crash. Not entry ordering. |
| Missing `require` declarations | Checked all ns forms | All correct. |
| Classes missing from JAR | `jar tf` on all uberjars | All `__init.class` files present. |
| Schemas not registering | Loaded `binning` directly, checked `registry*` | All 5 schemas present. |
| Runtime hashCode mismatch | Ran with `-XX:hashCode=3` at runtime | Same crash. |

## The Fix

Strip `.clj`/`.cljc` source files from the uberjar when a corresponding `__init.class` exists. Without source files, `RT.load()` has no choice but to use the AOT class, regardless of timestamps.

Added to `nix/derivation/uberjar.nix` after the `clojure -X:build:build/uberjar` step:

```bash
jar tf "$JAR" > "$ALL_ENTRIES"
grep -E '\.clj[cs]?$' "$ALL_ENTRIES" | while read -r src_entry; do
  base="${src_entry%.*}"
  init_class="${base}__init.class"
  grep -qxF "$init_class" "$ALL_ENTRIES" && echo "$src_entry"
done > "$SOURCES_TO_REMOVE"
xargs -a "$SOURCES_TO_REMOVE" zip -qd "$JAR"
```

This is safe because:
- AOT-compiled `__init.class` contains all compiled code from the source
- Source files are only needed if Clojure decides to recompile (which we don't want)
- The official build also effectively avoids this by having newer class timestamps

## Additional Notes

### `-XX:hashCode=3` is still needed

Reproducibility checks confirmed that without `hashCode=3`, the uberjar is NOT bit-for-bit reproducible (translations and drivers ARE reproducible). The flag is restored in `lib.nix`.

### `dontStripJavaArchives = true` is kept for now

The `stripJavaArchivesHook` took 8+ hours on the uberjar. Since the source-stripping fix handles the timestamp issue directly, and `dontStripJavaArchives` avoids the performance problem, we keep it enabled.

## References

- [Clojure RT.load() source](https://github.com/clojure/clojure/blob/master/src/jvm/clojure/lang/RT.java) — `classTime > sourceTime` at line ~471
- [Clojure hashCode non-determinism](https://ask.clojure.org/index.php/12249)
- [Java+Nix reproducibility (Farid Zakaria)](https://fzakaria.com/2021/06/27/java-nix-reproducibility.html)
- `nix/derivation/uberjar.nix` — the source-stripping post-build step
- `nix/derivation/lib.nix` line 30 — `hashCode=3` flag
- `bin/build/src/build/uberjar.clj` — the AOT compilation entry point
