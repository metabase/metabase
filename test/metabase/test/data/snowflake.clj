(ns metabase.test.data.snowflake
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.snowflake.SnowflakeDriver))

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

;; Since all tests share the same Snowflake server let's make sure we don't stomp over any tests running
;; simultaneously by creating different databases for different tests. We'll append a random suffix to each DB name
;; created for the duration of this test which should hopefully be enough to prevent collision.
(defonce ^:private session-db-suffix
  (str "__" (rand-int 100)))

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:account                        (i/db-test-env-var-or-throw :snowflake :account)
          :user                           (i/db-test-env-var-or-throw :snowflake :user)
          :password                       (i/db-test-env-var-or-throw :snowflake :password)
          :warehouse                      (i/db-test-env-var-or-throw :snowflake :warehouse)
          ;; SESSION parameters
          :quoted_identifiers_ignore_case true
          :timezone                       "UTC"}
         (when (= context :db)
           {:db (str database-name session-db-suffix)})))


;; Snowflake requires you identify an object with db-name.schema-name.table-name
(defn- qualified-name-components
  ([_ db-name]                       [(str db-name session-db-suffix)])
  ([_ db-name table-name]            [(str db-name session-db-suffix) "public" table-name])
  ([_ db-name table-name field-name] [(str db-name session-db-suffix) "public" table-name field-name]))

(defn- create-db-sql [driver {:keys [database-name]}]
  (let [db (generic/qualify+quote-name driver database-name)]
    (format "CREATE DATABASE %s; USE DATABASE %s;" db db)))

(defn- load-data! [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  (jdbc/with-db-connection [conn (generic/database->spec driver :db dbdef)]
    (.setAutoCommit (jdbc/get-connection conn) false)
    (let [table (generic/qualify+quote-name driver database-name table-name)
          rows  (generic/add-ids (generic/load-data-get-rows driver dbdef tabledef))
          cols  (keys (first rows))
          vals  (for [row rows]
                  (map row cols))]
      (jdbc/insert-multi! conn table cols vals))))


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
          :format-name                  (u/drop-first-arg str/upper-case)
          :default-schema               (constantly "public")
          :engine                       (constantly :snowflake)}))
