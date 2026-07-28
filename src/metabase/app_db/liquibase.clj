(ns metabase.app-db.liquibase
  "High-level Clojure wrapper around relevant parts of the Liquibase API."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.custom-migrations]
   [metabase.app-db.liquibase.h2 :as liquibase.h2]
   [metabase.app-db.liquibase.mysql :as liquibase.mysql]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (java.io StringWriter)
   (java.sql Connection)
   (java.util ArrayList List Map)
   (javax.sql DataSource)
   (liquibase Contexts LabelExpression Liquibase RuntimeEnvironment Scope Scope$Attr Scope$ScopedRunner UpdateSummaryOutputEnum)
   (liquibase.change.custom CustomChangeWrapper)
   (liquibase.changelog ChangeLogIterator ChangeSet ChangeSet$ExecType)
   (liquibase.changelog.filter AlreadyRanChangeSetFilter ChangeSetFilter ChangeSetFilterResult DbmsChangeSetFilter IgnoreChangeSetFilter)
   (liquibase.changelog.visitor AbstractChangeExecListener ChangeExecListener UpdateVisitor)
   (liquibase.command.core AbstractRollbackCommandStep)
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

(def ^{:private true
       :doc     "Liquibase setting used for upgrading a fresh instance or instances running version >= 45."}
  ^String changelog-file "liquibase.yaml")

(defn table-exists?
  "Check if a table exists."
  [table-name ^Connection conn]
  (-> (.getMetaData conn)
      (.getTables nil nil table-name (u/varargs String ["TABLE"]))
      jdbc/metadata-query
      seq
      boolean))

(defn- fresh-install?
  [^Connection conn ^Database database]
  (not (table-exists? (.getDatabaseChangeLogTableName database) conn)))

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
   f :- fn?]
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
  (let [table-name (case (:db-type app-db)
                     (:postgres :h2) "databasechangelog"
                     :mysql "DATABASECHANGELOG")]
    (t2/query-one (format "select * from %s where id = '%s'" table-name changelog-id))))

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
        (log/error e "Unable to release the Liquibase lock")))))

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

