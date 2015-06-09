(ns metabase.test.data.interface
  (:require [clojure.string :as s]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field]
                             [table :refer [Table]]))
  (:import clojure.lang.Keyword))

(defprotocol IEscapedName
  (^String escaped-name [this]
    "Return escaped version of DATABASE-NAME suitable for use as a filename / database name / etc."))

(defrecord FieldDefinition [^String  field-name
                            ^Keyword base-type
                            ^Keyword field-type
                            ^Keyword special-type
                            ^Keyword fk])

(defrecord TableDefinition [^String table-name
                            field-definitions
                            rows])

(defrecord DatabaseDefinition [^String database-name
                               table-definitions]
  IEscapedName
  (escaped-name [_]
    (s/replace database-name #"\s+" "_")))


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
  (metabase-instance [this engine-kw]
    (assert (keyword? engine-kw))
    (setup-db-if-needed :auto-migrate true)
    (sel :one Database :name (:database-name this) :engine (name engine-kw))))


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
