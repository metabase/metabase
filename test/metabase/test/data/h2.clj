(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [clojure.string :as s]
            (korma [core :as k]
                   [db :as kdb])
            [metabase.test.data.interface :refer :all])
  (:import (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

;; ## DatabaseDefinition helper functions

(defn filename
  "Return filename that should be used for connecting to H2 database defined by DATABASE-DEFINITION.
   This does not include the `.mv.db` extension."
  [^DatabaseDefinition database-definition]
  (format "%s/target/%s" (System/getProperty "user.dir") (escaped-name database-definition)))

(defn connection-details
  "Return a Metabase `Database.details` for H2 database defined by DATABASE-DEFINITION."
  [^DatabaseDefinition database-definition]
  {:db (format (if (:short-lived? database-definition) "file:%s" ; for short-lived connections don't create a server thread and don't use a keep-alive connection
                   "file:%s;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1")
               (filename database-definition))})

(defn korma-connection-pool
  "Return an H2 korma connection pool to H2 database defined by DATABASE-DEFINITION."
  [^DatabaseDefinition database-definition]
  (kdb/create-db (kdb/h2 (assoc (connection-details database-definition)
                                  :naming {:keys   s/lower-case
                                           :fields s/upper-case}))))

(defn exec-sql
  "Execute RAW-SQL against H2 instance of H2 database defined by DATABASE-DEFINITION."
  [^DatabaseDefinition database-definition ^String raw-sql]
  (log/info raw-sql)
  (k/exec-raw (korma-connection-pool database-definition) raw-sql))


;; ## TableDefinition helper functions

(defn korma-entity
  "Return a Korma entity (e.g., one that can be passed to `select` or `sel` for the table
   defined by TABLE-DEFINITION in the H2 database defined by DATABASE-DEFINITION."
  [^TableDefinition table-definition ^DatabaseDefinition database-definition]
  (-> (k/create-entity (:table-name table-definition))
      (k/database (korma-connection-pool database-definition))))


;; ## Internal Stuff

(def ^:private ^:const field-base-type->sql-type
  "Map of `Field.base_type` to the SQL type we should use for that column when creating a DB."
  {:BigIntegerField "BIGINT"
   :BooleanField    "BOOL"
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "DATETIME"
   :DecimalField    "DECIMAL"
   :FloatField      "FLOAT"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

;; ## Public Concrete DatasetLoader instance

;; For some reason this doesn't seem to work if we define IDatasetLoader methods inline, but does work when we explicitly use extend-protocol
(defrecord H2DatasetLoader [])
(extend-protocol IDatasetLoader
  H2DatasetLoader
  (engine [_]
    :h2)

  (database->connection-details [_ database-definition]
    (connection-details database-definition))

  (drop-physical-db! [_ database-definition]
    (let [file (io/file (format "%s.mv.db" (filename database-definition)))]
      (when (.exists file)
        (.delete file))))

  (create-physical-table! [this database-definition table-definition]
    ;; Drop the table if it already exists
    (drop-physical-table! this database-definition table-definition)

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

  (create-physical-db! [this database-definition]
    ;; Create all the Tables
    (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
      (log/info (format "Creating table '%s'..." (:table-name table-definition)))
      (create-physical-table! this database-definition table-definition))

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

  (load-table-data! [_ database-definition table-definition]
    (let [rows              (:rows table-definition)
          fields-for-insert (map :field-name (:field-definitions table-definition))]
      (-> (korma-entity table-definition database-definition)
          (k/insert (k/values (map (partial zipmap fields-for-insert)
                                   rows))))))

  (drop-physical-table! [_ database-definition table-definition]
    (exec-sql
     database-definition
     (format "DROP TABLE IF EXISTS \"%s\";" (s/upper-case (:table-name table-definition))))))

(defn dataset-loader []
  (let [loader (->H2DatasetLoader)]
    (assert (satisfies? IDatasetLoader loader))
    loader))
