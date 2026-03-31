(ns metabase.util.quick-task
  "Namespace with helpers for quick tasks. Intended for quick, one-off tasks like re-syncing a table,
  fingerprinting a field, etc."
  (:require
   [clojure.string :as str]
   [metabase.classloader.core :as classloader]
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

(def ^:dynamic *task-timeout-ms*
  "Maximum time in milliseconds a quick-task is allowed to run before being cancelled.
   Default is 2 hours."
  (* 2 60 60 1000))

(defn submit-task!
  "Submit a task to the single thread executor. Each task is run on a separate thread with a timeout
   of [[*task-timeout-ms*]]. If a task exceeds the timeout, it is cancelled and the executor moves on
   to the next queued task. This prevents a single stuck task from blocking all subsequent tasks."
  ^Future [^Callable f]
  {:pre [(some? f)]}
  (let [timeout-ms (long *task-timeout-ms*)
        task       (bound-fn* f)
        wrapped    (fn []
                     (let [fut (FutureTask. ^Callable task)
                           t   (.newThread ^ThreadFactory thread-factory ^Runnable fut)]
                       (.start t)
                       (try
                         (.get fut timeout-ms TimeUnit/MILLISECONDS)
                         (catch TimeoutException _
                           (log/warnf "quick-task exceeded timeout of %d ms, cancelling. Stuck thread stack trace:\n%s"
                                      timeout-ms
                                      (str/join "\n" (map #(str "  " %) (.getStackTrace t))))
                           (.cancel fut true))
                         (catch InterruptedException _
                           (.interrupt (Thread/currentThread)))
                         (catch Exception e
                           (log/warn e "quick-task threw exception")))))]
    (.submit ^ExecutorService @executor ^Callable wrapped)))
