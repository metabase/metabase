(ns metabase.mq.appdb
  "Shared utilities for appdb-backed queue and topic backends: periodic cleanup loops."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Future)))

(set! *warn-on-reflection* true)

(defn start-cleanup-loop!
  "Starts a background future that calls `cleanup-fn` every `interval-ms`.
  Stores the future in `future-atom`; loops while it is non-nil."
  [future-atom interval-ms cleanup-fn label]
  (let [f (future
            (try
              (loop []
                (when @future-atom
                  (try
                    (cleanup-fn)
                    (catch Exception e
                      (log/error e (str "Error during " label " cleanup"))))
                  (Thread/sleep (long interval-ms))
                  (recur)))
              (catch InterruptedException _
                (log/info (str label " cleanup loop interrupted")))))]
    (reset! future-atom f)
    (log/info (str label " cleanup loop started"))))

(defn stop-cleanup-loop!
  "Stops a cleanup loop started by [[start-cleanup-loop!]]."
  [future-atom label]
  (when-let [^Future f @future-atom]
    (reset! future-atom nil)
    (.cancel f true)
    (log/info (str label " cleanup loop stopped"))))
