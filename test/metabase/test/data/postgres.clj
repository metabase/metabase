(ns metabase.test.data.postgres
  "Code for creating / destroying a Postgres database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            (korma [core :as k]
                   [db :as kdb])
            (metabase.test.data [generic-sql :as generic]
                                [interface :refer :all]))
  (:import (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "BIGINT"
   :BooleanField    "BOOL"
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "TIMESTAMP"
   :DecimalField    "DECIMAL"
   :FloatField      "FLOAT"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

(defn- pg-connection-details [^DatabaseDefinition database-definition]
  (merge {:host "localhost"
          :port 5432}
         ;; HACK
         (when (env :circleci)
           {:user "ubuntu"})))

(defn- db-connection-details [^DatabaseDefinition database-definition]
  (assoc (pg-connection-details database-definition)
         :db (:database-name database-definition)))

(defn- execute! [scope ^DatabaseDefinition database-definition & format-strings]
  (jdbc/execute! (-> ((case scope
                        :pg pg-connection-details
                        :db db-connection-details) database-definition)
                     kdb/postgres
                     (assoc :make-pool? false))
                 [(apply format format-strings)]
                 :transaction? false))


(defrecord PostgresDatasetLoader []
  generic/IGenericSQLDatasetLoader
  (generic/execute-sql! [_ database-definition raw-sql]
    (log/info raw-sql)
    (execute! :db database-definition raw-sql))

  (generic/korma-entity [_ database-definition table-definition]
    (-> (k/create-entity (:table-name table-definition))
        (k/database (-> (db-connection-details database-definition)
                        kdb/postgres
                        (assoc :make-pool? false)
                        kdb/create-db))))

  (generic/pk-sql-type [_]
    "SERIAL")

  (generic/field-base-type->sql-type [_ field-type]
    (field-base-type->sql-type field-type)))

(extend-protocol IDatasetLoader
  PostgresDatasetLoader
  (engine [_]
    :postgres)

  (database->connection-details [_ database-definition]
    (assoc (db-connection-details database-definition)
           :timezone :America/Los_Angeles))

  (drop-physical-db! [_ database-definition]
    (execute! :pg database-definition "DROP DATABASE IF EXISTS \"%s\";" (:database-name database-definition)))

  (drop-physical-table! [this database-definition table-definition]
    (generic/drop-physical-table! this database-definition table-definition))

  (create-physical-table! [this database-definition table-definition]
    (generic/create-physical-table! this database-definition table-definition))

  (create-physical-db! [this {:keys [database-name], :as database-definition}]
    (execute! :pg database-definition "DROP DATABASE IF EXISTS \"%s\";" database-name)
    (execute! :pg database-definition "CREATE DATABASE \"%s\";" database-name)

    ;; double check that we can connect to the newly created DB
    (metabase.driver/can-connect-with-details? :postgres (db-connection-details database-definition) :rethrow-exceptions)

    ;; call the generic implementation to create Tables + FKs
    (generic/create-physical-db! this database-definition))

  (load-table-data! [this database-definition table-definition]
    (generic/load-table-data! this database-definition table-definition)))


(defn dataset-loader []
  (->PostgresDatasetLoader))
