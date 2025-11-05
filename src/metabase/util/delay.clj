(ns metabase.util.delay
  "Re-implementation of `delay` with custom behavior."
  (:import
   (java.util.concurrent.locks ReentrantLock)))

(set! *warn-on-reflection* true)

(deftype DelayWithTTL [ttl-ms f state, ^ReentrantLock lock]
  clojure.lang.IDeref
  (deref [_]
    (.lock lock)
    (try (let [[deadline val] @state
               now (System/currentTimeMillis)]
           (if (or (nil? deadline) (> now deadline))
             (let [new-val (f)]
               (reset! state [(+ now ttl-ms) new-val])
               new-val)
             val))
         (finally (.unlock lock)))))

(defn delay-with-ttl
  "Return a `delay`-like object that caches the result of invoking `(f)` for up to `ttl-ms` milliseconds. Once the TTL
  exceeds, the next deref will invoke `(f)` again."
  [ttl-ms f]
  (->DelayWithTTL ttl-ms f (atom [nil nil]) (ReentrantLock.)))
