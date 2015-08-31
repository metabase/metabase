(ns metabase.test.data.generic-sql
  "Common functionality for various Generic SQL dataset loaders."
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.test.data.interface :as i])
  (:import (metabase.test.data.interface DatabaseDefinition
                                         TableDefinition)))

(defn- quote-name [{:keys [quote-character], :or {quote-character \"}} nm]
  (str quote-character nm quote-character))

(defprotocol IGenericSQLDatasetLoader
  "Methods that generic SQL dataset loaders should implement so they can use the shared functions in `metabase.test.data.generic-sql`.

   (Optional) Properies:

   *  `quote-character`: Character to use to quote table & field names in raw SQL. Defaults to double-quote."
  (execute-sql! [this ^DatabaseDefinition database-definition ^String raw-sql]
    "Execute RAW-SQL against  database defined by DATABASE-DEFINITION.")

  (korma-entity [this ^DatabaseDefinition database-definition ^TableDefinition table-definition]
    "Return a Korma entity (e.g., one that can be passed to `select` or `sel` for the table
     defined by TABLE-DEFINITION in the database defined by DATABASE-DEFINITION.")

  (pk-sql-type ^String [this]
    "SQL that should be used for creating the PK Table ID, e.g. `SERIAL` or `BIGINT AUTOINCREMENT`.")

  (pk-field-name ^String [this]
    "e.g. `id` or `ID`.")

  (field-base-type->sql-type ^String [this base-type]
    "Given a `Field.base_type`, return the SQL type we should use for that column when creating a DB."))


(defn create-physical-table! [dataset-loader database-definition {:keys [table-name field-definitions], :as table-definition}]
  ;; Drop the table if it already exists
  (i/drop-physical-table! dataset-loader database-definition table-definition)

  ;; Now create the new table
  (execute-sql! dataset-loader database-definition
    (let [quot (partial quote-name dataset-loader)
          pk-field-name (quot (pk-field-name dataset-loader))]
      (format "CREATE TABLE %s (%s, %s %s, PRIMARY KEY (%s));"
              (quot table-name)
              (->> field-definitions
                   (map (fn [{:keys [field-name base-type]}]
                          (format "%s %s" (quot field-name) (field-base-type->sql-type dataset-loader base-type))))
                   (interpose ", ")
                   (apply str))
              pk-field-name (pk-sql-type dataset-loader)
              pk-field-name))))


(defn drop-physical-table! [dataset-loader database-definition {:keys [table-name]}]
  (execute-sql! dataset-loader database-definition
    (format "DROP TABLE IF EXISTS %s;" (quote-name dataset-loader table-name))))


(defn create-physical-db! [dataset-loader {:keys [table-definitions], :as database-definition}]
  (let [quot (partial quote-name dataset-loader)]
    ;; Create all the Tables
    (doseq [^TableDefinition table-definition table-definitions]
      (i/create-physical-table! dataset-loader database-definition table-definition))

    ;; Now add the foreign key constraints
    (doseq [{:keys [table-name field-definitions]} table-definitions]
      (doseq [{dest-table-name :fk, field-name :field-name} field-definitions]
        (when dest-table-name
          (let [dest-table-name (name dest-table-name)]
            (execute-sql! dataset-loader database-definition
              (format "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s);"
                      (quot table-name)
                      (quot (format "FK_%s_%s_%s" table-name field-name dest-table-name))
                      (quot field-name)
                      (quot dest-table-name)
                      (quot (pk-field-name dataset-loader))))))))))


(defn load-table-data! [dataset-loader database-definition table-definition]
  (let [rows              (:rows table-definition)
        fields-for-insert (map :field-name (:field-definitions table-definition))]
    (-> (korma-entity dataset-loader database-definition table-definition)
        (k/insert (k/values (->> (for [row rows]
                                   (for [v row]
                                     (if (instance? java.util.Date v) (java.sql.Timestamp. (.getTime ^java.util.Date v))
                                         v)))
                                 (map (partial zipmap fields-for-insert))))))))
