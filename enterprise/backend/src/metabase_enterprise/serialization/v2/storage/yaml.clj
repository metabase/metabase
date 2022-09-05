(ns metabase-enterprise.serialization.v2.storage.yaml
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.v2.storage :as storage]
            [metabase-enterprise.serialization.v2.utils.yaml :as u.yaml]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.util.date-2 :as u.date]
            [yaml.core :as yaml]
            [yaml.writer :as y.writer])
  (:import java.time.temporal.Temporal))

(extend-type Temporal y.writer/YAMLWriter
  (encode [data]
    (u.date/format data)))

(defn- spit-yaml
  [file obj]
  (io/make-parents file)
  (spit (io/file file) (yaml/generate-string (into (sorted-map) obj) :dumper-options {:flow-style :block})))

(defn- store-entity! [{:keys [root-dir]} entity]
  (spit-yaml (u.yaml/hierarchy->file root-dir (serdes.base/serdes-path entity))
             (dissoc entity :serdes/meta)))

(defn- store-settings! [{:keys [root-dir]} settings]
  (let [as-map (into (sorted-map)
                     (for [{:keys [key value]} settings]
                       [key value]))]
    (spit-yaml (io/file root-dir "settings.yaml") as-map)))

(defmethod storage/store-all! :yaml [stream opts]
  (when-not (or (string? (:root-dir opts))
                (instance? java.io.File (:root-dir opts)))
    (throw (ex-info ":yaml storage requires the :root-dir option to be a string or File"
                    {:opts opts})))
  (let [settings (atom [])]
    (doseq [entity stream]
      (if (-> entity :serdes/meta last :model (= "Setting"))
        (swap! settings conj entity)
        (store-entity! opts entity)))
    (store-settings! opts @settings)))

(defn store!
  "Helper for storing a serialized database to a tree of YAML files."
  [stream root-dir]
  (storage/store-all! stream {:storage/target :yaml
                              :root-dir       root-dir}))
