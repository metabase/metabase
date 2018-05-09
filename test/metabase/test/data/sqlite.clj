(ns metabase.test.data.sqlite
  (:require [honeysql.core :as hsql]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]])
  (:import metabase.driver.sqlite.SQLiteDriver))

(defn- database->connection-details [context dbdef]
  {:db (str (i/escaped-name dbdef) ".sqlite")})

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "DATETIME"
   :type/Decimal    "DECIMAL"
   :type/Float      "DOUBLE"
   :type/Integer    "INTEGER"
   :type/Text       "TEXT"
   :type/Time       "TIME"})

(defn- load-data-stringify-dates
  "Our SQLite JDBC driver doesn't seem to like Dates/Timestamps so just convert them to strings before INSERTing them into the Database."
  [insert!]
  (fn [rows]
    (insert! (for [row rows]
               (into {} (for [[k v] row]
                          [k (cond
                               (instance? java.sql.Time v)
                               (hsql/call :time (hx/literal (du/format-time v "UTC")))

                               (instance? java.util.Date v)
                               (hsql/call :datetime (hx/literal (du/date->iso-8601 v)))

                               :else v)]))))))

(u/strict-extend SQLiteDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:add-fk-sql                (constantly nil) ; TODO - fix me
          :create-db-sql             (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :execute-sql!              generic/sequentially-execute-sql!
          :load-data!                (generic/make-load-data-fn load-data-stringify-dates generic/load-data-chunked)
          :pk-sql-type               (constantly "INTEGER")
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :engine                       (constantly :sqlite)}))
