(ns metabase.notification.storage.disk
  (:require
   [clojure.java.io :as io]
   [metabase.notification.storage.protocols :as storage]
   [metabase.util :as u]
   [metabase.util.random :as random])
  (:import
   (java.io File)
   (java.nio.file Files Path)
   (java.time Instant Duration)
   (java.util.concurrent Executors ScheduledFuture TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private ^:const expiry-minutes
  "How long to keep files before deletion"
  5)

(def ^:private temp-dir
  (delay
    (let [dir (io/file (System/getProperty "java.io.tmpdir")
                       (str "metabase-notification-" (random/random-name)))]
      (.mkdirs dir)
      (.deleteOnExit dir)
      dir)))

(def ^:private deletion-scheduler
  (Executors/newScheduledThreadPool 1))

(defn- schedule-deletion!
  "Schedule file for deletion after expiry-minutes"
  [^File file]
  (.schedule deletion-scheduler
             (fn []
               (when (.exists file)
                 (io/delete-file file true)))
             expiry-minutes
             TimeUnit/MINUTES))

(deftype DiskStorage [^:volatile-mutable path]
  storage/NotificationStorage
  (store! [this data]
    (let [file (doto (File/createTempFile "notification-" ".edn" @temp-dir)
                 (.deleteOnExit))]
      (set! path file)
      (spit file (pr-str data))
      this))

  (retrieve [this]
    (let [^File file (.path this)]
      (when (.exists file)
        (read-string (slurp file)))))

  (cleanup! [this]
    (let [^File file (.path this)]
      (when (.exists file)
        (.delete file))))

  clojure.lang.IDeref
  (deref [this]
    (storage/retrieve this))

  Object
  (toString [this]
    (str "#<DiskStorage@" (.path this) ">")))

(defn store!
  "Store data in a temporary file and return a reference to it"
  [data]
  (let [s (DiskStorage. nil)]
    (storage/store! s data)
    s))

(comment
  (ngoc/with-tc
    (store! {:foo "bar"}))
  #_@(.getPath (store! {:foo "bar"})))

;; Ensure the scheduler is shut down when the JVM exits
#_(.addShutdownHook (Runtime/getRuntime)
                    (Thread. ^Runnable #(.shutdown deletion-scheduler)))

(store! {:foo "bar"})
