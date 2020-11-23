(ns metabase.async.streaming-response.thread-pool
  (:require [metabase.config :as config])
  (:import [java.util.concurrent Executors ThreadPoolExecutor]
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(def ^:private ^Long thread-pool-max-size
  (or (config/config-int :mb-async-query-thread-pool-size)
      (config/config-int :mb-jetty-maxthreads)
      50))

(defonce ^:private thread-pool*
  (delay
    (Executors/newFixedThreadPool thread-pool-max-size
                                  (.build
                                   (doto (BasicThreadFactory$Builder.)
                                     (.namingPattern "streaming-response-thread-pool-%d")
                                     ;; Daemon threads do not block shutdown of the JVM
                                     (.daemon true))))))

(defn thread-pool
  "Thread pool for asynchronously running streaming responses."
  ^ThreadPoolExecutor []
  @thread-pool*)

(defn active-thread-count
  "The number of active streaming response threads."
  []
  (.getActiveCount (thread-pool)))

(defn queued-thread-count
  "The number of queued streaming response threads."
  []
  (count (.getQueue (thread-pool))))
