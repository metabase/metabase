(ns metabase.util.lru-ttl-cache
  "A cache bounded on two axes at once: how many entries it keeps, and how long it keeps them.

  Either bound alone is unsafe for the usual case of remembering an expensive answer about the
  outside world. A TTL alone grows without limit when keys keep changing; an LRU alone will serve an
  answer that went stale years ago. Bounding both makes the worst case `threshold` entries, none
  older than `ttl-ms`.

  Built by nesting two `clojure.core.cache` caches -- an LRU cache over a TTL one -- because
  `core.cache` ships no combined factory. Entries expire lazily, as they do in `core.cache`
  generally: nothing here starts a thread, and an expired entry is only noticed when something asks
  for it."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.cache.wrapped :as cache.wrapped]))

(set! *warn-on-reflection* true)

(def ^:private default-threshold 256)

(defn- backing-cache [ttl-ms threshold]
  ;; LRU outermost, TTL underneath. Only the outer cache is told about a hit, so nesting these the
  ;; other way leaves the LRU ordering by insertion rather than by use -- it would then evict the
  ;; entry being asked for most often. The TTL underneath still expires entries on lookup.
  (cache/lru-cache-factory (cache/ttl-cache-factory {} :ttl ttl-ms) :threshold threshold))

(defn cache
  "Build a cache.

  `:ttl-ms` is required. `:threshold` is the most entries to keep, and `:cache-when` decides which
  computed values are worth keeping -- a value it rejects is returned to the caller but never
  stored."
  [{:keys [ttl-ms threshold cache-when]}]
  (when-not (pos-int? ttl-ms)
    (throw (ex-info "A cache needs a positive :ttl-ms" {:ttl-ms ttl-ms})))
  {:entries    (atom (backing-cache ttl-ms (or threshold default-threshold)))
   :ttl-ms     ttl-ms
   :threshold  (or threshold default-threshold)
   :cache-when (or cache-when (constantly true))})

(defn get-or-compute!
  "Return the cached value for `k`, or call `thunk` and cache what it returns.

  A value the cache's `:cache-when` rejects is dropped immediately after being written, so another
  caller racing this one can briefly see it. Reading through `lookup-or-miss` rather than testing
  the value first is what keeps a hit registering as a use, which is what the LRU orders by."
  [{:keys [entries cache-when]} k thunk]
  (let [value (cache.wrapped/lookup-or-miss entries k (fn [_k] (thunk)))]
    (when-not (cache-when value)
      (cache.wrapped/evict entries k))
    value))

(defn evict!
  "Forget `k`. Call this whenever something makes a cached answer wrong."
  [{:keys [entries]} k]
  (cache.wrapped/evict entries k)
  nil)

(defn invalidate-all!
  "Forget everything."
  [{:keys [entries ttl-ms threshold]}]
  (reset! entries (backing-cache ttl-ms threshold))
  nil)
