(ns metabase.test.data.snowflake
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.log :as log])
  (:import
   (java.sql PreparedStatement ResultSet)
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

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
                              ;; :type/Number is used by tx/id-field-type for Snowflake PKs
                              :type/Number         "NUMBER"
                              :type/Text           "TEXT"
                              ;; 3 = millisecond precision. Default is allegedly 9 (nanosecond precision) according to
                              ;; https://docs.snowflake.com/en/sql-reference/data-types-datetime#time, but it seems like
                              ;; no matter what I do it ignores everything after seconds anyway. See
                              ;; https://community.snowflake.com/s/question/0D50Z00008sOM5JSAW/how-can-i-get-milliseconds-precision-on-time-datatype
                              :type/Time           "TIME(3)"}]
  (defmethod sql.tx/field-base-type->sql-type [:snowflake base-type] [_ _] sql-type))

(defn qualified-db-name
  "Prepend `database-name` with the hash of the db-def so we don't stomp on any other jobs running at the same
  time."
  [{:keys [database-name] :as db-def}]
  (if (str/starts-with? database-name "sha_")
    database-name
    (str "sha_" (tx/hash-dataset db-def) "_" database-name)))

(defmethod tx/dbdef->connection-details :snowflake
  [_driver context dbdef]
  (merge
   {:account             (tx/db-test-env-var-or-throw :snowflake :account)
    :user                (tx/db-test-env-var-or-throw :snowflake :user)
    :private-key-options "uploaded"
    :private-key-value (mt/priv-key->base64-uri (tx/db-test-env-var-or-throw :snowflake :private-key))
    :use-password false
    :additional-options  (tx/db-test-env-var :snowflake :additional-options)
    :warehouse           (tx/db-test-env-var-or-throw :snowflake :warehouse)
    ;;
    ;; SESSION parameters
    ;;
    :timezone            "UTC"
    ;; return times with millisecond precision, if we don't set this then Snowflake will only return them with second
    ;; precision. Important mostly because other DBs use millisecond precision by default and this makes Snowflake test
    ;; results match up with others
    :time_output_format  "HH24:MI:SS.FF3"}
   ;; Snowflake JDBC driver ignores this, but we do use it in the `query-db-name` function in
   ;; `metabase.driver.snowflake`
   (when (= context :db)
     {:db (qualified-db-name dbdef)})))

