(ns metabase.mq.appdb
  "Shared utilities for appdb-backed queue and topic backends: periodic cleanup loops."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Future)))

(set! *warn-on-reflection* true)

(defn start-cleanup-loop!
  "Starts a background future that calls `cleanup-fn` every `interval-ms`.
  Loops while `future-atom` is non-nil. Returns the future."
  [future-atom interval-ms cleanup-fn label]
  (future
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
        (log/info (str label " cleanup loop interrupted"))))))

(defn start-cleanup-loop-once!
  "Idempotently starts a cleanup loop with double-checked locking.
  Uses `future-atom` as both the guard and the storage for the future."
  [future-atom interval-ms cleanup-fn label]
  (when-not @future-atom
    (locking future-atom
      (when-not @future-atom
        (let [f (start-cleanup-loop! future-atom interval-ms cleanup-fn label)]
          (reset! future-atom f)
          (log/info (str label " cleanup loop started")))))))

(defn stop-cleanup-loop!
  "Stops a cleanup loop started by [[start-cleanup-loop-once!]]."
  [future-atom label]
  (when-let [^Future f @future-atom]
    (reset! future-atom nil)
    (.cancel f true)
    (log/info (str label " cleanup loop stopped"))))
