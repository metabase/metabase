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

(defn file-writer
  "Create a filesystem storage backend rooted at `root-dir`, writing each entity at the path `layout` gives it (see
  [[storage.util/storage-context]]), [[storage.util/default-layout]] by default. An entity the layout gives no file is
  not written."
  ([root-dir]
   (file-writer root-dir storage.util/default-layout))
  ([root-dir layout]
   (let [ctx (storage.util/storage-context layout)]
     (reify protocols/ExportWriter
       (store-entity! [_ entity]
         (when-let [resolved (storage.util/resolve-storage-path ctx entity)]
           (let [^File f  (io/file root-dir (storage.util/yaml-file-path resolved))
                 document (storage.util/entity-document ctx entity)]
             (log/info "Storing" {:path (serdes/log-path-str (:serdes/meta entity))
                                  :file (str (.relativize (Path/of (str root-dir) (make-array String 0))
                                                          (.toPath f)))})
             (spit-yaml! f (storage.util/without-resources document))
             (doseq [[segments content] (storage.util/resource-files resolved document)
                     :let [resource (apply io/file root-dir segments)]]
               (io/make-parents resource)
               (spit resource content))))
         (:serdes/meta entity))

       (store-settings! [_ settings]
         (when (seq settings)
           (let [as-map (into (sorted-map)
                              (for [{:keys [key value]} settings]
                                [key value]))]
             (spit-yaml! (io/file root-dir "settings.yaml") as-map))))

       (store-log! [_ _content]
         nil)

       (finish! [_]
         nil)))))