;; Snowflake requires you identify an object with db-name.schema-name.table-name
(defmethod sql.tx/qualified-name-components :snowflake
  ([driver db-name]
   (if (some-> db-name (str/starts-with? "sha_"))
     [db-name]
     [(qualified-db-name (tx/get-dataset-definition (or data.impl/*dbdef-used-to-create-db* (tx/default-dataset driver))))]))
  ([driver db-name table-name]
   (into (sql.tx/qualified-name-components driver db-name) ["PUBLIC" table-name]))
  ([driver db-name table-name field-name]
   (into (sql.tx/qualified-name-components driver db-name table-name) [field-name])))

(defmethod sql.tx/create-db-sql :snowflake
  [driver dbdef]
  (let [db (sql.tx/qualify-and-quote driver (qualified-db-name dbdef))]
    (format "DROP DATABASE IF EXISTS %s; CREATE DATABASE %s;" db db)))

(defn- no-db-connection-spec
  "Connection spec for connecting to our Snowflake instance without specifying a DB."
  []
  (sql-jdbc.conn/connection-details->spec :snowflake (tx/dbdef->connection-details :snowflake :server nil)))

(defn- old-dataset-names
  "Return a collection of all dataset names that are old
   -- tracked that haven't been touched in 2 days or are not tracked and two days old"
  []
  (let [days-ago -2
        ;; tracked UNION ALL untracked
        query "(select name from metabase_test_tracking.PUBLIC.datasets
                where accessed_at < dateadd(day, ?, current_timestamp()))
               UNION All
               (select database_name from metabase_test_tracking.information_schema.databases d
                where d.database_name not in (select name from metabase_test_tracking.PUBLIC.datasets)
                and d.database_name like 'sha_%'
                and created < dateadd(day, ?, current_timestamp()))"]
    (into [] (map :name) (jdbc/reducible-query (no-db-connection-spec) [query days-ago days-ago]))))

(defn- old-isolation-schema-names
  "Return a collection of schema names with mb__isolation_ prefix that are more than 3 hours old,
   along with their database names."
  []
  (sql-jdbc.execute/do-with-connection-with-options
   :snowflake
   (no-db-connection-spec)
   {:write? false}
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)
                 rs (.executeQuery stmt "SHOW SCHEMAS LIKE 'mb__isolation_%' IN ACCOUNT")]
       (let [three-hours-ago (-> (Instant/now)
                                 (.minus 3 ChronoUnit/HOURS)
                                 java.util.Date/from)]
         (loop [results []]
           (if (.next rs)
             (let [schema-name (.getString rs "name")
                   db-name (.getString rs "database_name")
                   created-on (.getTimestamp rs "created_on")]
               (if (and created-on (.before created-on three-hours-ago))
                 (recur (conj results {:schema-name schema-name :database-name db-name}))
                 (recur results)))
             results)))))))

(defn- delete-old-test-data!
  "Delete old test data:
   - Datasets (databases) prefixed by sha_ that are two days ago or older
   - Isolation schemas prefixed by mb__isolation_ that are more than 3 hours old"
  []
  ;; the printlns below are on purpose because we want them to show up when running tests, even on CI, to make sure this
  ;; stuff is working correctly. We can change it to `log` in the future when we're satisfied everything is working as
  ;; intended -- Cam
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "[Snowflake] deleting old test data...")
  (sql-jdbc.execute/do-with-connection-with-options
   :snowflake
   (no-db-connection-spec)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)]
       ;; Delete old datasets
       (when-let [old-datasets (not-empty (old-dataset-names))]
         (doseq [dataset-name old-datasets]
           #_{:clj-kondo/ignore [:discouraged-var]}
           (println "[Snowflake] Deleting old dataset:" dataset-name)
           (try
             (.execute stmt (format "DROP DATABASE IF EXISTS \"%s\";"
                                    dataset-name))
             (.execute stmt (format "delete from metabase_test_tracking.PUBLIC.datasets where name = '%s';"
                                    dataset-name))
             ;; if this fails for some reason it's probably just because some other job tried to delete the dataset at the
             ;; same time. No big deal. Just log this and carry on trying to delete the other datasets. If we don't end up
             ;; deleting anything it's not the end of the world because it won't affect our ability to run our tests
             (catch Throwable e
               #_{:clj-kondo/ignore [:discouraged-var]}
               (println "[Snowflake] Error deleting old dataset:" (ex-message e))))))
       ;; Delete old isolation schemas
       (when-let [old-schemas (not-empty (old-isolation-schema-names))]
         (doseq [{:keys [schema-name database-name]} old-schemas]
           #_{:clj-kondo/ignore [:discouraged-var]}
           (println "[Snowflake] Deleting old isolation schema:" database-name "." schema-name)
           (try
             (.execute stmt (format "DROP SCHEMA IF EXISTS \"%s\".\"%s\";"
                                    database-name schema-name))
             (catch Throwable e
               #_{:clj-kondo/ignore [:discouraged-var]}
               (println "[Snowflake] Error deleting old isolation schema:" (ex-message e))))))))))

(defonce ^:private deleted-old-test-data?
  (atom false))

(defn- delete-old-test-data-if-needed!
  "Call [[delete-old-test-data!]], only if we haven't done so already."
  []
  (when (compare-and-set! deleted-old-test-data? false true)
    (delete-old-test-data!)))

(defn- set-current-user-timezone!
  [timezone]
  (sql-jdbc.execute/do-with-connection-with-options
   :snowflake
   (no-db-connection-spec)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)]
       (.execute stmt (format "ALTER USER SET TIMEZONE = '%s';" timezone))))))

(defmethod tx/create-db! :snowflake
  [driver db-def & options]
  ;; qualify the DB name with the unique prefix
  (let [db-def (assoc db-def :database-name (qualified-db-name db-def))]
    ;; clean up any old test data (datasets and isolation schemas)
    (delete-old-test-data-if-needed!)
    ;; Snowflake by default uses America/Los_Angeles timezone. See https://docs.snowflake.com/en/sql-reference/parameters#timezone.
    ;; We expect UTC in tests. Hence fixing [[metabase.query-processor.timezone/database-timezone-id]] (PR #36413)
    ;; produced lot of failures. Following expression addresses that, setting timezone for the test user.
    (set-current-user-timezone! "UTC")
    ;; now call the default impl for SQL JDBC drivers
    (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))

(defmethod tx/destroy-db! :snowflake
  [_driver dbdef]
  (let [database-name (qualified-db-name dbdef)
        sql           (format "DROP DATABASE \"%s\";" database-name)]
    (log/infof "[Snowflake] %s" sql)
    (jdbc/query (no-db-connection-spec)
                ["DELETE FROM metabase_test_tracking.PUBLIC.datasets where name = ?" database-name])
    (jdbc/execute! (no-db-connection-spec) [sql])))

;; For reasons I don't understand the Snowflake JDBC driver doesn't seem to work when trying to use parameterized
;; INSERT statements, even though the documentation suggests it should. Just go ahead and deparameterize all the
;; statements for now.
(defmethod ddl/insert-rows-dml-statements :snowflake
  [driver table-identifier rows]
  (binding [driver/*compile-with-inline-parameters* true]
    ((get-method ddl/insert-rows-dml-statements :sql-jdbc/test-extensions) driver table-identifier rows)))

(defmethod execute/execute-sql! :snowflake
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :snowflake [_] "INTEGER AUTOINCREMENT")

(defmethod tx/id-field-type :snowflake [_] :type/Number)

(defmethod load-data/row-xform :snowflake
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

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

(defmethod sql.tx/generated-column-sql :snowflake [_ expr]
  (format "AS (%s)" expr))

(defn- setup-tracking-db!
  "Idempotently create test tracking database"
  [conn driver]
  (with-open [^PreparedStatement setup-1 (sql-jdbc.execute/prepared-statement
                                          driver
                                          conn
                                          "CREATE DATABASE IF NOT EXISTS metabase_test_tracking;"
                                          [])
              ^PreparedStatement setup-2 (sql-jdbc.execute/prepared-statement
                                          driver
                                          conn
                                          "CREATE TABLE IF NOT EXISTS metabase_test_tracking.PUBLIC.datasets (hash TEXT, name TEXT, accessed_at TIMESTAMP_TZ, access_note TEXT)"
                                          [])
              ^ResultSet _ (sql-jdbc.execute/execute-prepared-statement! driver setup-1)
              ^ResultSet _ (sql-jdbc.execute/execute-prepared-statement! driver setup-2)]
    nil))

(defn- dataset-tracked?!
  [conn driver db-def]
  (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement
                                       driver
                                       conn
                                       "SELECT true as tracked FROM metabase_test_tracking.PUBLIC.datasets WHERE hash = ? and name = ?"
                                       [(tx/hash-dataset db-def) (qualified-db-name db-def)])
              ^ResultSet rs (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
    (some-> rs
            resultset-seq
            first
            :tracked)))

(defn- database-exists?!
  [conn driver db-def]
  (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement
                                       driver
                                       conn
                                       "SHOW DATABASES LIKE ?"
                                       [(qualified-db-name db-def)])
              ^ResultSet rs (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
    (some-> rs resultset-seq first)))

(defmethod tx/dataset-already-loaded? :snowflake
  [driver db-def]
  ;; check and see if ANY tables are loaded for the current catalog
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :server db-def))
   {:write? false}
   (fn [^java.sql.Connection conn]
     (setup-tracking-db! conn driver)
     (and
      (dataset-tracked?! conn driver db-def)
      (database-exists?! conn driver db-def)))))

(defmethod tx/track-dataset :snowflake
  [driver db-def]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :server db-def))
   {:write? false}
   (fn [^java.sql.Connection conn]
     (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement
                                          driver
                                          conn
                                          (str "MERGE INTO metabase_test_tracking.PUBLIC.datasets d"
                                               "  USING (select ? as hash, ? as name, current_timestamp() as accessed_at, ? as access_note) as n on d.hash = n.hash"
                                               "  WHEN MATCHED THEN UPDATE SET d.accessed_at = n.accessed_at, d.access_note = n.access_note"
                                               "  WHEN NOT MATCHED THEN INSERT (hash,name, accessed_at, access_note) VALUES (n.hash, n.name, n.accessed_at, n.access_note)")
                                          [(tx/hash-dataset db-def)
                                           (qualified-db-name db-def)
                                           (tx/tracking-access-note)])
                 ^ResultSet rs (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
       (some-> rs resultset-seq doall)))))

(defn drop-if-exists-and-create-roles!
  [driver details roles]
  (let [spec  (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name _table-perms] roles]
      (doseq [statement [(format "DROP ROLE IF EXISTS %s;" role-name)
                         (format "CREATE ROLE %s;" role-name)]]
        (jdbc/execute! spec [statement] {:transaction? false})))))

(defn grant-table-perms-to-roles!
  [driver details roles]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)
        wh-name (:warehouse details)
        db-name (sql.tx/qualify-and-quote driver (:db details))
        schema-name (format "%s.\"PUBLIC\"" db-name)]
    (doseq [[role-name table-perms] roles]
      (doseq [statement [(format "GRANT USAGE ON WAREHOUSE %s TO ROLE %s" wh-name role-name)
                         (format "GRANT USAGE ON DATABASE %s TO ROLE %s" db-name role-name)
                         (format "GRANT USAGE ON SCHEMA %s TO ROLE %s" schema-name role-name)]]
        (jdbc/execute! spec [statement] {:transaction? false}))
      (doseq [[table-name _perms] table-perms]
        (jdbc/execute! spec
                       (format "GRANT SELECT ON TABLE %s TO ROLE %s" table-name role-name)
                       {:transaction? false})))))

(defn grant-roles-to-user!
  [driver details roles user-name]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name _table-perms] roles]
      (jdbc/execute! spec
                     [(format "GRANT ROLE %s TO USER \"%s\"" role-name user-name)]
                     {:transaction? false}))))

(defmethod tx/create-and-grant-roles! :snowflake
  [driver details roles user-name _default-role]
  (drop-if-exists-and-create-roles! driver details roles)
  (grant-table-perms-to-roles! driver details roles)
  (grant-roles-to-user! driver details roles user-name))

(defmethod tx/drop-roles! :snowflake
  [driver details roles _user-name]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name _table-perms] roles]
      (jdbc/execute! spec
                     [(format "DROP ROLE IF EXISTS %s;" role-name)]
                     {:transaction? false}))))

(defn set-user-public-key [details pk-user pub-key]
  (let [spec (sql-jdbc.conn/connection-details->spec :snowflake details)]
    (jdbc/execute! spec (format "ALTER USER %s SET RSA_PUBLIC_KEY = '%s'"
                                pk-user
                                pub-key))))

(defmethod tx/drop-db-user-if-exists! :snowflake
  [driver details db-user]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (jdbc/execute! spec [(format "DROP USER IF EXISTS \"%s\"" db-user)])))

(defmethod tx/create-db-user! :snowflake
  [driver details db-user]
  (tx/drop-db-user-if-exists! driver details db-user)
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (jdbc/execute! spec "USE ROLE ACCOUNTADMIN")
    (jdbc/execute! spec (format "CREATE USER %s
                                 DEFAULT_ROLE = 'ACCOUNTADMIN'
                                 DEFAULT_WAREHOUSE = '%s'
                                 MUST_CHANGE_PASSWORD = FALSE;"
                                db-user
                                (tx/db-test-env-var-or-throw driver :warehouse)))
    (jdbc/execute! spec (format "GRANT ROLE %s TO USER %s" "ACCOUNTADMIN" db-user))))

(comment
  (old-dataset-names)
  (into [] (jdbc/reducible-query (no-db-connection-spec) ["select * from metabase_test_tracking.PUBLIC.datasets"]))
  ;; Tracked databases ordered by age
  (->> ["select d.name, d.accessed_at, i.created, timestampdiff('minute', i.created, d.accessed_at) as diff, timestampdiff('minute', i.created, current_timestamp()) as age
         from metabase_test_tracking.PUBLIC.datasets d
         inner join metabase_test_tracking.information_schema.databases i on i.database_name = d.name
         order by 5 asc"]
       (jdbc/reducible-query (no-db-connection-spec))
       (into [] (map (juxt :name :diff :age :accessed_at :created))))

  ;; Tracked DBs that are not in snowflake
  (->> ["select name, accessed_at from metabase_test_tracking.PUBLIC.datasets d
       where d.name not in (select database_name from metabase_test_tracking.information_schema.databases)
       order by accessed_at"]
       (jdbc/reducible-query (no-db-connection-spec))
       (into [] (map (juxt :name :accessed_at))))

  ;; DBs in snowflake that are not tracked
  (->> ["select database_name, created from metabase_test_tracking.information_schema.databases  d
         where d.database_name not in (select name from metabase_test_tracking.PUBLIC.datasets)
         and d.database_name like 'sha_%'
         -- and created < dateadd(day, -2, current_timestamp())
         order by created"]
       (jdbc/reducible-query (no-db-connection-spec))
       (into [] (map (juxt :database_name :created)))))

(defmethod sql.tx/session-schema :snowflake [_driver] "PUBLIC")

;;; ------------------------------------------------ Fake Sync Support ------------------------------------------------

;; Enable fake sync for Snowflake on feature branches.
;; Fake sync skips network calls to the database for metadata sync, which saves significant CI time.
;; On master/release branches, use real sync to catch any sync regressions.
(defmethod driver/database-supports? [:snowflake :test/use-fake-sync]
  [_driver _feature _database]
  (not (tx/on-master-or-release-branch?)))

(defmethod tx/fake-sync-schema :snowflake
  [_driver]
  "PUBLIC")

(defmethod tx/fake-sync-table-name :snowflake
  [_driver _database-name table-name]
  ;; Snowflake uses separate databases per dataset, so table names are NOT prefixed
  ;; with the database name. Unlike Redshift (which uses test_data_venues), Snowflake
  ;; tables are just "venues" within the sha_xxx_test_data database.
  table-name)

(defmethod tx/fake-sync-database-type :snowflake
  [_driver base-type]
  ;; Return the database_type as Snowflake's query processor expects it.
  ;; The QP uses lowercase types without precision (e.g., "time" not "TIME(3)").
  ;; Snowflake normalizes types: TEXT->VARCHAR, FLOAT->DOUBLE, INTEGER->NUMBER
  ;;
  ;; For timezone columns: DDL uses TIMESTAMP_TZ, but DB reports as TIMESTAMPTZ
  (case base-type
    :type/Text                   "VARCHAR"
    :type/Float                  "DOUBLE"
    :type/Integer                "NUMBER"
    :type/BigInteger             "NUMBER"
    :type/Number                 "NUMBER"
    :type/Boolean                "BOOLEAN"
    :type/Date                   "date"
    :type/DateTime               "timestampntz"
    :type/DateTimeWithTZ         "timestamptz"   ; DDL: TIMESTAMP_TZ, reported as: TIMESTAMPTZ
    :type/DateTimeWithLocalTZ    "timestamptz"
    :type/DateTimeWithZoneID     "timestamptz"
    :type/DateTimeWithZoneOffset "timestamptz"
    :type/Time                   "time"
    :type/TimeWithLocalTZ        "time"
    :type/TimeWithZoneOffset     "time"
    ;; For other types, use the creation type
    (sql.tx/field-base-type->sql-type :snowflake base-type)))

(defmethod tx/fake-sync-base-type :snowflake
  [_driver base-type]
  ;; Snowflake normalizes some types. Real sync maps them to specific base_types,
  ;; so fake-sync must match what sync would produce:
  ;; - INTEGER/BIGINT -> NUMBER -> :type/Number
  ;; - TimeWithLocalTZ/TimeWithZoneOffset -> TIME -> :type/Time (Snowflake only has one TIME type)
  ;; - DateTimeWithTZ/DateTimeWithZoneID/DateTimeWithZoneOffset -> TIMESTAMP_TZ -> :type/DateTimeWithLocalTZ
  ;;   (Note: :type/DateTimeWithTZ -> TIMESTAMP_TZ -> sync as TIMESTAMPTZ -> :type/DateTimeWithLocalTZ)
  (case base-type
    :type/Integer                :type/Number
    :type/BigInteger             :type/Number
    :type/TimeWithLocalTZ        :type/Time
    :type/TimeWithZoneOffset     :type/Time
    :type/DateTimeWithTZ         :type/DateTimeWithLocalTZ
    :type/DateTimeWithZoneID     :type/DateTimeWithLocalTZ
    :type/DateTimeWithZoneOffset :type/DateTimeWithLocalTZ
    ;; Other types are unchanged
    base-type))

(defmethod tx/fake-sync-native-base-type :snowflake
  [_driver native-type]
  ;; Map native Snowflake type strings to their base_type.
  ;; These must match what sql-jdbc.sync/database-type->base-type returns for Snowflake.
  ;; See metabase.driver.snowflake for the full mapping.
  (case (some-> native-type u/upper-case-en)
    ;; Timestamp types
    "TIMESTAMPTZ"  :type/DateTimeWithLocalTZ
    "TIMESTAMPLTZ" :type/DateTimeWithTZ
    "TIMESTAMPNTZ" :type/DateTime
    "TIMESTAMP"    :type/DateTime
    ;; Other common types
    "VARCHAR"      :type/Text
    "TEXT"         :type/Text
    "NUMBER"       :type/Number
    "FLOAT"        :type/Float
    "DOUBLE"       :type/Float
    "BOOLEAN"      :type/Boolean
    "DATE"         :type/Date
    "TIME"         :type/Time
    ;; Default: unknown types get :type/*
    :type/*))