(defonce ^{:private true
           :doc     "Identifiers of the application DBs whose `databasechangelog_version` table we have already created in
                 this process, so repeated [[ensure-databasechangelog-versions-table!]] calls can skip the DDL. Keyed by
                 [[mdb.connection/unique-identifier]] so each (e.g. temp test) application DB is tracked separately."}
  databasechangelog-versions-table-created
  (atom #{}))

(defn- databasechangelog-versions-table-ddl
  ^String []
  (let [db-type   (mdb.connection/db-type)
        id-column (case db-type
                    :mysql "id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY"
                    "id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
        ;; match the storage options every other Metabase table gets on MySQL -- see [[liquibase.mysql]]
        suffix    (case db-type
                    :mysql " ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    "")]
    (format (str "CREATE TABLE IF NOT EXISTS %s ("
                 "%s, "
                 "deployment_id varchar(10) NOT NULL, "
                 "metabase_version varchar(255) NOT NULL, "
                 "deployed_at timestamp NOT NULL, "
                 "CONSTRAINT uq_databasechangelog_version UNIQUE (deployment_id, metabase_version))%s")
            databasechangelog-versions-table id-column suffix)))

(defn ensure-databasechangelog-versions-table!
  "Create the `databasechangelog_version` table if it does not already exist."
  [^Connection conn]
  (let [app-db (mdb.connection/unique-identifier)]
    (when-not (contains? @databasechangelog-versions-table-created app-db)
      (jdbc/execute! {:connection conn} [(databasechangelog-versions-table-ddl)])
      (swap! databasechangelog-versions-table-created conj app-db))))

(defn forget-databasechangelog-versions-table!
  "Forget that the `databasechangelog_version` table was ensured for the current application database. Must be called
  when a migration transaction is rolled back: on databases with transactional DDL (Postgres) the rollback undoes the
  lazy CREATE TABLE, and a stale in-memory marker would make every later insert in this process fail with 'relation
  does not exist'. Re-ensuring when the table actually survived is a cheap CREATE IF NOT EXISTS no-op."
  []
  (swap! databasechangelog-versions-table-created disj (mdb.connection/unique-identifier)))

(defn- versions-table-exists?
  [^Connection conn]
  (boolean (or (table-exists? databasechangelog-versions-table conn)
               (table-exists? (u/upper-case-en databasechangelog-versions-table) conn))))

(defn version->major
  "Parse the Metabase major version out of a recorded version string."
  [version]
  (some-> (re-find #"^x\.(\d+)" (str version)) second parse-long))

(def ^{:private true
       :doc     "Dev synthetic majors start here, well above any real Metabase release so it's obvious"}
  synthetic-major-floor
  1000)

(defn synthetic-dev-major?
  "Whether `major` is a synthetic development major (one assigned to a dev build), rather than a real released version."
  [major]
  (boolean (and major (>= major synthetic-major-floor))))

(defn- compute-synthetic-version
  "One past the highest recorded synthetic major, or the floor when nothing synthetic is recorded. Read-only: a
  missing version table computes the floor rather than creating the table, since this also runs on paths that must
  not mutate the database (`migrate print`)."
  [^Connection conn]
  (let [highest (if (versions-table-exists? conn)
                  (->> (jdbc/query {:connection conn}
                                   [(format "SELECT metabase_version FROM %s" databasechangelog-versions-table)])
                       (keep (comp version->major :metabase_version))
                       (reduce max (dec synthetic-major-floor)))
                  (dec synthetic-major-floor))]
    (format "x.%d.0.0" (inc highest))))

(defn- synthetic-dev-version
  "The synthetic development version this process would record right now. Deliberately NOT memoized: after a migration
  run records its version, the next run in the same process must compute the next major, so consecutive dev
  `migrate up` runs create distinct rollback boundaries (see [[migrate-up-if-needed!]])."
  []
  (when config/is-prod?
    (log/errorf (str "Could not parse a release version from this build's version tag %s; recording synthetic "
                     "development versions instead. Version tracking and downgrade detection will be degraded. "
                     "This usually means version.properties is missing or malformed.")
                (pr-str (:tag config/mb-version-info))))
  (with-open [conn (.getConnection (mdb.connection/data-source))]
    (compute-synthetic-version conn)))

(defn- real-recorded-version
  "The edition-agnostic real version string from the build tag, or nil in dev where there is no real version."
  []
  (let [tag (:tag config/mb-version-info)]
    (when (re-find #"^v\d+\.\d+" tag)
      (str/replace tag #"^v\d+" "x"))))

(defn current-recorded-version
  "The edition-agnostic Metabase version string to record for this process. In dev (no real version) this is a synthetic
  per-deployment incrementing version (see [[synthetic-dev-version]])."
  []
  (or (real-recorded-version)
      (synthetic-dev-version)))

(defn current-recorded-major
  "Major version of [[current-recorded-version]]"
  []
  (version->major (current-recorded-version)))

(defn- insert-deployment-version!
  "Insert a `(deployment-id, version, now)` row into `databasechangelog_version`, unless that exact pair already
  exists. No-op when `deployment-id` is nil (an empty changelog has no deployment to stamp). Safe to call concurrently
  from multiple instances: every path tolerates the pair appearing between check and insert."
  [^Connection conn deployment-id version]
  (when (and deployment-id version)
    (ensure-databasechangelog-versions-table! conn)
    (let [values       "(deployment_id, metabase_version, deployed_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
          upsert       (case (mdb.connection/db-type)
                         :postgres (format "INSERT INTO %s %s ON CONFLICT DO NOTHING" databasechangelog-versions-table values)
                         :mysql (format "INSERT IGNORE INTO %s %s" databasechangelog-versions-table values)
                         nil)
          pair-exists? #(seq (jdbc/query {:connection conn}
                                         [(format "SELECT 1 FROM %s WHERE deployment_id = ? AND metabase_version = ?"
                                                  databasechangelog-versions-table) deployment-id version]))]
      (if upsert
        (jdbc/execute! {:connection conn} [upsert deployment-id version])
        (when-not (pair-exists?)
          (try
            (jdbc/execute! {:connection conn}
                           [(format "INSERT INTO %s %s" databasechangelog-versions-table values)
                            deployment-id version])
            (catch java.sql.SQLException e
              ;; lost the check-then-insert race with another instance; the unique constraint makes the loss benign
              (when-not (pair-exists?)
                (throw e)))))))))

(defn record-deployment-version!
  "Record `version` for `deployment-id` in `databasechangelog_version` (idempotent: no-op if that exact pair already
  exists). Exposed for tests that need to fabricate a multi-version deployment history."
  [^Connection conn deployment-id version]
  (insert-deployment-version! conn deployment-id version))

(defn- record-active-deployment-version!
  "Record the current Metabase version for the current Liquibase deployment being."
  [^Database database]
  (insert-deployment-version! (.. database getConnection getUnderlyingConnection)
                              (.getDeploymentId (Scope/getCurrentScope))
                              (current-recorded-version)))

(defn- last-deployment-id
  "The `deployment_id` of the most-recently-applied changeset."
  [^Database database]
  (-> (jdbc/query {:connection (.. database getConnection getUnderlyingConnection)}
                  [(format "SELECT deployment_id FROM %s ORDER BY dateexecuted DESC, orderexecuted DESC LIMIT 1"
                           (.getDatabaseChangeLogTableName database))])
      first
      :deployment_id))

(def ^:private special-case-migrations #{"v56.2025-06-05T16:48:48" "v56.2025-05-19T16:48:48"})

(defn- handle-special-case-migrations
  "This handles v56 migrations that were checked into the v55 branch to resolve an issue with
  inadventently backported migrations in 55. We check if this or the bad backports are the most recent
  available migration and explicitly return 55 as the available major version if so."
  [s]
  (when (contains? special-case-migrations s)
    55))

(defn- extract-numbers
  "Returns contiguous integers parsed from string s"
  [s]
  (if-let [special-cased (handle-special-case-migrations s)]
    [special-cased]
    (map #(Integer/parseInt %) (re-seq #"\d+" s))))

(defn- backfill-version-row
  "Compute the one-time backfill row for an existing install that has no rows in `databasechangelog_version` yet:
  `{:deployment-id .., :version ..}` pointing the *latest* `deployment_id` at the *highest* major version present in
  the changelog, or nil when there is nothing to backfill (fresh install, or no versioned changesets). Older
  deployments are intentionally left without a row: downgrade detection consults only the latest deployment, and a
  legacy changeset's major is derived from its `vNN.` id rather than a recorded version, so the older deployments
  never need one.

  Note we use the highest major across all run changesets, not the major of the most-recently-*executed* changeset:
  back-ported patches can land a lower-version changeset (e.g. a `v44.` id) with a later `dateexecuted` than the
  highest-version changeset already applied, and the DB's real schema version is the highest, not the last one run."
  [^Connection conn ^Database database]
  (let [changelog     (.getDatabaseChangeLogTableName database)
        deployment_id (-> (jdbc/query {:connection conn}
                                      [(format (str "SELECT deployment_id AS deployment_id "
                                                    "FROM %s ORDER BY dateexecuted DESC, orderexecuted DESC LIMIT 1")
                                               changelog)])
                          first
                          :deployment_id)
        major         (->> (jdbc/query {:connection conn}
                                       [(format "SELECT id FROM %s WHERE id LIKE 'v%%'" changelog)])
                           (keep (fn [{:keys [id]}]
                                   (when (re-find #"^v\d+\." id)
                                     (first (extract-numbers id)))))
                           (reduce max 0))]
    (when (and (pos? major) deployment_id)
      {:deployment-id deployment_id
       :version       (format "x.%d.0.0" major)})))

(defn backfill-databasechangelog-versions!
  "Stamp the single [[backfill-version-row]] for an existing install that has no rows in `databasechangelog_version`
  yet; no-op when there is nothing to backfill."
  [^Connection conn ^Database database]
  (when-let [{:keys [deployment-id version]} (backfill-version-row conn database)]
    (insert-deployment-version! conn deployment-id version)))

(defn- backfill-versions-if-unrecorded!
  "Create the `databasechangelog_version` table if needed and, when it has no rows at all (an install that predates
  version tracking), backfill the current schema version from the changelog. The boot-time downgrade check does this
  lazily on read, but upgrades driven directly by `migrate up` / `migrate force` skip that check -- and the version
  recorded for the upgrade itself must never become the table's first row, or the pre-upgrade rollback boundary is
  lost and `migrate down` has nothing to roll back to."
  [^Connection conn ^Database database]
  (ensure-databasechangelog-versions-table! conn)
  (when (empty? (jdbc/query {:connection conn}
                            [(format "SELECT 1 FROM %s LIMIT 1" databasechangelog-versions-table)]))
    (backfill-databasechangelog-versions! conn database)))

(defn- record-unchanged-deployment-version!
  "Associate the most recent deployment with the current Metabase version when a boot runs no migrations, purely as
  history ('this version booted here'; a newer major recorded this way is one that shipped no migrations for this DB).
  Only real versions are recorded here -- a no-op boot is not a new deployment, so it must not advance the dev
  synthetic counter (which only increments when migrations actually run, via [[record-active-deployment-version!]]).

  These stamps are history, not schema state: every reader derives the schema's version from a deployment's *earliest*
  row -- the version that ran it (see [[recorded-deployments]] / [[last-deployment-version]]) -- so a stamp never
  moves the downgrade/rollback boundaries. To keep that invariant, a stamp must never become a deployment's first row:
  if the deployment has no recorded version yet (e.g. a legacy install touched via `migrate up`, which skips the
  boot-time checks that normally backfill), the backfill runs first. A binary *older* than the deployment's
  ran-version records nothing -- that flow is an unsupported downgrade, not history worth a row."
  [^Database database]
  (when-let [version (real-recorded-version)]
    (let [conn (.. database getConnection getUnderlyingConnection)]
      (when-let [deployment-id (last-deployment-id database)]
        (ensure-databasechangelog-versions-table! conn)
        (letfn [(ran-major []
                  (some-> (jdbc/query {:connection conn}
                                      [(format "SELECT metabase_version FROM %s WHERE deployment_id = ? ORDER BY deployed_at ASC, id ASC LIMIT 1"
                                               databasechangelog-versions-table)
                                       deployment-id])
                          first :metabase_version version->major))]
          (let [major (or (ran-major)
                          (do (backfill-databasechangelog-versions! conn database) (ran-major)))]
            (when (and major (>= (version->major version) major))
              (insert-deployment-version! conn deployment-id version))))))))

(defn recording-exec-listener
  "A Liquibase `ChangeExecListener` that records the running Metabase version against the current `deployment_id` as
  soon as the first changeset of a run is applied. This ensures a version is tracked even if the update fails in later changesets."
  ^ChangeExecListener [^Database database]
  (let [recorded? (atom false)]
    (proxy [AbstractChangeExecListener] []
      (ran [change-set _database-change-log _database _exec-type]
        (when (and (instance? ChangeSet change-set) (compare-and-set! recorded? false true))
          (record-active-deployment-version! database))))))

(def ^{:private true}
  legacy-version-tracking-suffix "legacy-version-tracking")

(def ^{:private true}
  legacy-version-tracking-author "version-tracking")

(def ^{:private true}
  legacy-version-tracking-comment
  "Not a real migration, tracking version for instances prior to the databasechangelog_version tracking.")

(defn record-legacy-version-tracking!
  "Record a synthetic `vNN.legacy-version-tracking` changeset row for `major`, as an ordinary row of the deployment that
  just ran migrations.

  Older Metabase binaries detect an unsupported downgrade by reading the highest `vNN.*` changeset id
  ([[latest-applied-major-version]]) and know nothing about `databasechangelog_version`. Once a release ships its
  migrations as version-less changesets those binaries would see a stale major, so this row keeps that signal accurate.

  It deliberately carries the **same `deployment_id`** as the deployment that created it, and an execution position
  within that deployment's range. That means it needs no special handling anywhere: rolling that deployment back deletes
  it through the normal [[delete-deployment-rows!]] path, exactly like any other row of the deployment. (It must be
  in-range for that: [[rollback-plan]] only drops a deployment when *all* of its rows are being rolled back.)

  Rows for earlier majors are deliberately left in place, so that after rolling back the later deployments the earlier
  deployment's row is once again the highest -- e.g. rolling 65 -> 63 removes the v64 and v65 rows with their
  deployments and leaves v63."
  [^Database database major deployment-id]
  (when (and major (< major synthetic-major-floor) deployment-id)
    (let [conn      (.. database getConnection getUnderlyingConnection)
          changelog (.getDatabaseChangeLogTableName database)
          wanted    (format "v%d.%s" major legacy-version-tracking-suffix)
          exists?   (seq (jdbc/query {:connection conn}
                                     [(format "SELECT 1 FROM %s WHERE id = ?" changelog) wanted]))]
      (when-not exists?
        (try
          (let [next-order (-> (jdbc/query {:connection conn}
                                           [(format "SELECT MAX(orderexecuted) AS m FROM %s WHERE deployment_id = ?" changelog)
                                            deployment-id])
                               first :m (or 0) inc)]
            (jdbc/execute! {:connection conn}
                           [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, "
                                         "deployment_id, comments) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'EXECUTED', ?, ?)")
                                    changelog)
                            wanted legacy-version-tracking-author legacy-version-tracking-suffix
                            next-order deployment-id legacy-version-tracking-comment]))
          (catch Throwable e
            ;; This row only improves downgrade detection for *older* binaries -- it must never block a migration.
            (log/warnf e "Could not record %s in %s; older Metabase versions may not detect a downgrade from this schema"
                       wanted changelog)))))))

(defn- version-tracking-sql
  "SQL statements recording this upgrade in `databasechangelog_version`, plus the `vNN.legacy-version-tracking`
  changelog marker for older binaries, for inclusion in manually-applied upgrade SQL. The recording listener
  and [[record-legacy-version-tracking!]] only run when Metabase itself executes the migrations, so a manual
  `migrate print` upgrade would otherwise leave no version bookkeeping at all -- silently disabling downgrade
  detection for both older binaries (which read the marker) and newer ones (which read `databasechangelog_version`).

  Includes the one-time [[backfill-version-row]] for the pre-upgrade schema when this install has no recorded
  versions yet, so the pre-upgrade rollback boundary is preserved just like on the boot and `migrate up` paths."
  ^String [^Liquibase liquibase]
  (let [database       (.getDatabase liquibase)
        conn           (.. database getConnection getUnderlyingConnection)
        changelog      (.getDatabaseChangeLogTableName database)
        deployment-id  (.getDeploymentId (Scope/getCurrentScope))
        version        (current-recorded-version)
        major          (current-recorded-major)
        ;; read-only: this runs on the `migrate print` path, which must not mutate the database -- the CREATE TABLE
        ;; is part of the generated SQL instead
        backfill       (when (or (not (versions-table-exists? conn))
                                 (empty? (jdbc/query {:connection conn}
                                                     [(format "SELECT 1 FROM %s LIMIT 1" databasechangelog-versions-table)])))
                         (backfill-version-row conn database))
        insert-version (fn [{version' :version, deployment-id' :deployment-id}]
                         (format "INSERT INTO %s (deployment_id, metabase_version, deployed_at) VALUES ('%s', '%s', CURRENT_TIMESTAMP);\n"
                                 databasechangelog-versions-table deployment-id' version'))]
    (str "\n-- Record the Metabase version performing this upgrade\n"
         (databasechangelog-versions-table-ddl) ";\n"
         (when backfill
           (insert-version backfill))
         (insert-version {:deployment-id deployment-id, :version version})
         (when (and major (< major synthetic-major-floor))
           (format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id, comments) "
                        "SELECT 'v%d.%s', '%s', '%s', CURRENT_TIMESTAMP, COALESCE(MAX(orderexecuted), 0) + 1, "
                        "'EXECUTED', '%s', '%s' FROM %s;\n")
                   changelog
                   major legacy-version-tracking-suffix legacy-version-tracking-author legacy-version-tracking-suffix
                   deployment-id legacy-version-tracking-comment changelog)))))

(defn migrations-sql
  "Return a string of SQL containing the DDL statements needed to perform unrun `liquibase` migrations, custom
  migrations will be ignored. Ends with statements that record the upgrade in `databasechangelog_version` (and the
  legacy version-tracking marker) -- see [[version-tracking-sql]] -- since the listeners that normally write those
  only run when Metabase itself executes the migrations."
  ^String [^Liquibase liquibase]
  ;; calling update on custom migrations will execute them, so we ignore it and generates
  ;; sql for SQL migrations only
  (doseq [^ChangeSet change (.listUnrunChangeSets liquibase nil nil)]
    (when (instance? CustomChangeWrapper (first (.getChanges change)))
      (.setIgnore change true)))
  (let [writer (StringWriter.)]
    (.update liquibase "" writer)
    (str (.toString writer) (version-tracking-sql liquibase))))

(defn migrate-up-if-needed!
  "Run any unrun `liquibase` migrations, if needed."
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
              ;; must happen before the recording listener writes this run's version row
              (backfill-versions-if-unrecorded! (.. database getConnection getUnderlyingConnection) database)
              (.setChangeExecListener liquibase (recording-exec-listener (.getDatabase liquibase)))
              (try
                (.update liquibase contexts)
                (finally
                  (.setChangeExecListener liquibase nil)))
              (let [database (.getDatabase liquibase)]
                (record-legacy-version-tracking! database (current-recorded-major) (last-deployment-id database)))
              (log/infof "Migration complete in %s" (u/format-milliseconds (u/since-ms timer))))
            (log/info "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))
    (do
      (log/info "No unrun migrations found.")
      (record-unchanged-deployment-version! (.getDatabase liquibase)))))

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
      (let [database (.getDatabase liquibase)]
        (backfill-versions-if-unrecorded! (.. database getConnection getUnderlyingConnection) database))
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
                                   (record-active-deployment-version! database))
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
        (let [database (.getDatabase liquibase)]
          (record-legacy-version-tracking! database (current-recorded-major) (last-deployment-id database)))))))

(def ^:private legacy-migrations-file "migrations/000_legacy_migrations.yaml")
(def ^:private update001-migrations-file "migrations/001_update_migrations.yaml")

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
      ;; Skip mutating the table if the filenames are already correct. It assumes we have never moved the boundary
      ;; between the two files, i.e. that update-migrations still start from v45.
      ;; NOTE: this `when` is always truthy (`filter` returns a truthy lazy seq even when empty), so the UPDATE below
      ;; runs on every non-fresh boot. That matches long-standing master behavior -- the UPDATE is an idempotent no-op
      ;; once filenames are consolidated -- and pre-consolidation installs' filenames don't reliably match this filter,
      ;; so the always-run semantics are what actually consolidates them. Do not "fix" the guard without auditing the
      ;; filenames of pre-consolidation installs.
      (when (->> (str "SELECT DISTINCT(FILENAME) AS filename FROM " liquibase-table-name)
                 (jdbc/query conn-spec)
                 (into #{} (map :filename))
                 (filter #(or (= % legacy-migrations-file)
                              (str/ends-with? % "update_migrations.yaml"))))
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
            "%/____/%" ;; versionless migrations have a 4-digit string after "migrations/"
            ]))))))

