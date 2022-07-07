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

(defn- ingest-entity [root-dir hierarchy]
  (let [entity    (-> (u.yaml/hierarchy->file root-dir hierarchy)
                      yaml/from-file
                      (assoc :serdes/meta hierarchy)
                      (read-timestamps))
        ;; Strip the labels off the hierarchy; they might have been manipulated (eg. truncated) by the storage system.
        hierarchy (mapv #(dissoc % :label) hierarchy)]
    (assoc entity :serdes/meta hierarchy)))

(deftype YamlIngestion [^File root-dir settings]
  ingest/Ingestable
  (ingest-list [_]
    (eduction (comp (filter (fn [^File f] (.isFile f)))
                    (mapcat (partial build-metas root-dir)))
              (file-seq root-dir)))

  (ingest-one [_ abs-path]
    (let [{:keys [model id]} (first abs-path)]
      (if (and (= 1 (count abs-path))
               (= "Setting" model))
        {:serdes/meta abs-path :key (keyword id) :value (get settings (keyword id))}
        (ingest-entity root-dir abs-path)))))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml"))))
