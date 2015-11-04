(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            (korma [core :as k]
                   [db :as kdb])
            [metabase.driver.sqlserver :refer [sqlserver]]
            (metabase.test.data [generic-sql :as generic]
                                [interface :refer :all])
            [metabase.util :as u])
  (:import (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "BIGINT"
   :BooleanField    "BOOLEAN" ; Synonym of TINYINT(1)
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "TIMESTAMP"
   :DecimalField    "DECIMAL"
   :FloatField      "FLOAT"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

(defn- db-connection-details [& [db-name]]
  {:host       "sqlservertestdb.ce4kuivej1tq.us-east-1.rds.amazonaws.com"
   :port       1433
   :user       "cam"
   :password   "12345678"
   :db         db-name
   :make-pool? false})

(defn- db-spec [& [db-name]]
  ((:connection-details->spec sqlserver) (db-connection-details db-name)))

(let [colors (cycle ['red 'green 'blue 'cyan 'magenta 'white 'yellow])
      i      (atom 0)]
  (defn- next-color []
    (swap! i inc)
    (nth colors @i)))

(defn- execute! [db-name & format-strings]
  (let [color (next-color)]
    (println (u/format-color color "SQL [%s] -> %s" (or db-name "no db") (apply format format-strings)))
    (try
      (jdbc/with-db-connection [conn (db-spec db-name)]
        (jdbc/execute! conn [(apply format format-strings)] :transaction? true))
      (println (u/format-color color "[OK]"))
      (catch java.sql.SQLException e
        (println (u/format-color color "Caught SQLException:\n%s"
                   (with-out-str (jdbc/print-sql-exception-chain e))))
        (throw e))
      (catch Throwable e
        (println (u/format-color color "Caught Exception: %s %s\n%s" (class e) (.getMessage e)
                                 (with-out-str (.printStackTrace e))))
        (throw e)))))

(defn- query [& sql]
  (jdbc/query (db-spec nil) sql))

(defrecord SQLServerDatasetLoader []
  generic/IGenericSQLDatasetLoader
  (generic/execute-sql! [_ {:keys [database-name]} raw-sql]
    (execute! database-name raw-sql))

  (generic/korma-entity [_ {:keys [database-name]} table-definition]
    (-> (k/create-entity (:table-name table-definition))
        (k/database (kdb/create-db (db-spec database-name)))))

  (generic/pk-sql-type   [_] "INT IDENTITY(1,1)")
  (generic/pk-field-name [_] "id")

  (generic/field-base-type->sql-type [_ field-type]
    (if (map? field-type) (:native field-type)
        (field-base-type->sql-type field-type))))

(extend-protocol IDatasetLoader
  SQLServerDatasetLoader
  (engine [_]
    :sqlserver)

  (database->connection-details [_ {:keys [database-name]}]
    (db-connection-details database-name))

  (drop-physical-table! [_ {:keys [database-name]} {:keys [table-name]}]
    (execute! database-name "IF object_id('%s.%s') IS NOT NULL DROP TABLE \"%s\".\"%s\";" database-name table-name database-name table-name))

  (create-physical-table! [this {:keys [database-name], :as database-definition} table-definition]
    (generic/create-physical-table! this database-definition table-definition ;; , :table-name-qualification :database
                                    ))

  (drop-physical-db! [_ {:keys [database-name], :as database-definition}]
    (let [do-if-db-exists! (fn [& strs]
                             (execute! nil (str (format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s') " database-name)
                                                (apply format strs))))]
      ;; Kill all open connections to this database
      (do-if-db-exists! "ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;" database-name)
      ;; Delete the database
      (do-if-db-exists! "DROP DATABASE \"%s\";" database-name)))

  (create-physical-db! [this {:keys [database-name], :as database-definition}]
    (execute! nil "CREATE DATABASE \"%s\";" database-name)

    ;; call the generic implementation to create Tables + FKs
    (generic/create-physical-db! this database-definition))

  (load-table-data! [this database-definition table-definition]
    (generic/load-table-data! this database-definition table-definition)))


(defn dataset-loader []
  (map->SQLServerDatasetLoader {}))

(require '[metabase.test.util.q :refer [Q]])

(defn x []
  (Q dataset tupac-sightings use sqlserver
     return rows of sightings
     limit 10))
