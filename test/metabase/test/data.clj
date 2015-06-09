(ns metabase.test.data
  "Code related to creating and deleting test databases + datasets."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field]
                             [table :refer [Table]]))
  (:import clojure.lang.Keyword))

;; ## FieldDefinition

(defprotocol IFieldDefinition
  "Convenience methods provided by `FieldDefinition`."
  (metabase-field [this table]
    "Return the Metabase `Field` associated with this field definition and Metabase TABLE."))

(defrecord FieldDefinition [^String  field-name
                            ^Keyword base-type
                            ^Keyword field-type
                            ^Keyword special-type
                            ^Keyword fk]
  IFieldDefinition
  (metabase-field [_ table]
    (sel :one Field :table_id (:id table), :name [in #{(s/lower-case field-name) ; HACKY!
                                                       (s/upper-case field-name)}])))

(defn create-field-definition
  "Create a new `FieldDefinition`; verify its values."
  ^FieldDefinition [{:keys [field-name base-type field-type special-type fk], :as field-definition-map}]
  (assert (contains? field/base-types base-type))
  (when field-type
    (assert (contains? field/field-types field-type)))
  (when special-type
    (assert (contains? field/special-types special-type)))
  (map->FieldDefinition field-definition-map))


;; ## TableDefinition

(defprotocol ITableDefinition
  "Convenience methods provided by `TableDefinition`."
  (metabase-table [this database]
    "Return the Metabase `Table` associated with this table definition and Metabase DATABASE."))

(defrecord TableDefinition [^String table-name
                            field-definitions
                            rows]
  ITableDefinition
  (metabase-table [_ database]
    (sel :one Table :db_id (:id database), :name [in #{(s/lower-case table-name) ; HACKY!
                                                       (s/upper-case table-name)}])))

(defn create-table-definition
  "Convenience for creating a `TableDefinition`."
  ^TableDefinition [^String table-name field-definition-maps rows]
  (map->TableDefinition {:table-name        table-name
                         :rows              rows
                         :field-definitions (mapv create-field-definition field-definition-maps)}))


;; ## DatabaseDefinition

(defprotocol IDatabaseDefinition
  "Convenience methods provided by `DatabaseDefinition`."
  (escaped-database-name ^String [this]
    "Return escaped version of DATABASE-NAME suitable for use as a filename / database name / etc.")

  (metabase-database [this ^Keyword engine]
    "Return the Metabase `Database` associated with this database definition."))

(defrecord DatabaseDefinition [^String database-name
                               table-definitions]
  IDatabaseDefinition
  (escaped-database-name [_]
    (s/replace database-name #"\s+" "_"))

  (metabase-database [_ engine]
    (assert (keyword? engine))
    (setup-db-if-needed :auto-migrate true)
    (sel :one Database :name database-name :engine (name engine))))

(defn create-database-definition
  "Convenience for creating a new `DatabaseDefinition`."
  ^DatabaseDefinition [^String database-name & table-name+field-definition-maps+rows]
  {:pre [(string? database-name)
         (not (s/blank? database-name))]}
  (map->DatabaseDefinition
   {:database-name     database-name
    :table-definitions (mapv (partial apply create-table-definition)
                             table-name+field-definition-maps+rows)}))


;; ## IDatasetLoaderDelegate protocol definition

(defprotocol IDatasetLoaderDelegate
  "Methods to implement internal, driver-specific functionality for creating and destroying test databases/datasets."
  (engine ^Keyword [this]
    "Return the engine keyword associated with this database, e.g. `:h2` or `:mongo`.")

  (database-definition->connection-details [this ^DatabaseDefinition database-definition]
    "Return the connection details map that should be used to connect to this database.")

  (create-database! [this ^DatabaseDefinition database-definition]
    "Create a new database from DATABASE-DEFINITION, including adding tables, fields, and foreign key constraints.
     This refers to the actual *DBMS* database itself, *not* a Metabase `Database` object.
     This method should *not* add data to the database, create any metabase objects (such as `Database`), or trigger syncing.")

  (drop-database! [this ^DatabaseDefinition database-definition]
    "Destroy database, if any, associated with DATABASE-DEFINITION.
     This refers to destroying a *DBMS* database -- removing an H2 file, dropping a Postgres database, etc.
     This does not need to remove corresponding Metabase definitions -- this is handled by `DatasetLoader`.")

  (create-table! [this ^DatabaseDefinition database-definition ^TableDefinition table-definition]
    "Create a new DBMS table/collection/etc for TABLE-DEFINITION. Don't load any data.")

  (load-table-data! [this ^DatabaseDefinition database-definition ^TableDefinition table-definition]
    "Load data for the DMBS table/collection/etc. corresponding to TABLE-DEFINITION.")

  (drop-table! [this ^DatabaseDefinition database-definition ^TableDefinition table-definition]
    "Drop the DBMS table/collection/etc. associated with TABLE-DEFINITION."))


;; ## DatasetLoader

(defprotocol IDatasetLoader
  "Public-facing interface for concrete dataset loaders. Methods for creating and destroying test databases/datasets."
  (get-or-create-database! [this ^DatabaseDefinition database-definition]
    "Create DBMS database associated with DATABASE-DEFINITION, create corresponding Metabase `Databases`/`Tables`/`Fields`, and sync the `Database`.")

  (remove-database! [this ^DatabaseDefinition database-definition]
    "Delete Metabase `Database`, `Fields` and `Tables` associated with DATABASE-DEFINITION, then remove the physical database from the associated DBMS."))

(defrecord DatasetLoader [delegate]
  IDatasetLoader
  (get-or-create-database! [this {:keys [database-name], :as database-definition}]
    (println "ENGINE: " engine)
    (let [engine (engine delegate)]
      (or (metabase-database database-definition engine)
          (do
            ;; Create the database
            (log/info (format "Creating %s Database %s..." (name engine) database-name))
            (create-database! delegate database-definition)

            ;; Load data
            (log/info "Loading data...")
            (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
              (log/info (format "Loading data for Table %s..." (:table-name table-definition)))
              (load-table-data! delegate database-definition table-definition))

            ;; Add DB object to Metabase DB
            (log/info "Adding DB to Metabase...")
            (let [db (ins Database
                       :name    database-name
                       :engine  (name engine)
                       :details (database-definition->connection-details delegate database-definition))]

              ;; Sync the database
              (log/info "Syncing DB...")
              (driver/sync-database! db)

              ;; Add extra metadata like Field field-type, base-type, etc.
              (log/info "Adding schema metadata...")
              (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
                (let [table-name (:table-name table-definition)
                      table      (delay (let [table (metabase-table table-definition db)]
                                          (assert table)
                                          table))]
                  (doseq [{:keys [field-name field-type special-type], :as field-definition} (:field-definitions table-definition)]
                    (let [field (delay (let [field (metabase-field field-definition @table)]
                                         (assert field)
                                         field))]
                      (when field-type
                        (log/info (format "SET FIELD TYPE %s.%s -> %s" table-name field-name field-type))
                        (upd Field (:id @field) :field_type (name field-type)))
                      (when special-type
                        (log/info (format "SET SPECIAL TYPE %s.%s -> %s" table-name field-name special-type))
                        (upd Field (:id @field) :special_type (name special-type)))))))

              (log/info "Finished.")
              db)))))

  (remove-database! [_ database-definition]
    ;; Delete the Metabase Database and associated objects
    (cascade-delete (metabase-database database-definition (engine delegate)))

    ;; now delete the DBMS database
    (drop-database! delegate database-definition)))
