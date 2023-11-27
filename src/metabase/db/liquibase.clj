(ns metabase.db.liquibase
  "High-level Clojure wrapper around relevant parts of the Liquibase API."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.db.custom-migrations]
   [metabase.db.liquibase.h2 :as liquibase.h2]
   [metabase.db.liquibase.mysql :as liquibase.mysql]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.connection :as t2.conn])
  (:import
   (java.io StringWriter)
   (java.util List Map)
   (liquibase Contexts LabelExpression Liquibase Scope Scope$Attr Scope$ScopedRunner RuntimeEnvironment)
   (liquibase.change.custom CustomChangeWrapper)
   (liquibase.changelog ChangeLogIterator ChangeSet ChangeSet$ExecType)
   (liquibase.changelog.visitor AbstractChangeExecListener ChangeExecListener UpdateVisitor)
   (liquibase.database Database DatabaseFactory)
   (liquibase.database.jvm JdbcConnection)
   (liquibase.exception LockException)
   (liquibase.lockservice LockService LockServiceFactory)
   (liquibase.resource ClassLoaderResourceAccessor)))

(set! *warn-on-reflection* true)

(comment
  ;; load our custom migrations
  metabase.db.custom-migrations/keep-me)

;; register our custom MySQL SQL generators
(liquibase.mysql/register-mysql-generators!)

;; Liquibase uses java.util.logging (JUL) for logging, so we need to install the JUL -> Log4j2 bridge which replaces the
;; default JUL handler with one that "writes" log messages to Log4j2. (Not sure this is the best place in the world to
;; do this, but Liquibase is the only thing using JUL directly.)
;;
;; See https://logging.apache.org/log4j/2.x/log4j-jul/index.html for more information.
(org.apache.logging.log4j.jul.Log4jBridgeHandler/install true nil true)

;; Liquibase logs a message for every ChangeSet directly to standard out -- see
;; https://github.com/liquibase/liquibase/issues/2396 -- but we can disable this by setting the ConsoleUIService's
;; output stream to the null output stream
(doto ^liquibase.ui.ConsoleUIService (.getUI (Scope/getCurrentScope))
  ;; we can't use `java.io.OutputStream/nullOutputStream` here because it's not available on Java 8
  (.setOutputStream (java.io.PrintStream. (org.apache.commons.io.output.NullOutputStream.))))

(def ^{:private true
       :doc     "Liquibase setting used for upgrading instances running version < 45."}
  ^String changelog-legacy-file "liquibase_legacy.yaml")

(def ^{:private true
       :doc     "Liquibase setting used for upgrading a fresh instance or instances running version >= 45."}
  ^String changelog-file "liquibase.yaml")

(defn changelog-table-name
  "Return the proper changelog table name based on db type of the connection."
  [^java.sql.Connection conn]
  (if (= "PostgreSQL" (-> conn .getMetaData .getDatabaseProductName))
    "databasechangelog"
    "DATABASECHANGELOG"))

(defn table-exists?
  "Check if a table exists."
  [table-name ^java.sql.Connection conn]
  (-> (.getMetaData conn)
      (.getTables  nil nil table-name (u/varargs String ["TABLE"]))
      jdbc/metadata-query
      seq
      boolean))

(defn- fresh-install?
  [^java.sql.Connection conn]
  (not (table-exists? (changelog-table-name conn) conn)))

