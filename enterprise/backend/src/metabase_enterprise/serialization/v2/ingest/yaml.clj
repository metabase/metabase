(ns metabase-enterprise.serialization.v2.ingest.yaml
  "Note that throughout the YAML file handling, the `:serdes/meta` abstract path is referred to as the \"hierarchy\",
  to avoid confusion with filesystem paths."
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.v2.ingest :as ingest]
            [metabase-enterprise.serialization.v2.utils.yaml :as u.yaml]
            [metabase.util.date-2 :as u.date]
            [yaml.core :as yaml]
            [yaml.reader :as y.reader])
  (:import java.io.File
           java.time.temporal.Temporal))

(extend-type Temporal y.reader/YAMLReader
  (decode [data]
    (u.date/parse data)))

(defn- build-settings [file]
  (let [settings (yaml/from-file file)]
    (for [[k _] settings]
      ; We return a path of 1 item, the setting itself.
      [{:model "Setting" :id (name k)}])))


(defn- build-metas [^File root-dir ^File file]
  (let [path-parts (u.yaml/path-split root-dir file)]
    (if (= ["settings.yaml"] path-parts)
      (build-settings file)
      [(u.yaml/path->hierarchy path-parts)])))

(defn- read-timestamps [entity]
  (->> (keys entity)
       (filter #(.endsWith (name %) "_at"))
       (reduce #(update %1 %2 u.date/parse) entity)))

(defn- ingest-entity
  "Given a hierarchy, read in the YAML file it identifies. Clean it up (eg. parsing timestamps) and attach the
  hierarchy as `:serdes/meta`.
  The returned entity is in \"extracted\" form, ready to be passed to the `load` step.

  The labels are removed from the hierarchy attached at `:serdes/meta`, since the storage system might have damaged the
  original labels by eg. truncating them to keep the file names from getting too long. The labels aren't used at all on
  the loading side, so it's fine to drop them."
  [root-dir hierarchy]
  (let [unlabeled (mapv #(dissoc % :label) hierarchy)]
    (-> (u.yaml/hierarchy->file root-dir hierarchy) ; Use the original hierarchy for the filesystem.
        yaml/from-file
        read-timestamps
        (assoc :serdes/meta unlabeled)))) ; But return the hierarchy without labels.

(deftype YamlIngestion [^File root-dir settings]
  ingest/Ingestable
  (ingest-list [_]
    (eduction (comp (filter (fn [^File f] (.isFile f)))
                    (mapcat (partial build-metas root-dir)))
              (file-seq root-dir)))

  (ingest-one [_ abs-path]
    (let [{:keys [model id]} (first abs-path)]
      (if (and (= (count abs-path) 1)
               (= model "Setting"))
        {:serdes/meta abs-path :key (keyword id) :value (get settings (keyword id))}
        (ingest-entity root-dir abs-path)))))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml"))))
