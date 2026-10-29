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
  changelog row, in the `[dateexecuted orderexecuted]` order Liquibase itself uses (see [[exec-pos]] and
  [[recorded-deployments]]).
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
   (liquibase.changelog ChangeSet ChangeSet$RunStatus)
   (liquibase.changelog.visitor AbstractChangeExecListener ChangeExecListener)
   (liquibase.database Database)
   (liquibase.util LiquibaseUtil)))

(set! *warn-on-reflection* true)

(defn- postgres?
  "Whether the application database is Postgres."
  []
  (= :postgres (mdb.connection/db-type)))

(defn versions-table-name
  "Name of the table that records the Metabase version associated with each Liquibase `deployment_id`, cased like
  Liquibase's own `DATABASECHANGELOG` on the application database (upper case on H2 and MySQL, where MySQL table names
  can be case-sensitive; lower case on Postgres)."
  ^String []
  (if (postgres?)
    "databasechangelog_version"
    "DATABASECHANGELOG_VERSION"))

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
  "Whether the [[versions-table-name]] table exists, checked without creating it."
  [^Connection conn]
  (table-exists? (versions-table-name) conn))

(defn first-runs-table-name
  "Name of the table that records where each re-run changeset first ran (see [[record-first-run!]]), cased like
  [[versions-table-name]]."
  ^String []
  (if (postgres?)
    "databasechangelog_first_run"
    "DATABASECHANGELOG_FIRST_RUN"))

(defn- underlying-connection ^Connection [^Database database]
  (.. database getConnection getUnderlyingConnection))

(defn- changelog-table ^String [^Database database]
  (.getDatabaseChangeLogTableName database))

(defn- query [^Connection conn sql-params]
  (jdbc/query {:connection conn} sql-params))

(defn- execute-ddl!
  "Run `ddl` on `conn` as it is, without the transaction `clojure.java.jdbc` wraps statements in: that transaction's
  rollback on failure would also discard the caller's savepoint (see [[create-table-if-missing!]])."
  [^Connection conn ^String ddl]
  (jdbc/execute! {:connection conn} [ddl] {:transaction? false}))

(defn- execute! [^Connection conn sql-params]
  (jdbc/execute! {:connection conn} sql-params))

;;; -------------------------------------------- the version being recorded ----------------------------------------

