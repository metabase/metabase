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
          (first (jdbc/query {:connection conn}
                             [(format "select id, filename from %s order by dateexecuted desc limit 1"
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
        scope-objects {(.name Scope$Attr/database)         database
                       (.name Scope$Attr/resourceAccessor) (.getResourceAccessor liquibase)}]
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

(defn ensure-databasechangelog-versions-table!
  "Create the `databasechangelog_version` table if it does not already exist."
  [^Connection conn]
  (let [app-db (mdb.connection/unique-identifier)]
    (when-not (contains? @databasechangelog-versions-table-created app-db)
      (let [id-column (case (mdb.connection/db-type)
                        :mysql "id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY"
                        "id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")]
        (jdbc/execute! {:connection conn}
                       [(format (str "CREATE TABLE IF NOT EXISTS %s ("
                                     "%s, "
                                     "deployment_id varchar(10) NOT NULL, "
                                     "metabase_version varchar(255) NOT NULL, "
                                     "deployed_at timestamp NOT NULL, "
                                     "CONSTRAINT uq_databasechangelog_version UNIQUE (deployment_id, metabase_version))")
                                databasechangelog-versions-table id-column)]))
      (swap! databasechangelog-versions-table-created conj app-db))))

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
  [^Connection conn]
  (ensure-databasechangelog-versions-table! conn)
  (let [highest (->> (jdbc/query {:connection conn}
                                 [(format "SELECT metabase_version FROM %s" databasechangelog-versions-table)])
                     (keep (comp version->major :metabase_version))
                     (reduce max (dec synthetic-major-floor)))]
    (format "x.%d.0.0" (inc highest))))

(def ^{:private true}
  synthetic-dev-version
  (let [memoized (memoize (fn [_app-db-id]
                            (with-open [conn (.getConnection (mdb.connection/data-source))]
                              (compute-synthetic-version conn))))]
    (fn [] (memoized (mdb.connection/unique-identifier)))))

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
  "Insert a `(deployment-id, version, now)` row into `databasechangelog_version`, unless that exact pair already exists."
  [^Connection conn deployment-id version]
  (ensure-databasechangelog-versions-table! conn)
  (let [values "(deployment_id, metabase_version, deployed_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
        upsert (case (mdb.connection/db-type)
                 :postgres (format "INSERT INTO %s %s ON CONFLICT DO NOTHING" databasechangelog-versions-table values)
                 :mysql (format "INSERT IGNORE INTO %s %s" databasechangelog-versions-table values)
                 nil)]
    (if upsert
      (jdbc/execute! {:connection conn} [upsert deployment-id version])
      (when (empty? (jdbc/query {:connection conn}
                                [(format "SELECT 1 FROM %s WHERE deployment_id = ? AND metabase_version = ?"
                                         databasechangelog-versions-table) deployment-id version]))
        (jdbc/execute! {:connection conn}
                       [(format "INSERT INTO %s %s" databasechangelog-versions-table values)
                        deployment-id version])))))

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

(defn- record-unchanged-deployment-version!
  "Associate the most recent deployment with the current Metabase version when a boot runs no migrations. Only real
  versions are recorded here -- a no-op boot is not a new deployment, so it must not advance the dev synthetic counter
  (which only increments when migrations actually run, via [[record-active-deployment-version!]])."
  [^Database database]
  (when-let [version (real-recorded-version)]
    (insert-deployment-version! (.. database getConnection getUnderlyingConnection)
                                (last-deployment-id database)
                                version)))

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
  (str "Not a real migration, tracking version for instances prior to the databasechangelog_version tracking."))

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
                  timer              (u/start-timer)]
              (log/infof "Running %s migrations ..." unrun-migrations-count)
              (doseq [^ChangeSet change to-run-migrations]
                (log/tracef "To run migration %s" (.getId change)))
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
              (.setFailOnError change-set fail-on-error?))))))))

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

