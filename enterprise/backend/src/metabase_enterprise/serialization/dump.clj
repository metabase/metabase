(ns metabase-enterprise.serialization.dump
  "Serialize entities into a directory structure of YAMLs."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.serialization.names
    :refer [fully-qualified-name name-for-logging safe-name]]
   [metabase-enterprise.serialization.serialize :as serialize]
   [metabase.config :as config]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.database :refer [Database]]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.setting :as setting]
   [metabase.models.table :refer [Table]]
   [metabase.models.user :refer [User]]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn spit-yaml
  "Writes obj to filename and creates parent directories if necessary"
  [filename obj]
  (io/make-parents filename)
  (spit filename (yaml/generate-string obj :dumper-options {:flow-style :block, :split-lines false})))

(defn- as-file?
  [instance]
  (some (fn [model]
          (mi/instance-of? model instance))
        [Pulse Dashboard Metric Segment Field User]))

(defn- spit-entity
  [path entity]
  (let [filename (if (as-file? entity)
                   (format "%s%s.yaml" path (fully-qualified-name entity))
                   (format "%s%s/%s.yaml" path (fully-qualified-name entity) (safe-name entity)))]
    (when (.exists (io/as-file filename))
      (log/warn (str filename " is about to be overwritten."))
      (log/debug (str "With object: " (pr-str entity))))

    (spit-yaml filename (serialize/serialize entity))))

(defn dump
  "Serialize entities into a directory structure of YAMLs at `path`."
  [path & entities]
  (doseq [entity (flatten entities)]
    (try
      (spit-entity path entity)
      (catch Throwable e
        (log/error e (trs "Error dumping {0}" (name-for-logging entity))))))
  (spit-yaml (str path "/manifest.yaml")
             {:serialization-version serialize/serialization-protocol-version
              :metabase-version      config/mb-version-info}))

(defn dump-settings
  "Combine all settings into a map and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/settings.yaml")
             (into {} (for [{:keys [key value]} (setting/admin-writable-site-wide-settings
                                                 :getter (partial setting/get-value-of-type :string))]
                        [key value]))))

(defn dump-dimensions
  "Combine all dimensions into a vector and dump it into YAML at in the directory for the
   corresponding schema starting at `path`."
  [path]
  (doseq [[table-id dimensions] (group-by (comp :table_id Field :field_id) (t2/select Dimension))
          :let [table (t2/select-one Table :id table-id)]]
    (spit-yaml (if (:schema table)
                 (format "%s%s/schemas/%s/dimensions.yaml"
                         path
                         (->> table :db_id (fully-qualified-name Database))
                         (:schema table))
                 (format "%s%s/dimensions.yaml"
                         path
                         (->> table :db_id (fully-qualified-name Database))))
               (map serialize/serialize dimensions))))
