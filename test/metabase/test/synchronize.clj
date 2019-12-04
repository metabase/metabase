(ns metabase.test.synchronize
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [colorize.core :as colorize])
  (:import java.util.concurrent.locks.ReentrantReadWriteLock))

(when-let [chan (resolve 'messages-chan)]
  (a/close! (var-get chan)))

(def ^:private messages-chan (a/chan 100))

(a/go
  (loop []
    (when-let [message (a/<! messages-chan)]
      (println message)
      (recur))))

(defn- threadsafe-println [& args]
  (a/put! messages-chan (str/join " " args)))

(def ^:private ^ReentrantReadWriteLock lock (ReentrantReadWriteLock. #_(boolean :fair)))

(def ^:private ^:dynamic *lock* nil)

(defn do-parallel [thunk]
  (if *lock*
    (thunk)
    (try
      (when (.isWriteLocked lock)
        (threadsafe-println (format "%s waiting for a synchronous thread to finish before running in parallel"
                                    thunk)))
      (.. lock readLock lock)
      (binding [*lock* :read]
        (thunk))
      (finally
        (.. lock readLock unlock)))))

(defn do-synchronized [thunk]
  (condp = *lock*
    :write
    (thunk)

    :read
    (try
      (.. lock readLock unlock)
      (binding [*lock* nil]
        (do-synchronized thunk))
      (finally (.. lock readLock lock)))

    (try
      (cond
        (.isWriteLocked lock)
        (threadsafe-println (format "%s waiting for a synchronous thread to finish before running synchronously"
                                    thunk))

        (pos? (.getReadHoldCount lock))
        (threadsafe-println (format "%s waiting for %d threads to finish before running synchronously"
                                    thunk (.getReadHoldCount lock))))
      (.. lock writeLock lock)
      (binding [*lock* :write]
        (threadsafe-println (colorize/red (format "%s running synchronously" thunk)))
        (thunk))
      (finally
        (.. lock writeLock unlock)))))

(defmacro parallel {:style/indent 0} [& body]
  `(do-parallel (fn [] ~@body)))

(defmacro synchronized {:style/indent 0} [& body]
  `(do-synchronized (fn [] ~@body)))
