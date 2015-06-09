(ns metabase.test.data.interface
  (:require [clojure.string :as s])
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


;; ## IDatasetLoader

(defprotocol IDatasetLoader
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
