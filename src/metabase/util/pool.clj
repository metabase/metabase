(ns metabase.util.pool
  "Dirigiste worker-pool factory, shared by the GraalVM static-viz contexts, the sqlglot contexts, and the
  image-render pixel buffers."
  (:import
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(defn create-pool
  "Build a dirigiste `Pool` of workers, each held exclusively from acquire to release (so at most `:max-size` are in
  use at once; further acquires block). The utilization controller targets 100% utilization with a min of 0, so an
  idle pool shrinks to 0 and `destroy` is called on each idle worker; it rechecks every `:idle-minutes`, so a worker
  lingers up to that long between uses (keeping it warm through short gaps). `(generate)` mints a worker;
  `(destroy worker)` tears one down. The other constructor args (queue size, sampling interval) don't matter much."
  ^Pool [generate destroy {:keys [max-size idle-minutes]}]
  (let [max-queued-acquires 65000
        sample-period-ms    (.toMillis TimeUnit/MILLISECONDS 25)
        control-period-ms   (.toMillis TimeUnit/MINUTES idle-minutes)]
    (Pool. (reify IPool$Generator
             (generate [_ _] (generate))
             (destroy [_ _ worker] (destroy worker)))
           (Pools/utilizationController 1.0 max-size max-size)
           max-queued-acquires
           sample-period-ms
           control-period-ms
           TimeUnit/MILLISECONDS)))
