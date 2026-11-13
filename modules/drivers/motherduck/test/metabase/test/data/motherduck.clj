(ns metabase.test.data.motherduck
  "Test data extensions for the MotherDuck driver.

  Load test data through the MotherDuck Postgres endpoint with the same connection settings as
  the driver under test. Inherit the Postgres and SQL-JDBC test extensions, with overrides for DuckDB SQL and
  endpoint behavior."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection-test :as connection-test]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-table-test :as describe-table-test]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   ;; Load the inherited test extensions, including the row-xform method used below.
   [metabase.test.data.postgres]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.log :as log]
   [metabase.util.random :as u.random])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

;; Postgres already inherits the SQL-JDBC test extensions. Calling add-test-extensions! again
;; for MotherDuck would fail because clojure.core/derive rejects a redundant ancestor.

(doseq [[feature supported?] {::describe-table-test/describe-materialized-view-fields false ; MotherDuck has no materialized views
                              ;; The driver adds an explicit ESCAPE clause to LIKE; run the shared escaping tests.
                              :test/escaping-like-metacharacters true
                              ;; This pooling test invalidates the user name. The endpoint authenticates
                              ;; with the token and ignores the user name, so the connection stays valid.
                              ::connection-test/regular-connection-pooling false}]
  (defmethod driver/database-supports? [:motherduck feature] [_driver _feature _db] supported?))

;; The endpoint ignores unknown connection options. A nonexistent database reliably fails to connect.
(defmethod tx/bad-connection-details :motherduck
  [_driver]
  {:dbname (u.random/random-name)})

;; The inherited query uses public, but DuckDB's default schema is main.
(defmethod tx/agg-venues-by-category-id :motherduck
  [_driver]
  (str "SELECT category_id, array_agg(name) FROM main.venues"
       " GROUP BY category_id"
       " ORDER BY 1 ASC"
       " LIMIT 2;"))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection details                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Concurrent CI jobs share one MotherDuck account, so every test database gets a qualified name.
;;
;; Static datasets (`defdataset` and `defdataset-edn`) never change once loaded, so every job shares one copy of each:
;; `sha_<date>_<hash>_<name>`. The hash covers the dataset's definition, so a changed definition gets a new database.
;; The date is the UTC day the name was first used, so each copy lives for about a day: the nightly sweep
;; ([[tx/gc-orphans!]] below) drops it once nothing can still be using it, and a copy that a test polluted, say with
;; a table it didn't get to drop, lasts a day rather than forever.
;;
;; Every other dataset is private to its JVM: temp_<date>_<hour>_<site-uuid>_<name>. after-run drops it, and the
;; nightly sweep drops whatever a cancelled job left behind.

(defn- already-qualified? [database-name]
  (or (str/starts-with? database-name "temp_")
      (str/starts-with? database-name "sha_")))

(defn- static? [dbdef]
  (boolean (get-in dbdef [:options :static])))

