(ns metabase.test.data.interface
  "`Definition` types for databases, tables, fields; related protocols, helper functions.

   Objects that implement `IDatasetLoader` know how to load a `DatabaseDefinition` into an
   actual physical RDMS database. This functionality allows us to easily test with multiple datasets."
  (:require [clojure.string :as s]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field]
                             [table :refer [Table]]))
  (:import clojure.lang.Keyword))

(defrecord FieldDefinition [^String  field-name
                            ^Keyword base-type
                            ^Keyword field-type
                            ^Keyword special-type
                            ^Keyword fk])

(defrecord TableDefinition [^String table-name
                            field-definitions
                            rows])

(defrecord DatabaseDefinition [^String database-name
                               table-definitions
                               ;; Optional. Set this to non-nil to let dataset loaders know that we don't intend to keep it
                               ;; for long -- they can adjust connection behavior, e.g. choosing simple connections instead of creating pools.
                               ^Boolean short-lived?])

(defn escaped-name
  "Return escaped version of database name suitable for use as a filename / database name / etc."
  ^String [^DatabaseDefinition database-definition]
  (s/replace (:database-name database-definition) #"\s+" "_"))


(defprotocol IMetabaseInstance
  (metabase-instance [this context]
    "Return the Metabase object associated with this definition, if applicable. CONTEXT should be the parent
     object of the Metabase object to return (e.g., a pass a `Table` to a `FieldDefintion`). For a `DatabaseDefinition`,
     pass the engine keyword."))

(extend-protocol IMetabaseInstance
  FieldDefinition
  (metabase-instance [this table]
    (sel :one Field :table_id (:id table), :name [in #{(s/lower-case (:field-name this)) ; HACKY!
                                                       (s/upper-case (:field-name this))}]))

  TableDefinition
  (metabase-instance [this database]
    (sel :one Table :db_id (:id database), :name [in #{(s/lower-case (:table-name this))
                                                       (s/upper-case (:table-name this))}]))

  DatabaseDefinition
  (metabase-instance [{:keys [database-name]} engine-kw]
    (assert (string? database-name))
    (assert (keyword? engine-kw))
    (setup-db-if-needed :auto-migrate true)
    (sel :one Database :name database-name, :engine (name engine-kw))))


;; ## IDatasetLoader

(defprotocol IDatasetLoader
  "Methods for creating, deleting, and populating *pyhsical* DBMS databases, tables, and fields."
  (engine [this]
    "Return the engine keyword associated with this database, e.g. `:h2` or `:mongo`.")

  (database->connection-details [this ^DatabaseDefinition database-definition]
    "Return the connection details map that should be used to connect to this database.")

  ;; create-physical-database, etc.
  (create-physical-db! [this ^DatabaseDefinition database-definition]
    "Create a new database from DATABASE-DEFINITION, including adding tables, fields, and foreign key constraints.
     This refers to the actual *DBMS* database itself, *not* a Metabase `Database` object.
     This method should *not* add data to the database, create any metabase objects (such as `Database`), or trigger syncing.")

  (drop-physical-db! [this ^DatabaseDefinition database-definition]
    "Destroy database, if any, associated with DATABASE-DEFINITION.
     This refers to destroying a *DBMS* database -- removing an H2 file, dropping a Postgres database, etc.
     This does not need to remove corresponding Metabase definitions -- this is handled by `DatasetLoader`.")

  (create-physical-table! [this ^DatabaseDefinition database-definition, ^TableDefinition table-definition]
    "Create a new DBMS table/collection/etc for TABLE-DEFINITION. Don't load any data.")

  (load-table-data! [this ^DatabaseDefinition database-definition, ^TableDefinition table-definition]
    "Load data for the DMBS table/collection/etc. corresponding to TABLE-DEFINITION.")

  (drop-physical-table! [this ^DatabaseDefinition database-definition, ^TableDefinition table-definition]
    "Drop the DBMS table/collection/etc. associated with TABLE-DEFINITION."))


;; ## Helper Functions for Creating New Definitions

(defn create-field-definition
  "Create a new `FieldDefinition`; verify its values."
  ^FieldDefinition [{:keys [field-name base-type field-type special-type fk], :as field-definition-map}]
  (assert (or (contains? field/base-types base-type)
              (and (map? base-type)
                   (string? (:native base-type))))
    (str (format "Invalid field base type: '%s'\n" base-type)
         "Field base-type should be either a valid base type like :TextField or be some native type wrapped in a map, like {:native \"JSON\"}."))
  (when field-type
    (assert (contains? field/field-types field-type)))
  (when special-type
    (assert (contains? field/special-types special-type)))
  (map->FieldDefinition field-definition-map))

(defn create-table-definition
  "Convenience for creating a `TableDefinition`."
  ^TableDefinition [^String table-name field-definition-maps rows]
  (map->TableDefinition {:table-name          table-name
                         :rows                rows
                         :field-definitions   (mapv create-field-definition field-definition-maps)}))

(defn create-database-definition
  "Convenience for creating a new `DatabaseDefinition`."
  ^DatabaseDefinition [^String database-name & table-name+field-definition-maps+rows]
  {:pre [(string? database-name)
         (not (s/blank? database-name))]}
  (map->DatabaseDefinition {:database-name     database-name
                            :table-definitions (mapv (partial apply create-table-definition)
                                                     table-name+field-definition-maps+rows)}))

(defmacro def-database-definition
  "Convenience for creating a new `DatabaseDefinition` named by the symbol DATASET-NAME."
  [^clojure.lang.Symbol dataset-name & table-name+field-definition-maps+rows]
  {:pre [(symbol? dataset-name)]}
  `(def ~(vary-meta dataset-name assoc :tag DatabaseDefinition)
     (create-database-definition ~(name dataset-name)
       ~@table-name+field-definition-maps+rows)))