(defn- decide-liquibase-file
  [^java.sql.Connection conn]
  (if (fresh-install? conn)
   changelog-file
   (let [latest-migration (->> (jdbc/query {:connection conn}
                                           [(format "select id from %s order by dateexecuted desc limit 1" (changelog-table-name conn))])
                               first
                               :id)]
     (cond
       (nil? latest-migration)
       changelog-file

       ;; post-44 installation downgraded to 45
       (= latest-migration "v00.00-000")
       changelog-file

       ;; pre 42
       (not (str/starts-with? latest-migration "v"))
       changelog-legacy-file

       (< (->> latest-migration (re-find #"v(\d+)\..*") second parse-long) 45)
       changelog-legacy-file

       :else
       changelog-file))))

(defn- liquibase-connection ^JdbcConnection [^java.sql.Connection jdbc-connection]
  (JdbcConnection. jdbc-connection))

(defn- h2? [^JdbcConnection liquibase-conn]
  (str/starts-with? (.getURL liquibase-conn) "jdbc:h2"))

(defn- database ^Database [^JdbcConnection liquibase-conn]
  (if (h2? liquibase-conn)
    (liquibase.h2/h2-database liquibase-conn)
    (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)))

(defn- liquibase ^Liquibase [^java.sql.Connection conn ^Database database]
  (Liquibase.
   ^String (decide-liquibase-file conn)
   (ClassLoaderResourceAccessor. (classloader/the-classloader))
   database))

(mu/defn do-with-liquibase
  "Impl for [[with-liquibase-macro]]."
  [conn-or-data-source :- [:or (ms/InstanceOfClass java.sql.Connection) (ms/InstanceOfClass javax.sql.DataSource)]
   f                   :- fn?]
  ;; Custom migrations use toucan2, so we need to make sure it uses the same connection with liquibase
  (binding [t2.conn/*current-connectable* conn-or-data-source]
    (if (instance? java.sql.Connection conn-or-data-source)
      (f (->> conn-or-data-source liquibase-connection database (liquibase conn-or-data-source)))
      ;; closing the `LiquibaseConnection`/`Database` closes the parent JDBC `Connection`, so only use it in combination
      ;; with `with-open` *if* we are opening a new JDBC `Connection` from a JDBC spec. If we're passed in a `Connection`,
      ;; it's safe to assume the caller is managing its lifecycle.
      (with-open [conn           (.getConnection ^javax.sql.DataSource conn-or-data-source)
                  liquibase-conn (liquibase-connection conn)
                  database       (database liquibase-conn)]
        (f (liquibase conn database))))))

(defmacro with-liquibase
  "Execute body with an instance of a `Liquibase` bound to `liquibase-binding`.

    (liquibase/with-liquibase [liquibase {:subname :postgres, ...}]
      (liquibase/migrate-up-if-needed! liquibase))"
  {:style/indent 1}
  [[liquibase-binding conn-or-data-source] & body]
  `(do-with-liquibase
    ~conn-or-data-source
    (fn [~(vary-meta liquibase-binding assoc :tag (symbol (.getCanonicalName Liquibase)))]
      ~@body)))

(defn migrations-sql
  "Return a string of SQL containing the DDL statements needed to perform unrun `liquibase` migrations, custom migrations will be ignored."
  ^String [^Liquibase liquibase]
  ;; calling update on custom migrations will execute them, so we ignore it and generates
  ;; sql for SQL migrations only
  (doseq [^ChangeSet change (.listUnrunChangeSets liquibase nil nil)]
    (when (instance? CustomChangeWrapper (first (.getChanges change)))
      (.setIgnore change true)))
  (let [writer (StringWriter.)]
    (.update liquibase "" writer)
    (.toString writer)))

(defn unrun-migrations
  "Returns a list of unrun migrations.

  It's a good idea to check to make sure there's actually something to do before running `(migrate :up)` so we can
  skip creating and releasing migration locks, which is both slightly dangerous and a waste of time when we won't be
  using them.

  (I'm not 100% sure whether `Liquibase.update()` still acquires locks if the database is already up-to-date)"
  [^Liquibase liquibase]
  (.listUnrunChangeSets liquibase nil (LabelExpression.)))

(defn- migration-lock-exists?
  "Is a migration lock in place for `liquibase`?"
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listLocks liquibase))))

(defn force-release-locks!
  "(Attempt to) force release Liquibase migration locks."
  [^Liquibase liquibase]
  (.forceReleaseLocks liquibase))

(defn release-lock-if-needed!
  "Attempts to release the liquibase lock if present. Logs but does not bubble up the exception if one occurs as it's
  intended to be used when a failure has occurred and bubbling up this exception would hide the real exception."
  [^Liquibase liquibase]
  (when (migration-lock-exists? liquibase)
    (try
      (force-release-locks! liquibase)
      (catch Exception e
        (log/error e (trs "Unable to release the Liquibase lock after a migration failure"))))))

(defn- wait-for-migration-lock-to-be-cleared
  "Check and make sure the database isn't locked. If it is, sleep for 2 seconds and then retry several times. There's a
  chance the lock will end up clearing up so we can run migrations normally."
  [^Liquibase liquibase]
  (u/auto-retry 5
    (when (migration-lock-exists? liquibase)
      (Thread/sleep 2000)
      (throw
       (LockException.
        (str
         (trs "Database has migration lock; cannot run migrations.")
         " "
         (trs "You can force-release these locks by running `java -jar metabase.jar migrate release-locks`.")))))))

(defn migrate-up-if-needed!
  "Run any unrun `liquibase` migrations, if needed."
  [^Liquibase liquibase]
  (log/info (trs "Checking if Database has unrun migrations..."))
  (if (seq (unrun-migrations liquibase))
    (do
     (log/info (trs "Database has unrun migrations. Waiting for migration lock to be cleared..."))
     (wait-for-migration-lock-to-be-cleared liquibase)
    ;; while we were waiting for the lock, it was possible that another instance finished the migration(s), so make
    ;; sure something still needs to be done...
     (let [unrun-migrations-count (count (unrun-migrations liquibase))]
       (if (pos? unrun-migrations-count)
         (let [^Contexts contexts nil
               start-time         (System/currentTimeMillis)]
           (log/info (trs "Migration lock is cleared. Running {0} migrations ..." unrun-migrations-count))
           (.update liquibase contexts)
           (log/info (trs "Migration complete in {0}" (u/format-milliseconds (- (System/currentTimeMillis) start-time)))))
         (log/info
          (trs "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))
    (log/info (trs "No unrun migrations found."))))

(defn run-in-scope-locked
  "Run function `f` in a scope on the Liquibase instance `liquibase`.
  Liquibase scopes are used to hold configuration and parameters (akin to binding dynamic variables in
  Clojure). This function initializes the database and the resource accessor which are often required."
  [^Liquibase liquibase f]
  (let [database (.getDatabase liquibase)
        ^LockService lock-service (.getLockService (LockServiceFactory/getInstance) database)
        scope-objects {(.name Scope$Attr/database) database
                       (.name Scope$Attr/resourceAccessor) (.getResourceAccessor liquibase)}]
    (Scope/child ^Map scope-objects
                 (reify Scope$ScopedRunner
                   (run [_]
                     (.waitForLock lock-service)
                     (try
                       (f)
                       (finally
                         (.releaseLock lock-service))))))))

(defn update-with-change-log
  "Run update with the change log instances in `liquibase`."
  ([liquibase]
   (update-with-change-log liquibase {}))
  ([^Liquibase liquibase
    {:keys [^List change-set-filters exec-listener]
     :or {change-set-filters []}}]
   (let [change-log     (.getDatabaseChangeLog liquibase)
         database       (.getDatabase liquibase)
         log-iterator   (ChangeLogIterator. change-log (into-array liquibase.changelog.filter.ChangeSetFilter change-set-filters))
         update-visitor (UpdateVisitor. database ^ChangeExecListener exec-listener)
         runtime-env    (RuntimeEnvironment. database (Contexts.) nil)]
     (run-in-scope-locked
      liquibase
      #(.run ^ChangeLogIterator log-iterator update-visitor runtime-env)))))

(mu/defn force-migrate-up-if-needed!
  "Force migrating up. This does three things differently from [[migrate-up-if-needed!]]:

  1.  This will force release the locks before start running
  2.  Migrations that fail will be ignored

  It can be used to fix situations where the database got into a weird state, as was common before the fixes made in
  #3295."
  [^Liquibase liquibase :- (ms/InstanceOfClass Liquibase)]
  ;; have to do this before clear the checksums else it will wait for locks to be released
  (release-lock-if-needed! liquibase)
  (.clearCheckSums liquibase)
  (when (seq (unrun-migrations liquibase))
    (let [change-log     (.getDatabaseChangeLog liquibase)
          fail-on-errors (mapv (fn [^ChangeSet change-set] [change-set (.getFailOnError change-set)])
                               (.getChangeSets change-log))
          exec-listener  (proxy [AbstractChangeExecListener] []
                           (willRun [^ChangeSet change-set _database-change-log _database _run-status]
                             (when (instance? ChangeSet change-set)
                               (log/info (format "Start executing migration with id %s" (.getId change-set)))))

                           (runFailed [^ChangeSet change-set _database-change-log _database ^Exception e]
                             (log/error (u/format-color 'red "[ERROR] %s" (.getMessage e))))

                           (ran [change-set _database-change-log _database ^ChangeSet$ExecType exec-type]
                             (when (instance? ChangeSet change-set)
                               (condp = exec-type
                                 ChangeSet$ExecType/EXECUTED
                                 (log/info (u/format-color 'green "[SUCCESS]"))

                                 ChangeSet$ExecType/FAILED
                                 (log/error (u/format-color 'red "[ERROR]"))

                                 (log/info (format "[%s]" (.name exec-type)))))))]
      (try
        (doseq [^ChangeSet change-set (.getChangeSets change-log)]
          (.setFailOnError change-set false))
        (update-with-change-log liquibase {:exec-listener exec-listener})
        (finally
          (doseq [[^ChangeSet change-set fail-on-error?] fail-on-errors]
            (.setFailOnError change-set fail-on-error?)))))))


(mu/defn consolidate-liquibase-changesets!
  "Consolidate all previous DB migrations so they come from single file.

  Previously migrations where stored in many small files which added seconds per file to the startup time because
  liquibase was checking the jar signature for each file. This function is required to correct the liquibase tables to
  reflect that these migrations were grouped into 2 files.

  See https://github.com/metabase/metabase/issues/3715
  Also see https://github.com/metabase/metabase/pull/34400"
  [conn :- (ms/InstanceOfClass java.sql.Connection)]
  (let [liquibase-table-name (changelog-table-name conn)
        statement            (format "UPDATE %s SET FILENAME = CASE WHEN ID = ? THEN ? WHEN ID < ? THEN ? ELSE ? END" liquibase-table-name)]
    (when-not (fresh-install? conn)
      (jdbc/execute!
       {:connection conn}
       [statement
        "v00.00-000" "migrations/001_update_migrations.yaml"
        "v45.00-001" "migrations/000_legacy_migrations.yaml"
        "migrations/001_update_migrations.yaml"]))))

(defn- extract-numbers
  "Returns contiguous integers parsed from string s"
  [s]
  (map #(Integer/parseInt %) (re-seq #"\d+" s)))

(defn rollback-major-version
  "Roll back migrations later than given Metabase major version"
  ;; default rollback to previous version
  ([db-type conn liquibase]
   ;; get current major version of Metabase we are running
   (rollback-major-version db-type conn liquibase (dec (config/current-major-version))))

  ;; with explicit target version
  ([_db-type conn ^Liquibase liquibase target-version]
   (when (or (not (integer? target-version)) (< target-version 44))
     (throw (IllegalArgumentException.
             (format "target version must be a number between 44 and the previous major version (%d), inclusive"
                     (config/current-major-version)))))
   ;; count and rollback only the applied change set ids which come after the target version (only the "v..." IDs need to be considered)
   (let [changeset-query (format "SELECT id FROM %s WHERE id LIKE 'v%%' ORDER BY ORDEREXECUTED ASC" (changelog-table-name conn))
         changeset-ids   (map :id (jdbc/query {:connection conn} [changeset-query]))
         ;; IDs in changesets do not include the leading 0/1 digit, so the major version is the first number
         ids-to-drop     (drop-while #(not= (inc target-version) (first (extract-numbers %))) changeset-ids)]
     (log/infof "Rolling back app database schema to version %d" target-version)
     (.rollback liquibase (count ids-to-drop) ""))))
