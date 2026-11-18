(ns metabase.util.quick-task
  "Namespace with helpers for quick tasks. Intended for quick, one-off tasks like re-syncing a table,
  fingerprinting a field, etc."
  (:require
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Callable Executors ExecutorService Future FutureTask ThreadFactory TimeUnit TimeoutException)))

(set! *warn-on-reflection* true)

(defonce ^:private thread-factory
  (reify ThreadFactory
    (newThread [_ r]
      ;; Ensure that the classloader is in the current thread context so it gets passed on.
      (classloader/the-classloader)
      (doto (Thread. r)
        (.setName "table sync worker")
        (.setDaemon true)))))

(defonce ^:private executor
  (delay (Executors/newFixedThreadPool 1 ^ThreadFactory thread-factory)))

(defn task-timeout-ms
  "Returns the task timeout in milliseconds. Reads from the `MB_QUICK_TASK_TIMEOUT_MINUTES` env var,
   defaulting to 120 minutes (2 hours)."
  []
  (u/minutes->ms (or (config/config-int :mb-quick-task-timeout-minutes) 120)))

(defn run-with-timeout!
  "Run `f` on a thread of its own and return its result, or log a warning and return nil when `f` throws or runs longer
  than `timeout-ms`, by default [[task-timeout-ms]], in which case its thread is interrupted and not waited for."
  ([f]
   (run-with-timeout! f (task-timeout-ms)))
  ([f timeout-ms]
   (let [timeout-ms (long timeout-ms)
         fut        (FutureTask. ^Callable (bound-fn* f))
         t          (.newThread ^ThreadFactory thread-factory ^Runnable fut)]
     (.start t)
     (try
       (.get fut timeout-ms TimeUnit/MILLISECONDS)
       (catch TimeoutException _
         (log/warnf "Task exceeded timeout of %d ms, interrupting it" timeout-ms)
         (.cancel fut true)
         nil)
       (catch InterruptedException _
         (.interrupt (Thread/currentThread)))
       (catch Exception e
         (log/warnf "Task threw exception: %s" (ex-message e)))))))

(defn submit-task!
  "Submit a task to the single thread executor. Each task is run on a separate thread with a timeout
   controlled by the `MB_QUICK_TASK_TIMEOUT_MINUTES` env var (default 120 minutes). If a task exceeds
   the timeout, it is cancelled and the executor moves on to the next queued task. This prevents a
   single stuck task from blocking all subsequent tasks."
  ^Future [^Callable f]
  {:pre [(some? f)]}
  (let [task       (bound-fn* f)
        timeout-ms (task-timeout-ms)]
    (.submit ^ExecutorService @executor ^Callable (fn [] (run-with-timeout! task timeout-ms)))))
