(ns metabase.test.data.snowflake
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [com.climate.claypoole :as cp]
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

;; in CI use a completely different set of databases for each run and tear down
;; all of them when the job completes; see after-run below.
(defonce dataset-prefix (str (rand-int 9999999)))

(defn- already-qualified? [database-name]
  (and (string? database-name)
       (or (str/starts-with? database-name "isolate_")
           (str/starts-with? database-name "sha_"))))

(defn qualified-db-name
  "Isolate db name so we don't stomp on any other jobs running at the same time."
  [{:keys [database-name] :as db-def}]
  (cond (already-qualified? database-name) database-name
        ;; isolate if we are in a CI job
        (System/getenv "GITHUB_REF_NAME") (str "isolate_" dataset-prefix database-name)
        :else (str "sha_" (tx/hash-dataset db-def) "_" database-name)))

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
  (let [spec (no-db-connection-spec)
        query "select name from metabase_test_tracking.PUBLIC.datasets
                where name like 'isolate_%s%%'"]
    (doseq [{:keys [name]} (jdbc/query spec [(format query dataset-prefix)])]
      (jdbc/query spec
                  ["DELETE FROM metabase_test_tracking.PUBLIC.datasets where name = ?" name])
      (jdbc/execute! spec [(format "DROP DATABASE \"%s\";" name)]))))

(defn- old-dataset-names
  "Names of test databases old enough to delete, oldest first.

  [[qualified-db-name]] gives CI runs an `isolate_` name built from a random int -- per-run, never reused, so they
  age from `created`. Everything else is a `sha_` name from a local run, content-addressed and reused, so those age
  from `accessed_at` when the tracking table knows them.

  `accessed_at` is only trustworthy for `sha_`: the tracking table is keyed on dataset hash and its MERGE never
  updates `name`, so an `isolate_` row keeps the first run's name while later runs keep refreshing its `accessed_at`.

  Compares timestamps directly; `timestampdiff` counts boundary crossings, so an hour bucket calls a 10:59 database
  two hours old at 12:01."
  [{:keys [temp-data-hours fixture-hours]}]
  (into []
        (map :database_name)
        (jdbc/query (no-db-connection-spec)
                    [(format
                      "select d.database_name
                       from metabase_test_tracking.information_schema.databases d
                       left join metabase_test_tracking.PUBLIC.datasets t on t.name = d.database_name
                       where (startswith(d.database_name, 'isolate_')
                              and d.created < dateadd(hour, -%d, current_timestamp()))
                          or (startswith(d.database_name, 'sha_')
                              and coalesce(t.accessed_at, d.created) < dateadd(hour, -%d, current_timestamp()))
                       order by d.created"
                      temp-data-hours
                      fixture-hours)])))

;;; --------------------------------- Destruction ----------------------------------

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

(def ^:private drop-workers
  "Connections used to drop databases at once. Each `DROP DATABASE` is a round trip of roughly half a second and a
  backlog runs to thousands, which is what overran the job's first real run. Snowflake caps a session at 8 concurrent
  statements by default, so more workers than this buys queueing, not throughput."
  8)

(def ^:private untrack-batch-size
  "Names per `DELETE` when clearing tracking rows. Snowflake locks the whole table for DML, so this is one statement
  at a time by design -- the win is round trips, not concurrency."
  500)

(defn- drop-one!
  [^java.sql.Statement stmt dataset-name]
  (tx/print-progress! :snowflake "deleting %s" dataset-name)
  (try
    (.execute stmt (format "DROP DATABASE IF EXISTS \"%s\";" dataset-name))
    {:name dataset-name, :status :deleted}
    ;; usually just another job deleting the same dataset at the same time
    (catch Exception e
      {:name dataset-name, :status :failed, :error (ex-message e)})))

(defn- drop-chunk!
  "Drop one worker's share on a connection of its own: a JDBC Statement cannot be shared across threads, and
  reconnecting per database would cost more than the drop does."
  [dataset-names]
  (with-write-stmt!
    (fn [^java.sql.Statement stmt]
      (mapv #(drop-one! stmt %) dataset-names))))

(defn- untrack!
  "Forget these databases. Kept out of the workers: every row lives in one table, and Snowflake serializes DML on a
  table, so per-database deletes would have undone the parallelism they ran alongside."
  [dataset-names]
  (doseq [batch (partition-all untrack-batch-size dataset-names)]
    (jdbc/execute! (no-db-connection-spec)
                   (into [(format "delete from metabase_test_tracking.PUBLIC.datasets where name in (%s)"
                                  (str/join "," (repeat (count batch) "?")))]
                         batch))))

(defn- drop-datasets!
  "Un-track each named test database and then drop it, reporting per database whether it went. See [[tx/gc-orphans!]]
  for the shape.

  Un-tracking comes first so that being killed partway -- the GitHub job hitting its timeout -- leaves recoverable
  state. A database that is present but untracked is collected again by the next sweep, which ages an untracked
  `sha_` database from `created`, necessarily older than the `accessed_at` that made it eligible here. Dropping
  first would instead strand tracking rows for databases that no longer exist, and the sweep enumerates from
  `information_schema`, so it would never revisit them and the table would grow without bound.

  Each `DROP DATABASE IF EXISTS` is atomic and idempotent on its own, so no individual delete can be torn in half
  and the parallelism costs nothing in recoverability."
  [dataset-names]
  ;; nothing to drop is the common case on a healthy night; don't open a connection to discover that
  (if (empty? dataset-names)
    []
    (if-let [untrack-error (try
                             (untrack! dataset-names)
                             nil
                             (catch Exception e (ex-message e)))]
      ;; dropping anyway would strand exactly the rows we failed to clear, so drop nothing
      [{:name   nil
        :status :failed
        :error  (format "could not clear tracking rows for %d database(s), so dropped none of them: %s"
                        (count dataset-names) untrack-error)}]
      (let [chunks (partition-all (max 1 (long (Math/ceil (/ (count dataset-names) (double drop-workers)))))
                                  dataset-names)]
        (cp/with-shutdown! [pool (cp/threadpool (min drop-workers (count chunks)))]
          (into [] cat (doall (cp/pmap pool drop-chunk! chunks))))))))

;;; --------------------------------- Orphan GC ----------------------------------
;;;
;;; Nightly sweep (`.github/workflows/test.cleanup-dwh-data.yml`). This replaces the old in-process cleanup, which
;;; ran on every job and was disabled for causing hard-to-debug CI failures.

(defn- account
  "Label for the Snowflake account under sweep, used as the `:server` key in the nightly report."
  []
  (tx/db-test-env-var-or-throw :snowflake :account))

(defmethod tx/gc-orphans! :snowflake
  [_driver options]
  (let [server (account)]
    (mapv #(assoc % :server server) (drop-datasets! (old-dataset-names options)))))

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

(defonce ^:private set-up-tracking-db?
  (atom false))

(defn- setup-tracking-db-if-needed!
  "Call [[setup-tracking-db!]], only if we haven't done so already.

  Both of its statements are server round trips, and nothing drops `metabase_test_tracking` while a run is in
  progress, so once they have succeeded they only need repeating in the next process."
  [conn driver]
  (when-not @set-up-tracking-db?
    (setup-tracking-db! conn driver)
    (reset! set-up-tracking-db? true)))

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

(defmethod tx/track-dataset :snowflake
  [driver db-def]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :server db-def))
   {:write? false}
   (fn [^java.sql.Connection conn]
     (setup-tracking-db-if-needed! conn driver)
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
  (let [test-data (tx/get-dataset-definition (data.impl/resolve-dataset-definition
                                              *ns* 'test-data))]
    (tx/dataset-already-loaded? :snowflake test-data))
  (jdbc/query (no-db-connection-spec) ["SELECT query_text, end_time
                                        FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
                                        WHERE query_text LIKE 'DROP DATABASE %'
                                        ORDER BY end_time DESC limit 64"])
  ;; preview what the nightly sweep would collect, at its own thresholds
  (old-dataset-names {:temp-data-hours 2, :fixture-hours 72})
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
