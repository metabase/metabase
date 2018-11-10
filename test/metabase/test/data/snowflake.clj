(ns metabase.test.data.snowflake
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u]
            [honeysql.core :as hsql]
            [honeysql.helpers :as h]
            [metabase.util.honeysql-extensions :as hx]
            [honeysql.format :as hformat])
  (:import metabase.driver.snowflake.SnowflakeDriver))

(def ^:private ^SnowflakeDriver snowflake-driver (SnowflakeDriver.))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMPLTZ"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/Text       "TEXT"
   :type/Time       "TIME"})

(defn- database->connection-details [context {:keys [database-name]}]
  (merge
   {:account   (i/db-test-env-var-or-throw :snowflake :account)
    :user      (i/db-test-env-var-or-throw :snowflake :user)
    :password  (i/db-test-env-var-or-throw :snowflake :password)
    :warehouse (i/db-test-env-var-or-throw :snowflake :warehouse)
    ;; SESSION parameters
    :timezone "UTC"}
   ;; Snowflake JDBC driver ignores this, but we do use it in the `query-db-name` function in
   ;; `metabase.driver.snowflake`
   (when (= context :db)
     {:db database-name})))


;; Snowflake requires you identify an object with db-name.schema-name.table-name
(defn- qualified-name-components
  ([_ db-name table-name]            [db-name "PUBLIC" table-name])
  ([_ db-name]                       [db-name])
  ([_ db-name table-name field-name] [db-name "PUBLIC" table-name field-name]))

(defn- create-db-sql [driver {:keys [database-name]}]
  (let [db (generic/qualify+quote-name driver database-name)]
    (format "DROP DATABASE IF EXISTS %s; CREATE DATABASE %s;" db db)))

(defn- expected-base-type->actual [base-type]
  (if (isa? base-type :type/Integer)
    :type/Number
    base-type))

(defn- drop-database [_]) ; no-op since we shouldn't be trying to drop any databases anyway

(defn- no-db-connection-spec
  "Connection spec for connecting to our Snowflake instance without specifying a DB."
  []
  (sql/connection-details->spec snowflake-driver (database->connection-details nil nil)))

(defn- existing-dataset-names []
  (let [db-spec (no-db-connection-spec)]
    (jdbc/with-db-metadata [metadata db-spec]
      ;; for whatever dumb reason the Snowflake JDBC driver always returns these as uppercase despite us making them
      ;; all lower-case
      (set (map str/lower-case (sql/get-catalogs metadata))))))

(let [datasets (atom nil)]
  (defn- existing-datasets []
    (when-not (seq @datasets)
      (reset! datasets (existing-dataset-names))
      (println "These Snowflake datasets have already been loaded:\n" (u/pprint-to-str (sort @datasets))))
    @datasets)

  (defn- add-existing-dataset! [database-name]
    (swap! datasets conj database-name)))

(defn- create-db!
  ([db-def]
   (create-db! snowflake-driver db-def))
  ([driver {:keys [database-name] :as db-def}]
   ;; ok, now check if already created. If already created, no-op
   (when-not (contains? (existing-datasets) database-name)
     ;; if not created, create the DB...
     (try
       (generic/default-create-db! driver db-def)
       ;; and add it to the set of DBs that have been created
       (add-existing-dataset! database-name)
       ;; if creating the DB failed, DROP it so we don't get stuck with a DB full of bad data and skip trying to
       ;; load it next time around
       (catch Throwable e
         (let [drop-db-sql (format "DROP DATABASE \"%s\";" database-name)]
           (println "Creating DB failed; executing" drop-db-sql)
           (jdbc/execute! (no-db-connection-spec) [drop-db-sql]))
         (throw e))))))

(u/strict-extend SnowflakeDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :create-db-sql             create-db-sql
          :execute-sql!              generic/sequentially-execute-sql!
          :pk-sql-type               (constantly "INTEGER AUTOINCREMENT")
          :qualified-name-components qualified-name-components
          :load-data!                generic/load-data-add-ids!})

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :engine                       (constantly :snowflake)
          :id-field-type                (constantly :type/Number)
          :expected-base-type->actual   (u/drop-first-arg expected-base-type->actual)
          :create-db!                   create-db!}))
