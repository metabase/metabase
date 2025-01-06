(ns metabase.notification.payload.data-provider
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [taoensso.nippy :as nippy])
  (:import
   (com.google.common.io Files)
   (java.io File)
   (java.util.concurrent Executors ScheduledThreadPoolExecutor)))

(set! *warn-on-reflection* true)

;; ------------------------------------------------------------------------------------------------;;
;;                                           Protocols                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defprotocol DataProvider
  "Protocol for storing and retrieving notification payload data"
  (store! [this dest data] "Store the data and return a reference that can be used to retrieve it later.")
  ;; not sure if we need this tbh
  (entries [this] "Return a list of destination")
  (retrieve [this source] "Retrieve the rows of data.")
  (cleanup! [this] "Clean up all resources"))

;; ------------------------------------------------------------------------------------------------;;
;;                                         DiskDataProvider                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private deletion-scheduler
  (delay
    (Executors/newScheduledThreadPool 1)))

(defn- temp-dir ^File
  []
  (let [temp-path (Files/createTempDir)]
    (.deleteOnExit temp-path)
    temp-path))

(defn- new-file ^File
  [base-dir file-name]
  ;; TODO: throw if exists
  (doto (io/file base-dir file-name)
    (.deleteOnExit)))

(defn- path->file-name
  [path]
  (let [qualified-path (map #(if (keyword? %) (u/qualified-name %) (str %)) path)]
    (str (str/join "_" qualified-path) ".npy")))

(defn- file-name->path
  [^File x]
  (.getName x))

(deftype DiskDataProvider [folder]
  DataProvider
  (store! [this dest-path data]
    (let [file (new-file folder (path->file-name dest-path))]
      (nippy/freeze-to-file file data))
    this)

  (retrieve [_this source-path]
    (let [file (io/file folder (path->file-name source-path))]
      (if (.exists file)
        (nippy/thaw-from-file file)
        (throw (ex-info (format "Data at %s does not exists" file) {:source source-path})))))

  (entries [_this]
    (when (.exists (io/file folder))
      (map file-name->path (.listFiles (io/file folder)))))

  (cleanup! [_this]
    (when (.exists (io/file folder))
      (doseq [f (filter #(.isFile ^File %) (.listFiles (io/file folder)))]
        (.delete ^File f))
      (.delete (io/file folder))))

  Object
  (toString [_this]
    (str "#<DiskDataProvider@" folder ">")))

(.addShutdownHook
 (Runtime/getRuntime)
 (Thread. ^Runnable (fn []
                      (when @deletion-scheduler
                        (.shutdown ^ScheduledThreadPoolExecutor @deletion-scheduler)))))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(mr/def ::EntryRef
  [:tuple
   [:fn #(= ::ref %)]
   :any])

(mu/defn store-rows! :- ::EntryRef
  "Store the data and return a reference that can be used to retrieve it later."
  [data-provider card-id data]
  (let [dest [:rows card-id]]
    (store! data-provider dest data)
    [::ref dest]))

(defn entry-ref?
  "Check if the given object is an entry-ref."
  [x]
  (mr/validate ::EntryRef x))

(mu/defn retrieve-by-ref
  "Retrieve the rows of data by the given entry-ref."
  [data-provider entry-ref]
  (retrieve data-provider (last entry-ref)))

(defn data-provider?
  "Check if the given object satisfies the {[NotificationStorage}] protocol."
  [x]
  (satisfies? DataProvider x))

(defn init-data-provider!
  "Initialize a new DiskDataProvider instance with a temporary directory that'll be cleaned up on exit JVM."
  []
  (DiskDataProvider. (temp-dir)))

(comment
  (let [provider (init-data-provider!)]
    (store! provider ["rows" 1] {:foo "bar"})
    (retrieve provider ["rows" 1])
    #_(cleanup! provider)
    (entries provider)))
