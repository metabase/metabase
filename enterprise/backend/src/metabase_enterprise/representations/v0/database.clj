(ns metabase-enterprise.representations.v0.database
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def toucan-model
  "The toucan model keyword associated with database representations"
  :model/Database)

(defmethod v0-common/representation-type :model/Database [_entity]
  :database)

(defn yaml->toucan
  "Convert a v0 database representation to Toucan-compatible data."
  [representation _ref-index]
  (-> representation
      (set/rename-keys {:connection_details :details
                        :display_name :name})
      (select-keys [:name :engine :description :details :schemas])
      (v0-common/hydrate-env-vars)
      (u/remove-nils)))

;;; ------------------------------------ Export Functions ------------------------------------

(defn- get-fk-reference
  "Get the foreign key reference in TABLE.COLUMN format"
  [fk-target-field-id]
  (when fk-target-field-id
    (when-let [target-field (t2/select-one [:model/Field :name :table_id] :id fk-target-field-id)]
      (when-let [target-table-name (t2/select-one-fn :name :model/Table :id (:table_id target-field))]
        (str target-table-name "." (:name target-field))))))

(defn- process-field
  [field]
  (let [fk-ref (when (:fk_target_field_id field)
                 (get-fk-reference (:fk_target_field_id field)))]
    (cond-> {:name (:name field)
             :type (or (:database_type field)
                       (name (or (:base_type field) :unknown)))}
      (:description field) (assoc :description (:description field))
      (= (:database_required field) false) (assoc :nullable true)
      (:pk field) (assoc :pk true)
      fk-ref (assoc :fk fk-ref))))

(defn- get-table-columns
  "Get all columns for a table with their metadata"
  [table-id]
  (->> (t2/select :model/Field :table_id table-id :active true)
       (mapv process-field)))

(defn- process-schema-tables
  [[schema-name tables]]
  {:name (or schema-name "PUBLIC")
   :tables (vec (for [table tables]
                  (cond-> {:name (:name table)}
                    (:description table) (assoc :description (:description table))
                    :always (assoc :columns (get-table-columns (:id table))))))})

(defn- get-database-schemas
  "Get all schemas, tables, and columns for a database"
  [database-id]
  (->> (t2/select :model/Table :db_id database-id :active true)
       (group-by :schema)
       (mapv process-schema-tables)))

(defn- sanitize-connection-details
  "Remove sensitive fields from connection details using Metabase's official list"
  [details ref]
  (when details
    (reduce (fn [m k]
              (if (contains? m k)
                (assoc m k (-> (format "%s_%s" ref (name k))
                               (str/replace #"-" "_")
                               (u/upper-case-en)
                               (->> #_env-name
                                (str "env:"))))
                m))
            details
            driver.u/default-sensitive-fields)))

(defn export-database
  "Export a Database Toucan entity to a v0 database representation."
  [database]
  (let [ref (v0-common/unref (v0-common/->ref (:id database) :database))]
    (-> (ordered-map
         :name ref
         :type :database
         :version :v0
         :engine (:engine database)
         :display_name (:name database)
         :description (not-empty (:description database))
         :connection_details (some-> (:details database)
                                     (sanitize-connection-details ref))
         :schemas (get-database-schemas (:id database)))
        u/remove-nils)))
