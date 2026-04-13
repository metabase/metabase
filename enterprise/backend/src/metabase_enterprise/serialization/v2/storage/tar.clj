(ns metabase-enterprise.serialization.v2.storage.tar
  "Streaming tar.gz storage backend — writes entries directly to a TarArchiveOutputStream."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :refer [yaml-content]]
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log])
  (:import
   [java.io OutputStream]
   [org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveOutputStream]
   [org.apache.commons.compress.compressors.gzip GzipCompressorOutputStream GzipParameters]))

(set! *warn-on-reflection* true)

(defn- put-entry!
  "Write a single entry to a TarArchiveOutputStream."
  [^TarArchiveOutputStream tar-out ^String entry-path ^bytes content]
  (let [entry (doto (TarArchiveEntry. entry-path)
                (.setSize (alength content)))]
    (.putArchiveEntry tar-out entry)
    (.write tar-out content)
    (.closeArchiveEntry tar-out)))

(defn- entry-path
  "Build the tar entry path: dirname/resolved.../name.yaml"
  ^String [dirname resolved]
  (str dirname "/" (str/join "/" (drop-last resolved)) "/" (last resolved) ".yaml"))

(defn tar-writer
  "Create a streaming tar.gz storage backend writing to `output`."
  [^OutputStream output ^String dirname]
  (let [gzip (GzipCompressorOutputStream. output (doto (GzipParameters.)
                                                   (.setModificationTime (System/currentTimeMillis))))
        tar  (TarArchiveOutputStream. gzip 512 "UTF-8")
        ctx  (serdes/storage-base-context)]
    (.setLongFileMode tar TarArchiveOutputStream/LONGFILE_POSIX)
    (.setBigNumberMode tar TarArchiveOutputStream/BIGNUMBER_POSIX)
    (reify protocols/ExportWriter
      (store-entity! [_ entity]
        (let [resolved   (storage.util/resolve-storage-path ctx entity)
              path       (entry-path dirname resolved)
              content    (.getBytes ^String (yaml-content entity) "UTF-8")]
          (log/trace "Storing" {:path (serdes/log-path-str (:serdes/meta entity))
                                :file path})
          (put-entry! tar path content)
          (:serdes/meta entity)))

      (store-settings! [_ settings]
        (when (seq settings)
          (let [as-map  (into (sorted-map)
                              (for [{:keys [key value]} settings]
                                [key value]))
                content (.getBytes ^String (yaml-content as-map) "UTF-8")]
            (put-entry! tar (str dirname "/settings.yaml") content))))

      (store-log! [_ content]
        (put-entry! tar (str dirname "/export.log") content))

      (finish! [_]
        (.finish tar)
        (.finish gzip)))))