(defn latest-applied-major-version
  "Gets the latest version applied to the database."
  [conn ^Database database]
  (when-not (fresh-install? conn database)
    (let [changeset-query (format "SELECT id FROM %s WHERE id LIKE 'v%%' ORDER BY id DESC LIMIT 1"
                                  (.getDatabaseChangeLogTableName database))
          changeset-id    (last (map :id (jdbc/query {:connection conn} [changeset-query])))]
      (some-> changeset-id extract-numbers first))))

;;; ------------------------------------ databasechangelog_version table -------------------------------------------
;;;
;;; The `databasechangelog_version` table records, for each Liquibase `deployment_id`, the Metabase version that ran it.
;;;
;;; The table is managed *directly* (not via a Liquibase changeset) to avoid a bootstrapping loop -- a version-tracking
;;; table created by a tracked changeset would need to record the version of the very deployment that creates it.
;;;
;;; Note: Liquibase generates the deployment id once per process (it lives in the root `Scope`), not once per update
;;; run. [[run-in-scope-locked]] therefore stamps every locked scope with a fresh deployment id, so each migration run
;;; records as its own deployment even inside a long-lived process (a dev REPL) -- and, because the dev synthetic
;;; version is recomputed rather than memoized (see [[synthetic-dev-version]]), each run also records the next
;;; synthetic major. Together these make `migrate down` roll back exactly the most recent run, in production and in
;;; dev alike.

