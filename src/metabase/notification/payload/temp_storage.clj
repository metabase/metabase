(ns metabase.notification.payload.temp-storage
  "Util to put data into a temporary file and schedule it for deletion after a specified time period.

  Currently used to store card's rows data when sending notification since it can be large and we don't want to keep it in memory."
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log]
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

(defonce ^:private deletion-scheduler
  (delay
    (Executors/newScheduledThreadPool 1)))

(defn- temp-file!
  []
  (doto (File/createTempFile "notification-" ".npy" @temp-dir)
    (.deleteOnExit)))

(defn- write-to-file!
  [^File file data preamble]
  (nippy/freeze-to-file file {:data data :preamble preamble}))

(defn- read-from-file
  [^File file]
  (when (.exists file)
    (let [{:keys [data preamble]} (nippy/thaw-from-file file)]
      (when (seq preamble)
        (log/infof "reading file with preamble: %s" (pr-str preamble)))
      data)))

(.addShutdownHook
 (Runtime/getRuntime)
 (Thread. ^Runnable (fn []
                      (when @deletion-scheduler
                        (.shutdown ^ScheduledThreadPoolExecutor @deletion-scheduler)))))

(defprotocol Cleanable
  (cleanup! [this] "Cleanup any resources associated with this object"))

;; Add a default implementation that does nothing
(extend-protocol Cleanable
  Object
  (cleanup! [_] nil))

(defn- human-readable-size [bytes]
  (cond (nil? bytes) "0 bytes"
        (zero? bytes) "0 bytes"
        :else
        (let [units ["b" "kb" "mb" "gb" "tb"]
              magnitude 1024.0]
          (loop [[unit & remaining] units
                 current (double bytes)]
            (if (and (seq remaining) (> current magnitude))
              (recur remaining (/ current magnitude))
              (format "%.1f %s" current unit))))))

(deftype TempFileStorage [^File file]
  Cleanable
  (cleanup! [_]
    (when (.exists file)
      (io/delete-file file true)))

  clojure.lang.IDeref
  (deref [_]
    (if (.exists file)
      (do
        (log/infof "reading temp storage file of size: %s" (human-readable-size (.length file)))
        (read-from-file file))
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

(defn is-cleanable?
  "Returns true if x implements the Cleanable protocol"
  [x]
  (satisfies? Cleanable x))

(defn to-temp-file!
  "Write data to a temporary file. Returns a TempFileStorage type that:
   - Implements IDeref - use @ to read the data from the file
   - Implements Cleanable - call cleanup! when the file is no longer needed

  You may include an optional `preamble` which will be logged when the file is read. Helpful to leave a breadcrumb of
  which dashboard/card the file might be from. "
  ^TempFileStorage
  ([data] (to-temp-file! data {}))
  ([data preamble]
   (let [f (temp-file!)]
     (write-to-file! f data preamble)
     (log/debug "stored data in temp file" {:length (.length ^File f)})
     (TempFileStorage. f))))
