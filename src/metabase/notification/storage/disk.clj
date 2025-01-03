(ns metabase.notification.storage.disk
  (:require
   [clojure.java.io :as io]
   [metabase.notification.storage.protocols :as storage]
   [metabase.util :as u]
   [metabase.util.random :as random]
   [taoensso.nippy :as nippy])
  (:import
   (java.io File)
   (java.util.concurrent Executors ScheduledThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private temp-dir
  (delay
    (let [dir (io/file (System/getProperty "java.io.tmpdir")
                       (str "metabase-notification-" (random/random-name)))]
      (.mkdirs dir)
      (.deleteOnExit dir)
      dir)))

(def ^:private deletion-scheduler
  (delay
    (Executors/newScheduledThreadPool 1)))

(defn- schedule-deletion!
  "Schedule file for deletion after specified seconds."
  [^File file seconds]
  (.schedule ^ScheduledThreadPoolExecutor @deletion-scheduler
             ^Callable (fn []
                         (when (.exists file)
                           (io/delete-file file true)))
             ^Long seconds
             TimeUnit/SECONDS))

(defn- temp-file
  []
  (doto (File/createTempFile "notification-" ".npy" @temp-dir)
    (.deleteOnExit)))

(deftype DiskStorage [file]
  storage/NotificationStorage
  (store! [this data]
    (nippy/freeze-to-file file data)
    this)

  (retrieve [this]
    (let [^File file (.file this)]
      (when (.exists file)
        (nippy/thaw-from-file file))))

  (cleanup! [this]
    (let [^File file (.file this)]
      (when (.exists file)
        (.delete file))))

  Object
  (toString [this]
    (str "#<DiskStorage@" (.file this) ">")))

(defn to-disk-storage!
  "Store data in a temporary file and return a reference to it.
  Optional expiry-seconds parameter specifies how long to keep the file before deletion (defaults to 5 minutes)"
  ([]
   (to-disk-storage! nil))
  ([data]
   (to-disk-storage! data (* 5 60)))
  ([data expired-seconds]
   (let [f (temp-file)
         s (DiskStorage. f)]
     (u/prog1 (storage/store! s data)
       (-> f (schedule-deletion! expired-seconds))))))

(comment
  (to-disk-storage! {:foo "bar"} 20))

(.addShutdownHook
 (Runtime/getRuntime)
 (Thread. ^Runnable (fn []
                      (when @deletion-scheduler
                        (.shutdown ^ScheduledThreadPoolExecutor @deletion-scheduler)))))
