(ns metabase.util.timer-cache
  "A node-local cache of per-key timers, for throttling a write that only needs to happen now and then — a
  last-activity column touched on every request, say. A key comes due at most once per window, and the keys that
  have fallen outside it are pruned.

  Node-local: each node in a cluster lets its own first write per window through, so a throttled column reads as the
  newest of those."
  (:require
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn cache
  "A new, empty timer cache. Values are opaque timers created by [[metabase.util/start-timer]]."
  []
  (atom {}))

(defn record-if-due!
  "Atomically record that `k` is being handled now, if at least `window-ms` has passed since it last was. Returns true
  when the caller should go ahead with the work, false when it is throttled.

  Under contention one of two racing callers returns false, so the work happens at most once per window per key
  rather than at least once."
  [cache window-ms k]
  (let [now     (u/start-timer)
        old-val @cache
        timer   (get old-val k)]
    (if (or (nil? timer)
            (> (u/since-ms timer) window-ms))
      (compare-and-set! cache old-val (assoc old-val k now))
      false)))

(defn prune!
  "Drop the keys whose timer has fallen outside `window-ms`; they throttle nothing any more. Without this the cache
  grows with every key the node has ever seen."
  [cache window-ms]
  (swap! cache
         (fn [m] (into {} (filter (fn [[_ timer]] (<= (u/since-ms timer) window-ms))) m))))

(defn clear!
  "Empty `cache`, so every key comes due again."
  [cache]
  (reset! cache {}))
