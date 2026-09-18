(ns metabase.app-db.liquibase.versions
  "Metabase-version bookkeeping for Liquibase deployments: the `databasechangelog_version` table and the
  `vNN.legacy-version-tracking` marker rows in `databasechangelog`.

  Liquibase records *which* changesets ran, grouped by `deployment_id`, but not which Metabase version ran them. Now
  that changesets are version-less that has to be recorded separately, and it is what `migrate down` and the boot-time
  downgrade check are driven by. `databasechangelog_version` holds one row per `(deployment_id, metabase_version)`:

  * `ran_migrations = true`: the version that executed the deployment's changesets. There is exactly one per
    deployment. It is written by [[recording-exec-listener]] as the run's first changeset lands, or backfilled from the
    `vNN.` changeset ids for installs that predate this table (see [[ensure-version-tracking!]]).
  * `ran_migrations = false`: a version that later booted against the schema at that deployment without running
    anything, i.e. a release that shipped no migrations for this database. These rows are history: they never change
    what version the schema is *at*, but they do make that major a nameable `migrate down` target (see
    [[rollback-window]]).

  The table is managed directly rather than through a changeset, to avoid the bootstrapping loop of a version-tracking
  table that would have to record the very deployment creating it. Callers bring it up to date once, at the entry
  points (boot, `migrate`, the development rollback) with [[ensure-version-tracking!]]; everything else here is a
  side-effect-free read that assumes the table exists.

  Which deployment is *current* is always decided by `databasechangelog`: it is the deployment that owns the newest
  changelog row, in the `[dateexecuted orderexecuted]` order Liquibase itself uses (see [[recorded-deployments]]).
  `databasechangelog_version` never decides ordering.

  Liquibase generates the deployment id once per process (it lives in the root `Scope`), not once per update run;
  [[metabase.app-db.liquibase/run-in-scope-locked]] therefore stamps every locked scope with a fresh deployment id, so
  each migration run records as its own deployment even inside a long-lived process (a dev REPL). Development builds
  all record the same constant [[dev-version]], so for them the deployment is the only thing that tells runs apart."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection SQLException)
   (liquibase Scope)
   (liquibase.changelog ChangeSet)
   (liquibase.changelog.visitor AbstractChangeExecListener ChangeExecListener)
   (liquibase.database Database)))

(set! *warn-on-reflection* true)

(def databasechangelog-versions-table
  "Name of the table that records the Metabase version associated with each Liquibase `deployment_id`."
  "databasechangelog_version")

;;; ------------------------------------------------- JDBC helpers --------------------------------------------------

(defn table-exists?
  "Check if a table exists."
  [table-name ^Connection conn]
  (-> (.getMetaData conn)
      (.getTables nil nil table-name (u/varargs String ["TABLE"]))
      jdbc/metadata-query
      seq
      boolean))

(defn versions-table-exists?
  "Whether `databasechangelog_version` exists, checked without creating it. Unquoted DDL identifiers are folded to upper
  case by H2 and to lower case by Postgres, so both spellings are checked."
  [^Connection conn]
  (boolean (or (table-exists? databasechangelog-versions-table conn)
               (table-exists? (u/upper-case-en databasechangelog-versions-table) conn))))

(defn- underlying-connection ^Connection [^Database database]
  (.. database getConnection getUnderlyingConnection))

(defn- changelog-table ^String [^Database database]
  (.getDatabaseChangeLogTableName database))

(defn- query [^Connection conn sql-params]
  (jdbc/query {:connection conn} sql-params))

(defn- execute! [^Connection conn sql-params]
  (jdbc/execute! {:connection conn} sql-params))

;;; -------------------------------------------- the version being recorded ----------------------------------------

