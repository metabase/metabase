(ns metabase.test.data.sqlite
  (:require [clojure.string :as s]
            [korma.core :as k]
            metabase.driver.sqlite
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u])
  (:import metabase.driver.sqlite.SQLiteDriver))

(defn- database->connection-details
  [_ context {:keys [short-lived?], :as dbdef}]
  {:short-lived? short-lived?
   :db           (str (i/escaped-name dbdef) ".sqlite")})

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "BIGINT"
   :BooleanField    "BOOLEAN"
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "DATETIME"
   :DecimalField    "DECIMAL"
   :FloatField      "DOUBLE"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

(defn- load-data-stringify-dates
  "Our SQLite JDBC driver doesn't seem to handle Dates/Timestamps correctly so just convert them to string before INSERTing them into the Database."
  [insert!]
  (fn [rows]
    (insert! (for [row rows]
               (into {} (for [[k v] row]
                          [k (u/cond-as-> v v
                               (instance? java.util.Date v) (k/raw (format "DATETIME('%s')" (u/date->iso-8601 v))))]))))))

(extend SQLiteDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:add-fk-sql                (constantly nil) ; TODO - fix me
          :create-db-sql             (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :execute-sql!              generic/sequentially-execute-sql!
          :load-data!                (generic/make-load-data-fn load-data-stringify-dates generic/load-data-chunked)
          :pk-sql-type               (constantly "INTEGER")
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :sqlite)}))
