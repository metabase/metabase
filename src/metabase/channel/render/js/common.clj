(ns metabase.channel.render.js.common
  "Shared helpers for the pooled static-viz renderers ([[metabase.channel.render.js.graal]] and
  [[metabase.channel.render.js.node]]): the graal bundle's classpath path, the test-init guard, and the
  dirigiste worker-pool factory they both use."
  (:require
   [metabase.config.core :as config])
  (:import
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(def bundle-resource-path
  "Classpath path of the built static-viz bundle the graal renderer evaluates in-process. (The node
  renderer runs its own self-contained bundle from disk instead — see
  [[metabase.channel.render.js.node]].)"
  "frontend_client/app/dist/app-static-viz.bundle.js")

(defn assert-tests-not-initializing!
  "Guard against loading the static-viz bundle as a side effect of loading namespaces: it might not have
  been built yet. If it hasn't, we want a meaningful error (see the fixture in
  [[metabase.channel.render.js.svg-test]]) rather than a meaningless failure at test-runner startup."
  []
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)")))

(defn create-pool
  "Build a dirigiste `Pool` of static-viz workers, each held exclusively per render (so at most `:max-size`
  renders run at once). `:max-size` is the maximum number of concurrent workers. The utilization
  controller targets 100% utilization with a min of 0, so when nothing is rendering the pool shrinks to 0
  and `destroy` is called on each idle worker; it rechecks every 1 minute, so a worker lingers up to 1
  minute before being reaped (keeping it warm through gaps between renders). `(generate)` mints a worker;
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
