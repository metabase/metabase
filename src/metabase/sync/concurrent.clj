(ns metabase.sync.concurrent
  "Namespace with helpers for concurrent tasks in sync. Intended for quick, one-off tasks like re-syncing a table,
  fingerprinting a field, etc."
  (:import
   (java.util.concurrent Callable Executors ExecutorService Future ThreadFactory)))

(set! *warn-on-reflection* true)

(defonce ^:private thread-factory
  (reify ThreadFactory
    (newThread [_ r]
      (doto (Thread. r)
        (.setName "table sync worker")
        (.setDaemon true)))))

(defonce ^:private executor
  (delay (Executors/newFixedThreadPool 1 ^ThreadFactory thread-factory)))

(defn submit-task
  "Submit a task to the single thread executor. This will attempt to serialize repeated requests to sync tables. It
  obviously cannot work across multiple instances."
  ^Future [^Callable f]
  (let [task (bound-fn [] (f))]
    (.submit ^ExecutorService @executor ^Callable task)))
