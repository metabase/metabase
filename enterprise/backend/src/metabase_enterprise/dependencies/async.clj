(ns metabase-enterprise.dependencies.async
  "Single-threaded executor for dependency event work.

  The two expensive post-save handlers (`::check-card-dependents` and `::update-card-dependents-metadata`)
  submit their work here so the HTTP response returns immediately. Tasks execute serially
  to avoid concurrent writes to dependent cards."
  (:require
   [integrant.core :as ig])
  (:import
   (java.util.concurrent Callable Executors ExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(defn- start
  []
  (Executors/newSingleThreadExecutor
   (reify ThreadFactory
     (newThread [_ r]
       (doto (Thread. r)
         (.setName "dependency-event-worker")
         (.setDaemon true))))))

(defn- stop
  [^ExecutorService this]
  (.shutdown this)
  (.awaitTermination this 10 TimeUnit/SECONDS))

(defonce ^:private executor
  (atom (delay (start))))

(defmethod ig/init-key ::executor [_key _args]
  (locking executor
    (swap! executor #(delay (do (when @%
                                  (stop @%))
                                (start))))))

(defmethod ig/halt-key! ::executor [_key _this]
  (locking executor
    (let [old-executor @@executor]
      (reset! executor (delay (do (when old-executor
                                    (stop old-executor))
                                  nil)))
      @@executor)))

(defn submit!
  "Submit dependency work to the single-threaded executor. Tasks execute serially."
  [f]
  (let [task (bound-fn* f)]
    (.submit ^ExecutorService @@executor ^Callable task)))

; Loading and using this namespace from prod namespaces should work without needing an explicit init step.
; Tests should be able to replace the default executor with a new instance with defined start and stop lifecycle
; methods that can be called at the start and end of the test to isolate its activity from other tests.
