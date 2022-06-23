(ns metabase-enterprise.serialization.v2.ingest.yaml
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.v2.ingest :as ingest]
            [yaml.core :as yaml])
  (:import java.io.File))

(defmulti ^:private build-metas
  (fn [^File file] (.getName file)))

(defmethod build-metas "settings.yaml" [file]
  (let [settings (yaml/from-file file)]
    (for [[k _] settings]
      {:type "Setting" :id (name k)})))

(defmethod build-metas :default [^File file]
  (let [model-name   (-> file .getParentFile .getName)
        [_ id label] (re-matches #"^([A-Za-z0-9_-]+)(?:\+(.*))?.yaml$" (.getName file))]
    [(cond-> {:type model-name :id id}
       label (assoc :label label))]))

(defn- ingest-entity [root-dir {:keys [type id label] :as meta-map}]
  (let [filename (if label
                   (str id "+" label ".yaml")
                   (str id ".yaml"))]
    (-> (io/file root-dir type filename)
        yaml/from-file
        (assoc :serdes/meta meta-map))))

(deftype YamlIngestion [^File root-dir settings]
  ingest/Ingestable
  (ingest-list [_]
    (eduction (comp (filter (fn [^File f] (.isFile f)))
                    (mapcat build-metas))
              (file-seq root-dir)))
  (ingest-one [_ {:keys [type id] :as meta-map}]
    (if (= "Setting" type)
      {:serdes/meta meta-map :key (keyword id) :value (get settings (keyword id))}
      (ingest-entity  root-dir meta-map))))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml"))))
