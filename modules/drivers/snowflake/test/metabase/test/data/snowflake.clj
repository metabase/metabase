(ns metabase.test.data.snowflake
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]
            [metabase.util :as u]))

(sql-jdbc.tx/add-test-extensions! :snowflake)

(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Boolean]    [_ _] "BOOLEAN")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/DateTime]   [_ _] "TIMESTAMPLTZ")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Float]      [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Text]       [_ _] "TEXT")
(defmethod sql.tx/field-base-type->sql-type [:snowflake :type/Time]       [_ _] "TIME")

(defmethod tx/dbdef->connection-details :snowflake [_ context {:keys [database-name]}]
  (merge
   {:account   (tx/db-test-env-var-or-throw :snowflake :account)
    :user      (tx/db-test-env-var-or-throw :snowflake :user)
    :password  (tx/db-test-env-var-or-throw :snowflake :password)
    :warehouse (tx/db-test-env-var-or-throw :snowflake :warehouse)
    ;; SESSION parameters
    :timezone "UTC"}
   ;; Snowflake JDBC driver ignores this, but we do use it in the `query-db-name` function in
   ;; `metabase.driver.snowflake`
   (when (= context :db)
     {:db database-name})))


;; Snowflake requires you identify an object with db-name.schema-name.table-name
(defmethod sql.tx/qualified-name-components :snowflake
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name "PUBLIC" table-name])
  ([_ db-name table-name field-name] [db-name "PUBLIC" table-name field-name]))

(defmethod sql.tx/create-db-sql :snowflake [driver {:keys [database-name]}]
  (let [db (sql.tx/qualify+quote-name driver database-name)]
    (format "DROP DATABASE IF EXISTS %s; CREATE DATABASE %s;" db db)))

(defmethod tx/expected-base-type->actual :snowflake [_ base-type]
  (if (isa? base-type :type/Integer)
    :type/Number
    base-type))

(defn- no-db-connection-spec
  "Connection spec for connecting to our Snowflake instance without specifying a DB."
  []
  (sql-jdbc.conn/connection-details->spec :snowflake (tx/dbdef->connection-details :snowflake :server nil)))

(defn- existing-dataset-names []
  (let [db-spec (no-db-connection-spec)]
    (jdbc/with-db-metadata [metadata db-spec]
      ;; for whatever dumb reason the Snowflake JDBC driver always returns these as uppercase despite us making them
      ;; all lower-case
      (set (map str/lower-case (sql-jdbc.sync/get-catalogs metadata))))))

(let [datasets (atom nil)]
  (defn- existing-datasets []
    (when-not (seq @datasets)
      (reset! datasets (existing-dataset-names))
      (println "These Snowflake datasets have already been loaded:\n" (u/pprint-to-str (sort @datasets))))
    @datasets)

  (defn- add-existing-dataset! [database-name]
    (swap! datasets conj database-name)))

(defmethod tx/create-db! :snowflake [driver {:keys [database-name] :as db-def} & options]
  ;; ok, now check if already created. If already created, no-op
  (when-not (contains? (existing-datasets) database-name)
    ;; if not created, create the DB...
    (try
      ;; call the default impl for SQL JDBC drivers
      (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)
      ;; and add it to the set of DBs that have been created
      (add-existing-dataset! database-name)
      ;; if creating the DB failed, DROP it so we don't get stuck with a DB full of bad data and skip trying to
      ;; load it next time around
      (catch Throwable e
        (let [drop-db-sql (format "DROP DATABASE \"%s\";" database-name)]
          (println "Creating DB failed; executing" drop-db-sql)
          (jdbc/execute! (no-db-connection-spec) [drop-db-sql]))
        (throw e)))))

(defmethod execute/execute-sql! :snowflake [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :snowflake [_] "INTEGER AUTOINCREMENT")

(defmethod tx/id-field-type :snowflake [_] :type/Number)

(defmethod load-data/load-data! :snowflake [& args]
  (apply load-data/load-data-add-ids! args))
