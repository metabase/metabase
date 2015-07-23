(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [clojure.string :as s]
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
   :DateTimeField   "DATETIME"
   :DecimalField    "DECIMAL"
   :FloatField      "FLOAT"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

;; ## DatabaseDefinition helper functions

(defn- connection-details
  "Return a Metabase `Database.details` for H2 database defined by DATABASE-DEFINITION."
  [^DatabaseDefinition {:keys [short-lived?], :as database-definition}]
  {:db (str (format "mem:%s" (escaped-name database-definition))
            ;; For non "short-lived" (temp) databases keep the connection open for the duration of unit tests
            (when-not short-lived?
              ";DB_CLOSE_DELAY=-1"))
   :short-lived? short-lived?})

(defn- korma-connection-pool
  "Return an H2 korma connection pool to H2 database defined by DATABASE-DEFINITION."
  [^DatabaseDefinition database-definition]
  (kdb/create-db (kdb/h2 (assoc (connection-details database-definition)
                                :naming {:keys   s/lower-case
                                         :fields s/upper-case}))))

;; ## Implementation

(defn- format-for-h2 [obj]
  (cond
    (:database-name obj) (update-in obj [:table-definitions] (partial map format-for-h2))
    (:table-name obj)    (-> obj
                             (update-in [:table-name] s/upper-case)
                             (update-in [:field-definitions] (partial map format-for-h2)))
    (:field-name obj)    (cond-> (update-in obj [:field-name] s/upper-case)
                           (:fk obj) (update-in [:fk] (comp s/upper-case name)))))


;; ## Public Concrete DatasetLoader instance

;; For some reason this doesn't seem to work if we define IDatasetLoader methods inline, but does work when we explicitly use extend-protocol
(defrecord H2DatasetLoader []
  generic/IGenericSQLDatasetLoader
  (generic/execute-sql! [_ database-definition raw-sql]
    (log/debug raw-sql)
    (k/exec-raw (korma-connection-pool database-definition) raw-sql))

  (generic/korma-entity [_ database-definition table-definition]
    (-> (k/create-entity (:table-name table-definition))
        (k/database (korma-connection-pool database-definition))))

  (generic/pk-sql-type   [_] "BIGINT AUTO_INCREMENT")
  (generic/pk-field-name [_] "ID")

  (generic/field-base-type->sql-type [_ field-type]
    (field-base-type->sql-type field-type)))


(extend-protocol IDatasetLoader
  H2DatasetLoader
  (engine [_]
    :h2)

  (database->connection-details [_ database-definition]
    ;; Return details with the GUEST user added so SQL queries are allowed
    (let [details (connection-details database-definition)]
      (update details :db str ";USER=GUEST;PASSWORD=guest")))

  (drop-physical-db! [_ database-definition]
    ;; Nothing to do here - there are no physical dbs <3
    )

  (create-physical-table! [this database-definition table-definition]
    (generic/create-physical-table! this database-definition (format-for-h2 table-definition)))

  (create-physical-db! [this database-definition]
    ;; Create the "physical" database which in this case actually just means creating the schema
    (generic/create-physical-db! this (format-for-h2 database-definition))
    ;; Now create a non-admin account 'GUEST' which will be used from here on out
    (generic/execute-sql! this database-definition "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';")
    ;; Grant the GUEST account SELECT permissions for all the Tables in this DB
    (doseq [{:keys [table-name]} (:table-definitions database-definition)]
      (generic/execute-sql! this database-definition (format "GRANT SELECT ON %s TO GUEST" table-name))))

  (load-table-data! [this database-definition table-definition]
    (generic/load-table-data! this database-definition table-definition))

  (drop-physical-table! [this database-definition table-definition]
    (generic/drop-physical-table! this database-definition (format-for-h2 table-definition))))

(defn dataset-loader []
  (->H2DatasetLoader))
