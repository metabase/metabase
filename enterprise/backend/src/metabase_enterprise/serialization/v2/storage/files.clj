(ns metabase-enterprise.serialization.v2.storage.files
  "Filesystem storage backend — writes YAML files to a directory tree."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.serialization.dump :refer [spit-yaml!]]
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.serialization.core :as serialization]
   [metabase.util.log :as log])
  (:import
   [java.io File]
   [java.nio.file Path]))

(set! *warn-on-reflection* true)

(defn file-writer
  "Create a filesystem storage backend rooted at `root-dir`."
  [root-dir]
  (reify protocols/ExportWriter
    (store-entities! [_ batch]
      (doseq [[resolved entity] batch
              :let [^File f (io/file root-dir (storage.util/yaml-file-path resolved))]]
        (log/info "Storing" {:path (serialization/log-str entity)
                             :file (str (.relativize (Path/of (str root-dir) (make-array String 0))
                                                     (.toPath f)))})
        (spit-yaml! f (storage.util/without-resources entity))
        (doseq [[segments content] (storage.util/resource-files resolved entity)
                :let [resource (apply io/file root-dir segments)]]
          (io/make-parents resource)
          (spit resource content))))

    (store-settings! [_ settings]
      (when (seq settings)
        (let [as-map (into (sorted-map)
                           (for [{:keys [key value]} settings]
                             [(keyword key) value]))]
          (spit-yaml! (io/file root-dir "settings.yaml") as-map))))

    (store-log! [_ _content]
      nil)

    (finish! [_]
      nil)))