(defn latest-available-major-version
  "Get the latest version that Liquibase would apply if we ran migrations right now."
  [^Liquibase liquibase]
  (->> liquibase
       (.getDatabaseChangeLog)
       (.getChangeSets)
       last
       (#(.getId ^ChangeSet %))
       extract-numbers
       first))

(defn latest-applied-major-version
  "Gets the latest version applied to the database."
  [conn ^Database database]
  (when-not (fresh-install? conn database)
    (let [changeset-query (format "SELECT id FROM %s WHERE id LIKE 'v%%' ORDER BY id DESC LIMIT 1"
                                  (.getDatabaseChangeLogTableName database))
          changeset-id    (last (map :id (jdbc/query {:connection conn} [changeset-query])))]
      (some-> changeset-id extract-numbers first))))

(defn changesets-from-later-version
  "Returns changeset IDs applied from versions later than `latest-available` up to `latest-applied`, ordered by execution date."
  [conn ^Database database latest-available latest-applied]
  (let [table    (.getDatabaseChangeLogTableName database)
        versions (range (inc latest-available) (inc latest-applied))
        clauses  (str/join " OR " (map #(format "id LIKE 'v%d.%%'" %) versions))
        query    (format "SELECT id FROM %s WHERE %s ORDER BY dateexecuted ASC, orderexecuted ASC" table clauses)]
    (mapv :id (jdbc/query {:connection conn} [query]))))

;;; ------------------------------------ databasechangelog_version table -------------------------------------------
;;;
;;; The `databasechangelog_version` table records, for each Liquibase `deployment_id`, the Metabase version that ran it.
;;;
;;; The table is managed *directly* (not via a Liquibase changeset) to avoid a bootstrapping loop -- a version-tracking
;;; table created by a tracked changeset would need to record the version of the very deployment that creates it.

(defn backfill-databasechangelog-versions!
  "Stamp a single version row for an existing install that has no rows in `databasechangelog_version` yet, pointing the
  *latest* `deployment_id` at the *highest* major version present in the changelog. Older deployments are intentionally
  left without a row: downgrade detection consults only the latest deployment, and a legacy changeset's major is
  derived from its `vNN.` id rather than a recorded version, so the older deployments never need one.

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
      (insert-deployment-version! conn deployment_id (format "x.%d.0.0" major)))))

(defn deployment-versions
  "Return a map of `deployment_id` -> recorded `metabase_version` for the deployments we allow rolling back to.

  By default the result is windowed to the recent history: every deployment on the *current* major version, plus the
  single most recent deployment from the previous major version (the boundary of the last major upgrade). When `all?` is
  true the full recorded history is returned instead"
  ([conn database] (deployment-versions conn database false))
  ([^Connection conn ^Database database all?]
   (ensure-databasechangelog-versions-table! conn)
   (letfn [(recent-rows []
             (jdbc/query {:connection conn}
                         [(format "SELECT deployment_id, metabase_version FROM %s ORDER BY deployed_at DESC, id DESC"
                                  databasechangelog-versions-table)]))]
     (let [rows          (or (seq (recent-rows))
                             ;; empty means the table has no rows at all, so do the one-time backfill and read again
                             (do (backfill-databasechangelog-versions! conn database)
                                 (recent-rows)))
           ;; The major the schema is currently at = major of the most-recently-deployed recorded version (rows are
           ;; newest-first). In production this equals current-recorded-major (the running binary migrated the DB to its
           ;; own version); in dev, where each deployment records an incrementing synthetic version, this is the latest
           ;; major that actually ran -- whereas current-recorded-major is the *next* synthetic version this process
           ;; would record. Windowing on the recorded value keeps `migrate down` correct in both cases.
           current-major (some-> (first rows) :metabase_version version->major)
           ;; by default keep the leading current-major rows (rows are newest-first) plus the first row from a different
           ;; major version (the last-major-upgrade boundary); `all?` keeps the entire recorded history
           kept          (if all?
                           rows
                           (let [[current older] (split-with #(= current-major (version->major (:metabase_version %))) rows)]
                             (concat current (take 1 older))))]
       ;; a deployment can have several version rows; rows are ordered by deployed_at DESC, so keep the newest one
       (update-vals (group-by :deployment_id kept) (comp :metabase_version first))))))

(defn current-schema-major
  "Major version the application-db schema is currently at: the major of the most-recently-deployed recorded version.
  In production this equals [[current-recorded-major]] (the running binary migrated the DB to its own version); in dev,
  where each deployment records an incrementing synthetic version, it is the latest major that actually ran migrations
  -- which is the correct major to step back *from* on a default `migrate down` (whereas [[current-recorded-major]] is
  the *next* synthetic version this process would record, so `dec` of it would target the current state and be a no-op).
  Returns nil only when there is no recorded (or backfillable) version at all."
  [^Connection conn ^Database database]
  (letfn [(newest [] (some-> (jdbc/query {:connection conn}
                                         [(format "SELECT metabase_version FROM %s ORDER BY deployed_at DESC, id DESC LIMIT 1"
                                                  databasechangelog-versions-table)])
                             first :metabase_version version->major))]
    (ensure-databasechangelog-versions-table! conn)
    (or (newest)
        (do (backfill-databasechangelog-versions! conn database) (newest)))))

(defn last-deployment-version
  "Return the Metabase version string recorded for the `deployment_id` of the most-recently-applied changeset, or nil if
  there is none (empty changelog, or the deployment has no recorded version)."
  [^Connection conn ^Database database]
  (when-let [last-dep (-> (jdbc/query {:connection conn}
                                      [(format "SELECT deployment_id FROM %s ORDER BY dateexecuted DESC, orderexecuted DESC LIMIT 1"
                                               (.getDatabaseChangeLogTableName database))])
                          first
                          :deployment_id)]
    (get (deployment-versions conn database) last-dep)))

(defn- exec-pos
  "The execution position of a `databasechangelog` row as a comparable `[dateexecuted orderexecuted]` vector. A row's
  `orderexecuted` is only meaningful relative to its `dateexecuted` (it is the order within a single deployment, not a
  globally increasing counter), so rows must always be compared on the pair, never on `orderexecuted` alone."
  [{:keys [dateexecuted orderexecuted]}]
  [dateexecuted orderexecuted])

(defn- version-vec
  "Parse a version string into a vector of integer components for comparison, ignoring an optional leading `x.`.
  e.g. `\"55.2.1\"` -> `[55 2 1]`, `\"x.55.2.1\"` -> `[55 2 1]`, `\"54\"` -> `[54]`."
  [version]
  (->> (str/split (str/replace (str version) #"^x\." "") #"\.")
       (keep #(some-> (re-find #"\d+" %) parse-long))
       vec))

(defn- resolve-rollback-target
  "Resolve a rollback `target` string to the concrete recorded version vector to roll back to, drawn from `versions` (the
  allowable `deployment_id` -> version map from [[deployment-versions]]). A full `major.minor.patch` target must match a
  recorded version exactly; a bare major resolves to the highest recorded version of that major. Returns nil when the
  target is not one of the allowable versions."
  [versions target]
  (let [target-vec (version-vec target)
        candidates (->> (vals versions) (map version-vec) distinct)]
    (when (seq target-vec)
      (if (>= (count target-vec) 3)
        (first (filter #(= % target-vec) candidates))
        (->> candidates
             (filter #(= (first target-vec) (first %)))
             sort
             last)))))

(defn valid-rollback-target?
  "Whether `target` (a bare major or full `major.minor.patch` version string) is a permitted rollback target: it must
  resolve to one of the versions in [[deployment-versions]] -- the recent window (current major plus the previous-major
  upgrade boundary) by default, or the full recorded history when `force?` widens it."
  ([conn database target] (valid-rollback-target? conn database target false))
  ([^Connection conn ^Database database target force?]
   (some? (resolve-rollback-target (deployment-versions conn database force?) target))))

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
  "Compute what a rollback to the resolved `target-vec` should drop. Returns
  `{:changesets-to-drop <set of [filename author id] keys>, :deployments-to-drop <set of deployment_ids whose entire
  history is rolled back>}`.

  The deployment(s) we roll back *to* are those recorded with exactly `target-vec`; every changeset that ran after the
  latest of them is dropped. (A version can span more than one deployment_id -- e.g. the same build recording across
  restarts -- so we take the max as the boundary.) Ordering is the `[dateexecuted orderexecuted]` pair -- `orderexecuted`
  is not a globally increasing counter, so it cannot be compared on its own."
  [^Connection conn changelog-table target-vec]
  (let [all-rows      (jdbc/query {:connection conn}
                                  [(format "SELECT id, author, filename, deployment_id, dateexecuted, orderexecuted FROM %s" changelog-table)])
        version-rows  (jdbc/query {:connection conn}
                                  [(format "SELECT deployment_id, metabase_version FROM %s" databasechangelog-versions-table)])
        boundary-deps (set (for [{:keys [deployment_id metabase_version]} version-rows
                                 :when (= (version-vec metabase_version) target-vec)]
                             deployment_id))
        boundary-pos  (->> all-rows
                           (filter #(boundary-deps (:deployment_id %)))
                           (map exec-pos)
                           sort
                           last)
        drop-rows     (if boundary-pos
                        (filter #(pos? (compare (exec-pos %) boundary-pos)) all-rows)
                        [])
        rows-by-dep   (group-by :deployment_id all-rows)]
    {:changesets-to-drop  (set (map changeset-row-key drop-rows))
     ;; only clear a deployment's history/version rows when the entire deployment is being rolled back
     :deployments-to-drop (set (for [[dep drops] (group-by :deployment_id drop-rows)
                                     :when (and dep (= (count drops) (count (get rows-by-dep dep))))]
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
  "Roll back migrations applied after the given `target` version (a string). The target must be one of the versions you
  are allowed to roll back to (see [[deployment-versions]] / [[valid-rollback-target?]]): a bare major resolves to the
  highest recorded version of that major, while a full `major.minor.patch` version must match a recorded version
  exactly. Every changeset that ran after the latest deployment recorded with that version is then rolled back.

  By default only the recent window is targetable -- the current major plus the previous-major upgrade boundary. When
  `force` is true the window is widened to the *full* recorded history, so you can roll back further back; the target
  must still be a recorded version."
  ;; default: roll back to the previous *recorded* major. In dev this rolls back the
  ;; last deployment rather than no-opping against the next synthetic version; in production it steps back one recorded
  ;; major even when the upgrade skipped majors or the current major shipped no migrations.
  ([conn ^Liquibase liquibase force]
   (if-let [target (previous-recorded-major conn (.getDatabase liquibase) force)]
     (rollback-major-version! conn liquibase force (str target))
     (log/info "No earlier recorded Metabase version to roll back to; nothing to do.")))

  ;; with explicit target version
  ([conn ^Liquibase liquibase force target]
   (with-scope-locked liquibase
     (let [lb-db           (.getDatabase liquibase)
           changelog-table (changelog-table-name liquibase)
           _               (ensure-databasechangelog-versions-table! conn)
           target-vec      (resolve-rollback-target (deployment-versions conn lb-db force) target)]
       (when (nil? target-vec)
         (throw (IllegalArgumentException.
                 (format (str "%s is not a valid rollback target. You can roll back to any recorded version of the current "
                              "major or to the previous major version; use force to roll back to any recorded version in "
                              "history.")
                         (pr-str target)))))
       (let [{:keys [changesets-to-drop deployments-to-drop]} (rollback-plan conn changelog-table target-vec)]
         (log/infof "Rolling back app database schema to %s" target)
         (if (empty? changesets-to-drop)
           (log/info "No changesets to roll back")
           (let [error-ids (run-liquibase-rollback! liquibase lb-db changesets-to-drop)]
             ;; If any changeset failed to reverse, do NOT clear the deployments' history. Doing so would leave the
             ;; changelog claiming a rollback that only partly happened, and would drop the `legacy-version-tracking`
             ;; row with it -- so an older binary would read a *lower* major than the schema actually has and happily
             ;; start against it. Fail loudly instead: the caller ([[metabase.app-db.setup/migrate!]]) rolls the
             ;; transaction back, so the database is left as it was and the operator can fix the changeset and retry.
             (when (seq error-ids)
               (throw (ex-info (trs "Rollback to {0} failed: could not roll back changeset(s) {1}. The database has been left unchanged."
                                    target (str/join ", " error-ids))
                               {:target target, :failed-changesets (vec error-ids)})))
             (delete-deployment-rows! conn changelog-table deployments-to-drop))))))))
