(ns metabase.serialization.dump
  "Serialize entities into a directory structure of YAMLs."
  (:require [clojure.java.io :as io]
            [metabase.models
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [setting :as setting]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.serialization
             [names :refer [fully-qualified-name safe-name]]
             [serialize :refer [serialize]]]
            [yaml.core :as yaml]))

(defn- spit-yaml
  [fname obj]
  (io/make-parents fname)
  (spit fname (yaml/generate-string obj :dumper-options {:flow-style :block})))

(def ^:private as-file?
  (comp (set (map type [Pulse Dashboard Metric Segment Field User])) type))

(defn dump
  "Serialize a entities into a directory structure of YAMLs at `path`."
  [path entities]
  (doseq [entity entities]
    (spit-yaml (if (as-file? entity)
                 (format "%s/%s.yaml" path (fully-qualified-name entity))
                 (format "%s/%s/%s.yaml" path (fully-qualified-name entity) (safe-name entity)))
               (serialize entity))))

(defn dump-dependencies
  "Combine all dependencies into a vector and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/dependencies.yaml")
             (for [{:keys [model_id model dependent_on_id dependent_on_model]} (Dependency)]
               {:dependent_on_id (fully-qualified-name (symbol dependent_on_model) dependent_on_id)
                :model_id        (fully-qualified-name (symbol model) model_id)})))

(defn dump-settings
  "Combine all settings into a map and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/settings.yaml")
             (into {} (for [{:keys [key value]} (setting/all setting/get-string)]
                        [key value]))))

(defn dump-dimensions
  "Combine all dimensions into a vector and dump it into YAML at in the directory for the
   corresponding schema starting at `path`."
  [path]
  (doseq [[table-id dimensions] (group-by (comp :table_id Field :field_id) (Dimension))
          :let [table (Table table-id)]]
    (spit-yaml (format "%s/%s/schemas/%s/dimensions.yaml"
                       path
                       (->> table :db_id (fully-qualified-name Database))
                       (:schema table))
               (for [dimension dimensions]
                 (-> dimension
                     (update :field_id (partial fully-qualified-name Field))
                     (update :human_readable_field_id (partial fully-qualified-name Field))
                     serialize)))))