(defn- recorded-deployments
  "All `databasechangelog_version` rows grouped into deployments, newest deployment first (a deployment's position is
  that of its most recent row). Each entry is `{:deployment_id .., :ran-version .., :versions [..]}` where
  `:ran-version` is the *earliest* version recorded for the deployment -- the version that actually ran it (written by
  the recording listener or the backfill). Any later rows are no-op boot stamps
  (see [[record-unchanged-deployment-version!]]): history of versions that booted against this schema without changing
  it. Only the ran-version may be used to decide what version the schema is at."
  [^Connection conn]
  (let [rows   (jdbc/query {:connection conn}
                           [(format "SELECT deployment_id, metabase_version FROM %s ORDER BY deployed_at DESC, id DESC"
                                    databasechangelog-versions-table)])
        by-dep (group-by :deployment_id rows)]
    (for [dep (distinct (map :deployment_id rows))]
      (let [versions (mapv :metabase_version (by-dep dep))]
        {:deployment_id dep
         :versions      versions
         ;; rows are newest-first, so the deployment's earliest row -- the version that ran it -- is the last one
         :ran-version   (peek versions)}))))

(defn changesets-from-later-version
  "Returns changeset IDs applied by versions later than `latest-available` up to `latest-applied`, ordered by execution
  position. Version-prefixed ids are matched by the major in the id; version-less changesets carry no version in their
  id, so they are matched by the recorded ran-version major of their deployment (see [[recorded-deployments]])."
  [conn ^Database database latest-available latest-applied]
  (ensure-databasechangelog-versions-table! conn)
  (let [table      (.getDatabaseChangeLogTableName database)
        versions   (range (inc latest-available) (inc latest-applied))
        later-deps (->> (recorded-deployments conn)
                        (filter #(when-let [major (version->major (:ran-version %))]
                                   (and (> major latest-available) (<= major latest-applied))))
                        (mapv :deployment_id))
        ;; RERAN rows are older changesets that merely re-executed under the later deployment (edited runOnChange
        ;; changesets); they are not "from" the later version and would only confuse the listing
        clauses    (concat (map #(format "id LIKE 'v%d.%%'" %) versions)
                           (when (seq later-deps)
                             [(format "(deployment_id IN (%s) AND exectype <> 'RERAN')"
                                      (str/join ", " (repeat (count later-deps) "?")))]))
        query      (format "SELECT id FROM %s WHERE %s ORDER BY dateexecuted ASC, orderexecuted ASC"
                           table (str/join " OR " clauses))]
    (mapv :id (jdbc/query {:connection conn} (into [query] later-deps)))))

