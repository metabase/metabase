(ns metabase.util.log.throttle
  "Runtime support for [[metabase.util.log/throttle]]. Kept separate from `metabase.util.log` so the
  state and decision logic can be shared by both the CLJ and CLJS expansions of the macro (mirroring
  `metabase.util.log.capture`).")

(defonce ^{:doc "Map of throttle key -> epoch-ms the key last fired. Bounded by the number of call sites."}
  state
  (atom {}))

(defn- now-ms ^long []
  #?(:clj  (System/currentTimeMillis)
     :cljs (.now js/Date)))

(defn allow?
  "Return `true` (and record the current time against `k`) if `k` has not fired within the last
  `interval-ms`, otherwise `false`. Thread-safe; at most one caller per interval is allowed through.

  Optimized for the throttled (suppressed) case, which dominates on the hot paths this is meant for: that
  path is a lock-free read of `state` plus a map lookup — no CAS, no allocation. The atomic `swap!` runs
  only when the window has actually elapsed (≈ once per `interval-ms` per key), with a double-check inside
  to keep it race-correct."
  [k ^long interval-ms]
  (let [now (now-ms)]
    (if (< (- now (long (get @state k 0))) interval-ms)
      ;; fast path: still within the window — no write, no allocation
      false
      ;; slow path: window elapsed; try to claim the slot.
      (let [[old _] (swap-vals! state (fn [m]
                                        (if (>= (- now (long (get m k 0))) interval-ms)
                                          (assoc m k now)
                                          m)))]
        (>= (- now (long (get old k 0))) interval-ms)))))