(def ^:private ^{:arglists '([dataset-hash database-name])} shared-db-name
  ;; Memoized, so a JVM that crosses midnight UTC keeps using the copy it already has rather than looking for a new
  ;; one partway through, between checking whether a dataset is loaded and connecting to it.
  (memoize
   (fn [dataset-hash database-name]
     (-> (format "sha_%s_%s_%s" (t/local-date (t/instant) (t/zone-id "UTC")) dataset-hash database-name)
         (str/replace #"-" "_")))))

(defn- qualified-db-name
  "Name of the MotherDuck database for `dbdef`. Callers that know only a dataset's name may pass `{:database-name
  name}`, which is never static."
  [{:keys [database-name], :as dbdef}]
  (cond
    (already-qualified? database-name) database-name
    (static? dbdef)                    (shared-db-name (tx/hash-dataset (update dbdef :options dissoc :static))
                                                       database-name)
    :else                              (sql.tu.unique-prefix/unique-prefix database-name)))

;; Use the same endpoint and credentials for test setup and driver queries. MB_MOTHERDUCK_TEST_*
;; variables override the defaults; MB_MOTHERDUCK_TEST_TOKEN is required.
;;
;; The endpoint requires an existing database even for CREATE DATABASE and DROP DATABASE. Connect
;; the :server context to my_db, or MB_MOTHERDUCK_TEST_SERVER_DBNAME, so setup and cleanup can run
;; independently of the test database. Other contexts use the requested database, including nil
;; contexts from callers that supply a database-name.
(defn- server-dbname []
  (tx/db-test-env-var :motherduck :server-dbname "my_db"))

(defmethod tx/dbdef->connection-details :motherduck
  [_driver context {:keys [database-name], :as dbdef}]
  {:host     (tx/db-test-env-var :motherduck :host "pg.us-east-1-aws.motherduck.com")
   :port     (parse-long (tx/db-test-env-var :motherduck :port "5432"))
   :user     (tx/db-test-env-var :motherduck :user "metabase")
   :password (tx/db-test-env-var-or-throw :motherduck :token)
   :ssl      true
   :dbname   (if (and database-name
                      (not= context :server))
               (qualified-db-name dbdef)
               (server-dbname))})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              DDL / type dialect                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[base-type db-type] {:type/BigInteger          "BIGINT"
                             :type/Boolean             "BOOL"
                             :type/Date                "DATE"
                             :type/DateTime            "TIMESTAMP"
                             :type/DateTimeWithTZ      "TIMESTAMPTZ"
                             :type/Decimal             "DECIMAL"
                             :type/Float               "DOUBLE"
                             :type/Integer             "INTEGER"
                             :type/Text                "STRING"
                             :type/Time                "TIME"
                             :type/TimeWithTZ          "TIMETZ"
                             :type/TimeWithLocalTZ     "TIMETZ"
                             :type/TimeWithZoneOffset  "TIMETZ"
                             :type/UUID                "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:motherduck base-type]
    [_driver _type]
    db-type))

;; DuckDB has no SERIAL type. Use INTEGER and let row-xform generate the IDs.
(defmethod sql.tx/pk-sql-type :motherduck [_] "INTEGER")

;; Qualify test tables with DuckDB's default schema rather than Postgres public.
(defmethod sql.tx/session-schema :motherduck [_driver] "main")

(defmethod sql.tx/create-db-sql :motherduck
  [driver dbdef]
  (format "CREATE DATABASE IF NOT EXISTS %s;"
          (sql.tx/qualify-and-quote driver (qualified-db-name dbdef))))

;; The inherited method uses a Postgres DO block to terminate other connections. DuckDB does not
;; support that block. The :server connection uses a different database, so DROP can run directly.
(defmethod ddl/drop-db-ddl-statements :motherduck
  [driver dbdef & _]
  [(format "DROP DATABASE IF EXISTS %s CASCADE;"
           (sql.tx/qualify-and-quote driver (qualified-db-name dbdef)))])

;; DuckDB can't add a foreign key with ALTER TABLE, so declare foreign keys in CREATE TABLE instead
;; (below) and skip the loader's separate step.
(defmethod sql.tx/add-fk-sql :motherduck [& _] nil)

(defn- fk-target
  "Name of the table that `fielddef` references, or nil if it isn't a foreign key."
  [{:keys [fk]}]
  (some-> fk name))

(defn- inline-fk-sql
  "FOREIGN KEY clause for `fielddef` in `table-name`, referencing the target table's primary key.

  Skip self-references: DuckDB checks a row's foreign keys before inserting the row, and runs UPDATE as a delete plus
  an insert, so no row can ever reference itself. The `test-data-self-referencing-user` dataset needs exactly that."
  [driver dbdef table-name {:keys [field-name], :as fielddef}]
  (let [target (fk-target fielddef)
        pks    (some->> (sql.tx/get-tabledef dbdef target)
                        :field-definitions
                        sql.tx/fielddefs->pk-field-names)]
    (when (and target
               (not= target table-name)
               (= 1 (count pks)))
      (format "FOREIGN KEY (%s) REFERENCES %s (%s)"
              (sql.tx/format-and-quote-field-name driver field-name)
              (sql.tx/qualify-and-quote driver (:database-name dbdef) target)
              (sql.tx/format-and-quote-field-name driver (first pks))))))

(defmethod sql.tx/create-table-sql :motherduck
  [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions], :as tabledef}]
  (let [fks (keep #(inline-fk-sql driver dbdef table-name %) field-definitions)
        sql ((get-method sql.tx/create-table-sql :sql/test-extensions) driver dbdef tabledef)]
    (if (empty? fks)
      sql
      ;; The inherited statement ends its column list with the PRIMARY KEY clause.
      (let [pk-clause (re-find #", PRIMARY KEY \([^)]*\)" sql)]
        (assert pk-clause (format "Expected a PRIMARY KEY clause in CREATE TABLE for %s.%s"
                                  database-name
                                  table-name))
        (str/replace-first sql pk-clause (str pk-clause ", " (str/join ", " fks)))))))

(defn- parents-first
  "Order `tabledefs` so every table comes after the tables it references, keeping the original order otherwise.
  Tables must be created this way because a FOREIGN KEY clause needs its target to exist, and loaded this way
  because DuckDB checks foreign keys on insert."
  [tabledefs]
  (let [names (into #{} (map :table-name) tabledefs)
        deps  (fn [{:keys [table-name field-definitions]}]
                (into #{} (comp (keep fk-target)
                                (filter names)
                                (remove #{table-name}))
                      field-definitions))]
    (loop [done      #{}
           ordered   []
           remaining tabledefs]
      (if (empty? remaining)
        ordered
        (let [ready (filter #(every? done (deps %)) remaining)]
          (when (empty? ready)
            (throw (ex-info "Foreign keys between test tables form a cycle; DuckDB can't load them"
                            {:tables (map :table-name remaining)})))
          (recur (into done (map :table-name) ready)
                 (into ordered ready)
                 (remove (set ready) remaining)))))))

;; DuckDB supports virtual generated columns, the default when STORED is omitted.
(defmethod sql.tx/generated-column-sql :motherduck [_ expr]
  (format "GENERATED ALWAYS AS (%s)" expr))

;; Generate IDs without SERIAL, then reuse Postgres JSON casts to give bound values an explicit type.
(defmethod load-data/row-xform :motherduck
  [driver dbdef tabledef]
  (comp (load-data/maybe-add-ids-xform tabledef)
        ((get-method load-data/row-xform :postgres) driver dbdef tabledef)))

;; Split large datasets into batches to stay below pgjdbc's 65,535-parameter limit.
(defmethod load-data/chunk-size :motherduck
  [_driver _dbdef _tabledef]
  200)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Statement execution                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The endpoint returns a result set for some statements, including SET and COMMENT ON, even in
;; Metabase compatibility mode. Use Statement.execute, which accepts result sets, instead of executeUpdate.
(defmethod execute/execute-sql! :motherduck
  [driver ^Connection conn sql]
  (execute/default-execute-sql!
   driver conn sql :execute!
   (fn [^Connection conn ^String sql]
     (with-open [stmt (.createStatement conn)]
       (.execute stmt sql)))))

(defmethod load-data/do-insert! :motherduck
  [driver ^Connection conn table-identifier rows]
  ;; The inherited method uses executeUpdate for SET, which rejects the endpoint's result set.
  ;; Set the session time zone with execute before loading rows.
  (with-open [stmt (.createStatement conn)]
    (.execute stmt "SET SESSION TIMEZONE TO 'UTC';"))
  ;; Prevent parameter binding from looking up the database time zone before sync completes.
  (mt/with-database-timezone-id nil
    (doseq [[sql & params] (ddl/insert-rows-dml-statements driver table-identifier rows)]
      (try
        (with-open [stmt (.prepareStatement conn ^String sql)]
          (when (seq params)
            (sql-jdbc.execute/set-parameters! driver stmt params))
          (.execute stmt))
        (catch Throwable e
          (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                          {:driver driver
                           :sql    sql}
                          e)))))))

;; Reuse the SQL-JDBC view builders with the execution method above, which accepts result sets.
(defmethod tx/create-view-of-table! :motherduck
  [driver database view-name table-name options]
  (sql-jdbc.execute/do-with-connection-with-options
   driver (driver.u/ensure-lib-database database) {:write? true}
   (fn [conn]
     (->> (sql.tx/create-view-of-table-sql driver database view-name table-name options)
          first
          (execute/execute-sql! driver conn)))))

(defmethod tx/drop-view! :motherduck
  [driver database view-name options]
  (sql-jdbc.execute/do-with-connection-with-options
   driver (driver.u/ensure-lib-database database) {:write? true}
   (fn [conn]
     (->> (sql.tx/drop-view-sql driver database view-name options)
          first
          (execute/execute-sql! driver conn)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      create / load / cleanup lifecycle                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-server-connection
  "Call `f` with a connection to the server database, which every database can be created and dropped from."
  [f]
  (sql-jdbc.execute/do-with-connection-with-options
   :motherduck (spec/dbdef->spec :motherduck :server nil) {:write? true} f))

(defn- execute-on-server! [^String sql]
  (do-with-server-connection
   (fn [^Connection conn]
     (with-open [stmt (.createStatement conn)]
       (.execute stmt sql)))))

(defn- drop-database! [^Connection conn db-name]
  (with-open [stmt (.createStatement conn)]
    (.execute stmt (format "DROP DATABASE IF EXISTS \"%s\" CASCADE;" db-name))))

(defn- database-exists?
  "Does the account have a database named `db-name`? Read the account catalog, since the server connection attaches
  only its own database; see [[test-database-names]]."
  [db-name]
  (do-with-server-connection
   (fn [^Connection conn]
     (with-open [stmt (.prepareStatement conn (str "SELECT 1 FROM MD_ALL_DATABASES() "
                                                   "WHERE type = 'motherduck' AND \"alias\" = ?"))]
       (.setString stmt 1 db-name)
       (with-open [rset (.executeQuery stmt)]
         (.next rset))))))

(defonce ^{:private true
           :doc "Names of the private test databases created or reused by this run, for after-run to drop. Shared
                 static datasets are never registered: other jobs are using them."}
  created-databases
  (atom #{}))

(defn- load-db! [driver dbdef options]
  (apply load-data/create-db! driver (update dbdef :table-definitions parents-first) options))

(defn- create-shared-db!
  "Load a static dataset into a private staging database, then publish it under its shared name with a single
  zero-copy clone. Other jobs therefore see the shared database complete or not at all, never half-loaded.

  Two jobs that miss the same dataset at the same time both load it, and the second clone is a no-op. Loading twice
  is the price of not needing a lock between jobs."
  [driver dbdef options]
  (let [shared  (qualified-db-name dbdef)
        staging (sql.tu.unique-prefix/unique-prefix (str "staging_" (:database-name dbdef)))]
    (try
      ;; A staging database left by an earlier, interrupted load in this hour may be half-loaded.
      (execute-on-server! (format "DROP DATABASE IF EXISTS \"%s\" CASCADE;" staging))
      (load-db! driver
                (-> dbdef
                    (assoc :database-name staging)
                    (update :options dissoc :static))
                options)
      (execute-on-server! (format "CREATE DATABASE IF NOT EXISTS \"%s\" FROM \"%s\";" shared staging))
      (finally
        (try
          (execute-on-server! (format "DROP DATABASE IF EXISTS \"%s\" CASCADE;" staging))
          (catch Exception e
            ;; The nightly sweep collects it, and the load's own exception, if any, is the one worth seeing.
            (log/warnf e "Could not drop staging database %s" staging)))))))

(defmethod tx/create-db! :motherduck
  [driver dbdef & options]
  (if (static? dbdef)
    (create-shared-db! driver dbdef options)
    (do
      (swap! created-databases conj (qualified-db-name dbdef))
      (load-db! driver dbdef options))))

;; The test harness destroys a database whose load or sync failed. A shared database was cloned whole from a
;; finished load, so it is never half-loaded, and other jobs may be querying it. The staging database a failed load
;; leaves is dropped by [[create-shared-db!]].
(defmethod tx/destroy-db! :motherduck
  [driver dbdef]
  (if (static? dbdef)
    (log/warnf "Not dropping %s: other test runs share it" (qualified-db-name dbdef))
    ((get-method tx/destroy-db! :postgres) driver dbdef)))

(defmethod tx/dataset-already-loaded? :motherduck
  [driver dbdef]
  (if (static? dbdef)
    ;; A shared database exists only once its load has finished; see create-shared-db!.
    (database-exists? (qualified-db-name dbdef))
    (do
      ;; Include reused datasets in cleanup, even when create-db! does not run.
      (swap! created-databases conj (qualified-db-name dbdef))
      (try
        (sql-jdbc.execute/do-with-connection-with-options
         driver
         (spec/dbdef->spec driver :db dbdef)
         {:write? false}
         (fn [^java.sql.Connection conn]
           ;; An existing database may be left empty by an interrupted load. Check for the first
           ;; dataset table rather than treating a successful connection as proof that data was loaded.
           (with-open [stmt (.prepareStatement conn (str "SELECT 1 FROM duckdb_tables() "
                                                         "WHERE database_name = current_database() AND table_name = ? "
                                                         "LIMIT 1"))]
             (.setString stmt 1 (:table-name (first (:table-definitions dbdef))))
             (with-open [rset (.executeQuery stmt)]
               (.next rset)))))
        (catch Throwable _
          ;; A missing database fails at connection time.
          false)))))

(defmethod tx/before-run :motherduck
  [_driver]
  ;; Clear names left by an earlier run in the same JVM.
  (reset! created-databases #{}))

(defn- drop-registered-databases!
  "Drop each of `db-names`, carrying on past any that fail: one bad DROP must not leave the rest for the nightly
  sweep. Return the names that could not be dropped."
  [^Connection conn db-names]
  (into []
        (remove (fn [db-name]
                  (try
                    (drop-database! conn db-name)
                    true
                    (catch Exception e
                      (log/warnf e "Could not drop test database %s; the nightly sweep will" db-name)
                      false))))
        db-names))

(defmethod tx/after-run :motherduck
  [_driver]
  ;; Drop the private test databases registered during this run, including reused ones.
  (try
    (let [failed (do-with-server-connection #(drop-registered-databases! % @created-databases))]
      (when (seq failed)
        (log/warnf "Could not drop %d of %d test database(s)" (count failed) (count @created-databases))))
    (finally
      (reset! created-databases #{}))))

;; For tests that create their own database. `dbdef->connection-details` prefixes the name, so create it under the
;; prefixed name too, and register it for cleanup. The inherited method ends other sessions with
;; `pg_terminate_backend`, which the endpoint doesn't have.
(defmethod tx/drop-if-exists-and-create-db! :motherduck
  [_driver db-name & [just-drop]]
  (let [db-name (qualified-db-name {:database-name db-name})]
    (swap! created-databases conj db-name)
    (do-with-server-connection
     (fn [^Connection conn]
       (drop-database! conn db-name)
       (when-not (= just-drop :just-drop)
         (with-open [stmt (.createStatement conn)]
           (.execute stmt (format "CREATE DATABASE \"%s\";" db-name))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Orphan GC                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Nightly sweep (`.github/workflows/test.cleanup-dwh-data.yml`) of private databases left behind by jobs that were
;; cancelled before after-run could drop them, and of shared static datasets from earlier days.

(defn- account
  "Label for the MotherDuck account under sweep, used as the `:server` key in the nightly report."
  []
  (format "%s/%s"
          (tx/db-test-env-var :motherduck :host "pg.us-east-1-aws.motherduck.com")
          (server-dbname)))

(defn- test-database-names
  "Names of every test database in the account: private temp_ ones and shared sha_ ones.

  Read MotherDuck's account catalog with `MD_ALL_DATABASES()`, not `duckdb_databases()`. Connections attach only their
  own database, so `duckdb_databases()` would list just the server database. `MD_ALL_DATABASES()` lists attached and
  unattached databases alike, and `DROP DATABASE` works on a database that isn't attached."
  [^Connection conn]
  (with-open [stmt (.createStatement conn)
              rset (.executeQuery stmt (str "SELECT \"alias\" AS database_name FROM MD_ALL_DATABASES() "
                                            "WHERE type = 'motherduck' "
                                            "AND (starts_with(\"alias\", 'temp_') "
                                            "OR starts_with(\"alias\", 'sha_'))"))]
    (into [] (map :database_name) (resultset-seq rset))))

(defn- old-shared-database?
  "Is this shared static dataset more than `hours` past the end of the UTC day it is named for? Jobs start using a
  shared name only on its own day, so by then none can still be using it. Names that don't parse are kept."
  [hours db-name]
  (if-let [[_ year month day] (re-matches #"^sha_(\d{4})_(\d{2})_(\d{2})_.*$" db-name)]
    (t/before? (-> (t/local-date-time (parse-long year) (parse-long month) (parse-long day) 0 0)
                   (t/plus (t/days 1) (t/hours hours)))
               (t/local-date-time (t/instant) (t/zone-id "UTC")))
    false))

(defn- old-test-database? [hours db-name]
  (or (sql.tu.unique-prefix/old-temp-dataset? hours db-name)
      (old-shared-database? hours db-name)))

(defn- drop-orphan! [^Connection conn dry-run? db-name]
  (try
    (when-not dry-run?
      (drop-database! conn db-name))
    {:server (account)
     :name   db-name
     :status :deleted}
    (catch Exception e
      {:server (account)
       :name   db-name
       :status :failed
       :error  (ex-message e)})))

(defmethod tx/gc-orphans! :motherduck
  [_driver {:keys [hours dry-run?]}]
  (do-with-server-connection
   (fn [conn]
     (into [] (comp (filter #(old-test-database? hours %))
                    (map #(drop-orphan! conn dry-run? %)))
           (test-database-names conn)))))

(defmethod tx/count-datasets :motherduck
  [_driver]
  {(account) (try
               (count (do-with-server-connection test-database-names))
               (catch Exception _
                 nil))})
