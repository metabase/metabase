(ns metabase.test.data.snowflake
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util :as u]))

(sql-jdbc.tx/add-test-extensions! :snowflake)

(defmethod tx/sorts-nil-first? :snowflake [_] false)

(doseq [[base-type sql-type] {:type/BigInteger     "BIGINT"
                              :type/Boolean        "BOOLEAN"
                              :type/Date           "DATE"
                              :type/DateTime       "TIMESTAMP_LTZ"
                              :type/DateTimeWithTZ "TIMESTAMP_TZ"
                              :type/Decimal        "DECIMAL"
                              :type/Float          "FLOAT"
                              :type/Integer        "INTEGER"
                              :type/Text           "TEXT"
                              :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:snowflake base-type] [_ _] sql-type))

(defn- qualified-db-name
  "Prepend `database-name` with a version number so we can create new versions without breaking existing tests."
  [database-name]
  ;; try not to qualify the database name twice!
  (if (str/starts-with? database-name "v2_")
    database-name
    (str "v2_" database-name)))

(defmethod tx/dbdef->connection-details :snowflake
  [_ context {:keys [database-name]}]
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
     {:db (qualified-db-name database-name)})))

;; Snowflake requires you identify an object with db-name.schema-name.table-name
(defmethod sql.tx/qualified-name-components :snowflake
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name "PUBLIC" table-name])
  ([_ db-name table-name field-name] [db-name "PUBLIC" table-name field-name]))

(defmethod sql.tx/create-db-sql :snowflake
  [driver {:keys [database-name]}]
  (let [db (sql.tx/qualify-and-quote driver (qualified-db-name database-name))]
    (format "DROP DATABASE IF EXISTS %s; CREATE DATABASE %s;" db db)))

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
    (swap! datasets conj database-name))

  (defn- remove-existing-dataset! [database-name]
    (swap! datasets disj database-name)))

(defmethod tx/create-db! :snowflake
  [driver db-def & options]
  (let [{:keys [database-name], :as db-def} (update db-def :database-name qualified-db-name)]
    ;; ok, now check if already created. If already created, no-op
    (when-not (contains? (existing-datasets) database-name)
      (println (format "Creating new Snowflake database %s..." (pr-str database-name)))
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
            (println "Creating DB failed:" e)
            (println "[Snowflake]" drop-db-sql)
            (jdbc/execute! (no-db-connection-spec) [drop-db-sql]))
          (throw e))))))

(defmethod tx/destroy-db! :snowflake
  [_ {:keys [database-name]}]
  (let [database-name (qualified-db-name database-name)]
    (jdbc/execute! (no-db-connection-spec) [(format "DROP DATABASE \"%s\";" database-name)])
    (remove-existing-dataset! database-name)))

;; For reasons I don't understand the Snowflake JDBC driver doesn't seem to work when trying to use parameterized
;; INSERT statements, even though the documentation suggests it should. Just go ahead and deparameterize all the
;; statements for now.
(defmethod ddl/insert-rows-ddl-statements :snowflake
  [driver table-identifier row-or-rows]
  (for [sql+args ((get-method ddl/insert-rows-ddl-statements :sql-jdbc/test-extensions) driver table-identifier row-or-rows)]
    (unprepare/unprepare driver sql+args)))

(defmethod execute/execute-sql! :snowflake
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :snowflake [_] "INTEGER AUTOINCREMENT")

(defmethod tx/id-field-type :snowflake [_] :type/Number)

(defmethod load-data/load-data! :snowflake
  [& args]
  (apply load-data/load-data-add-ids! args))

(defmethod tx/aggregate-column-info :snowflake
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Number})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Number}))))
