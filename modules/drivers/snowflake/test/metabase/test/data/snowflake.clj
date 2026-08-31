(ns metabase.test.data.snowflake
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.sql PreparedStatement ResultSet)))

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

(defn- already-qualified? [database-name]
  (and (string? database-name)
       (or (str/starts-with? database-name "temp_")
           (str/starts-with? database-name "sha_"))))

(def ^:private to-cleanup (atom #{}))

(defn qualified-db-name
  "Isolate db name so we don't stomp on any other jobs running at the same time."
  [{:keys [database-name options] :as db-def}]
  (cond (already-qualified? database-name) database-name
        (:static options) (str "sha_" (tx/hash-dataset (update db-def :options
                                                               dissoc :static))
                               "_" database-name)
        :else (let [name (sql.tu.unique-prefix/unique-prefix database-name)]
                (swap! to-cleanup conj name)
                name)))

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
   (if (already-qualified? db-name)
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

;;; --------------------------------- Cleanup ----------------------------------

(defmethod tx/after-run :snowflake [_driver]
  (let [spec (no-db-connection-spec)]
    (doseq [name @to-cleanup]
      (jdbc/execute! spec [(format "DROP DATABASE \"%s\";" name)]))))

(defn- with-write-stmt!
  "Open a write-capable Snowflake connection + Statement, call `f` with the stmt,
  close everything. Centralizes the boilerplate so the per-resource drop fns
  don't repeat it."
  [f & args]
  (sql-jdbc.execute/do-with-connection-with-options
   :snowflake
   (no-db-connection-spec)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)]
       (apply f stmt args)))))

;;; --------------------------------- Orphan GC ----------------------------------
;;;
;;; Nightly sweep (`.github/workflows/test.cleanup-dwh-data.yml`). This replaces the old in-process cleanup, which
;;; ran on every job and was disabled for causing hard-to-debug CI failures.

(defn- account
  "Label for the Snowflake account under sweep, used as the `:server` key in the nightly report."
  []
  (tx/db-test-env-var-or-throw :snowflake :account))

(defn- drop-orphan [conn server dry-run? name]
  (try
    (when-not dry-run?
      (jdbc/execute! conn [(format "DROP DATABASE \"%s\";" name)]))
    {:server server :name name :status :deleted}
    (catch Exception e
      {:server server :name name :status :error :error (ex-message e)})))

(defn- gc-orphans! [conn _stmt {:keys [hours dry-run?]}]
  (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement
                                       :snowflake conn
                                       "SHOW TERSE DATABASES STARTS WITH 'temp_' LIMIT 256"
                                       [])
              ^ResultSet rs (sql-jdbc.execute/execute-prepared-statement! :snowflake stmt)]
    (->> (resultset-seq rs)
         (filter (partial sql.tu.unique-prefix/old-temp-dataset? hours))
         (mapv (partial drop-orphan conn (account) dry-run?)))))

(defn- drop-tracked-dataset [conn server dry-run? {:keys [database_name]}]
  (try
    (when-not dry-run?
      (jdbc/execute! conn [(format "DROP DATABASE IF EXISTS \"%s\";" database_name)])
      (jdbc/execute! conn ["DELETE FROM metabase_test_tracking.PUBLIC.datasets where name = ?"
                           database_name]))
    {:server server :name name :status :deleted}
    (catch Exception e
      {:server server :name name :status :error :error (ex-message e)})))

(defn- gc-tracked-datasets!
  "Datasets created by CI runs from older versions still use the tracking table. Until
  we stop supporting version 58 and 64 we'll have to keep GCing these, but we handle them
  in a separate function so they'll be easier to delete later."
  [conn _stmt {:keys [hours dry-run?]}]
  (->> (jdbc/query (no-db-connection-spec)
                   [(format
                     "select d.database_name
                       from metabase_test_tracking.information_schema.databases d
                       left join metabase_test_tracking.PUBLIC.datasets t on t.name = d.database_name
                       where (startswith(d.database_name, 'isolate_')
                              and d.created < dateadd(hour, -%d, current_timestamp()))
                          or (startswith(d.database_name, 'sha_')
                              and coalesce(t.accessed_at, d.created) < dateadd(hour, -%d, current_timestamp()))
                       order by d.created"
                     hours hours)])
       (mapv (partial drop-tracked-dataset conn (account) dry-run?))))

(defmethod tx/gc-orphans! :snowflake
  [_driver options]
  (concat (with-write-stmt! gc-orphans! options)
          (with-write-stmt! gc-tracked-datasets! options)))

