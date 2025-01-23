(ns metabase.notification.payload.temp-storage
  "Util to put data into a temporary file and schedule it for deletion after a specified time period.

  Currently used to store card's rows data when sending notification since it can be large and we don't want to keep it in memory."
  (:require
   [clojure.java.io :as io]
   [metabase.util.random :as random]
   [taoensso.nippy :as nippy])
  (:import
   (java.io File)
   (java.util.concurrent Executors ScheduledThreadPoolExecutor)))

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

(defprotocol Cleanable
  (cleanup! [this] "Cleanup any resources associated with this object"))

(deftype TempFileStorage [^File file]
  Cleanable
  (cleanup! [_]
    (when (.exists file)
      (io/delete-file file true)))

  clojure.lang.IDeref
  (deref [_]
    (if (.exists file)
      (read-from-file file)
      (throw (ex-info "File no longer exists" {:file file}))))

  Object
  (toString [_]
    (str "#TempFileStorage{:file " file "}"))

  ;; Add equality behavior
  (equals [_this other]
    (and (instance? TempFileStorage other)
         (= file (.file ^TempFileStorage other))))

  (hashCode [_]
    (.hashCode file)))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defn to-temp-file!
  "Write data to a temporary file. Returns a TempFileStorage type that:
   - Implements IDeref - use @ to read the data from the file
   - Implements Cleanable - call cleanup! when the file is no longer needed"
  [data]
  (let [f (temp-file)]
    (write-to-file f data)
    (TempFileStorage. f)))
