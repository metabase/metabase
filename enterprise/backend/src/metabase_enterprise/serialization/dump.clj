(ns metabase-enterprise.serialization.dump
  "Serialize entities into a directory structure of YAMLs."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase-enterprise.serialization
             [names :refer [fully-qualified-name name-for-logging safe-name]]
             [serialize :as serialize :refer [serialize]]]
            [metabase.config :as config]
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
            [metabase.util
             [date-2 :as u.date]
             [i18n :as i18n :refer [trs]]]
            [yaml
             [core :as yaml]
             [writer :as y.writer]])
  (:import java.time.temporal.Temporal))

(extend-type Temporal y.writer/YAMLWriter
  (encode [data]
    (u.date/format data)))

(defn- spit-yaml
  [filename obj]
  (io/make-parents filename)
  (spit filename (yaml/generate-string obj :dumper-options {:flow-style :block})))

(def ^:private as-file?
  (comp (set (map type [Pulse Dashboard Metric Segment Field User])) type))

(defn dump
  "Serialize entities into a directory structure of YAMLs at `path`."
  [path & entities]
  (doseq [entity (flatten entities)]
    (try
      (spit-yaml (if (as-file? entity)
                   (format "%s%s.yaml" path (fully-qualified-name entity))
                   (format "%s%s/%s.yaml" path (fully-qualified-name entity) (safe-name entity)))
                 (serialize entity))
      (catch Throwable _
        (log/error (trs "Error dumping {0}" (name-for-logging entity))))))
  (spit-yaml (str path "/manifest.yaml")
             {:serialization-version serialize/serialization-protocol-version
              :metabase-version      config/mb-version-info}))

(defn dump-dependencies
  "Combine all dependencies into a vector and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/dependencies.yaml") (map serialize (Dependency))))

(defn dump-settings
  "Combine all settings into a map and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/settings.yaml")
             (into {} (for [{:keys [key value]} (setting/all :getter setting/get-string)]
                        [key value]))))

(defn dump-dimensions
  "Combine all dimensions into a vector and dump it into YAML at in the directory for the
   corresponding schema starting at `path`."
  [path]
  (doseq [[table-id dimensions] (group-by (comp :table_id Field :field_id) (Dimension))
          :let [table (Table table-id)]]
    (spit-yaml (if (:schema table)
                 (format "%s%s/schemas/%s/dimensions.yaml"
                         path
                         (->> table :db_id (fully-qualified-name Database))
                         (:schema table))
                 (format "%s%s/dimensions.yaml"
                         path
                         (->> table :db_id (fully-qualified-name Database))))
               (map serialize dimensions))))
