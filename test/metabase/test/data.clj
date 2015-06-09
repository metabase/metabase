(ns metabase.test.data
  "Code related to creating and deleting test databases + datasets."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field])
            [metabase.test.data.interface :refer :all])
  (:import clojure.lang.Keyword
           (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

;; ## Functions for Creating New Definitions

(defn create-field-definition
  "Create a new `FieldDefinition`; verify its values."
  ^FieldDefinition [{:keys [field-name base-type field-type special-type fk], :as field-definition-map}]
  (assert (contains? field/base-types base-type))
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
                         :field-definitions   (mapv create-field-definition field-definition-maps)
                         :database-definition (promise)}))

(defn create-database-definition
  "Convenience for creating a new `DatabaseDefinition`."
  ^DatabaseDefinition [^String database-name & table-name+field-definition-maps+rows]
  {:pre [(string? database-name)
         (not (s/blank? database-name))]}
  (map->DatabaseDefinition {:database-name     database-name
                            :table-definitions (mapv (partial apply create-table-definition)
                                                     table-name+field-definition-maps+rows)}))


;; ## Loading / Deleting Test Datasets

(defn get-or-create-database!
  "Create DBMS database associated with DATABASE-DEFINITION, create corresponding Metabase `Databases`/`Tables`/`Fields`, and sync the `Database`."
  [dataset-loader {:keys [database-name], :as ^DatabaseDefinition database-definition}]
  (let [engine (engine dataset-loader)]
    (or (metabase-instance database-definition engine)
        (do
          ;; Create the database
          (log/info (format "Creating %s Database %s..." (name engine) database-name))
          (create-physical-db! dataset-loader database-definition)

          ;; Load data
          (log/info "Loading data...")
          (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
            (log/info (format "Loading data for Table %s..." (:table-name table-definition)))
            (load-table-data! dataset-loader database-definition table-definition))

          ;; Add DB object to Metabase DB
          (log/info "Adding DB to Metabase...")
          (let [db (ins Database
                     :name    database-name
                     :engine  (name engine)
                     :details (database->connection-details dataset-loader database-definition))]

            ;; Sync the database
            (log/info "Syncing DB...")
            (driver/sync-database! db)

            ;; Add extra metadata like Field field-type, base-type, etc.
            (log/info "Adding schema metadata...")
            (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
              (let [table-name (:table-name table-definition)
                    table      (delay (let [table (metabase-instance table-definition db)]
                                        (assert table)
                                        table))]
                (doseq [{:keys [field-name field-type special-type], :as field-definition} (:field-definitions table-definition)]
                  (let [field (delay (let [field (metabase-instance field-definition @table)]
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

(defn remove-database!
  "Delete Metabase `Database`, `Fields` and `Tables` associated with DATABASE-DEFINITION, then remove the physical database from the associated DBMS."
  [dataset-loader ^DatabaseDefinition database-definition]
  ;; Delete the Metabase Database and associated objects
  (cascade-delete (metabase-instance database-definition (engine dataset-loader)))

    ;; now delete the DBMS database
  (drop-physical-db! dataset-loader database-definition))
