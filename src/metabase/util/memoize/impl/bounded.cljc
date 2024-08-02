(ns metabase.util.memoize.impl.bounded
  (:require
   [metabase.util.log :as log]
   #?(:clj  [clojure.core.cache :as cache]
      :cljs [cljs.cache :as cache])))

(cache/defcache BoundedCache [cache threshold]
  cache/CacheProtocol
  (lookup [_ item] (get cache item))
  (lookup [_ item not-found] (get cache item not-found))
  (has?   [_ item] (contains? cache item))
  (hit    [this _item] this)
  (miss   [_ item result]
    (if (< (count cache) threshold)
      (BoundedCache. (assoc cache item result) threshold)
      ;; It's too big! Throw away the original cache and start over!
      (do
        (log/warnf "BoundedCache threshold (%d) exceeded - runaway cache? threshold too small?" threshold)
        (BoundedCache. {item result} threshold))))
  (evict [_ item] (BoundedCache. (dissoc cache item) threshold))
  (seed  [_ base]
    (assert (< (count base) threshold) "cache seed is larger than the threshold")
    (BoundedCache. base threshold)))

(defn bounded-cache-factory
  "Create a bounded [[clojure.core.cache]]-compatible cache. This is a basic map with no bookkeeping on `hit` but
  that will completely discard the cache if it exceeds the `threshold` size.

  Intended to be used with [[metabase.util.memoize/bounded]], rather than called directly."
  [base threshold]
  {:pre [(map? base)]}
  (BoundedCache. base threshold))
