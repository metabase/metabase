(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            (korma [core :as k]
                   [db :as kdb])
            [metabase.driver.generic-sql.interface :refer [ISqlDriverQuoteName quote-name]]
            (metabase.test.data [generic-sql :as generic]
                                [interface :refer :all]))
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

(defn- mysql-connection-details [^DatabaseDefinition {:keys [short-lived?]}]
  {:host         "localhost"
   :port         3306
   :short-lived? short-lived?
   :user         (if (env :circleci) "ubuntu"
                     "root")})

(defn- db-connection-details [^DatabaseDefinition database-definition]
  (assoc (mysql-connection-details database-definition)
         :db (:database-name database-definition)
         :timezone :America/Los_Angeles))

(defn- execute! [scope ^DatabaseDefinition database-definition & format-strings]
  (println "SQL -> " (apply format format-strings))
  (jdbc/execute! (-> ((case scope
                        :mysql mysql-connection-details
                        :db    db-connection-details) database-definition)
                     kdb/mysql
                     (assoc :make-pool? false))
                 [(apply format format-strings)]
                 :transaction? false))


(defrecord MySQLDatasetLoader []
  generic/IGenericSQLDatasetLoader
  (generic/execute-sql! [_ database-definition raw-sql]
    (log/debug raw-sql)
    (execute! :db database-definition raw-sql))

  (generic/korma-entity [_ database-definition table-definition]
    (-> (k/create-entity (:table-name table-definition))
        (k/database (-> (db-connection-details database-definition)
                        kdb/mysql
                        (assoc :make-pool? false)
                        kdb/create-db))))

  (generic/pk-sql-type   [_] "INTEGER NOT NULL AUTO_INCREMENT")
  (generic/pk-field-name [_] "id")

  (generic/field-base-type->sql-type [_ field-type]
    (if (map? field-type) (:native field-type)
        (field-base-type->sql-type field-type)))

  ISqlDriverQuoteName
  (quote-name [_ nm]
    (str \` nm \`)))

(extend-protocol IDatasetLoader
  MySQLDatasetLoader
  (engine [_]
    :mysql)

  (database->connection-details [_ database-definition]
    (assoc (db-connection-details database-definition)
           :timezone :America/Los_Angeles))

  (drop-physical-db! [_ database-definition]
    (execute! :mysql database-definition "DROP DATABASE IF EXISTS `%s`;" (:database-name database-definition)))

  (drop-physical-table! [this database-definition table-definition]
    (generic/drop-physical-table! this database-definition table-definition))

  (create-physical-table! [this database-definition table-definition]
    (generic/create-physical-table! this database-definition table-definition))

  (create-physical-db! [this database-definition]
    (drop-physical-db! this database-definition)
    (execute! :mysql database-definition "CREATE DATABASE `%s`;" (:database-name database-definition))

    ;; double check that we can connect to the newly created DB
    (metabase.driver/can-connect-with-details? :mysql (db-connection-details database-definition) :rethrow-exceptions)

    ;; call the generic implementation to create Tables + FKs
    (generic/create-physical-db! this database-definition))

  (load-table-data! [this database-definition table-definition]
    (generic/load-table-data! this database-definition table-definition)))


(defn dataset-loader []
  (MySQLDatasetLoader.))
