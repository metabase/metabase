(ns metabase-enterprise.serialization.v2.ingest.yaml
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
      ; We return a hierarchy of 1 item, the setting itself.
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
  (-> (u.yaml/hierarchy->file root-dir hierarchy)
      yaml/from-file
      (assoc :serdes/meta (last hierarchy))
      (read-timestamps)))

(deftype YamlIngestion [^File root-dir settings]
  ingest/Ingestable
  (ingest-list [_]
    (eduction (comp (filter (fn [^File f] (.isFile f)))
                    (mapcat (partial build-metas root-dir)))
              (file-seq root-dir)))

  (ingest-one [_ meta-maps]
    (let [{:keys [model id]} (first meta-maps)]
      (if (and (= 1 (count meta-maps))
               (= "Setting" model))
        {:serdes/meta (first meta-maps) :key (keyword id) :value (get settings (keyword id))}
        (ingest-entity root-dir meta-maps)))))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml"))))

(comment
  (into [] (ingest/ingest-list (ingest-yaml (io/file "/tmp/serdesv2-EHDVDKJCFOTQTVXCJJMD"))))
  )
