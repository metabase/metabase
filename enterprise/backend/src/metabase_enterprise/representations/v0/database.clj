(ns metabase-enterprise.representations.v0.database
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema :v0/database [_]
  ::database)

(set! *warn-on-reflection* true)

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'database' for this schema"}
   :v0/database])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the database, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the database"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the database contains"}
   :string])

(mr/def ::engine
  [:and
   {:description "Database engine type (postgres, mysql, h2, etc.)"}
   ::lib.schema.common/non-blank-string])

;;; ------------------------------------ Connection Details ------------------------------------

(mr/def ::connection-details
  [:map
   {:description "Connection parameters (without secrets)"}
   [:host {:optional true} :string]
   [:port {:optional true} :int]
   [:dbname {:optional true} :string]
   [:user {:optional true} :string]
   [:ssl {:optional true} :boolean]
   [:tunnel {:optional true} :boolean]
   [:warehouse {:optional true} :string] ;; For Snowflake/BigQuery
   [:project-id {:optional true} :string] ;; For BigQuery
   [:dataset-id {:optional true} :string] ;; For BigQuery
   [:region {:optional true} :string] ;; For cloud databases
   [:schema {:optional true} :string] ;; Default schema
   [:options {:optional true} :string] ;; Additional connection options
   ;; Note: passwords, keys, and other secrets should be provided separately
   ])

;;; ------------------------------------ Column Schema ------------------------------------

(mr/def ::column-type
  [:and
   {:description "Column data type"}
   ::lib.schema.common/non-blank-string])

(mr/def ::column
  [:map
   {:description "Column definition"}
   [:name ::lib.schema.common/non-blank-string]
   [:type ::column-type]
   [:description {:optional true} :string]
   [:nullable {:optional true} :boolean]
   [:pk {:optional true} :boolean] ;; Primary key
   [:fk {:optional true} :string] ;; Foreign key reference (table.column)
   ])

;;; ------------------------------------ Table Schema ------------------------------------

(mr/def ::table
  [:map
   {:description "Table definition"}
   [:name ::lib.schema.common/non-blank-string]
   [:description {:optional true} :string]
   [:columns [:sequential ::column]]])

;;; ------------------------------------ Schema (database schema, not Malli) ------------------------------------

(mr/def ::schema
  [:map
   {:description "Database schema definition (e.g., PUBLIC, dbo, etc.)"}
   [:name ::lib.schema.common/non-blank-string]
   [:tables [:sequential ::table]]])

;;; ------------------------------------ Main Database Schema ------------------------------------

(mr/def ::database
  [:map
   {:description "v0 schema for human-writable database representation"}
   [:type ::type]
   [:ref ::ref]
   [:name ::name]
   [:engine ::engine]
   [:description {:optional true} ::description]
   [:connection_details :any]
   [:schemas {:optional true} [:sequential ::schema]]])

(defn- hydrate-env-vars [database]
  (walk/prewalk (fn [node]
                  (if-some [var (v0-common/hydrate-env-var node)]
                    (System/getenv var)
                    node))
                database))

(defmethod import/yaml->toucan :v0/database
  [representation _ref-index]
  (-> representation
      (set/rename-keys {:connection_details :details})
      (select-keys [:name :engine :description :details :schemas :ref])
      (hydrate-env-vars)))

(defmethod import/persist! :v0/database
  [representation ref-index]
  (let [representation (import/yaml->toucan representation ref-index)]
    (if-some [existing (t2/select-one :model/Database
                                      :name (:name representation)
                                      :engine (:engine representation))]
      (do
        (log/info "Found existing database" (:name representation) "with ref" (:ref representation))
        existing)
      (throw (ex-info (str "Could not match database by name: " (:name representation)
                           " and engine: " (:engine representation))
                      {:representation representation})))))

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
                (assoc m k (-> (format "env:%s_%s" ref (name k))
                               (str/replace #"-" "_")
                               (u/upper-case-en)))
                m))
            details
            driver.u/default-sensitive-fields)))

(defmethod export/export-entity :model/Database [database]
  (let [ref (v0-common/unref (v0-common/->ref (:id database) :database))]
    (-> {:type :v0/database
         :ref ref
         :name (:name database)
         :engine (:engine database)
         :description (not-empty (:description database))
         :connection_details (some-> (:details database)
                                     (sanitize-connection-details ref))
         :schemas (get-database-schemas (:id database))}
        v0-common/remove-nils)))

(comment
  (export (t2/select-one :model/Database 52)))
