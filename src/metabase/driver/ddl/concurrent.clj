(ns metabase.driver.ddl.concurrent
  (:import [java.util.concurrent Callable Executors ExecutorService Future ThreadFactory]))

(defonce ^:private thread-factory
  (reify ThreadFactory
    (newThread [_ r]
      (doto (Thread. r)
        (.setName "ddl worker")
        (.setDaemon true)))))

(defonce ^:private executor
  (delay (Executors/newFixedThreadPool 3 ^ThreadFactory thread-factory)))

(defn submit-task
  "Submit a task to the ddl threadpool."
  ^Future [^Callable f]
  (let [task (bound-fn [] (f))]
    (.submit ^ExecutorService @executor ^Callable task)))
