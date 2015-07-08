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

(defn- filename
  "Return filename that should be used for connecting to H2 database defined by DATABASE-DEFINITION.
   This does not include the `.mv.db` extension."
  [^DatabaseDefinition database-definition]
  (format "%s/target/%s" (System/getProperty "user.dir") (escaped-name database-definition)))

(defn- connection-details
  "Return a Metabase `Database.details` for H2 database defined by DATABASE-DEFINITION."
  [^DatabaseDefinition database-definition]
  {:db (format (if (:short-lived? database-definition) "file:%s" ; for short-lived connections don't create a server thread and don't use a keep-alive connection
                   "file:%s;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1")
               (filename database-definition))})

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
    (connection-details database-definition))

  (drop-physical-db! [_ database-definition]
    (let [file (io/file (format "%s.mv.db" (filename database-definition)))]
      (when (.exists file)
        (.delete file))))

  (create-physical-table! [this database-definition table-definition]
    (generic/create-physical-table! this database-definition (format-for-h2 table-definition)))

  (create-physical-db! [this database-definition]
    (generic/create-physical-db! this (format-for-h2 database-definition)))

  (load-table-data! [this database-definition table-definition]
    (generic/load-table-data! this database-definition table-definition))

  (drop-physical-table! [this database-definition table-definition]
    (generic/drop-physical-table! this database-definition (format-for-h2 table-definition))))

(defn dataset-loader []
  (->H2DatasetLoader))
