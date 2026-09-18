(ns metabase.app-db.liquibase
  "High-level Clojure wrapper around relevant parts of the Liquibase API."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.custom-migrations]
   [metabase.app-db.db :as app-db.db]
   [metabase.app-db.liquibase.h2 :as liquibase.h2]
   [metabase.app-db.liquibase.mysql :as liquibase.mysql]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.connection :as t2.conn])
  (:import
   (java.io StringWriter)
   (java.sql Connection)
   (java.util List Map)
   (javax.sql DataSource)
   (liquibase Contexts LabelExpression Liquibase RuntimeEnvironment Scope Scope$Attr Scope$ScopedRunner UpdateSummaryOutputEnum)
   (liquibase.change.custom CustomChangeWrapper)
   (liquibase.changelog ChangeLogIterator ChangeSet ChangeSet$ExecType)
   (liquibase.changelog.filter ChangeSetFilter)
   (liquibase.changelog.visitor AbstractChangeExecListener ChangeExecListener UpdateVisitor)
   (liquibase.database Database DatabaseFactory ObjectQuotingStrategy)
   (liquibase.database.jvm JdbcConnection)
   (liquibase.exception LockException)
   (liquibase.lockservice LockService LockServiceFactory)
   (liquibase.resource ClassLoaderResourceAccessor)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "The set of Liquibase instances which potentially have taken locks by this process."}
  potentially-locked-instances
  (atom #{}))

(comment
  ;; load our custom migrations
  metabase.app-db.custom-migrations/keep-me)

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

;; Disable phoning home to Liquibase analytics (since 4.28)
(System/setProperty "liquibase.analytics.enabled" "false")

(def ^{:private true
       :doc     "Liquibase setting used for upgrading instances running version < 45."}
  ^String changelog-legacy-file "liquibase_legacy.yaml")

(def ^{:doc "Liquibase setting used for upgrading a fresh instance or instances running version >= 45."}
  ^String changelog-file "liquibase.yaml")

(defn- fresh-install?
  [^Connection conn ^Database database]
  (not (versions/table-exists? (.getDatabaseChangeLogTableName database) conn)))

(defn- year-directory-migration?
  "Whether `filename` is a version-less migration living in a year-based directory,
  e.g. `migrations/2026/20260703_workspaces.yaml`."
  [filename]
  (boolean (some->> filename (re-find #"(?:^|[/\\])\d{4}[/\\]"))))

(defn- decide-liquibase-file
  [^Connection conn ^Database database]
  (if (fresh-install? conn database)
    changelog-file
    (let [{latest-migration :id, latest-filename :filename}
          ;; `orderexecuted` breaks ties between rows sharing a `dateexecuted` (e.g. MySQL second precision)
          (first (jdbc/query {:connection conn}
                             [(format "select id, filename from %s order by dateexecuted desc, orderexecuted desc limit 1"
                                      (.getDatabaseChangeLogTableName database))]))
          ;; major version parsed from a legacy "vNN.*" id, or nil for version-less (year-directory) ids
          major (some-> (re-find #"^v(\d+)\." (str latest-migration)) second parse-long)]
      (cond
        (nil? latest-migration)
        changelog-file

        ;; post-44 installation downgraded to 45
        (= latest-migration "v00.00-000")
        changelog-file

        (year-directory-migration? latest-filename)
        changelog-file

        ;; Pre-4.2 installs used purely-numeric changeset ids (e.g. "1" .. "316") and need the legacy changelog.
        (re-matches #"\d+" latest-migration)
        changelog-legacy-file

        ;; versioned ids below 45 need the legacy changelog
        (and major (< major 45))
        changelog-legacy-file

        :else
        changelog-file))))

(defn- liquibase-connection ^JdbcConnection [^Connection jdbc-connection]
  (JdbcConnection. jdbc-connection))

(defn- h2? [^JdbcConnection liquibase-conn]
  (str/starts-with? (.getURL liquibase-conn) "jdbc:h2"))

(defn- database ^Database [^JdbcConnection liquibase-conn]
  (if (h2? liquibase-conn)
    (liquibase.h2/h2-database liquibase-conn)
    (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)))

(defn- liquibase ^Liquibase [^Connection conn ^Database database]
  (u/prog1 (Liquibase.
            ^String (decide-liquibase-file conn database)
            (ClassLoaderResourceAccessor. (classloader/the-classloader))
            database)
    (.setObjectQuotingStrategy (.getDatabaseChangeLog <>) ObjectQuotingStrategy/QUOTE_ALL_OBJECTS)))

(mu/defn do-with-liquibase
  "Impl for [[with-liquibase-macro]]."
  [conn-or-data-source :- [:or (ms/InstanceOfClass Connection) (ms/InstanceOfClass javax.sql.DataSource)]
   f                   :- fn?]
  ;; Custom migrations use toucan2, so we need to make sure it uses the same connection with liquibase
  (let [f* (fn [^Liquibase liquibase]
             ;; trigger creation of liquibase's databasechangelog tables if needed, without updating any checksums
             ;; we need to do this until https://github.com/liquibase/liquibase/issues/5537 is fixed
             (.checkLiquibaseTables liquibase false (.getDatabaseChangeLog liquibase) nil nil)
             (.setShowSummaryOutput liquibase UpdateSummaryOutputEnum/LOG)
             (f liquibase))]
    (binding [t2.conn/*current-connectable* conn-or-data-source]
      (if (instance? Connection conn-or-data-source)
        (f* (->> conn-or-data-source liquibase-connection database (liquibase conn-or-data-source)))
        ;; closing the `LiquibaseConnection`/`Database` closes the parent JDBC `Connection`, so only use it in combination
        ;; with `with-open` *if* we are opening a new JDBC `Connection` from a JDBC spec. If we're passed in a `Connection`,
        ;; it's safe to assume the caller is managing its lifecycle.
        (with-open [conn           (.getConnection ^javax.sql.DataSource conn-or-data-source)
                    liquibase-conn (liquibase-connection conn)
                    database       (database liquibase-conn)]
          (f* (liquibase conn database)))))))

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

(defn changelog-table-name
  "Return the proper changelog table name based on db type of the connection."
  [liquibase-or-conn]
  (if (instance? Liquibase liquibase-or-conn)
    (.getDatabaseChangeLogTableName (.getDatabase ^Liquibase liquibase-or-conn))
    (with-liquibase [liquibase liquibase-or-conn]
      (changelog-table-name liquibase))))

(defn changelog-by-id
  "Return the changelog row value for the given `changelog-id`."
  [app-db changelog-id]
  (app-db.db/changelog-by-id (:db-type app-db) changelog-id))

(def databasechangelog-versions-table
  "Name of the table that records the Metabase version associated with each Liquibase `deployment_id`"
  "databasechangelog_version")

(defn unrun-migrations
  "Returns a list of unrun migrations.

  It's a good idea to check to make sure there's actually something to do before running `(migrate :up)` so we can
  skip creating and releasing migration locks, which is both slightly dangerous and a waste of time when we won't be
  using them.

  IMPORTANT: this function takes `data-source` but not `liquibase` because `.listUnrunChangeSets` is buggy. See #38257."
  [^DataSource data-source]
  (with-liquibase [liquibase data-source]
    (.listUnrunChangeSets liquibase nil (LabelExpression.))))

(defn- migration-lock-exists?
  "Is a migration lock in place for `liquibase`?"
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listLocks liquibase))))

(defn force-release-locks!
  "(Attempt to) force release Liquibase migration locks."
  [^Liquibase liquibase]
  (if-not (= (mdb.connection/db-type) :h2)
    (throw (ex-info "Database %s does not support forcing migration locks. The lock is always automatically removed when the process performing the migration completes or fails."
                    {:db-type (mdb.connection/db-type)}))
    (.forceReleaseLocks liquibase)))

(defn release-lock-if-needed!
  "Attempts to release the liquibase lock on h2 if present. Logs but does not bubble up the exception if one occurs as it's
  intended to be used when a failure has occurred and bubbling up this exception would hide the real exception."
  [^Liquibase liquibase]
  (when (migration-lock-exists? liquibase)
    (try
      (when (= (mdb.connection/db-type) :h2)
        (force-release-locks! liquibase))
      (catch Exception e
        (log/errorf "Unable to release the Liquibase lock: %s" (ex-message e))))))

(defn- lock-service ^LockService [^Liquibase liquibase]
  (.getLockService (LockServiceFactory/getInstance) (.getDatabase liquibase)))

(defn- wait-for-migration-lock
  "Check and make sure the database isn't locked. If it is, sleep for 2 seconds and then retry several times. There's a
  chance the lock will end up clearing up so we can run migrations normally."
  [^LockService lock-service]
  (let [retry-counter (volatile! 0)]
    (u/auto-retry 5
      (when-not (.acquireLock lock-service)
        (Thread/sleep 2000)
        (vswap! retry-counter inc)
        (throw
         (LockException.
          (str
           (trs "Database has migration lock; cannot run migrations.")
           " "
           (trs "You can force-release these locks by running `java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar migrate release-locks`."))))))
    (if (pos? @retry-counter)
      (log/warnf "Migration lock was acquired after %d retries." @retry-counter)
      (do (log/info "No migration lock found.")
          (log/info "Migration lock acquired.")))))

(defn holding-lock?
  "Check whether the given Liquibase instance is already holding the database migration lock."
  [liquibase]
  (.hasChangeLogLock (lock-service liquibase)))

(defn- wait-until [done? ^long sleep-ms timeout-ms]
  (let [deadline (+ (System/nanoTime) (* 1e6 timeout-ms))]
    (loop []
      (if (done?)
        :done
        (if (>= (System/nanoTime) deadline)
          :timed-out
          (do (Thread/sleep sleep-ms)
              (recur)))))))

(defn- locked-instances
  "Scan through a global set of potentially locking Liquibase objects, to retrieve the corresponding Lock Service
  instances, and filter by their `hasChangeLock` flag. Returns the list of locking instances in the current process."
  []
  (filter holding-lock? @potentially-locked-instances))

(defn wait-for-all-locks
  "Wait up to a maximum of `timeout-seconds` for the given Liquibase instance to release the migration lock."
  [sleep-ms timeout-ms]
  (log/warn (locked-instances))
  (let [done? #(empty? (locked-instances))]
    (if (done?)
      :none
      (do (log/infof "Waiting for migration lock(s) to be released (max %.1f secs)" (double (/ timeout-ms 1000)))
          (wait-until done? sleep-ms timeout-ms)))))

(defn- liquibase->url [^Liquibase liquibase]
  (let [conn (.. liquibase getDatabase getConnection)]
    ;; Need to this cast to get access to the metadata. We currently only use JDBC app databases.
    (.getURL (.getMetaData ^JdbcConnection conn))))

(defn release-concurrent-locks!
  "Release any locks held by this process corresponding to the same database."
  [conn-or-data-source]
  ;; Check whether there are Liquibase locks held by the current process - we don't want to release the database locks
  ;; if they are held by another server, for example if this host is part of an "old" fleet shutting down while new
  ;; servers starting up, of which one is performing the database upgrade to later Metabase version.
  ;;
  (when-let [instances (not-empty (locked-instances))]
    ;; We cannot use the existing instances to clear the locks, as their connections are blocking on their current
    ;; long-running transaction. Since we cannot "clone" a connection (they have "forgotten" their password), so we
    ;; will create a new Liquibase instance using a fresh database connection.
    (with-liquibase [liquibase conn-or-data-source]
      ;; We rely on the way that Liquibase normalizes the connection URL to check whether the blocking and fresh
      ;; Liquibase instances are pointing to the same database.
      (let [url (liquibase->url liquibase)]
        (doseq [instance instances]
          (when (= url (liquibase->url instance))
            ;; We assume that the lock is being held for the purpose of migrations, since the other cases where we take
            ;; locks are very fast, and in practice this method is only called after we have waited for a while to see
            ;; if the lock was released on its own.
            (log/warn "Releasing liquibase lock before migrations finished")
            (release-lock-if-needed! liquibase)))))))

(def ^:private ^:dynamic *lock-depth* 0)

(defn- assert-locked [liquibase]
  (when-not (holding-lock? liquibase)
    (throw (ex-info "This operation requires a hold on the liquibase migration lock."
                    {:lock-exists? (migration-lock-exists? liquibase)
                     ;; It's possible that the lock was accidentally released by an operation, or force released by
                     ;; another process, so it's useful for debugging to know whether we were still within a locked
                     ;; scope.
                     :lock-depth   *lock-depth*}))))

(defn- fresh-deployment-id
  "A new Liquibase-style deployment id: the last 10 digits of the current epoch millis (the same format
  `liquibase.Scope/generateDeploymentId` uses, fitting the `varchar(10)` DEPLOYMENT_ID column)."
  ^String []
  (let [s (str (System/currentTimeMillis))]
    (subs s (max 0 (- (count s) 10)))))

(defn run-in-scope-locked
  "Run function `f` in a scope on the Liquibase instance `liquibase`.
   Liquibase scopes are used to hold configuration and parameters (akin to binding dynamic variables in
   Clojure). This function initializes the database and the resource accessor which are often required.
   In order to ensure that mutual exclusion of these scopes across all running Metabase instances, we take a lock
   in the app database. It's the responsibility of inner functions which require the lock to call [[assert-locked]]."
  [^Liquibase liquibase f]
  ;; Disallow nested locking in dev and CI, in order to force a clear lexical boundary where locking begins.
  ;; Inner functions that require the lock to be held should
  (when (holding-lock? liquibase)
    ;; In somehow we encounter this situation in production, rather take a nested lock - it is re-entrant.
    (when-not config/is-prod?
      (throw (LockException. "Attempted to take a Liquibase lock, but we already are holding it."))))
  (let [database      (.getDatabase liquibase)
        lock-service  (lock-service liquibase)
        scope-objects (cond-> {(.name Scope$Attr/database)         database
                               (.name Scope$Attr/resourceAccessor) (.getResourceAccessor liquibase)}
                        ;; a re-entrant (prod-only) nested scope must not change the deployment id mid-run
                        (not (holding-lock? liquibase))
                        (assoc (.name Scope$Attr/deploymentId) (fresh-deployment-id)))]
    (Scope/child ^Map scope-objects
                 (reify Scope$ScopedRunner
                   (run [_]
                     (swap! potentially-locked-instances conj liquibase)
                     (wait-for-migration-lock lock-service)
                     (try
                       (binding [*lock-depth* (inc *lock-depth*)]
                         (f))
                       (finally
                         (when (zero? *lock-depth*)
                           (.releaseLock lock-service)
                           ;; There is theoretically a chance that another thread will open a new locked scope between
                           ;; these two statements, but in practice we do not expect concurrent usage within a process.
                           (swap! potentially-locked-instances disj liquibase)))))))))

(defmacro with-scope-locked
  "Run `body` in a scope on the Liquibase instance `liquibase`.
   Liquibase scopes are used to hold configuration and parameters (akin to binding dynamic variables in
   Clojure). This function initializes the database and the resource accessor which are often required.
   The underlying locks are re-entrant, so it is safe to nest these blocks."
  {:style/indent 1}
  [liquibase & body]
  `(run-in-scope-locked ~liquibase (fn [] ~@body)))
(defn migrations-sql
  "Return a string of SQL containing the DDL statements needed to perform unrun `liquibase` migrations, custom
  migrations will be ignored. Ends with statements that record the upgrade in `databasechangelog_version` (and the
  legacy version-tracking marker) -- see [[versions/version-tracking-sql]] -- since the listeners that normally write
  those only run when Metabase itself executes the migrations."
  ^String [^Liquibase liquibase]
  ;; calling update on custom migrations will execute them, so we ignore it and generates
  ;; sql for SQL migrations only
  (doseq [^ChangeSet change (.listUnrunChangeSets liquibase nil nil)]
    (when (instance? CustomChangeWrapper (first (.getChanges change)))
      (.setIgnore change true)))
  (let [writer   (StringWriter.)
        database (.getDatabase liquibase)]
    (.update liquibase "" writer)
    (str (.toString writer)
         (versions/version-tracking-sql (.. database getConnection getUnderlyingConnection) database))))

(defn migrate-up-if-needed!
  "Run any unrun `liquibase` migrations, if needed, recording the Metabase version that ran them (see
  [[metabase.app-db.liquibase.versions]]). Expects [[versions/ensure-version-tracking!]] to have run."
  [^Liquibase liquibase ^DataSource data-source]
  (log/info "Checking if Database has unrun migrations...")
  (if (seq (unrun-migrations data-source))
    (do
      (log/info "Database has unrun migrations. Checking if migration lock is taken...")
      (with-scope-locked liquibase
        ;; while we were waiting for the lock, it was possible that another instance finished the migration(s), so make
        ;; sure something still needs to be done...
        (let [to-run-migrations      (unrun-migrations data-source)
              unrun-migrations-count (count to-run-migrations)]
          (if (pos? unrun-migrations-count)
            (let [^Contexts contexts nil
                  timer              (u/start-timer)
                  database           (.getDatabase liquibase)]
              (log/infof "Running %s migrations ..." unrun-migrations-count)
              (doseq [^ChangeSet change to-run-migrations]
                (log/tracef "To run migration %s" (.getId change)))
              (.setChangeExecListener liquibase (versions/recording-exec-listener database))
              (try
                (.update liquibase contexts)
                (finally
                  (.setChangeExecListener liquibase nil)))
              (versions/record-legacy-version-tracking! database)
              (log/infof "Migration complete in %s" (u/format-milliseconds (u/since-ms timer))))
            (log/info "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))
    (do
      (log/info "No unrun migrations found.")
      (versions/record-boot-version! (.getDatabase liquibase)))))

(defn update-with-change-log
  "Run update with the change log instances in `liquibase`. Must be called within a scope holding the liquibase lock."
  ([liquibase]
   (update-with-change-log liquibase {}))
  ([^Liquibase liquibase
    {:keys [^List change-set-filters exec-listener]
     :or   {change-set-filters []}}]
   (assert-locked liquibase)
   (let [change-log     (.getDatabaseChangeLog liquibase)
         database       (.getDatabase liquibase)
         log-iterator   (ChangeLogIterator. change-log ^"[Lliquibase.changelog.filter.ChangeSetFilter;" (into-array ChangeSetFilter change-set-filters))
         update-visitor (UpdateVisitor. database ^ChangeExecListener exec-listener)
         runtime-env    (RuntimeEnvironment. database (Contexts.) nil)]
     (.run ^ChangeLogIterator log-iterator update-visitor runtime-env))))

(mu/defn force-migrate-up-if-needed!
  "Force migrating up. This does three things differently from [[migrate-up-if-needed!]]:

  1.  This will force release the locks before start running
  2.  Migrations that fail will be ignored

  It can be used to fix situations where the database got into a weird state, as was common before the fixes made in
  #3295."
  [^Liquibase liquibase :- (ms/InstanceOfClass Liquibase)
   ^DataSource data-source :- (ms/InstanceOfClass DataSource)]
  ;; We should have already released the lock before consolidating the changelog, but include this statement again
  ;; here to avoid depending on that non-local implementation detail. It is possible that the lock has been taken
  ;; again by another process before we reach this, and it's even possible that we lose yet *another* race again
  ;; between the next two lines, but we accept the risk of blocking in that latter case rather than complicating things
  ;; further.
  (release-lock-if-needed! liquibase)
  ;; This implicitly clears the lock, so it needs to execute first.
  (.clearCheckSums liquibase)
  (with-scope-locked liquibase
    (when (seq (unrun-migrations data-source))
      (let [change-log     (.getDatabaseChangeLog liquibase)
            recorded?      (atom false)
            fail-on-errors (mapv (fn [^ChangeSet change-set] [change-set (.getFailOnError change-set)])
                                 (.getChangeSets change-log))
            exec-listener  (proxy [AbstractChangeExecListener] []
                             (willRun [^ChangeSet change-set _database-change-log _database _run-status]
                               (when (instance? ChangeSet change-set)
                                 (log/infof "Start executing migration with id %s" (.getId change-set))))

                             (runFailed [^ChangeSet _change-set _database-change-log _database ^Exception e]
                               (log/error (u/format-color 'red "[ERROR] %s" (.getMessage e))))

                             (ran [change-set _database-change-log ^Database database ^ChangeSet$ExecType exec-type]
                               (when (instance? ChangeSet change-set)
                                 (when (compare-and-set! recorded? false true)
                                   (versions/record-active-deployment-version! database))
                                 (condp = exec-type
                                   ChangeSet$ExecType/EXECUTED
                                   (log/info (u/format-color 'green "[SUCCESS]"))

                                   ChangeSet$ExecType/FAILED
                                   (log/error (u/format-color 'red "[ERROR]"))

                                   (log/infof "[%s]" (.name exec-type))))))]
        (try
          (doseq [^ChangeSet change-set (.getChangeSets change-log)]
            (.setFailOnError change-set false))
          (update-with-change-log liquibase {:exec-listener exec-listener})
          (finally
            (doseq [[^ChangeSet change-set fail-on-error?] fail-on-errors]
              (.setFailOnError change-set fail-on-error?))))
        ;; same old-binary downgrade signal a normal upgrade leaves -- see [[migrate-up-if-needed!]]
        (versions/record-legacy-version-tracking! (.getDatabase liquibase))))))

(def ^:private legacy-migrations-file "migrations/000_legacy_migrations.yaml")
(def ^:private update001-migrations-file "migrations/001_update_migrations.yaml")

(defn repair-version-less-filenames!
  "Point version-less changelog rows back at the year-directory changelog file that defines them, after an older
  Metabase binary consolidated them into the legacy/001 file.

  Binaries before version-less changesets consolidate with an unguarded `WHEN ID < 'v45.00-001' THEN <legacy file>`,
  which catches every version-less id sorting before `v` -- most of them. Any `migrate` command of such a binary
  against an upgraded database (even one it then refuses as a downgrade) commits that rewrite via the Liquibase lock
  release, and a boot of it that succeeds does the same. Left in place, the rewritten rows no longer match their
  changesets, so a later `migrate down` here would clear their bookkeeping without reversing their DDL and the next
  upgrade would fail on the orphaned objects.

  Pre-4.2 numeric ids legitimately live in the legacy file and `vNN.` ids are never mis-consolidated, so only
  other ids are candidates; a candidate with no `[author id]` changeset in this changelog is left alone."
  [^Connection conn ^Liquibase liquibase changelog-table]
  (let [stray (->> (jdbc/query {:connection conn}
                               [(format "SELECT id, author FROM %s WHERE filename IN (?, ?) AND id NOT LIKE 'v%%'" changelog-table)
                                legacy-migrations-file update001-migrations-file])
                   (remove #(re-matches #"\d+" (:id %))))]
    (when (seq stray)
      (let [path-of (into {} (for [^ChangeSet cs (.getChangeSets (.getDatabaseChangeLog liquibase))
                                   :when (year-directory-migration? (.getFilePath cs))]
                               [[(.getAuthor cs) (.getId cs)] (.getFilePath cs)]))]
        (doseq [{:keys [id author]} stray
                :let [path (path-of [author id])]
                :when path]
          (log/warnf "Restoring the changelog filename of version-less changeset %s to %s (an older Metabase version had consolidated it into the legacy changelog file)"
                     id path)
          (jdbc/execute! {:connection conn}
                         [(format "UPDATE %s SET filename = ? WHERE id = ? AND author = ?" changelog-table)
                          path id author]))))))

(mu/defn consolidate-liquibase-changesets!
  "Consolidate all previous DB migrations so they come from single file.

  Previously migrations where stored in many small files which added seconds per file to the startup time because
  liquibase was checking the jar signature for each file. This function is required to correct the liquibase tables to
  reflect that these migrations were grouped into 2 files.

  NOTE: we are going back to more granular changelog files in v60, but should not as many as before.
  If we do end up seeing a performance issue similar to what caused a need for this file, we can do a similar
  (but different) consolidation function for the v60+ changelogs.

  See https://github.com/metabase/metabase/issues/3715
  Also see https://github.com/metabase/metabase/pull/34400"
  [conn :- (ms/InstanceOfClass Connection)
   liquibase :- (ms/InstanceOfClass Liquibase)]
  (let [liquibase-table-name (changelog-table-name liquibase)
        conn-spec            {:connection conn}]
    (when-not (fresh-install? conn (.getDatabase ^Liquibase liquibase))
      ;; The UPDATE runs on every non-fresh boot: it is an idempotent no-op once filenames are consolidated, and the
      ;; filenames of pre-consolidation installs are too varied to guard on reliably. It assumes we have never moved
      ;; the boundary between the two files, i.e. that update-migrations still start from v45.
      (log/info "Updating liquibase table to reflect consolidated changeset filenames")
      (with-scope-locked liquibase
        (jdbc/execute!
         conn-spec
         [(format (str "UPDATE %s SET FILENAME = CASE WHEN ID = ? THEN ? WHEN ID < ? THEN ? WHEN ID < ? THEN ? "
                       "ELSE FILENAME END WHERE FILENAME NOT LIKE ?")
                  liquibase-table-name)
          "v00.00-000" update001-migrations-file
          "v45.00-001" legacy-migrations-file
          "v56.0000-00-00T00:00:00" update001-migrations-file
          ;; version-less migrations live in a year directory: `migrations/2026/...` (see [[year-directory-migration?]])
          "%/____/%"])
        (repair-version-less-filenames! conn liquibase liquibase-table-name)))))
