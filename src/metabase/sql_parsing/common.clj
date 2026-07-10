(ns metabase.sql-parsing.common
  "Shared helpers for the pooled sqlglot parsers ([[metabase.sql-parsing.graal]]): the dirigiste
  worker-pool factory, copied from [[metabase.channel.render.js.common]]."
  (:import
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(defn create-pool
  "Build a dirigiste `Pool` of workers, each held exclusively per call (so at most `:max-size`
  calls run at once). `:max-size` is the maximum number of concurrent workers. The utilization
  controller targets 100% utilization with a min of 0, so when nothing is running the pool shrinks to 0
  and `destroy` is called on each idle worker; it rechecks every 1 minute, so a worker lingers up to 1
  minute before being reaped (keeping it warm through gaps between calls). `(generate)` mints a worker;
  `(destroy worker)` tears one down. The other constructor args (queue size, sampling interval) don't
  matter much."
  ^Pool [generate destroy {:keys [max-size]}]
  (let [max-queued-acquires 65000
        sample-period-ms    (.toMillis TimeUnit/MILLISECONDS 25)
        control-period-ms   (.toMillis TimeUnit/MINUTES 1)]
    (Pool. (reify IPool$Generator
             (generate [_ _] (generate))
             (destroy [_ _ worker] (destroy worker)))
           (Pools/utilizationController 1.0 max-size max-size)
           max-queued-acquires
           sample-period-ms
           control-period-ms
           TimeUnit/MILLISECONDS)))
