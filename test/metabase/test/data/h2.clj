(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [clojure.string :as s]
            (korma [core :as k]
                   [db :as kdb])
            [metabase.test.data :refer :all])
  (:import (metabase.test.data DatasetLoader
                               DatabaseDefinition
                               FieldDefinition
                               TableDefinition)))

;; ## DatabaseDefinition extensions

(defprotocol IH2DatabaseDefinition
  "Additional methods for `DatabaseDefinition` used by the H2 dataset loader."
  (filename ^String [this]
    "Return filename that should be used for connecting to and H2 instance of this database (not including the `.mv.db` extension).")

  (connection-details [this]
    "Return a Metabase `Database.details` for an H2 instance of this database.")

  (korma-connection-pool [this]
    "Return an H2 korma connection pool to this database.")

  (exec-sql [this ^String raw-sql]
    "Execute RAW-SQL against H2 instance of this database."))

(extend-protocol IH2DatabaseDefinition
  DatabaseDefinition
  (filename [this]
    (format "%s/target/%s" (System/getProperty "user.dir") (escaped-database-name this)))

  (connection-details [this]
    {:db (format "file:%s;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1" (filename this))})

  (korma-connection-pool [this]
    (kdb/create-db (kdb/h2 (assoc (connection-details this)
                                  :naming {:keys   s/lower-case
                                           :fields s/upper-case}))))

  (exec-sql [this raw-sql]
    (log/info raw-sql)
    (k/exec-raw (korma-connection-pool this) raw-sql)))


;; ## TableDefinition extensions

(defprotocol IH2TableDefinition
  "Additional methods for `TableDefinition` used by the H2 dataset loader."
  (korma-entity [this ^DatabaseDefinition database-definition]))

(extend-protocol IH2TableDefinition
  TableDefinition
  (korma-entity [this database-definition]
    (-> (k/create-entity (:table-name this))
        (k/database (korma-connection-pool database-definition)))))


;; ## Internal Stuff

(def ^:private ^:const field-base-type->sql-type
  "Map of `Field.base_type` to the SQL type we should use for that column when creating a DB."
  {:CharField     "VARCHAR(254)"
   :DateField     "DATE"
   :DateTimeField "TIMESTAMP"
   :FloatField    "DOUBLE"
   :IntegerField  "INTEGER"})

;; ## Public Concrete DatasetLoader instance

(defrecord H2DatasetLoaderDelegate []
  IDatasetLoaderDelegate
  (engine [_]
    :h2)

  (database-definition->connection-details [this database-definition]
    (connection-details database-definition))

  (drop-database! [this database-definition]
    (let [file (io/file (format "%s.mv.db" (filename database-definition)))]
      (when (.exists file)
        (.delete file))))

  (create-table! [this database-definition table-definition]
    ;; Drop the table if it already exists
    (drop-table! this database-definition table-definition)

    ;; Now create the new table
    (exec-sql
     database-definition
     (format "CREATE TABLE \"%s\" (%s, \"ID\" BIGINT AUTO_INCREMENT, PRIMARY KEY (\"ID\"));"
             (s/upper-case (:table-name table-definition))
             (->> (:field-definitions table-definition)
                  (map (fn [{:keys [field-name base-type]}]
                         (format "\"%s\" %s" (s/upper-case field-name) (base-type field-base-type->sql-type))))
                  (interpose ", ")
                  (apply str)))))

  (create-database! [this database-definition]
    ;; Create all the Tables
    (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
      (log/info (format "Creating table '%s'..." (:table-name table-definition)))
      (create-table! this database-definition table-definition))

    ;; Now add the foreign key constraints
    (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
      (let [table-name (s/upper-case (:table-name table-definition))]
        (doseq [{dest-table-name :fk, field-name :field-name} (:field-definitions table-definition)]
          (when dest-table-name
            (let [field-name      (s/upper-case field-name)
                  dest-table-name (s/upper-case (name dest-table-name))]
              (exec-sql
               database-definition
               (format "ALTER TABLE \"%s\" ADD CONSTRAINT IF NOT EXISTS \"FK_%s_%s\" FOREIGN KEY (\"%s\") REFERENCES \"%s\" (\"ID\");"
                       table-name
                       field-name dest-table-name
                       field-name
                       dest-table-name))))))))

  (load-table-data! [this database-definition table-definition]
    (log/info (format "Loading data for %s..." (:table-name table-definition)))
    (let [rows              (:rows table-definition)
          fields-for-insert (map :field-name (:field-definitions table-definition))]

      (-> (korma-entity table-definition database-definition)
          (k/insert (k/values (map (partial zipmap fields-for-insert)
                                   rows))))
      (log/info (format "Inserted %d rows." (count rows)))))

  (drop-table! [this database-definition table-definition]
    (exec-sql
     database-definition
     (format "DROP TABLE IF EXISTS \"%s\";" (s/upper-case (:table-name table-definition))))))

(println "Loading metabase.test.data.h2...")
(defn dataset-loader
  "Return a new DatasetLoader for loading a dataset into H2."
  ^DatasetLoader []
  (->DatasetLoader ^H2DatasetLoaderDelegate (->H2DatasetLoaderDelegate)))
