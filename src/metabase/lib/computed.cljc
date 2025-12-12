(ns metabase.lib.computed
  "A first cut at smarter, more granular memoization of derived data about queries.

  Only a corner of the vision is implemented here so far, it's expanding as needed in response to user perf issues."
  (:refer-clojure :exclude [get-in])
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [get-in]]))

(def ^:private weak-map
  "A global weak map using queries as keys. Since CLJ(S) maps are immutable, if the map changes it is a new pointer,
  and hence a new cache key. Since the keys of a weak map are weakly held, the map entries will be GC'd when the query
  is, avoiding any extra memory retention."
  #?(:clj  (java.util.Collections/synchronizedMap (java.util.WeakHashMap.))
     :cljs (js/WeakMap.)))

(defn weak-map-population
  "Returns the number of queries currently in the [[weak-map]]. Logged as a Prometheus metric on the BE."
  []
  (count weak-map))

(def ^:dynamic *computed-cache*
  "Dynamic var that holds an atom used for caching derived values for [[with-cache-sticky*]].

  `nil` by default, meaning would-be sticky values are actually cached in the weak map, keyed by query. That's more
  ephemeral than they're declared to be, but it's better than nothing.

  It is always safe, in terms of correctness, to bind this to an `(atom {})` before making lib calls, even with
  multiple queries and edits to queries. This atom is used by [[with-cache-sticky*]], which is only used for
  \"global\" things that apply across queries, like the metadata or columns of a card.

  However, there is no LRU or other eviction logic, and so the memory use will continue to grow as it is held.
  The best approach is to bind this var around a well-defined chunk of related lib calls like `qp.preprocess`.

  Soon this limitation should be removed by making queries `map`-likes with a private atom and evict-on-update."
  nil)

(defn- weak-value-factory [_ignored-key]
  {:sticky (atom {})
   :weak   (atom {})})

(defn- weak-atoms [query]
  #?(:clj  (.computeIfAbsent ^java.util.WeakHashMap weak-map query
                             weak-value-factory)
     :cljs (if (.has weak-map query)
             (.get weak-map query)
             (let [m (weak-value-factory nil)]
               (.set weak-map query m)
               m))))

(defn ^:dynamic *cache-hit-hook*
  "A function `(f cache-key)` called whenever the sticky or ephemeral caches are hit.

  Can be overridden for testing. The default just does a [[log/debug]]."
  [cache-key]
  (log/debug (str (u/colorize :green "HIT: ") (name (first cache-key)) " " (hash (rest cache-key)))))

(defn ^:dynamic *cache-miss-hook*
  "A function `(f cache-key)` called whenever the sticky or ephemeral caches are missed.

  Can be overridden for testing. The default just does a [[log/debug]]."
  [cache-key]
  (log/debug (str (u/colorize :red "MISS: ") (name (first cache-key)) " " (hash (rest cache-key)))))

(defn- cache-through [*atom cache-key f]
  (let [output (get-in @*atom cache-key ::not-found)]
    (if (not= output ::not-found)
      (do (*cache-hit-hook* cache-key)
          output)
      (let [output (f)]
        (swap! *atom assoc-in cache-key output)
        (*cache-miss-hook* cache-key)
        output))))

(defn with-cache-none*
  "A dummy cache function that doesn't actually cache anything, but has the same interface as [[with-cache-sticky*]]
  and friends.

  This is useful for debugging test failures, to see if a particular instance of caching is what's breaking your test.

  It always misses, running the input function every time."
  [_query _cache-key f]
  (f))

;; TODO: Put a macro around this for convenience.
(defn with-cache-sticky*
  "Implements the [[with-cache]] macro.

  Returns the cached value at `cache-key` (a path). If the value doesn't exist yet, runs the factory function and
  caches the value.

  When [[*computed-cache*]] is bound to an atom, these values persist as long as that atom. When [[*computed-cache*]]
  is not set, this uses the same weak map on queries as [[with-cache-ephemeral*]], which is more fragile but better
  than not caching at all.

  No eviction, these values last as long as [[*computed-cache*]] does."
  [query cache-key f]
  (cache-through (or *computed-cache* (-> query weak-atoms :sticky)) cache-key f))

;; TODO: Put a macro around this for convenience.
(defn with-cache-ephemeral*
  "Implements the [[with-cache]] macro.

  Returns the cached value at `cache-key` (a path). If the value doesn't exist yet, runs the factory function and
  caches the value.

  Bound to a weak map using the query as a key, so all cached values are forgotten and GC'd when a query is updated."
  [query cache-key f]
  (cache-through (-> query weak-atoms :weak) cache-key f))
