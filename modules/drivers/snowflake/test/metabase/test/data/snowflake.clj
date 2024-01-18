(ns metabase.test.data.snowflake
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :snowflake)

(defmethod tx/sorts-nil-first? :snowflake [_ _] false)

(doseq [[base-type sql-type] {:type/BigInteger     "BIGINT"
                              :type/Boolean        "BOOLEAN"
                              :type/Date           "DATE"
                              :type/DateTime       "TIMESTAMP_NTZ"
                              :type/DateTimeWithTZ "TIMESTAMP_TZ"
                              :type/Decimal        "DECIMAL"
                              :type/Float          "FLOAT"
                              :type/Integer        "INTEGER"
                              :type/Text           "TEXT"
                              :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:snowflake base-type] [_ _] sql-type))

(def ^:dynamic *database-prefix-fn*
  "Function that returns a unique prefix to use for test datasets for this instance. This is dynamic so we can rebind it
  to something fixed when we're testing the SQL we generate
  e.g. [[metabase.driver.snowflake-test/report-timezone-test]].

  This is a function because [[unique-prefix]] can't be calculated until the application database is initialized
  because it relies on [[public-settings/site-uuid]]."
  #'sql.tu.unique-prefix/unique-prefix)

(defn qualified-db-name
  "Prepend `database-name` with the [[*database-prefix-fn*]] so we don't stomp on any other jobs running at the same
  time."
  [database-name]
  (let [prefix (*database-prefix-fn*)]
    ;; try not to qualify the database name twice!
    (if (str/starts-with? database-name prefix)
      database-name
      (str prefix database-name))))

(defmethod tx/dbdef->connection-details :snowflake
  [_ context {:keys [database-name]}]
  (merge
   {:account             (tx/db-test-env-var-or-throw :snowflake :account)
    :user                (tx/db-test-env-var-or-throw :snowflake :user)
    :password            (tx/db-test-env-var-or-throw :snowflake :password)
    :additional-options  (tx/db-test-env-var :snowflake :additional-options)
    ;; this lowercasing this value is part of testing the fix for
    ;; https://github.com/metabase/metabase/issues/9511
    :warehouse           (u/lower-case-en (tx/db-test-env-var-or-throw :snowflake :warehouse))
    ;; SESSION parameters
    :timezone            "UTC"}
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

(defn- old-dataset-names
  "Return a collection of all dataset names that are old -- prefixed with a date two days ago or older?"
  []
  (sql-jdbc.execute/do-with-connection-with-options
   :snowflake
   (no-db-connection-spec)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (let [metadata (.getMetaData conn)]
       (with-open [rset (.getCatalogs metadata)]
         (loop [acc []]
           (if-not (.next rset)
             acc
             ;; for whatever dumb reason the Snowflake JDBC driver always returns these as uppercase despite us making
             ;; them all lower-case
             (let [catalog (u/lower-case-en (.getString rset "TABLE_CAT"))
                   acc     (cond-> acc
                             (sql.tu.unique-prefix/old-dataset-name? catalog) (conj catalog))]
               (recur acc)))))))))

(defn- delete-old-datasets!
  "Delete any datasets prefixed by a date that is two days ago or older. See comments above."
  []
  ;; the printlns below are on purpose because we want them to show up when running tests, even on CI, to make sure this
  ;; stuff is working correctly. We can change it to `log` in the future when we're satisfied everything is working as
  ;; intended -- Cam
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "[Snowflake] deleting old datasets...")
  (when-let [old-datasets (not-empty (old-dataset-names))]
    (sql-jdbc.execute/do-with-connection-with-options
     :snowflake
     (no-db-connection-spec)
     {:write? true}
     (fn [^java.sql.Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [dataset-name old-datasets]
           #_{:clj-kondo/ignore [:discouraged-var]}
           (println "[Snowflake] Deleting old dataset:" dataset-name)
           (try
             (.execute stmt (format "DROP DATABASE \"%s\";" dataset-name))
             ;; if this fails for some reason it's probably just because some other job tried to delete the dataset at the
             ;; same time. No big deal. Just log this and carry on trying to delete the other datasets. If we don't end up
             ;; deleting anything it's not the end of the world because it won't affect our ability to run our tests
             (catch Throwable e
               #_{:clj-kondo/ignore [:discouraged-var]}
               (println "[Snowflake] Error deleting old dataset:" (ex-message e))))))))))

(defonce ^:private deleted-old-datasets?
  (atom false))

(defn- delete-old-datsets-if-needed!
  "Call [[delete-old-datasets!]], only if we haven't done so already."
  []
  (when-not @deleted-old-datasets?
    (locking deleted-old-datasets?
      (when-not @deleted-old-datasets?
        (delete-old-datasets!)
        (reset! deleted-old-datasets? true)))))

(defmethod tx/create-db! :snowflake
  [driver db-def & options]
  ;; qualify the DB name with the unique prefix
  (let [db-def (update db-def :database-name qualified-db-name)]
    ;; clean up any old datasets that should be deleted
    (delete-old-datsets-if-needed!)
    ;; now call the default impl for SQL JDBC drivers
    (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))

(defmethod tx/destroy-db! :snowflake
  [_driver {:keys [database-name]}]
  (let [database-name (qualified-db-name database-name)
        sql           (format "DROP DATABASE \"%s\";" database-name)]
    (log/infof "[Snowflake] %s" sql)
    (jdbc/execute! (no-db-connection-spec) [sql])))

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
  (apply load-data/load-data-add-ids-chunked! args))

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
