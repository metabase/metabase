(ns metabase.notification.payload.temp-storage
  "Util to put data into a temporary file and schedule it for deletion after a specified time period.

  Currently used to store card's rows data when sending notification since it can be large and we don't want to keep it in memory."
  (:require
   [clojure.java.io :as io]
   [metabase.util.random :as random]
   [taoensso.nippy :as nippy])
  (:import
   (java.io File)
   (java.util.concurrent Executors ScheduledThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private temp-file-lifetime-seconds (* 5 60))

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

(defn- write-to-file
  [^File file data]
  (nippy/freeze-to-file file data))

(defn- read-from-file
  [^File file]
  (when (.exists file)
    (nippy/thaw-from-file file)))

(.addShutdownHook
 (Runtime/getRuntime)
 (Thread. ^Runnable (fn []
                      (when @deletion-scheduler
                        (.shutdown ^ScheduledThreadPoolExecutor @deletion-scheduler)))))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defn to-temp-file!
  "Write data to a temporary file and schedule it for deletion after a specified time period.
  The file will be automatically deleted after the given number of seconds.
  Returns a derefable object that, when dereferenced, reads and returns the data from the temporary file.

  Arguments:
    data    - The data to write to the temporary file
    seconds - Optional. Number of seconds before file deletion (default: is [[temp-file-lifetime-seconds]])"
  ([data]
   (to-temp-file! data temp-file-lifetime-seconds))
  ([data seconds]
   (let [f (temp-file)]
     (schedule-deletion! f seconds)
     (write-to-file f data)
     (reify
       clojure.lang.IDeref
       (deref [_] (read-from-file f))))))
