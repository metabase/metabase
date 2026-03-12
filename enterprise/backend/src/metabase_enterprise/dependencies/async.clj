(ns metabase-enterprise.dependencies.async
  "Single-threaded executor for dependency event work.

  The two expensive post-save handlers (`::check-card-dependents` and `::update-card-dependents-metadata`)
  submit their work here so the HTTP response returns immediately. Tasks execute serially
  to avoid concurrent writes to dependent cards."
  (:require
   [metabase.classloader.core :as classloader])
  (:import
   (java.util.concurrent Callable Executors ExecutorService ThreadFactory)))

(set! *warn-on-reflection* true)

(defonce ^:private executor
  (delay (Executors/newSingleThreadExecutor
          (reify ThreadFactory
            (newThread [_ r]
              (classloader/the-classloader)
              (doto (Thread. r)
                (.setName "dependency-event-worker")
                (.setDaemon true)))))))

(defn submit!
  "Submit dependency work to the single-threaded executor. Tasks execute serially."
  [f]
  (let [task (bound-fn* f)]
    (.submit ^ExecutorService @executor ^Callable task)))