(defn version->major
  "Parse the Metabase major version out of a recorded version string, e.g. 55 from `x.55.2.1`."
  [version]
  (some-> (re-find #"^x\.(\d+)" (str version)) second parse-long))

(def dev-major
  "The major of [[dev-version]]. Far above any real Metabase major, so a schema last written by a development build
  always reads as *newer* than every release binary, which then refuses to boot against it (see
  [[metabase.app-db.setup/error-if-downgrade-required!]])."
  9999)

(def dev-version
  "The constant version recorded by builds that have no real release version (local development, where
  `version.properties` is absent). Every dev deployment records this same version, so the release paths -- the
  boot-time downgrade check and `migrate down` -- refuse a schema whose newest deployment is a dev one and point at the
  development tooling, which tells deployments apart by `deployment_id` instead (see
  [[metabase.app-db.liquibase.rollback/rollback-to-deployment!]] and `dev.migrate/rollback!`)."
  (format "x.%d.0.0" dev-major))

(defn synthetic-dev-major?
  "Whether `major` is the development major ([[dev-major]]) rather than a real released version."
  [major]
  (= dev-major major))

(defonce ^{:private true
           :doc     "Whether this process has already logged that a prod build fell back to [[dev-version]]: the version
                 is consulted several times per boot, and the error only needs to be logged once."}
  dev-version-fallback-logged?
  (atom false))

(defn- synthetic-dev-version
  "The [[dev-version]] constant. A production build should never get here -- it means the build's version tag could
  not be parsed -- so log (once) that version tracking is degraded."
  []
  (when (and config/is-prod? (compare-and-set! dev-version-fallback-logged? false true))
    (log/errorf (str "Could not parse a release version from this build's version tag %s; recording the development "
                     "version %s instead. Version tracking and downgrade detection will be degraded. This usually "
                     "means version.properties is missing or malformed.")
                (pr-str (:tag config/mb-version-info)) dev-version))
  dev-version)

(defn- real-recorded-version
  "The edition-agnostic real version string from the build tag, or nil in dev where there is no real version."
  []
  (let [tag (:tag config/mb-version-info)]
    (when (re-find #"^v\d+\.\d+" tag)
      (str/replace tag #"^v\d+" "x"))))

(defn current-recorded-version
  "The edition-agnostic Metabase version string to record for this process (`x.56.2` for both `v0.56.2` and
  `v1.56.2`), or the constant [[dev-version]] when the build has no real version."
  []
  (or (real-recorded-version)
      (synthetic-dev-version)))

(defn current-recorded-major
  "Major version of [[current-recorded-version]]."
  []
  (version->major (current-recorded-version)))

;;; ------------------------------------------- the legacy `vNN.` id scan -------------------------------------------

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

(defn latest-applied-major-version
  "The major of the highest `vNN.` changeset id in the changelog, or nil when there is none.

  This is how Metabase binaries that predate version tracking decide what version a schema is at, and it is what the
  `vNN.legacy-version-tracking` marker rows keep accurate for them (see [[record-legacy-version-tracking!]]). Nothing
  in this binary decides anything by it any more -- it is kept as the oracle for what those older binaries will see,
  which is what the tests of the marker assert on, and it feeds the one-time backfill of pre-tracking installs."
  [^Connection conn ^Database database]
  (let [changelog (changelog-table database)]
    (when (table-exists? changelog conn)
      (let [changeset-id (-> (query conn [(format "SELECT id FROM %s WHERE id LIKE 'v%%' ORDER BY id DESC LIMIT 1" changelog)])
                             first
                             :id)]
        (some-> changeset-id extract-numbers first)))))

;;; -------------------------------------------------- changelog reads ---------------------------------------------

(defn exec-pos
  "The execution position of a `databasechangelog` row as a comparable `[dateexecuted orderexecuted]` vector -- the
  order Liquibase itself lists ran changesets in (`ORDER BY DATEEXECUTED ASC, ORDEREXECUTED ASC`). `orderexecuted`
  is a table-wide counter (`MAX(ORDEREXECUTED) + 1` at write time), used here as Liquibase uses it: to order rows
  that share a timestamp (e.g. one run's changesets on MySQL's second-precision column)."
  [{:keys [dateexecuted orderexecuted]}]
  [dateexecuted orderexecuted])

(defn last-deployment-id
  "The `deployment_id` of the most-recently-applied changeset (in [[exec-pos]] order), or nil for an empty changelog."
  [^Connection conn ^Database database]
  (-> (query conn [(format "SELECT deployment_id FROM %s ORDER BY dateexecuted DESC, orderexecuted DESC LIMIT 1"
                           (changelog-table database))])
      first
      :deployment_id))

(defn- ran-row? [{:keys [ran_migrations]}]
  ;; MySQL stores the column as tinyint(1), which some drivers hand back as a number
  (or (true? ran_migrations) (= 1 ran_migrations)))

(defn- ran-version
  "The version recorded as having run `deployment-id`, or nil when it has no such row."
  [^Connection conn deployment-id]
  (-> (query conn [(format "SELECT metabase_version FROM %s WHERE deployment_id = ? AND ran_migrations = TRUE ORDER BY id LIMIT 1"
                           databasechangelog-versions-table)
                   deployment-id])
      first
      :metabase_version))

;;; ------------------------------------------------ writing version rows -------------------------------------------

(defn- sql-literal
  "Render a statement parameter as a SQL literal, for the SQL that `migrate print` hands to a human."
  [x]
  (cond
    (string? x)  (str "'" (str/replace x "'" "''") "'")
    (boolean? x) (if x "TRUE" "FALSE")
    :else        (str x)))

(defn- render-sql
  "Render a `[sql & params]` statement as a single SQL string with the parameters inlined."
  ^String [[sql & params]]
  (reduce (fn [s param] (str/replace-first s "?" (sql-literal param))) sql params))

(defn- ignores-duplicate-rows?
  "Whether [[version-row-statement]] can tell the application database to skip an already-present row itself. Postgres
  *must* (a failed INSERT aborts the surrounding transaction) and MySQL can; H2 has no portable form, so its callers
  check first."
  []
  (contains? #{:postgres :mysql} (mdb.connection/db-type)))

(defn- version-row-statement
  "`[sql & params]` inserting a `databasechangelog_version` row, skipping an already-present
  `(deployment_id, metabase_version)` pair where the dialect can express that (see [[ignores-duplicate-rows?]])."
  [deployment-id version ran?]
  (let [insert (format "INSERT INTO %s (deployment_id, metabase_version, ran_migrations, deployed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
                       databasechangelog-versions-table)
        sql    (case (mdb.connection/db-type)
                 :postgres (str insert " ON CONFLICT DO NOTHING")
                 :mysql    (str/replace-first insert "INSERT INTO" "INSERT IGNORE INTO")
                 insert)]
    [sql deployment-id version ran?]))

(defn record-deployment-version!
  "Record that `version` ran deployment `deployment-id` (`ran?` true) or booted against the schema at it (`ran?`
  false). Idempotent: an already-present `(deployment_id, metabase_version)` pair is left as it is, so a boot row never
  overwrites the ran row of the same version. No-op when `deployment-id` is nil (an empty changelog has no deployment
  to record). Safe to call concurrently from several instances: every path tolerates the pair appearing between check
  and insert."
  [^Connection conn deployment-id version ran?]
  (when (and deployment-id version)
    (let [statement    (version-row-statement deployment-id version ran?)
          pair-exists? #(seq (query conn [(format "SELECT 1 FROM %s WHERE deployment_id = ? AND metabase_version = ?"
                                                  databasechangelog-versions-table)
                                          deployment-id version]))]
      (if (ignores-duplicate-rows?)
        (execute! conn statement)
        (when-not (pair-exists?)
          (try
            (execute! conn statement)
            (catch SQLException e
              ;; lost the check-then-insert race with another instance; the unique constraint makes the loss benign
              (when-not (pair-exists?)
                (throw e)))))))))

(defn record-active-deployment-version!
  "Record the running Metabase version as the one that ran the deployment of the current Liquibase scope. The exec
  listeners call this as the first changeset of a run lands, so the version is recorded even if a later changeset
  fails."
  [^Database database]
  (record-deployment-version! (underlying-connection database)
                              (.getDeploymentId (Scope/getCurrentScope))
                              (current-recorded-version)
                              true))

(defn recording-exec-listener
  "A Liquibase `ChangeExecListener` that records the running Metabase version against the current `deployment_id` as
  soon as the first changeset of a run is applied (see [[record-active-deployment-version!]])."
  ^ChangeExecListener [^Database database]
  (let [recorded? (atom false)]
    (proxy [AbstractChangeExecListener] []
      (ran [change-set _database-change-log _database _exec-type]
        (when (and (instance? ChangeSet change-set) (compare-and-set! recorded? false true))
          (record-active-deployment-version! database))))))

(defn record-boot-version!
  "Record that this Metabase version booted against the schema at its current deployment without running any
  migrations (`ran_migrations = false`). History only: a boot that ran nothing did not change the schema, so the
  deployment's ran version still decides what version it is at; but a release that shipped no migrations for this
  database becomes a nameable `migrate down` target this way.

  Nothing is recorded for a development build (its constant [[dev-version]] says nothing), for a binary older than the
  version that ran the deployment (an unsupported downgrade -- the boot check refuses it, but `migrate up` skips that
  check), or when the deployment has no ran version at all (a pre-tracking install with no `vNN.` ids to backfill
  from)."
  [^Database database]
  (let [conn  (underlying-connection database)
        major (current-recorded-major)]
    (when-let [deployment-id (last-deployment-id conn database)]
      (let [ran-major (some-> (ran-version conn deployment-id) version->major)]
        (when (and ran-major
                   (not (synthetic-dev-major? major))
                   (>= major ran-major))
          (record-deployment-version! conn deployment-id (current-recorded-version) false))))))

;;; ---------------------------------------- the legacy-version-tracking marker -------------------------------------

(def ^:private legacy-version-tracking-suffix "legacy-version-tracking")
(def ^:private legacy-version-tracking-author "version-tracking")
(def ^:private legacy-version-tracking-comment
  "Not a real migration, tracking version for instances prior to the databasechangelog_version tracking.")

(defn legacy-version-tracking-marker?
  "Whether a `databasechangelog` row (`{:filename ..}`) is a `vNN.legacy-version-tracking` marker rather than a changeset."
  [{:keys [filename]}]
  (= filename legacy-version-tracking-suffix))

(defn- legacy-marker-id [major]
  (format "v%d.%s" major legacy-version-tracking-suffix))

(defn- legacy-marker-statement
  "`[sql & params]` inserting the `vNN.legacy-version-tracking` row for `major` as a row of deployment `deployment-id`,
  at the next execution position -- Liquibase's own `MAX(orderexecuted) + 1`."
  [changelog major deployment-id]
  [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id, comments) "
                "SELECT ?, ?, ?, CURRENT_TIMESTAMP, COALESCE(MAX(orderexecuted), 0) + 1, 'EXECUTED', ?, ? FROM %s")
           changelog changelog)
   (legacy-marker-id major) legacy-version-tracking-author legacy-version-tracking-suffix
   deployment-id legacy-version-tracking-comment])

(defn record-legacy-version-tracking!
  "Record a synthetic `vNN.legacy-version-tracking` changeset row for `major` (by default the running binary's), as an
  ordinary row of `deployment-id` (by default the deployment that just ran migrations).

  Older Metabase binaries detect an unsupported downgrade by reading the highest `vNN.*` changeset id
  ([[latest-applied-major-version]]) and know nothing about `databasechangelog_version`. Once a release ships its
  migrations as version-less changesets those binaries would see a stale major, so this row keeps that signal accurate.

  It deliberately carries the **same `deployment_id`** as the deployment that created it, so it needs no special
  handling anywhere: rolling that deployment back deletes it like any other row of the deployment. Rows for earlier
  majors are deliberately left in place, so that after rolling back the later deployments the earlier deployment's row
  is once again the highest -- e.g. rolling 65 -> 63 removes the v64 and v65 rows with their deployments and leaves v63.

  Dev deployments record a `v9999.` marker too: a pre-version-less binary pointed at a dev-written DB then refuses
  cleanly ('migrations from v9999') instead of taking the version-less id of the latest changeset for a pre-4.2
  install, loading the legacy changelog and crashing on re-running changeset 1."
  ([^Database database]
   (record-legacy-version-tracking! database
                                    (current-recorded-major)
                                    (last-deployment-id (underlying-connection database) database)))
  ([^Database database major deployment-id]
   (when (and major deployment-id)
     (let [conn      (underlying-connection database)
           changelog (changelog-table database)
           id        (legacy-marker-id major)]
       (when-not (seq (query conn [(format "SELECT 1 FROM %s WHERE id = ?" changelog) id]))
         (try
           (execute! conn (legacy-marker-statement changelog major deployment-id))
           (catch Throwable e
             ;; This row only improves downgrade detection for *older* binaries -- it must never block a migration.
             (log/warnf e "Could not record %s in %s; older Metabase versions may not detect a downgrade from this schema"
                        id changelog))))))))

;;; --------------------------------------------- table creation and backfill ---------------------------------------

(defn- table-ddl
  ^String []
  (let [db-type   (mdb.connection/db-type)
        id-column (case db-type
                    :mysql "id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY"
                    "id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
        ;; match the storage options every other Metabase table gets on MySQL -- see [[metabase.app-db.liquibase.mysql]]
        suffix    (case db-type
                    :mysql " ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    "")]
    (format (str "CREATE TABLE IF NOT EXISTS %s ("
                 "%s, "
                 "deployment_id varchar(10) NOT NULL, "
                 "metabase_version varchar(255) NOT NULL, "
                 "ran_migrations boolean NOT NULL, "
                 "deployed_at timestamp NOT NULL, "
                 "CONSTRAINT uq_databasechangelog_version UNIQUE (deployment_id, metabase_version))%s")
            databasechangelog-versions-table id-column suffix)))

(defn- backfill-version
  "The version to record as having run the current deployment of an install that predates version tracking: the
  highest `vNN.` major present in the changelog, as `x.<major>.0.0`, or nil when there are no versioned changesets.

  The highest major, not the major of the most-recently-*executed* changeset: back-ported patches can land a
  lower-version changeset (e.g. a `v44.` id) with a later `dateexecuted` than the highest-version changeset already
  applied, and the schema's real version is the highest one. Older deployments are left without a row: downgrade
  detection only consults the current deployment, and a legacy changeset's major is in its id."
  [^Connection conn ^Database database]
  (let [major (->> (query conn [(format "SELECT id FROM %s WHERE id LIKE 'v%%'" (changelog-table database))])
                   (keep (fn [{:keys [id]}]
                           (when (re-find #"^v\d+\." id)
                             (first (extract-numbers id)))))
                   (reduce max 0))]
    (when (pos? major)
      (format "x.%d.0.0" major))))

(defn ensure-version-tracking!
  "Bring version tracking up to date for the application database on `conn`: create `databasechangelog_version` if
  it is missing, and record the version implied by the `vNN.` changeset ids as having run the current deployment when
  it has no ran-version row yet (an install that predates this table -- see [[backfill-version]]).

  Called once at each entry point that goes on to read or write version rows: the boot-time downgrade check, the
  `migrate` commands, and the development rollback. On Postgres, where DDL is transactional, the CREATE simply rolls
  back with a failed `migrate` transaction and is redone next time; on MySQL, where it commits implicitly, running it
  first keeps that commit ahead of any migration work."
  [^Connection conn ^Database database]
  (execute! conn [(table-ddl)])
  (when-let [deployment-id (last-deployment-id conn database)]
    (when-not (ran-version conn deployment-id)
      (when-let [version (backfill-version conn database)]
        (record-deployment-version! conn deployment-id version true)))))

(defn version-tracking-sql
  "SQL statements recording an upgrade performed by hand from `migrate print` output: the same rows the exec listener,
  [[record-legacy-version-tracking!]] and [[ensure-version-tracking!]] write when Metabase itself runs the
  migrations -- the version table, the one-time backfill of the pre-upgrade version when this install has none yet,
  the upgrading version, and the `vNN.legacy-version-tracking` marker for older binaries. Without them a manual
  upgrade would silently disable downgrade detection for both older binaries (which read the marker) and newer ones
  (which read `databasechangelog_version`).

  Read-only: `migrate print` must not mutate the database, so the CREATE TABLE is part of the returned SQL."
  ^String [^Connection conn ^Database database]
  (let [changelog     (changelog-table database)
        deployment-id (.getDeploymentId (Scope/getCurrentScope))
        version       (current-recorded-version)
        major         (current-recorded-major)
        current-dep   (last-deployment-id conn database)
        backfill      (when (and current-dep
                                 (or (not (versions-table-exists? conn))
                                     (not (ran-version conn current-dep))))
                        (backfill-version conn database))]
    (str "\n-- Record the Metabase version performing this upgrade\n"
         (table-ddl) ";\n"
         (when backfill
           (str (render-sql (version-row-statement current-dep backfill true)) ";\n"))
         (render-sql (version-row-statement deployment-id version true)) ";\n"
         (when major
           (str (render-sql (legacy-marker-statement changelog major deployment-id)) ";\n")))))

;;; -------------------------------------------------- deployment reads ---------------------------------------------

(defn recorded-deployments
  "The application database's deployments, newest first: every `deployment_id` in `databasechangelog`, ordered by the
  [[exec-pos]] of its newest changelog row, each with what `databasechangelog_version` records for it:

    {:deployment-id \"9673292410\"
     :position      [#inst \"...\" 1234]    ; the exec-pos of its newest changelog row
     :ran-version   \"x.65.2\"              ; the version that ran it (nil for an unrecorded legacy deployment)
     :versions      [\"x.65.2\" \"x.66.0\"]} ; every version recorded for it, ran and booted alike

  The first entry is the deployment the schema is currently at. Rows with no `deployment_id` (written by Liquibase
  versions from before it existed) are ignored."
  [^Connection conn ^Database database]
  (let [positions (reduce (fn [positions {:keys [deployment_id] :as row}]
                            (let [pos (exec-pos row)]
                              (cond-> positions
                                (and deployment_id
                                     (or (not (contains? positions deployment_id))
                                         (pos? (compare pos (positions deployment_id)))))
                                (assoc deployment_id pos))))
                          {}
                          (query conn [(format "SELECT deployment_id, dateexecuted, orderexecuted FROM %s"
                                               (changelog-table database))]))
        by-dep    (group-by :deployment_id
                            (query conn [(format "SELECT deployment_id, metabase_version, ran_migrations FROM %s ORDER BY id"
                                                 databasechangelog-versions-table)]))]
    (->> positions
         (sort-by val #(compare %2 %1))
         (mapv (fn [[deployment-id position]]
                 (let [rows (by-dep deployment-id)]
                   {:deployment-id deployment-id
                    :position      position
                    :ran-version   (some-> (first (filter ran-row? rows)) :metabase_version)
                    :versions      (mapv :metabase_version rows)}))))))

(defn schema-major
  "Major version the schema described by `deployments` (see [[recorded-deployments]]) is at: the ran-version major of
  its current deployment. Booted-only versions do not move this. nil when the current deployment has no recorded
  version (or there is no deployment at all)."
  [deployments]
  (some-> (first deployments) :ran-version version->major))

(defn last-deployment-version
  "The Metabase version string that *ran* the deployment the schema is currently at, or nil if there is none (empty
  changelog, or a deployment with no recorded version)."
  [^Connection conn ^Database database]
  (:ran-version (first (recorded-deployments conn database))))

(defn current-schema-major
  "[[schema-major]] of the application database on `conn`."
  [^Connection conn ^Database database]
  (schema-major (recorded-deployments conn database)))

(defn previous-deployment-id
  "The `deployment_id` of the second-newest deployment -- the boundary for rolling back just the newest one -- or nil
  when there is no earlier deployment. Used by the development rollback tooling (`dev.migrate/rollback!`)."
  [^Connection conn ^Database database]
  (:deployment-id (second (recorded-deployments conn database))))

(defn rollback-window
  "The deployments a `migrate down` may target, as a prefix of `deployments` (see [[recorded-deployments]]): by
  default every deployment that ran on the current schema major plus the single most recent deployment from an
  earlier major (the boundary of the last major upgrade). With `all?` the full recorded history is the window instead
  (what a forced rollback may target).

  The current schema major is that of the newest deployment, not this binary's version: a binary that shipped no
  migrations for this database is still windowed on the major the schema is actually at."
  [deployments all?]
  (if all?
    deployments
    (let [current          (schema-major deployments)
          [current-major older] (split-with #(= current (some-> (:ran-version %) version->major)) deployments)]
      (concat current-major (take 1 older)))))

(defn recorded-majors
  "Every major recorded, ran or booted, for `deployments`, as a sorted set."
  [deployments]
  (into (sorted-set) (keep version->major) (mapcat :versions deployments)))

(defn previous-recorded-major
  "The highest major recorded strictly below the current schema major within the [[rollback-window]] -- the default
  target of `migrate down`. nil when there is no earlier recorded major to roll back to."
  [deployments all?]
  (when-let [current (schema-major deployments)]
    (last (take-while #(< % current) (recorded-majors (rollback-window deployments all?))))))

(defn changesets-from-later-version
  "Returns changeset IDs applied by versions later than `latest-available` up to `latest-applied`, ordered by execution
  position. Version-prefixed ids are matched by the major in the id; version-less changesets carry no version in their
  id, so they are matched by the recorded ran-version major of their deployment (see [[recorded-deployments]])."
  [^Connection conn ^Database database latest-available latest-applied]
  (let [changelog  (changelog-table database)
        versions   (range (inc latest-available) (inc latest-applied))
        later-deps (->> (recorded-deployments conn database)
                        (filter #(when-let [major (some-> (:ran-version %) version->major)]
                                   (and (> major latest-available) (<= major latest-applied))))
                        (mapv :deployment-id))
        ;; RERAN rows are older changesets that merely re-executed under the later deployment (edited runOnChange
        ;; changesets); they are not "from" the later version and would only confuse the listing
        clauses    (concat (map #(format "id LIKE 'v%d.%%'" %) versions)
                           (when (seq later-deps)
                             [(format "(deployment_id IN (%s) AND exectype <> 'RERAN')"
                                      (str/join ", " (repeat (count later-deps) "?")))]))
        sql        (format "SELECT id FROM %s WHERE %s ORDER BY dateexecuted ASC, orderexecuted ASC"
                           changelog (str/join " OR " clauses))]
    (mapv :id (query conn (into [sql] later-deps)))))