(defmethod tx/count-datasets :snowflake
  [_driver]
  {(account) (:count (first (jdbc/query (no-db-connection-spec)
                                        ["select count(*) as count
                                          from metabase_test_tracking.information_schema.databases"])))})

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
    ;; Snowflake by default uses America/Los_Angeles timezone. See https://docs.snowflake.com/en/sql-reference/parameters#timezone.
    ;; We expect UTC in tests. Hence fixing [[metabase.query-processor.timezone/database-timezone-id]] (PR #36413)
    ;; produced lot of failures. Following expression addresses that, setting timezone for the test user.
    (set-current-user-timezone! "UTC")
    ;; now call the default impl for SQL JDBC drivers
    (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))

(defmethod tx/destroy-db! :snowflake
  [_driver dbdef]
  (when (= "test-data" (:database-name dbdef))
    (throw (Exception. "tried to delete test-data dataset.")))
  (let [database-name (qualified-db-name dbdef)
        sql           (format "DROP DATABASE \"%s\";" database-name)]
    (log/infof "[Snowflake] %s" sql)
    ;; test-harness cleanup output goes to the CI console, not the app log
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println "[Snowflake] destroy database " database-name (:database-name dbdef))
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

(defmethod tx/id-field-type :snowflake [_] :type/BigInteger)

(defmethod load-data/row-xform :snowflake
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

;; Load each chunk without wrapping it in a transaction: on Snowflake `setAutoCommit` and `commit` are each a server
;; round trip, so the default per-chunk transaction turns one INSERT into three. [[load-data/create-db!]] has already
;; put this connection in autocommit mode, so the rows still land. No atomicity is lost - every chunk committed
;; separately anyway, and [[dataset-rows-ok?!]] is what catches a half-loaded dataset and forces a reload.
(defmethod load-data/do-insert! :snowflake
  [driver conn table-identifier rows]
  (load-data/do-insert*! driver conn table-identifier rows {:transaction? false}))

(defmethod sql.tx/generated-column-sql :snowflake [_ expr]
  (format "AS (%s)" expr))

(defn- database-exists?!
  [conn driver db-def]
  (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement
                                       driver
                                       conn
                                       "SHOW DATABASES LIKE ?"
                                       [(qualified-db-name db-def)])
              ^ResultSet rs (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
    (some-> rs resultset-seq first)))

(defn- dataset-rows-ok?! [conn {:keys [table-definitions] :as dataset}]
  ;; sometimes for unknown reasons we get datasets double- or triple-inserted
  ;; and we have not been able to determine why. if a dataset has too many rows,
  ;; treat it as if it hasn't been loaded and force it to be reloaded.
  (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement
                                       :snowflake conn
                                       (format "SHOW TABLES IN DATABASE \"%s\""
                                               (qualified-db-name dataset)) [])
              ^ResultSet rs (sql-jdbc.execute/execute-prepared-statement! :snowflake stmt)]
    (let [table-names (set (map :table-name table-definitions))
          db-tables (->> (resultset-seq rs)
                         ;; there are some other tables of unknown source in there
                         ;; like "g_inspector_ji_f9f65557_e249_4543_ab34_9e"
                         (filter #(table-names (:name %))))
          db-row-counts (zipmap (map :name db-tables) (map :rows db-tables))
          dataset-row-counts (zipmap (map :table-name table-definitions)
                                     (map (comp count :rows) table-definitions))]
      (= db-row-counts dataset-row-counts))))

(defmethod tx/dataset-already-loaded? :snowflake
  [driver db-def]
  ;; check and see if ANY tables are loaded for the current catalog
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :server db-def))
   {:write? false}
   (fn [^java.sql.Connection conn]
     (and (database-exists?! conn driver db-def)
          (dataset-rows-ok?! conn db-def)))))

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
  (let [test-data (tx/get-dataset-definition (data.impl/resolve-dataset-definition
                                              *ns* 'test-data))]
    (tx/dataset-already-loaded? :snowflake test-data))
  (jdbc/query (no-db-connection-spec) ["SELECT query_text, end_time
                                        FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
                                        WHERE query_text LIKE 'DROP DATABASE %'
                                        ORDER BY end_time DESC limit 64"]))

(defmethod sql.tx/session-schema :snowflake [_driver] "PUBLIC")

;;; ------------------------------------------------ Fake Sync Support ------------------------------------------------

;; Enable fake sync for Snowflake on feature branches.
;; Fake sync skips network calls to the database for metadata sync, which saves significant CI time.
;; On master/release branches, use real sync to catch any sync regressions.
(defmethod driver/database-supports? [:snowflake :test/use-fake-sync]
  [_driver _feature _database]
  (not (tx/on-master-or-release-branch?)))

;; too much contention here causing unreliable tests
(defmethod driver/database-supports? [:snowflake :test/dynamic-dataset-loading]
  [_driver _feature _database] false)

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
  ;;
  ;; - `(BIG)INTEGER` -> `NUMBER` + JDBC Type `java.sql.Types/BIGINT` -> `:type/BigInteger` (as of #67609)
  ;;
  ;; - TimeWithLocalTZ/TimeWithZoneOffset -> TIME -> :type/Time (Snowflake only has one TIME type)
  ;;
  ;; - DateTimeWithTZ/DateTimeWithZoneID/DateTimeWithZoneOffset -> TIMESTAMP_TZ -> :type/DateTimeWithLocalTZ
  ;;   (Note: :type/DateTimeWithTZ -> TIMESTAMP_TZ -> sync as TIMESTAMPTZ -> :type/DateTimeWithLocalTZ)
  (case base-type
    :type/Integer                :type/BigInteger
    :type/BigInteger             :type/BigInteger
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
