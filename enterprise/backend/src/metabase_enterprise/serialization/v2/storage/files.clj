(ns metabase-enterprise.serialization.v2.storage.files
  "Filesystem storage backend — writes YAML files to a directory tree."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.serialization.dump :refer [spit-yaml!]]
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log])
  (:import
   [java.io File]
   [java.nio.file Path]))

(set! *warn-on-reflection* true)

(defn- file ^File [ctx root-dir entity]
  (let [resolved (storage.util/resolve-storage-path ctx entity)
        dirnames (drop-last resolved)
        basename (str (last resolved) ".yaml")]
    (apply io/file root-dir (concat dirnames [basename]))))

(defn file-writer
  "Create a filesystem storage backend rooted at `root-dir`."
  [root-dir]
  (let [ctx (serdes/storage-base-context)]
    (reify protocols/ExportWriter
      (store-entity! [_ entity]
        (let [f (file ctx root-dir entity)]
          (log/info "Storing" {:path (serdes/log-path-str (:serdes/meta entity))
                               :file (str (.relativize (Path/of (str root-dir) (make-array String 0))
                                                       (.toPath f)))})
          (spit-yaml! f entity)
          (:serdes/meta entity)))

      (store-settings! [_ settings]
        (when (seq settings)
          (let [as-map (into (sorted-map)
                             (for [{:keys [key value]} settings]
                               [key value]))]
            (spit-yaml! (io/file root-dir "settings.yaml") as-map))))

      (store-log! [_ _content]
        nil)

      (finish! [_]
        nil))))
