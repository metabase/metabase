(ns metabase.util.memoize
  "Cross-platform version of `clojure.core.memoize`.

  In CLJ this re-exports some of the public functions from `clojure.core.memoize`.
  In CLJS it implements the same design in CLJS.

  There are also extra caching primitives here: [[fast-memo]] and [[fast-bounded]] for
  memoization, and [[fast-interner]] for interning (deduping equal values to one shared
  instance, rather than caching a function's outputs)."
  (:require
   #?@(:clj  ([clojure.core.memoize :as memoize])
       :cljs ([metabase.util.memoize.impl.js :as memoize]))
   [metabase.util.memoize.impl.bounded :as bounded]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [memoize
  lru
  memoizer
  memo])

(defn bounded
  "Memoizes a function with zero overhead on a *hit*, but keeping to a bounded size.

  This is intended for functions that have many calls and nearly always *hit*. We want to use [[memo]] but are concerned
  about leaking memory if the set of inputs isn't bounded.

  It works by checking the cache size only on a *miss*: if it has reached the (configurable) threshold, then **discard
  the cache** and start over with an empty map. There's no bookkeeping overhead on a *hit*, which keeps the frequent
  hits very fast. The cost is that it will occasionally recompute even the most frequently hit values.

  The threshold is intended to be big enough to hold everything forever! It's just there as a safety valve in case
  the input set is larger than expected.

  This is not quite a drop-in replacement for [[memo]] (or `clojure.core/memoize`) because those will *never* call the
  inner function twice for the same arguments, but this will.

  Default `:bounded/threshold` is 1024."
  ([f] (bounded f :bounded/threshold 1024))
  ([f tkey threshold]
   (assert (= tkey :bounded/threshold) (str "wrong parameter tkey " tkey))
   (memoize/memoizer f (bounded/bounded-cache-factory {} threshold) {})))

(defn fast-memo
  "Variant of [[memo]] that optimizes a common special case: a function with only a single argument, where that
  argument makes a good map key.

  In CLJ, this uses `ConcurrentHashMap.computeIfAbsent` in Clojure for a significant speedup.
  Note that this also doesn't support the memoization API like `memo-swap!`, `memoized?` etc.
  The key should have a good `Object.hashCode`; Clojure values like strings and keywords have this built in.

  See this thread for an analysis of the performance https://metaboat.slack.com/archives/C04CYTEL9N2/p1702671632956539

  In CLJS, this is identical to [[memo]], but it's defined in both dialects for convenience."
  [f]
  #?(:clj  (let [cache      (java.util.concurrent.ConcurrentHashMap.)
                 mapping-fn (reify java.util.function.Function
                              (apply [_this k]
                                (f k)))]
             (fn [k]
               (.computeIfAbsent cache k mapping-fn)))
     :cljs (memoize/memo f)))

(defn fast-interner
  "Interner: collapses `=`-equal values to a single shared (`identical?`) instance, optionally
  normalizing each value through `canon-fn` first. Like [[fast-memo]] but with two differences
  that matter for interning:

  - It stores the *canonical* value `(canon-fn x)` as the cache key, not the lookup argument `x`,
    so the object retained forever is the canonical one (e.g. a copy whose strings are pooled),
    and the un-normalized input is discarded. `canon-fn` therefore **must return a value `=` to
    its argument** — it normalizes *within* an equivalence class (pool the contents, reorder a
    map) without changing equality. The zero-arg arity uses `identity` (intern values as-is).
  - Concurrent callers converge on a single canonical instance even on a simultaneous miss.

  In CLJ this is backed by a `ConcurrentHashMap`, so it is thread-safe; `canon-fn` may run more
  than once for the same value under contention (extra results are discarded), so it must be pure.
  Keys and values must be non-nil with a good `Object.hashCode` (Clojure values qualify). Like
  [[fast-memo]] it doesn't support the memoization API (`memo-swap!`, `memoized?`, etc.).

  In CLJS (single-threaded) this is a plain atom-backed map with the same contract."
  ([] (fast-interner identity))
  ([canon-fn]
   #?(:clj  (let [cache (java.util.concurrent.ConcurrentHashMap.)]
              (fn [x]
                (or (.get cache x)
                    (let [canon (canon-fn x)]
                      ;; key by `canon`, not `x`: `canon` = `x`, so this lookup/insert hits the
                      ;; same bin a later equal input would, while retaining the canonical object.
                      (or (.putIfAbsent cache canon canon) canon)))))
      :cljs (let [cache (atom {})]
              (fn [x]
                (or (get @cache x)
                    (let [canon (canon-fn x)]
                      (swap! cache assoc canon canon)
                      canon)))))))

(defn fast-bounded
  "Variant of [[bounded]] that optimizes a common special case: a function with only a single argument, where that
  argument makes a good map key.

  In CLJ, this uses `ConcurrentHashMap.computeIfAbsent` in Clojure for a significant speedup.
  Note that this also doesn't support the memoization API like `memo-swap!`, `memoized?` etc.
  The key should have a good `Object.hashCode`; Clojure values like strings and keywords have this built in.

  In CLJS, this is identical to [[bounded]], but it's defined in both dialects for convenience."
  ([f] (fast-bounded f :bounded/threshold 1024))
  ([f tkey threshold]
   (assert (= tkey :bounded/threshold) (str "wrong parameter tkey " tkey))
   #?(:clj  (let [cache      (java.util.concurrent.ConcurrentHashMap.)
                  mapping-fn (reify java.util.function.Function
                               (apply [_this k]
                                 (f k)))]
              (fn [k]
                (when (>= (.size cache) threshold)
                  ;; If the cache gets too large, empty it in place.
                  (.clear cache))
                (.computeIfAbsent cache k mapping-fn)))
      :cljs (bounded f tkey threshold))))
