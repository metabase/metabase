(ns metabase.test.data.snowflake
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
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

(defn- load-data! [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  (jdbc/with-db-connection [conn (generic/database->spec driver :db dbdef)]
    (.setAutoCommit (jdbc/get-connection conn) false)
    (let [table    (generic/qualify+quote-name driver database-name table-name)
          rows     (generic/add-ids (generic/load-data-get-rows driver dbdef tabledef))
          col-kwds (keys (first rows))
          cols     (map (comp #(generic/quote-name driver %) name) col-kwds)
          vals     (for [row rows]
                     (map row col-kwds))]
      (jdbc/insert-multi! conn table cols vals))))

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

(def ^:private existing-datasets
  (atom nil))


(defn- create-db!
  ([db-def]
   (create-db! snowflake-driver db-def))
  ([driver {:keys [database-name] :as db-def}]
   ;; if `existing-datasets` atom isn't populated, then do so
   (when-not (seq @existing-datasets)
     (reset! existing-datasets (existing-dataset-names))
     (println "These Snowflake datasets have already been loaded:\n" (u/pprint-to-str (sort @existing-datasets))))
   ;; ok, now check if already created. If already created, no-op
   (when-not (contains? @existing-datasets database-name)
     ;; if not created, create the DB...
     (generic/default-create-db! driver db-def)
     ;; and add it to the set of DBs that have been created
     (swap! existing-datasets conj database-name))))

(u/strict-extend SnowflakeDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :create-db-sql             create-db-sql
          :execute-sql!              generic/sequentially-execute-sql!
          :pk-sql-type               (constantly "INTEGER AUTOINCREMENT")
          :qualified-name-components qualified-name-components
          :load-data!                load-data!})

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :default-schema               (constantly "PUBLIC")
          :engine                       (constantly :snowflake)
          :id-field-type                (constantly :type/Number)
          :expected-base-type->actual   (u/drop-first-arg expected-base-type->actual)
          :create-db!                   create-db!}))