(defn version->major
  "Parse the Metabase major version out of a recorded version string, e.g. 55 from `x.55.2.1`."
  [version]
  (some-> (re-find #"^x\.(\d+)" (str version)) second parse-long))

(defn major->version
  "The version string recorded for major `major` when no exact version is known, e.g. `x.55.0.0` for 55: what the
  backfill and the repairs record, and what development builds record. The inverse of [[version->major]]."
  [major]
  (format "x.%d.0.0" major))

(defn- version-numbers
  "The leading dotted numbers of a recorded version string, e.g. `[65 5 1]` for `x.65.5.1` and `[66 0]` for
  `x.66.0-RC2`; nil when it has none."
  [version]
  (some->> (re-find #"^x\.(\d+(?:\.\d+)*)" (str version)) second (re-seq #"\d+") (mapv parse-long)))

(defn compare-versions
  "Compare two recorded version strings by their numbers, a missing trailing number counting as 0 (`x.65.0` is
  `x.65.0.0`). A pre-release suffix is ignored, so `x.66.0-RC2` compares equal to `x.66.0`."
  [a b]
  (let [a      (version-numbers a)
        b      (version-numbers b)
        padded #(vec (take (max (count a) (count b)) (concat % (repeat 0))))]
    (compare (padded a) (padded b))))

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
  (major->version dev-major))

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
    (log/errorf (str "This build's version tag %s is not a release version (vX.Y.Z), so this instance will run "
                     "migrations as a development build and record the development version %s for them. An official "
                     "Metabase release pointed at this application database later will refuse to start "
                     "(\"Development build detected\") until those deployments are rolled back with the development "
                     "tooling or the database is rebuilt. This usually means version.properties is missing or "
                     "malformed, e.g. a build from a git checkout without release tags (vUNKNOWN).")
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

(def ^:private special-case-migrations
  "Changeset ids of a later major that an earlier release line also ships, mapped to that earlier major, so a database
  of the earlier major that ran them is not taken for one of the later major:

  * the v56 changesets checked into the v55 branch to resolve inadvertently backported migrations in 55;
  * the v65 view changesets that 1.64.2.1 ran and 64 ships again (#84415)."
  {"v56.2025-06-05T16:48:48" 55
   "v56.2025-05-19T16:48:48" 55
   "v65.2026-10-07T12:00:00" 64
   "v65.2026-10-07T12:00:01" 64})

(defn- extract-numbers
  "Returns contiguous integers parsed from string s"
  [s]
  (if-let [special-cased (special-case-migrations s)]
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

(def ^:private legacy-version-tracking-suffix "legacy-version-tracking")

(def ^:private legacy-version-tracking-author "version-tracking")

(def ^:private legacy-version-tracking-comment
  "Not a real migration, tracking version for instances prior to the databasechangelog_version tracking.")

(defn- legacy-version-tracking-description
  "The `description` of the marker row: what a `SELECT * FROM databasechangelog` reader sees next to the changeset
  descriptions Liquibase writes (`addColumn tableName=...`)."
  [major]
  (format "Metabase v%d version marker (not a changeset)" major))

(defn legacy-version-tracking-marker?
  "Whether a `databasechangelog` row (`{:filename ..}`) is a `vNN.legacy-version-tracking` marker rather than a changeset."
  [{:keys [filename]}]
  (= filename legacy-version-tracking-suffix))

(defn- legacy-marker-id [major]
  (format "v%d.%s" major legacy-version-tracking-suffix))

(defn legacy-major
  "The major of a `vNN.` changeset id (see [[extract-numbers]]), or nil for a version-less id."
  [id]
  (when (re-find #"^v\d+\." id)
    (first (extract-numbers id))))

(defn- version-less-id?
  "Whether `id` is a version-less changeset's: neither a `vNN.` id nor a pre-4.2 numeric one."
  [id]
  (not (or (legacy-major id) (re-matches #"\d+" id))))

(defn- highest-legacy-major
  "The highest `vNN.` major in the changelog, or 0 when there are no versioned changesets.

  The highest major, not the major of the most-recently-*executed* changeset: back-ported patches can land a
  lower-version changeset (e.g. a `v44.` id) with a later `dateexecuted` than the highest-version changeset already
  applied, and the schema's real version is the highest one."
  [^Connection conn ^Database database]
  (->> (query conn [(format "SELECT id FROM %s WHERE id LIKE 'v%%'" (changelog-table database))])
       (keep (comp legacy-major :id))
       (reduce max 0)))

(defn- highest-real-legacy-major
  "The highest legacy changeset major, ignoring synthetic version-tracking markers. Used only to detect work that an
  older binary really rolled back: a marker is unknown to that binary and therefore survives its rollback."
  [^Connection conn ^Database database]
  (->> (query conn [(format "SELECT id, filename FROM %s WHERE id LIKE 'v%%'" (changelog-table database))])
       (remove legacy-version-tracking-marker?)
       (keep (comp legacy-major :id))
       (reduce max 0)))

;;; -------------------------------------------------- changelog reads ---------------------------------------------

(defn exec-pos
  "The execution position of a `databasechangelog` row as a comparable `[dateexecuted orderexecuted]` vector -- the
  order Liquibase itself lists ran changesets in (`ORDER BY DATEEXECUTED ASC, ORDEREXECUTED ASC`). `orderexecuted`
  only increases within an update run and can restart, so it only orders rows that share a timestamp (e.g. one run's
  changesets on MySQL's second-precision column). `dateexecuted` is the database's `NOW()` in the writing session's
  time zone (the JVM's on Postgres and H2), so binaries run in different zones, or a clock set back, misorder
  deployments; the marker for older binaries does not depend on this (see [[legacy-marker-statement]])."
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
  ;; a MySQL table created before the column became bit(1) stores tinyint(1), which reads back as a number
  (or (true? ran_migrations) (= 1 ran_migrations)))

(defn- ran-version
  "The version recorded as having run `deployment-id`, or nil when it has no such row."
  [^Connection conn deployment-id]
  (-> (query conn [(format "SELECT metabase_version FROM %s WHERE deployment_id = ? AND ran_migrations = TRUE ORDER BY id LIMIT 1"
                           (versions-table-name))
                   deployment-id])
      first
      :metabase_version))

;;; -------------------------------------------------- deployment reads ---------------------------------------------

(defn first-runs
  "Where each re-run changeset first ran, as `{[filename author id] {:deployment_id :dateexecuted :orderexecuted}}`
  -- keyed by the changeset's full identity, as Liquibase identifies it -- the values copied from its changelog row
  before its first re-run. Empty when the table does not exist. A record is only meaningful while the changelog row is
  RERAN: one left behind by a binary that removed the row without it is replaced the next time the changeset re-runs
  (see [[first-run-statements]]).

  The filename is the one this binary keeps on the changelog row: older binaries may rewrite the row's, but
  [[metabase.app-db.liquibase/repair-version-less-filenames!]] restores it before a migration or rollback reads it."
  [^Connection conn]
  (if (table-exists? (first-runs-table-name) conn)
    (into {}
          (map (juxt (juxt :filename :author :changeset_id) #(select-keys % [:deployment_id :dateexecuted :orderexecuted])))
          (query conn [(format "SELECT changeset_id, author, filename, deployment_id, dateexecuted, orderexecuted FROM %s"
                               (first-runs-table-name))]))
    {}))

(defn recorded-deployments
  "The application database's deployments, newest first: every `deployment_id` in `databasechangelog`, or in the
  first run of a changeset that re-ran later (see [[first-runs]]), ordered by the newest point it reached -- the
  [[exec-pos]] of its newest changelog row, or of where such a changeset first ran, if that is later still -- each with
  what `databasechangelog_version` records for it:

    {:deployment-id \"9673292410\"
     :position      [#inst \"...\" 1234]    ; the newest exec-pos it reached
     :ran-version   \"x.65.2\"              ; the version that ran it (nil for an unrecorded legacy deployment)
     :versions      [\"x.65.2\" \"x.66.0\"]} ; every version recorded for it, ran and booted alike

  A deployment whose only changesets re-ran later (say an older binary that re-ran a `runOnChange` view on its own)
  keeps its place this way. The first entry is the deployment the schema is currently at. Rows with no
  `deployment_id` (written by Liquibase versions from before it existed) are ignored."
  [^Connection conn ^Database database]
  (let [rows       (query conn [(format "SELECT id, author, filename, deployment_id, dateexecuted, orderexecuted, exectype FROM %s"
                                        (changelog-table database))])
        first-run  (first-runs conn)
        positions  (reduce (fn [positions {:keys [deployment_id] :as row}]
                             (let [pos (exec-pos row)]
                               (cond-> positions
                                 (and deployment_id
                                      (or (not (contains? positions deployment_id))
                                          (pos? (compare pos (positions deployment_id)))))
                                 (assoc deployment_id pos))))
                           {}
                           (concat rows
                                   (keep (fn [{:keys [filename author id exectype]}]
                                           (when (= "RERAN" (some-> exectype u/upper-case-en))
                                             (first-run [filename author id])))
                                         rows)))
        ;; `migrate print` reads this before the table exists: nothing is recorded yet
        by-dep    (if (versions-table-exists? conn)
                    (group-by :deployment_id
                              (query conn [(format "SELECT deployment_id, metabase_version, ran_migrations FROM %s ORDER BY id"
                                                   (versions-table-name))]))
                    {})]
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
  "The recorded major immediately before the newest recorded release within the [[rollback-window]] -- the default
  target of `migrate down`. This is deliberately based on ran and boot rows alike: if v64 booted without migrations
  on a schema last changed by v63, the previous release is v63 (a no-op boundary), not v62. nil when there is no
  earlier recorded major to roll back to."
  [deployments all?]
  (let [majors (recorded-majors (rollback-window deployments all?))]
    (when (< 1 (count majors))
      (nth (vec majors) (- (count majors) 2)))))

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
    (into [] (comp (map :id) (remove special-case-migrations)) (query conn (into [sql] later-deps)))))

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
                       (versions-table-name))
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
                                                  (versions-table-name))
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

;;; ------------------------------------------ first runs of re-run changesets -------------------------------------
;;; When a changeset runs again (a `runOnChange` changeset whose checksum changed, or any `runAlways` changeset),
;;; Liquibase moves its changelog row to the new run: new deployment_id, dateexecuted and orderexecuted, exectype RERAN.
;;; A rollback must know where it first ran to decide whether the rollback target has it, so that is copied to
;;; `databasechangelog_first_run` first.

(defn- first-run-statements
  "`[sql & params]` statements that record where the changeset `[filename author id]` first ran, for a run that is
  about to re-run it. Its changelog row still holds that run unless it is already RERAN, in which case a recorded first run is
  kept. A record left from an earlier life of the changeset (see [[first-runs]]) is replaced. Nothing to do when the
  changeset has no changelog row, or when its first run is recorded already."
  [^Connection conn ^Database database [filename author id]]
  (when-let [{:keys [exectype]} (first (query conn [(format "SELECT exectype FROM %s WHERE id = ? AND author = ? AND filename = ?"
                                                            (changelog-table database))
                                                    id author filename]))]
    (let [first-runs (first-runs-table-name)
          recorded?  (and (table-exists? first-runs conn)
                          (seq (query conn [(format "SELECT 1 FROM %s WHERE changeset_id = ? AND author = ? AND filename = ?"
                                                    first-runs)
                                            id author filename])))
          reran?     (= "RERAN" (some-> exectype u/upper-case-en))]
      (when-not (and reran? recorded?)
        (cond->> [[(format (str "INSERT INTO %s (changeset_id, author, filename, deployment_id, dateexecuted, orderexecuted) "
                                "SELECT id, author, filename, deployment_id, dateexecuted, orderexecuted FROM %s "
                                "WHERE id = ? AND author = ? AND filename = ?")
                           first-runs (changelog-table database))
                   id author filename]]
          recorded? (cons [(format "DELETE FROM %s WHERE changeset_id = ? AND author = ? AND filename = ?" first-runs)
                           id author filename]))))))

(defn- change-set-key
  "`[filename author id]` of `change-set`, with the filename Liquibase writes to its changelog row."
  [^ChangeSet change-set]
  [(.getStoredFilePath change-set) (.getAuthor change-set) (.getId change-set)])

(defn record-first-run!
  "Record where `change-set` first ran, before Liquibase re-runs it (see [[first-run-statements]])."
  [^Database database ^ChangeSet change-set]
  (let [conn (underlying-connection database)]
    (doseq [statement (first-run-statements conn database (change-set-key change-set))]
      (execute! conn statement))))

(defn forget-first-runs!
  "Delete the first-run records of the changesets `changeset-keys` (`[filename author id]`), for changesets a
  rollback reversed."
  [^Connection conn changeset-keys]
  (when (and (seq changeset-keys) (table-exists? (first-runs-table-name) conn))
    (doseq [[filename author id] changeset-keys]
      (execute! conn [(format "DELETE FROM %s WHERE changeset_id = ? AND author = ? AND filename = ?" (first-runs-table-name))
                      id author filename]))))

(defn delete-versions-of-emptied-deployments!
  "Delete the `databasechangelog_version` rows of deployments that have no changelog row left and no first run (see
  [[first-runs]]): a run that re-runs changesets moves their rows out of the deployment that ran them, so a deployment
  that only re-ran changesets is emptied by the next one that re-runs them too, which leaves its version row behind."
  [^Connection conn ^Database database]
  (execute! conn [(format (str "DELETE FROM %s WHERE deployment_id NOT IN "
                               "(SELECT deployment_id FROM %s WHERE deployment_id IS NOT NULL)%s")
                          (versions-table-name)
                          (changelog-table database)
                          (if (table-exists? (first-runs-table-name) conn)
                            (format " AND deployment_id NOT IN (SELECT deployment_id FROM %s WHERE deployment_id IS NOT NULL)"
                                    (first-runs-table-name))
                            ""))]))

(defn recording-exec-listener
  "A Liquibase `ChangeExecListener` that records the running Metabase version against the current `deployment_id` as
  soon as the first changeset of a run is applied (see [[record-active-deployment-version!]]), and where each
  changeset it re-runs first ran (see [[record-first-run!]])."
  ^ChangeExecListener [^Database database]
  (let [active-deployment-version-recorded? (atom false)]
    (proxy [AbstractChangeExecListener] []
      (willRun [change-set _database-change-log _database run-status]
        ;; RUN_AGAIN for a runOnChange changeset whose checksum changed, ALREADY_RAN for a runAlways one
        (when (and (instance? ChangeSet change-set) (not= ChangeSet$RunStatus/NOT_RAN run-status))
          (record-first-run! database change-set)))
      (ran [change-set _database-change-log _database _exec-type]
        (when (and (instance? ChangeSet change-set) (compare-and-set! active-deployment-version-recorded? false true))
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

(defn- liquibase-build-version
  "What Liquibase writes to the `liquibase` column of the rows it records: its build version, `SNAPSHOT` shortened as
  Liquibase's own `MarkChangeSetRanGenerator` does."
  ^String []
  (str/replace (LiquibaseUtil/getBuildVersion) "SNAPSHOT" "SNP"))

(def ^:private position-marker-major
  "The major of the marker recorded for a schema at a versioned major, one whose own `vNN.` changesets are in the
  changelog. Those ids already give older binaries its major, so the marker only has to be a row they read safely as
  the newest one: a major low enough never to be the highest `id LIKE 'v%'` (or be dropped by their `migrate down`), at
  least 45 (their pre-v45 changelog cutoff), and an id sorting after `v56.0000-00-00T00:00:00`, which their changelog
  filename consolidation would otherwise rewrite."
  56)

(defn- marker-major
  "The major of the marker recorded for a schema at `major`: [[position-marker-major]] when `major` is versioned --
  `versioned-through` (the highest real `vNN.` major the schema has) reaches it -- else the major itself, which older
  binaries learn from nothing else."
  [major versioned-through]
  (if (>= versioned-through major) position-marker-major major))

(defn- marker-delete-statement [changelog major]
  [(format "DELETE FROM %s WHERE id = ? AND author = ?" changelog)
   (legacy-marker-id major) legacy-version-tracking-author])

(defn- legacy-marker-statement
  "`[sql & params]` inserting the `vNN.legacy-version-tracking` row for `major` as a row of deployment `deployment-id`,
  as the newest row of the changelog: at Liquibase's own next execution position (`MAX(orderexecuted) + 1`), and
  executed strictly after every other row. Binaries from before version-less support pick their changelog from the
  row with the newest `dateexecuted` alone, so a tie would be as bad as losing: MySQL stores Liquibase's sub-second
  timestamps rounded, up to a second in the future, hence the fallback to one second past the newest row. Computed on
  the server, in the same clock Liquibase's rows use. Stamped with the Liquibase version like the rows Liquibase
  records itself."
  [changelog major deployment-id]
  [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id, "
                "description, comments, liquibase) "
                "SELECT ?, ?, ?, "
                "CASE WHEN MAX(dateexecuted) IS NULL OR CURRENT_TIMESTAMP > MAX(dateexecuted) THEN CURRENT_TIMESTAMP "
                "ELSE MAX(dateexecuted) + INTERVAL '1' SECOND END, "
                "COALESCE(MAX(orderexecuted), 0) + 1, 'EXECUTED', ?, ?, ?, ? FROM %s")
           changelog changelog)
   (legacy-marker-id major) legacy-version-tracking-author legacy-version-tracking-suffix
   deployment-id (legacy-version-tracking-description major) legacy-version-tracking-comment (liquibase-build-version)])

(defn- newest-row-is?
  "Whether the single row with the newest `dateexecuted` is marker `id` of `deployment-id`."
  [^Connection conn changelog id deployment-id]
  (= [[id deployment-id]]
     (mapv (juxt :id :deployment_id)
           (query conn [(format "SELECT id, deployment_id FROM %s WHERE dateexecuted = (SELECT MAX(dateexecuted) FROM %s)"
                                changelog changelog)]))))

(defn record-legacy-version-tracking!
  "Make a synthetic `vNN.legacy-version-tracking` row the newest row of the changelog, as an ordinary row of
  `deployment-id` (by default the deployment that just ran migrations) for a schema at `major` (by default the
  running binary's).

  Binaries from before version-less support -- the earlier patches of every major it was backported to, and every
  earlier major -- know nothing about `databasechangelog_version`, and read the changelog in two ways this row keeps
  safe:

  * they pick their changelog from the id of the newest row by `dateexecuted`, and take a version-less id for a
    pre-4.2 install: they load the legacy changelog and fail re-running changeset 1. So the marker is moved to the end
    of every run, rollback included -- once per major is not enough when a later patch runs version-less changesets
    only.
  * they read the schema's major from the highest `vNN.` id ([[latest-applied-major-version]]). A versioned major's own
    ids already say it, and its marker is the low [[position-marker-major]], which their `migrate down` never treats
    as newer than the major it rolls back to. A version-less major has no other `vNN.` id to say so, and the marker
    carries the major; earlier majors' markers are deliberately left in place, so rolling back the later deployments
    leaves the earlier major's row the highest again.

  It deliberately carries the **same `deployment_id`** as the deployment it ends, so it needs no special handling
  anywhere: rolling that deployment back deletes it like any other row of the deployment.

  Dev deployments record a `v9999.` marker too: a pre-version-less binary pointed at a dev-written DB then refuses
  cleanly ('migrations from v9999')."
  ([^Database database]
   (record-legacy-version-tracking! database
                                    (current-recorded-major)
                                    (last-deployment-id (underlying-connection database) database)))
  ([^Database database major deployment-id]
   (when (and major deployment-id)
     (let [conn      (underlying-connection database)
           changelog (changelog-table database)
           mmajor    (marker-major major (highest-real-legacy-major conn database))
           id        (legacy-marker-id mmajor)]
       (when-not (newest-row-is? conn changelog id deployment-id)
         (try
           (execute! conn (marker-delete-statement changelog mmajor))
           (execute! conn (legacy-marker-statement changelog mmajor deployment-id))
           (catch Throwable e
             ;; This row only improves downgrade detection for *older* binaries -- it must never block a migration.
             (log/warnf e "Could not record %s in %s; older Metabase versions may not detect a downgrade from this schema"
                        id changelog))))))))

(defn record-schema-marker!
  "[[record-legacy-version-tracking!]] for the schema as it now is, on its current deployment -- after a rollback,
  which can delete the marker with the deployments it removes, and keeps re-run rows that are newer than the boundary's
  marker (see [[metabase.app-db.liquibase.rollback/rollback-plan]]). The major is the current deployment's recorded
  one, or for an unrecorded legacy deployment its highest `vNN.` id."
  [^Database database]
  (let [conn  (underlying-connection database)
        major (or (current-schema-major conn database)
                  (let [highest (highest-real-legacy-major conn database)]
                    (when (pos? highest) highest)))]
    (record-legacy-version-tracking! database major (last-deployment-id conn database))))

;;; --------------------------------------------- table creation and backfill ---------------------------------------

(defn- table-ddl
  ^String []
  (let [db-type   (mdb.connection/db-type)
        id-column (case db-type
                    :mysql "id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY"
                    "id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
        ;; MySQL's `boolean` is tinyint(1); Metabase booleans there are bit(1) -- see general-schema-tests
        bool-type (case db-type
                    :mysql "bit(1)"
                    "boolean")
        ;; Match the type produced by the old UnifyTimeColumnsType custom migration. The version table is created
        ;; before Liquibase runs: a fresh install still runs that migration over it, while an upgrade on which the
        ;; migration already ran does not. Creating the final type directly keeps both paths identical.
        timestamp-type (case db-type
                         (:postgres :h2) "timestamp with time zone"
                         :mysql          "timestamp(6)")
        ;; match the storage options every other Metabase table gets on MySQL -- see [[metabase.app-db.liquibase.mysql]]
        suffix    (case db-type
                    :mysql " ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    "")]
    (format (str "CREATE TABLE IF NOT EXISTS %s ("
                 "%s, "
                 "deployment_id varchar(10) NOT NULL, "
                 "metabase_version varchar(255) NOT NULL, "
                 "ran_migrations %s NOT NULL, "
                 "deployed_at %s NOT NULL, "
                 "CONSTRAINT uq_databasechangelog_version UNIQUE (deployment_id, metabase_version))%s")
            (versions-table-name) id-column bool-type timestamp-type suffix)))

(defn- first-runs-table-ddl
  ^String []
  (let [db-type       (mdb.connection/db-type)
        ;; Liquibase's own DATEEXECUTED type: the copied values must compare with the changelog's. UnifyTimeColumnsType
        ;; leaves this table alone, as it does the changelog.
        datetime-type (case db-type
                        :postgres "timestamp without time zone"
                        :mysql    "datetime"
                        "timestamp")
        suffix        (case db-type
                        :mysql " ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                        "")]
    (format (str "CREATE TABLE IF NOT EXISTS %s ("
                 "changeset_id varchar(255) NOT NULL, "
                 "author varchar(255) NOT NULL, "
                 "filename varchar(255) NOT NULL, "
                 "deployment_id varchar(10), "
                 "dateexecuted %s NOT NULL, "
                 "orderexecuted int NOT NULL, "
                 "CONSTRAINT pk_databasechangelog_first_run PRIMARY KEY (changeset_id, author, filename))%s")
            (first-runs-table-name) datetime-type suffix)))

(defn- change-set-id [change-set]
  (if (instance? ChangeSet change-set)
    (.getId ^ChangeSet change-set)
    (str change-set)))

(defn- backfill-version
  "The version to record as having run the current deployment of an install that predates version tracking: the
  [[highest-legacy-major]] as `x.<major>.0.0`, or nil when there are no versioned changesets. Older deployments are
  recorded by [[backfill-untracked-deployments!]] at the major their own position puts the schema at."
  [^Connection conn ^Database database]
  (let [major (highest-legacy-major conn database)]
    (when (pos? major)
      (major->version major))))

(defn- legacy-major-at
  "Fn of a [[recorded-deployments]] entry's `:position`: the highest real (non-marker) `vNN.` major among the rows
  executed up to it -- what a binary that predates version tracking took the schema to be when it ran that
  deployment."
  [^Connection conn ^Database database]
  (let [rows (->> (query conn [(format "SELECT id, filename, dateexecuted, orderexecuted FROM %s WHERE id LIKE 'v%%'"
                                       (changelog-table database))])
                  (remove legacy-version-tracking-marker?)
                  (keep (fn [row] (when-let [major (legacy-major (:id row))] [(exec-pos row) major]))))]
    (fn [position]
      (transduce (comp (filter #(not (pos? (compare (first %) position)))) (map second)) max 0 rows))))

(defn- backfill-versions
  "`[deployment-id version]` for each deployment with no recorded version: on an install that predates this table,
  every deployment; otherwise every deployment newer than the newest recorded one. Those were run by a binary from
  before version-less support -- an earlier major, or an earlier patch of a major it was backported to -- and are
  recorded at the major their `vNN.` ids put the schema at, so they stay boundaries the downgrade check and `migrate
  down` know: an install that went 63 -> 64 before this table existed can still roll back to 63. The current deployment
  of a pre-tracking install is recorded at its [[backfill-version]]."
  [^Connection conn ^Database database]
  (let [[untracked tracked] (split-with (comp nil? :ran-version) (recorded-deployments conn database))
        major-at            (legacy-major-at conn database)
        current             (when (empty? tracked)
                              (when-let [deployment-id (:deployment-id (first untracked))]
                                (when-let [version (backfill-version conn database)]
                                  [[deployment-id version]])))]
    (concat current
            (for [{:keys [deployment-id position]} (cond-> untracked (empty? tracked) rest)
                  :let [major (major-at position)]
                  :when (pos? major)]
              [deployment-id (major->version major)]))))

(defn- backfill-untracked-deployments!
  "Record the [[backfill-versions]] as ran rows."
  [^Connection conn ^Database database]
  (doseq [[deployment-id version] (backfill-versions conn database)]
    (record-deployment-version! conn deployment-id version true)))

(defn- repair-old-binary-rollbacks!
  "Correct the version rows of deployments a binary from before version-less support rolled back with its own
  `migrate down`. It reverses the `vNN.` changesets above its target and nothing else: version rows, version-less
  changesets and the marker stay. So a deployment recorded above the highest real `vNN.` major left is a candidate,
  unless its major has a major marker (it is version-less, see [[record-legacy-version-tracking!]]). Its major was
  versioned -- and those changesets were removed -- when a candidate of that major carries the position marker that
  ended its run; such deployments are recorded instead at the highest major left, with their rows for the majors above
  dropped, otherwise every binary of those majors would take the schema for newer than it is and refuse to boot. A
  failed first run of a version-less major has no marker at all and is left alone, as is a development build's
  [[dev-version]]."
  [^Connection conn ^Database database]
  (let [highest (highest-real-legacy-major conn database)]
    (when (pos? highest)
      (let [markers        (query conn [(format "SELECT id, deployment_id FROM %s WHERE filename = ?" (changelog-table database))
                                        legacy-version-tracking-suffix])
            position-id    (legacy-marker-id position-marker-major)
            position-deps  (into #{} (comp (filter #(= position-id (:id %))) (map :deployment_id)) markers)
            major-markers  (into #{} (comp (remove #(= position-id (:id %))) (keep (comp legacy-major :id))) markers)
            candidates     (for [{:keys [ran-version] :as dep} (recorded-deployments conn database)
                                 :let [ran-major (some-> ran-version version->major)]
                                 :when (and ran-major
                                            (> ran-major highest)
                                            (not (synthetic-dev-major? ran-major))
                                            (not (major-markers ran-major)))]
                             (assoc dep :ran-major ran-major))
            versioned      (into #{} (comp (filter (comp position-deps :deployment-id)) (map :ran-major)) candidates)]
        (doseq [{:keys [deployment-id ran-version ran-major]} candidates
                :when (versioned ran-major)]
          (log/warnf "Deployment %s was recorded as run by version %s, but an older Metabase version rolled back its changesets above %d; recording it as %s"
                     deployment-id ran-version highest (major->version highest))
          (doseq [{:keys [id metabase_version]} (query conn [(format "SELECT id, metabase_version FROM %s WHERE deployment_id = ?"
                                                                     (versions-table-name))
                                                             deployment-id])
                  :when (> (version->major metabase_version) highest)]
            (execute! conn [(format "DELETE FROM %s WHERE id = ?" (versions-table-name)) id]))
          (record-deployment-version! conn deployment-id (major->version highest) true))))))

(defn- newest-row-safe-for-old-binaries?
  "Whether a binary from before version-less support picks the right changelog from this database: none of the rows
  with the newest `dateexecuted` (their only ordering, so with a tie the database may return either) is a
  version-less changeset's, which they would take for a pre-4.2 install. A `vNN.` or numeric id is read correctly --
  including below v45, which really does need the legacy changelog."
  [^Connection conn ^Database database]
  (let [changelog (changelog-table database)]
    (not-any? (comp version-less-id? :id)
              (query conn [(format "SELECT id FROM %s WHERE dateexecuted = (SELECT MAX(dateexecuted) FROM %s)"
                                   changelog changelog)]))))

(defn- create-table-if-missing!
  "Create `table-name` with `ddl` unless it exists. Checked first so an already-upgraded database runs no DDL at boot
  (a Postgres user without CREATE on the schema fails even `CREATE TABLE IF NOT EXISTS`). The table is committed at
  once, so other connections see it. A CREATE that fails because a concurrent boot created the table first is ignored;
  on Postgres a savepoint keeps that failure from aborting the caller's transaction."
  [^Connection conn table-name ddl]
  (when-not (table-exists? table-name conn)
    (let [savepoint (when (and (postgres?) (not (.getAutoCommit conn)))
                      (.setSavepoint conn))]
      (try
        (execute-ddl! conn ddl)
        (when-not (.getAutoCommit conn)
          (.commit conn))
        (catch SQLException e
          (when savepoint
            (.rollback conn savepoint))
          (when-not (table-exists? table-name conn)
            (throw e)))))))

(defn ensure-version-tracking!
  "Bring version tracking up to date for the application database on `conn`: create `databasechangelog_version` and
  `databasechangelog_first_run` if they are missing, record versions for deployments that have none (see
  [[backfill-untracked-deployments!]]), correct the ones a binary from before version-less support rolled back (see
  [[repair-old-binary-rollbacks!]]), and make sure those binaries read the newest changelog row safely (see
  [[record-legacy-version-tracking!]]).

  Called once at each entry point that goes on to read or write version rows: the boot-time downgrade check, the
  `migrate` commands, and the development rollback. The CREATEs commit at once (see [[create-table-if-missing!]]), so
  running them first keeps that commit ahead of any migration work."
  [^Connection conn ^Database database]
  (create-table-if-missing! conn (versions-table-name) (table-ddl))
  (create-table-if-missing! conn (first-runs-table-name) (first-runs-table-ddl))
  (backfill-untracked-deployments! conn database)
  (repair-old-binary-rollbacks! conn database)
  ;; every run and rollback ends with a marker; this heals a database whatever else left it otherwise
  (when-not (newest-row-safe-for-old-binaries? conn database)
    (record-schema-marker! database)))

(defn repair-legacy-rollback!
  "Correct the version rows of the current deployment after a binary that predates version tracking rolled it back with
  its own `migrate down`: that removes the deployment's newest `vNN.` changesets but not its version rows, so its ran
  version still names the major it was rolled back from. When the deployment ran only `vNN.` changesets and its ran
  major is above the highest real legacy changeset left in the changelog, the ran version becomes that major and the
  deployment's version rows above it are dropped. `unrun-change-sets` is the changelog work the caller found while
  holding the migration lock. It distinguishes a stale synthetic marker left by an old rollback from a valid marker
  on a deployment that simply ran a lower-major backport.

  Deployments this binary's own versions made are left alone when they carry version-less changesets, or when their
  marker has no matching legacy changeset in the locked unrun set; a development build's [[dev-version]] is also left
  alone. Only safe while holding the migration lock: until a migrating binary writes its marker, its deployment looks
  just like a trimmed one."
  [^Connection conn ^Database database unrun-change-sets]
  (when-let [deployment-id (last-deployment-id conn database)]
    (let [ran                 (ran-version conn deployment-id)
          ran-major           (some-> ran version->major)
          major               (highest-real-legacy-major conn database)
          deployment-rows     (query conn [(format "SELECT id, filename FROM %s WHERE deployment_id = ?"
                                                   (changelog-table database))
                                           deployment-id])
          marker-majors       (into #{} (comp (filter legacy-version-tracking-marker?)
                                              (keep (comp legacy-major :id)))
                                    deployment-rows)
          unrun-legacy-majors (into #{} (keep (comp legacy-major change-set-id)) unrun-change-sets)
          stale-marker?       (some #(and (> % major)
                                          (some (fn [unrun-major]
                                                  (<= (inc major) unrun-major %))
                                                unrun-legacy-majors))
                                    marker-majors)]
      (when (and ran-major
                 (not (synthetic-dev-major? ran-major))
                 (pos? major)
                 (> ran-major major)
                 (or (empty? marker-majors) stale-marker?)
                 (not-any? (comp version-less-id? :id)
                           deployment-rows))
        (let [version (major->version major)]
          (log/warnf "Deployment %s was recorded as run by version %s, but an older Metabase version rolled back its changesets above %d; recording it as %s"
                     deployment-id ran major version)
          (doseq [{:keys [id metabase_version]} (query conn [(format "SELECT id, metabase_version FROM %s WHERE deployment_id = ?"
                                                                     (versions-table-name))
                                                             deployment-id])
                  :when (> (version->major metabase_version) major)]
            (execute! conn [(format "DELETE FROM %s WHERE id = ?" (versions-table-name)) id]))
          (record-deployment-version! conn deployment-id version true))))))

(defn first-runs-sql
  "SQL statements recording where the changesets in `unrun-change-sets` that `migrate print` re-runs first ran (see
  [[record-first-run!]]), for the start of its output: they must run before Liquibase's UPDATE moves those changelog
  rows. Nil when it re-runs nothing. Read-only, so the table's CREATE is part of the returned SQL."
  ^String [^Connection conn ^Database database unrun-change-sets]
  (when-let [statements (seq (mapcat #(first-run-statements conn database (change-set-key %)) unrun-change-sets))]
    (str "-- Record where re-run changesets first ran\n"
         (first-runs-table-ddl) ";\n"
         (str/join (for [statement statements] (str (render-sql statement) ";\n")))
         "\n")))

(defn version-tracking-sql
  "SQL statements recording an upgrade performed by hand from `migrate print` output: the same rows the exec listener,
  [[record-legacy-version-tracking!]] and [[ensure-version-tracking!]] write when Metabase itself runs the
  migrations -- the version table, the one-time backfill of the pre-upgrade versions (see [[backfill-versions]]),
  the upgrading version, and the `vNN.legacy-version-tracking` marker for older binaries. Without them a manual
  upgrade would silently disable downgrade detection for both older binaries (which read the marker) and newer ones
  (which read `databasechangelog_version`).

  Read-only: `migrate print` must not mutate the database, so the CREATE TABLE is part of the returned SQL.
  `changelog-major` is the highest `vNN.` major in the changelog being printed: once the SQL is applied, the schema
  has those ids too (see [[record-legacy-version-tracking!]] for what the marker depends on)."
  ^String [^Connection conn ^Database database changelog-major]
  (let [changelog     (changelog-table database)
        deployment-id (.getDeploymentId (Scope/getCurrentScope))
        version       (current-recorded-version)
        major         (current-recorded-major)
        backfill      (backfill-versions conn database)]
    (str "\n-- Record the Metabase version performing this upgrade\n"
         (table-ddl) ";\n"
         (str/join (for [[deployment-id version] backfill]
                     (str (render-sql (version-row-statement deployment-id version true)) ";\n")))
         (render-sql (version-row-statement deployment-id version true)) ";\n"
         (when major
           (let [mmajor (marker-major major (max changelog-major (highest-real-legacy-major conn database)))]
             (str (render-sql (marker-delete-statement changelog mmajor)) ";\n"
                  (render-sql (legacy-marker-statement changelog mmajor deployment-id)) ";\n"))))))
