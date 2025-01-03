(ns metabase.notification.payload.disk-map
  (:require
   [clojure.java.io :as io]
   [metabase.util.random :as random]
   [potemkin :as p]
   [pretty.core :as pretty])
  (:import
   (java.io File)))

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

(defn- temp-file
  []
  (doto (File/createTempFile "notification-" ".edn" @temp-dir)
    (.deleteOnExit)))

#_(def ^:private deletion-scheduler
    (Executors/newScheduledThreadPool 1))

(defn- read-data [^File file]
  (when (.exists file)
    (read-string (slurp file))))

(defn- write-data [^File file data]
  (spit file (pr-str data))
  data)

(p/def-map-type DiskMap [^File file ^:volatile-mutable cached-keys ^:volatile-mutable cached-meta ^Object lock]
  (get [_ k default-value]
    (locking lock
      (when-let [data (read-data file)]
        (get data k default-value))))

  (assoc [_ k v]
    (locking lock
      (let [data     (or (read-data file) {})
            new-data (assoc data k v)]
        (write-data file new-data)
        (set! cached-keys (keys new-data))
        (DiskMap. file cached-keys cached-meta lock))))

  (dissoc [_ k]
    (locking lock
      (when-let [data (read-data file)]
        (let [new-data (dissoc data k)]
          (write-data file new-data)
          (set! cached-keys (keys new-data))
          (DiskMap. file cached-keys cached-meta lock)))))

  (keys [_]
    cached-keys)

  (meta [_] cached-meta)

  (with-meta [this mta]
    (locking lock
      (set! cached-meta mta)
      (DiskMap. file cached-keys cached-meta lock)))

  pretty/PrettyPrintable
  (pretty [this]
    (list `disk-map (.getAbsolutePath file))))

(defn disk-map?
  "Is `x` an instance of [[DiskMap]]?"
  [x]
  (instance? DiskMap x))

(defn cleanup!
  [m]
  (when (disk-map? m)
    (when-let [f (.file m)]
      (when (.exists f)
        (.delete f)))))

(defn to-disk-map
  "Initialize disk storage by creating temp directory if needed and optionally initialize with data"
  ([]
   (to-disk-map nil))
  ([initial-data]
   (let [file (temp-file)]
     (when initial-data
       (write-data file initial-data))
     (DiskMap. file (keys initial-data) nil (Object.)))))

(comment
  #_(to-disk-map {:a 1 :b 2}))