(defn deployment-versions
  "Return a map of `deployment_id` -> the version that *ran* it, for the deployments we allow rolling back to.
  No-op boot stamps recorded against a deployment (see [[recorded-deployments]]) do not affect the result.

  By default the result is windowed to the recent history: every deployment that ran on the *current* schema major,
  plus the single most recent deployment from an earlier major (the boundary of the last major upgrade). When `all?`
  is true the full recorded history is returned instead.

  (The current schema major is the ran-version major of the newest deployment. In production this equals
  [[current-recorded-major]]; in dev, where each deployment records an incrementing synthetic version, it is the
  latest major that actually ran -- whereas current-recorded-major is the *next* synthetic version this process would
  record. Windowing on the recorded value keeps `migrate down` correct in both cases.)"
  ([conn database] (deployment-versions conn database false))
  ([^Connection conn ^Database database all?]
   (ensure-databasechangelog-versions-table! conn)
   (let [deployments   (or (seq (recorded-deployments conn))
                           ;; empty means the table has no rows at all, so do the one-time backfill and read again
                           (do (backfill-databasechangelog-versions! conn database)
                               (recorded-deployments conn)))
         current-major (some-> (first deployments) :ran-version version->major)
         ;; by default keep the leading current-major deployments (newest first) plus the first deployment from an
         ;; earlier major (the last-major-upgrade boundary); `all?` keeps the entire recorded history
         kept          (if all?
                         deployments
                         (let [[current older] (split-with #(= current-major (version->major (:ran-version %))) deployments)]
                           (concat current (take 1 older))))]
     (into {} (map (juxt :deployment_id :ran-version)) kept))))

(defn current-schema-major
  "Major version the application-db schema is currently at: the ran-version major of the most recent deployment.
  No-op boot stamps recorded against a deployment do not move this forward -- a boot that ran no migrations did not
  change the schema. In production this equals [[current-recorded-major]] whenever the running binary migrated the DB
  to its own version; in dev, where each deployment records an incrementing synthetic version, it is the latest major
  that actually ran migrations -- which is the correct major to step back *from* on a default `migrate down` (whereas
  [[current-recorded-major]] is the *next* synthetic version this process would record, so `dec` of it would target
  the current state and be a no-op). Returns nil only when there is no recorded (or backfillable) version at all."
  [^Connection conn ^Database database]
  (letfn [(newest-ran [] (some-> (recorded-deployments conn) first :ran-version version->major))]
    (ensure-databasechangelog-versions-table! conn)
    (or (newest-ran)
        (do (backfill-databasechangelog-versions! conn database) (newest-ran)))))

(defn last-deployment-version
  "Return the Metabase version string that *ran* the most-recently-applied deployment: the earliest version recorded
  for the `deployment_id` of the most-recently-applied changeset, or nil if there is none (empty changelog, or the
  deployment has no recorded version). Later rows recorded against the same deployment are no-op boot stamps --
  versions that booted this schema without changing it -- and must not be mistaken for the version the schema is at."
  [^Connection conn ^Database database]
  (when-let [last-dep (-> (jdbc/query {:connection conn}
                                      [(format "SELECT deployment_id FROM %s ORDER BY dateexecuted DESC, orderexecuted DESC LIMIT 1"
                                               (.getDatabaseChangeLogTableName database))])
                          first
                          :deployment_id)]
    ;; called for its side effect: creates the version table and performs the lazy one-time backfill if needed
    (deployment-versions conn database)
    (-> (jdbc/query {:connection conn}
                    [(format "SELECT metabase_version FROM %s WHERE deployment_id = ? ORDER BY deployed_at ASC, id ASC LIMIT 1"
                             databasechangelog-versions-table)
                     last-dep])
        first
        :metabase_version)))

(defn- exec-pos
  "The execution position of a `databasechangelog` row as a comparable `[dateexecuted orderexecuted]` vector. A row's
  `orderexecuted` is only meaningful relative to its `dateexecuted` (it is the order within a single deployment, not a
  globally increasing counter), so rows must always be compared on the pair, never on `orderexecuted` alone."
  [{:keys [dateexecuted orderexecuted]}]
  [dateexecuted orderexecuted])

(defn- resolve-rollback-major
  "Resolve a rollback `target` -- an integer major version, or a numeric string like `\"64\"` -- to a major recorded
  in `candidate-versions` (the recorded version strings the rollback window allows -- see
  [[rollback-candidate-versions]]). Returns nil when the target is not a bare major or is not recorded. Point-release
  targets (e.g. `\"64.1\"`) are deliberately not supported: rollback boundaries are majors, resolved to the latest
  deployment of that major by [[rollback-plan]]."
  [candidate-versions target]
  (let [major (cond
                (integer? target) (long target)
                (string? target)  (some-> (re-matches #"\d+" target) parse-long)
                :else             nil)]
    (when (and major (some #(= major (version->major %)) candidate-versions))
      major)))

(defn- rollback-candidate-versions
  "All version strings recorded for the deployments in the rollback window (see [[deployment-versions]]). Includes
  every version recorded for those deployments -- also ones shadowed by a later no-op boot stamp on the same
  deployment, which remain valid rollback boundaries."
  [^Connection conn ^Database database all?]
  (let [deps (set (keys (deployment-versions conn database all?)))]
    (->> (jdbc/query {:connection conn}
                     [(format "SELECT deployment_id, metabase_version FROM %s" databasechangelog-versions-table)])
         (filter (comp deps :deployment_id))
         (map :metabase_version))))

(defn valid-rollback-target?
  "Whether `target` (a bare major version) is a permitted rollback target: it must be a major recorded for the
  deployments in [[deployment-versions]] -- the recent window (current major plus the previous-major upgrade
  boundary) by default, or the full recorded history when `force?` widens it."
  ([conn database target] (valid-rollback-target? conn database target false))
  ([^Connection conn ^Database database target force?]
   (some? (resolve-rollback-major (rollback-candidate-versions conn database force?) target))))

(defn- changeset-row-key
  "Unique identity of a `databasechangelog` row as `[filename author id]` -- the id alone is not unique (the same id can
  recur across changelog files or authors)."
  [{:keys [filename author id]}]
  [filename author id])

(defn- changeset-key
  "Unique identity of a Liquibase `ChangeSet` as `[filename author id]` (matches [[changeset-row-key]])."
  [^ChangeSet cs]
  [(.getFilePath cs) (.getAuthor cs) (.getId cs)])

(defn- rollback-plan
  "Compute what a rollback to the resolved `target-major` should drop. Returns
  `{:changesets-to-drop <set of [filename author id] keys>, :changesets-to-retain <set of keys of re-run rows that
  must NOT be reversed>, :boundary-deployment <deployment_id the retained rows are reassigned to>,
  :deployments-to-drop <set of deployment_ids whose entire history is rolled back>}`.

  The deployments we roll back *to* are those with any version of `target-major` recorded (a major can span several
  deployment_ids: point releases, the same build recording across restarts, no-op boot stamps); every changeset that
  ran after the latest of them is dropped, leaving the schema in the state that major last left it. Ordering is the
  `[dateexecuted orderexecuted]` pair -- `orderexecuted` is not a globally increasing counter, so it cannot be
  compared on its own.

  Rows with exectype `RERAN` in that window are *retained*, not dropped: a RERAN row is an older changeset that
  merely re-executed under the newer deployment (a `runOnChange` changeset whose checksum changed, or a
  `migrate force` re-run) -- Liquibase moves the row to the run's deployment with a fresh execution position, but the
  changeset itself predates the boundary, and reversing it would strip schema state the rollback target still needs.
  Retained rows are reassigned to `:boundary-deployment` (the latest deployment of the target major) so every
  surviving row stays attached to a deployment with a recorded version. Limitation: a changeset first introduced
  *after* the target that later re-ran is indistinguishable from this and is also retained -- the rolled-back schema
  keeps its object as a harmless orphan, and a later re-upgrade adopts it again."
  [^Connection conn changelog-table target-major]
  (let [all-rows      (jdbc/query {:connection conn}
                                  [(format "SELECT id, author, filename, deployment_id, dateexecuted, orderexecuted, exectype FROM %s" changelog-table)])
        version-rows  (jdbc/query {:connection conn}
                                  [(format "SELECT deployment_id, metabase_version FROM %s" databasechangelog-versions-table)])
        boundary-deps (set (for [{:keys [deployment_id metabase_version]} version-rows
                                 :when (= target-major (version->major metabase_version))]
                             deployment_id))
        boundary-row  (->> all-rows
                           (filter #(boundary-deps (:deployment_id %)))
                           (sort-by exec-pos)
                           last)
        boundary-pos  (some-> boundary-row exec-pos)
        window-rows   (if boundary-pos
                        (filter #(pos? (compare (exec-pos %) boundary-pos)) all-rows)
                        [])
        reran?        (fn [{:keys [exectype]}] (= "RERAN" (some-> exectype u/upper-case-en)))
        rows-by-dep   (group-by :deployment_id all-rows)]
    {:changesets-to-drop   (set (map changeset-row-key (remove reran? window-rows)))
     :changesets-to-retain (set (map changeset-row-key (filter reran? window-rows)))
     :boundary-deployment  (:deployment_id boundary-row)
     ;; only clear a deployment's history/version rows when its entire history leaves it (dropped or reassigned)
     :deployments-to-drop  (set (for [[dep in-window] (group-by :deployment_id window-rows)
                                      :when (and dep (= (count in-window) (count (get rows-by-dep dep))))]
                                  dep))}))

(defn- run-liquibase-rollback!
  "Reverse the changesets in `changesets-to-drop` (a set of `[filename author id]` keys) that still exist in the
  changelog file, using Liquibase's rollback machinery. Changesets that were removed from later changelog files cannot
  be reversed here and are instead cleared by [[delete-deployment-rows!]]. Returns a vector of changeset ids that
  errored during rollback (each also logged)."
  [^Liquibase liquibase ^Database lb-db changesets-to-drop]
  (let [ran-changesets     (.getRanChangeSetList lb-db)
        changelog          (.getDatabaseChangeLog liquibase)
        changelog-keys     (set (map changeset-key (.getChangeSets changelog)))
        changeset-filter   (proxy [ChangeSetFilter] []
                             (accepts [^ChangeSet changeSet]
                               (let [k      (changeset-key changeSet)
                                     result (and (contains? changesets-to-drop k) (contains? changelog-keys k))]
                                 (ChangeSetFilterResult. result (if result
                                                                  (do
                                                                    (log/infof "Going to roll back changeset %s" changeSet)
                                                                    (str "Changeset '" changeSet "' is in target list"))
                                                                  (str "Changeset '" changeSet "' is not in target list")) nil))))
        changelog-iterator (ChangeLogIterator. ran-changesets changelog
                                               (doto (ArrayList.)
                                                 (.addAll
                                                  [(AlreadyRanChangeSetFilter. ran-changesets)
                                                   (IgnoreChangeSetFilter.)
                                                   (DbmsChangeSetFilter. lb-db)
                                                   changeset-filter])))
        error-ids          (atom [])
        change-listener    (proxy [AbstractChangeExecListener] []
                             (rollbackFailed [^ChangeSet change-set _dbchangelog _db ^Exception e]
                               (swap! error-ids conj (.getId change-set))
                               (log/errorf e "Error rolling back migration %s" (.getId change-set))))]
    (AbstractRollbackCommandStep/doRollback lb-db
                                            changelog-file
                                            nil
                                            changelog-iterator
                                            (.getChangeLogParameters liquibase)
                                            changelog
                                            change-listener)
    @error-ids))

(defn- reassign-changeset-rows!
  "Move the retained (re-run) `changeset-keys` onto `deployment-id` -- the deployment being rolled back to -- so they
  survive [[delete-deployment-rows!]] and stay attached to a deployment with a recorded version."
  [^Connection conn changelog-table changeset-keys deployment-id]
  (doseq [[filename author id] changeset-keys]
    (jdbc/execute! {:connection conn}
                   [(format "UPDATE %s SET deployment_id = ? WHERE filename = ? AND author = ? AND id = ?" changelog-table)
                    deployment-id filename author id])))

(defn- rollback-failure-message
  "Error message for a rollback that could not reverse some changesets. Only claims the database was left unchanged
  where that is true: Postgres rolls the transaction's DDL back; H2 and MySQL auto-commit DDL, so rollback steps
  executed before the failure may have persisted."
  [db-type target error-ids]
  (str (trs "Rollback to {0} failed: could not roll back changeset(s) {1}." target (str/join ", " error-ids))
       " "
       (if (= db-type :postgres)
         (trs "The database has been left unchanged.")
         (trs "Rollback steps executed before the failure may already have been committed ({0} cannot roll back DDL transactionally). Verify the schema, or restore from a backup, before retrying." (name db-type)))))

(defn- delete-deployment-rows!
  "Delete every `databasechangelog` and `databasechangelog_version` row for the fully-rolled-back `deployment-ids`. This
  removes changesets that were dropped from later changelog files (so [[run-liquibase-rollback!]] could not reverse
  them) but still need to be cleared from history, along with those deployments' version rows."
  [^Connection conn changelog-table deployment-ids]
  (when (seq deployment-ids)
    (doseq [table [changelog-table databasechangelog-versions-table]]
      (jdbc/execute! {:connection conn}
                     (into [(format "DELETE FROM %s WHERE deployment_id IN (%s)"
                                    table
                                    (str/join ", " (repeat (count deployment-ids) "?")))]
                           deployment-ids)))))

(defn previous-recorded-major
  "The highest recorded major strictly below the current schema major -- the default target for `migrate down`.
  Returns nil when there is no earlier recorded major to roll back to."
  [^Connection conn ^Database database force?]
  (let [current (current-schema-major conn database)
        earlier (->> (vals (deployment-versions conn database force?))
                     (keep version->major)
                     (filter #(and current (< % current))))]
    (when (seq earlier)
      (apply max earlier))))

(defn rollback-major-version!
  "Roll back all migrations that ran after the most recent deployment of `target` -- an integer major version (or a
  numeric string like `\"64\"`). The target must be a major recorded in the `databasechangelog_version` table (see
  [[deployment-versions]] / [[valid-rollback-target?]]): by default the current major or the previous recorded major
  (the last upgrade boundary); when `force` is true, any recorded major in history.

  Unless `force` is true, refuses to run when the schema was migrated by a NEWER Metabase version than this binary:
  this binary's changelog does not contain those changesets, so it cannot reverse their DDL -- proceeding would only
  delete their bookkeeping rows and leave the schema silently corrupted. Run `migrate down` from the newer binary
  instead."
  ;; default: roll back to the previous *recorded* major. In dev this rolls back the
  ;; last deployment rather than no-opping against the next synthetic version; in production it steps back one recorded
  ;; major even when the upgrade skipped majors or the current major shipped no migrations.
  ([conn ^Liquibase liquibase force]
   (if-let [target (previous-recorded-major conn (.getDatabase liquibase) force)]
     (rollback-major-version! conn liquibase force target)
     (log/info "No earlier recorded Metabase version to roll back to; nothing to do.")))

  ;; with explicit target version
  ([conn ^Liquibase liquibase force target]
   (with-scope-locked liquibase
     (let [lb-db           (.getDatabase liquibase)
           changelog-table (changelog-table-name liquibase)
           _               (ensure-databasechangelog-versions-table! conn)]
       ;; Refuse (unless forced) to roll back a schema that a NEWER Metabase version migrated: this binary's changelog
       ;; does not contain those changesets, so Liquibase cannot reverse their DDL -- it would only delete their
       ;; bookkeeping rows (including the legacy-version-tracking marker) and leave the schema silently corrupted.
       ;; (In dev the synthetic binary major is always ahead of the recorded schema major, so this never fires for
       ;; dev-on-dev workflows; it does protect a release binary pointed at a dev-written DB.)
       (when-not force
         (let [schema-major (current-schema-major conn lb-db)
               binary-major (current-recorded-major)]
           (when (and schema-major binary-major (> schema-major binary-major))
             (throw (ex-info (format "Cannot downgrade a database at version %d from Metabase version %d. You must run 'migrate down' from Metabase version >= %d."
                                     schema-major binary-major schema-major)
                             {:schema-major schema-major, :binary-major binary-major})))))
       (let [target-major (resolve-rollback-major (rollback-candidate-versions conn lb-db force) target)]
         (when (nil? target-major)
           (throw (IllegalArgumentException.
                   (format "%s is not a valid rollback target. Target must be the major version of a recorded deployment (see the %s table)."
                           (pr-str target) databasechangelog-versions-table))))
         (let [{:keys [changesets-to-drop changesets-to-retain boundary-deployment deployments-to-drop]}
               (rollback-plan conn changelog-table target-major)]
           (log/infof "Rolling back app database schema to %s" target)
           (if (and (empty? changesets-to-drop) (empty? changesets-to-retain))
             (log/info "No changesets to roll back")
             (let [error-ids (when (seq changesets-to-drop)
                               (run-liquibase-rollback! liquibase lb-db changesets-to-drop))]
               ;; If any changeset failed to reverse, do NOT clear the deployments' history. Doing so would leave the
               ;; changelog claiming a rollback that only partly happened, and would drop the `legacy-version-tracking`
               ;; row with it -- so an older binary would read a *lower* major than the schema actually has and happily
               ;; start against it. Fail loudly instead: the caller ([[metabase.app-db.setup/migrate!]]) rolls the
               ;; transaction back -- which restores everything on Postgres, but on H2/MySQL DDL auto-commits, so
               ;; already-executed rollback steps may persist (the message says so; see [[rollback-failure-message]]).
               (when (seq error-ids)
                 (throw (ex-info (rollback-failure-message (mdb.connection/db-type) target error-ids)
                                 {:target target, :failed-changesets (vec error-ids)})))
               (when (seq changesets-to-retain)
                 (log/infof "Not reversing %d re-run (runOnChange/force) changeset(s) that predate the rollback target: %s"
                            (count changesets-to-retain) (str/join ", " (sort (map peek changesets-to-retain))))
                 (reassign-changeset-rows! conn changelog-table changesets-to-retain boundary-deployment))
               (delete-deployment-rows! conn changelog-table deployments-to-drop)))))))))
