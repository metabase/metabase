(ns metabase.app-db.liquibase.rollback
  "Rolling the application database back by Liquibase deployment.

  A rollback target is a set of *boundary* deployments: every changeset that ran after the newest changelog row of
  those deployments is reversed (through Liquibase, when this changelog still contains the changeset) and its
  bookkeeping cleared, leaving the schema as those deployments last left it. The release `migrate down`
  ([[rollback-major-version!]]) picks the boundary from a Metabase major version recorded in
  `databasechangelog_version`; the development tooling ([[rollback-to-deployment!]]) names a deployment directly,
  since every dev deployment records the same version. See [[metabase.app-db.liquibase.versions]] for how versions
  are recorded."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection)
   (java.util ArrayList)
   (liquibase Liquibase)
   (liquibase.changelog ChangeLogIterator ChangeSet)
   (liquibase.changelog.filter AlreadyRanChangeSetFilter ChangeSetFilter ChangeSetFilterResult DbmsChangeSetFilter IgnoreChangeSetFilter)
   (liquibase.changelog.visitor AbstractChangeExecListener)
   (liquibase.command.core AbstractRollbackCommandStep)
   (liquibase.database Database)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- target resolution --------------------------------------------

(defn- resolve-target
  "Resolve a rollback `target` -- an integer major version, or a numeric string like `\"64\"` -- to a major recorded
  (ran or booted) for a deployment in the [[versions/rollback-window]] of `deployments`. nil when the target is not
  a bare major or is not recorded there. Point-release targets (e.g. `\"64.1\"`) are deliberately not supported:
  rollback boundaries are majors, resolved to the latest deployment of that major by [[rollback-plan]]."
  [deployments target force?]
  (let [major (cond
                (integer? target) (long target)
                (string? target)  (some-> (re-matches #"\d+" target) parse-long)
                :else             nil)]
    (when (contains? (versions/recorded-majors (versions/rollback-window deployments force?)) major)
      major)))

(defn resolve-rollback-target
  "The major version `target` resolves to as a `migrate down` target for the application database on `conn`, or nil
  when it is not a permitted one: it must be a major recorded for a deployment in the recent window (the current
  major plus the previous-major upgrade boundary) by default, or anywhere in the recorded history when `force?`
  widens it. See [[resolve-target]]."
  ([conn database target] (resolve-rollback-target conn database target false))
  ([^Connection conn ^Database database target force?]
   (resolve-target (versions/recorded-deployments conn database) target force?)))

(defn- deployments-with-major
  "The `deployment_id`s of `deployments` with any version of `major` recorded. A major can span several deployments:
  point releases, the same build recording across restarts, boot rows."
  [deployments major]
  (into #{}
        (comp (filter (fn [{:keys [versions]}]
                        (some #(= major (versions/version->major %)) versions)))
              (map :deployment-id))
        deployments))

;;; ---------------------------------------------------- planning --------------------------------------------------

(defn- changeset-row-key
  "Unique identity of a `databasechangelog` row as `[filename author id]` -- the id alone is not unique (the same id can
  recur across changelog files or authors)."
  [{:keys [filename author id]}]
  [filename author id])

(defn- changeset-key
  "Unique identity of a Liquibase `ChangeSet` as `[filename author id]` (matches [[changeset-row-key]])."
  [^ChangeSet cs]
  [(.getFilePath cs) (.getAuthor cs) (.getId cs)])

(defn- changelog-keys
  "The [[changeset-key]]s of every changeset in the changelog `liquibase` was built with."
  [^Liquibase liquibase]
  (set (map changeset-key (.getChangeSets (.getDatabaseChangeLog liquibase)))))

(defn- rollback-plan
  "Compute what a rollback to the `boundary-deps` deployments should drop. Returns
  `{:changesets-to-drop <set of [filename author id] keys>, :changesets-to-retain <set of keys of re-run rows that
  must NOT be reversed>, :boundary-deployment <deployment_id the retained rows are reassigned to>,
  :deployments-to-drop <set of deployment_ids whose entire history is rolled back>}`.

  Every changeset that ran after the latest changelog row of `boundary-deps` is dropped, leaving the schema in the
  state those deployments last left it. Ordering is Liquibase's own [[versions/exec-pos]].

  Rows with exectype `RERAN` in that window are *retained*, not dropped: a RERAN row is an older changeset that
  merely re-executed under the newer deployment (a `runOnChange` changeset whose checksum changed, or a
  `migrate force` re-run) -- Liquibase moves the row to the run's deployment with a fresh execution position, but the
  changeset itself predates the boundary, and reversing it would strip schema state the rollback target still needs.
  Retained rows are reassigned to `:boundary-deployment` (the latest deployment of the target major) so every
  surviving row stays attached to a deployment with a recorded version. Limitation: a changeset first introduced
  *after* the target that later re-ran is indistinguishable from this and is also retained -- the rolled-back schema
  keeps its object as a harmless orphan, and a later re-upgrade adopts it again."
  [^Connection conn changelog-table boundary-deps]
  (let [all-rows     (jdbc/query {:connection conn}
                                 [(format "SELECT id, author, filename, deployment_id, dateexecuted, orderexecuted, exectype FROM %s" changelog-table)])
        boundary-row (->> all-rows
                          (filter #(boundary-deps (:deployment_id %)))
                          (sort-by versions/exec-pos)
                          last)
        boundary-pos (some-> boundary-row versions/exec-pos)
        window-rows  (if boundary-pos
                       (filter #(pos? (compare (versions/exec-pos %) boundary-pos)) all-rows)
                       [])
        reran?       (fn [{:keys [exectype]}] (= "RERAN" (some-> exectype u/upper-case-en)))
        rows-by-dep  (group-by :deployment_id all-rows)]
    {:changesets-to-drop   (set (map changeset-row-key (remove reran? window-rows)))
     :changesets-to-retain (set (map changeset-row-key (filter reran? window-rows)))
     :boundary-deployment  (:deployment_id boundary-row)
     ;; only clear a deployment's history/version rows when its entire history leaves it (dropped or reassigned)
     :deployments-to-drop  (set (for [[dep in-window] (group-by :deployment_id window-rows)
                                      :when (and dep (= (count in-window) (count (get rows-by-dep dep))))]
                                  dep))}))

;;; ---------------------------------------------------- execution -------------------------------------------------

(defn- run-liquibase-rollback!
  "Reverse the changesets in `changesets-to-drop` (a set of `[filename author id]` keys) that still exist in the
  changelog file, using Liquibase's rollback machinery. Changesets that were removed from later changelog files cannot
  be reversed here and are instead cleared by [[delete-deployment-rows!]]. Returns a vector of changeset ids that
  errored during rollback (each also logged)."
  [^Liquibase liquibase ^Database lb-db changesets-to-drop]
  (let [ran-changesets     (.getRanChangeSetList lb-db)
        changelog          (.getDatabaseChangeLog liquibase)
        known              (changelog-keys liquibase)
        changeset-filter   (proxy [ChangeSetFilter] []
                             (accepts [^ChangeSet changeSet]
                               (let [k      (changeset-key changeSet)
                                     result (and (contains? changesets-to-drop k) (contains? known k))]
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
                               (log/errorf "Error rolling back migration %s: %s" (.getId change-set) (ex-message e))))]
    (AbstractRollbackCommandStep/doRollback lb-db
                                            liquibase/changelog-file
                                            nil
                                            changelog-iterator
                                            (.getChangeLogParameters liquibase)
                                            changelog
                                            change-listener)
    @error-ids))

(defn- warn-about-unreversible-rows!
  "Log the rows in `changesets-to-drop` that have no changeset in this changelog to reverse them. Their bookkeeping
  is cleared with their deployment regardless, so any schema change they made stays behind -- worth shouting about.
  The legacy-version-tracking marker is bookkeeping only and is expected here."
  [^Liquibase liquibase changesets-to-drop]
  (let [known      (changelog-keys liquibase)
        orphan-ids (->> changesets-to-drop
                        (remove known)
                        (remove (fn [[filename]] (versions/legacy-version-tracking-marker? {:filename filename})))
                        (map peek)
                        sort)]
    (when (seq orphan-ids)
      (log/infof (str "The following changelog rows were cleared by the rollback but could not be reversed because this "
                      "changelog does not contain them; any schema changes they made remain in place: %s")
                 (str/join ", " orphan-ids)))))

(defn- reassign-changeset-rows!
  "Move the retained (re-run) `changeset-keys` onto `deployment-id` -- the deployment being rolled back to -- so they
  survive [[delete-deployment-rows!]] and stay attached to a deployment with a recorded version."
  [^Connection conn changelog-table changeset-keys deployment-id]
  (doseq [[filename author id] changeset-keys]
    (jdbc/execute! {:connection conn}
                   [(format "UPDATE %s SET deployment_id = ? WHERE filename = ? AND author = ? AND id = ?" changelog-table)
                    deployment-id filename author id])))

(defn- delete-deployment-rows!
  "Delete every `databasechangelog` and `databasechangelog_version` row for the fully-rolled-back `deployment-ids`. This
  removes changesets that were dropped from later changelog files (so [[run-liquibase-rollback!]] could not reverse
  them) but still need to be cleared from history, along with those deployments' version rows."
  [^Connection conn changelog-table deployment-ids]
  (when (seq deployment-ids)
    (doseq [table [changelog-table versions/databasechangelog-versions-table]]
      (jdbc/execute! {:connection conn}
                     (into [(format "DELETE FROM %s WHERE deployment_id IN (%s)"
                                    table
                                    (str/join ", " (repeat (count deployment-ids) "?")))]
                           deployment-ids)))))

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

(defn- rollback-to-deployments!
  "Roll back every changeset that ran after the latest changelog row of the `boundary-deps` deployments (see
  [[rollback-plan]]). `target` is only used for logging and error messages.

  Repairs version-less changelog filenames first (see [[liquibase/repair-version-less-filenames!]]): the rows must
  match their changesets to be reversed, and not every caller has been through
  [[liquibase/consolidate-liquibase-changesets!]] -- the development rollback ([[rollback-to-deployment!]]) has not."
  [conn ^Liquibase liquibase boundary-deps target]
  (liquibase/with-scope-locked liquibase
    (let [lb-db           (.getDatabase liquibase)
          changelog-table (liquibase/changelog-table-name liquibase)
          _               (liquibase/repair-version-less-filenames! conn liquibase changelog-table)
          {:keys [changesets-to-drop changesets-to-retain boundary-deployment deployments-to-drop]}
          (rollback-plan conn changelog-table boundary-deps)]
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
          (warn-about-unreversible-rows! liquibase changesets-to-drop)
          (delete-deployment-rows! conn changelog-table deployments-to-drop))))))

;;; ------------------------------------------------------ guards --------------------------------------------------

(defn- refuse-dev-migrated-schema!
  "Throw when the schema's current deployment was made by a development build. Every dev deployment records the same
  [[versions/dev-version]], so there is no release major to step back to; the development tooling rolls back by
  deployment instead (see [[rollback-to-deployment!]])."
  [deployments]
  (when (versions/synthetic-dev-major? (versions/schema-major deployments))
    (throw (ex-info (format (str "This database was last migrated by a development build (%s), so there is no release "
                                 "version to roll back to. Roll back its deployments from a development checkout with "
                                 "`clojure -M:dev:migrate rollback last-deployment` (dev.migrate/rollback!), or rebuild "
                                 "the database.")
                            versions/dev-version)
                    {:schema-major versions/dev-major}))))

(defn- refuse-to-roll-back-newer-schema!
  "Throw unless `force?` when the schema was migrated by a NEWER Metabase version than this binary: this binary's
  changelog does not contain those changesets, so Liquibase cannot reverse their DDL -- it would only delete their
  bookkeeping rows (including the legacy-version-tracking marker) and leave the schema silently corrupted."
  [deployments force?]
  (when-not force?
    (let [schema-major (versions/schema-major deployments)
          binary-major (versions/current-recorded-major)]
      (when (and schema-major binary-major (> schema-major binary-major))
        (throw (ex-info (format "Cannot downgrade a database at version %d from Metabase version %d. You must run 'migrate down' from Metabase version >= %d."
                                schema-major binary-major schema-major)
                        {:schema-major schema-major, :binary-major binary-major}))))))

;;; --------------------------------------------------- entry points -----------------------------------------------

(defn rollback-to-deployment!
  "Roll back every changeset that ran after the latest changelog row of `boundary-deployment-id`, whatever versions
  are recorded -- the development rollback (`dev.migrate/rollback!`), where each `migrate up` run is its own
  deployment. The id must be a deployment of the changelog (see [[versions/previous-deployment-id]] for the usual
  'one run back' target)."
  [conn ^Liquibase liquibase boundary-deployment-id]
  (let [deployments (versions/recorded-deployments conn (.getDatabase liquibase))]
    (when-not (some #(= boundary-deployment-id (:deployment-id %)) deployments)
      (throw (IllegalArgumentException.
              (format "%s is not a deployment of this database (see the deployment_id column of %s)."
                      (pr-str boundary-deployment-id) (liquibase/changelog-table-name liquibase)))))
    (rollback-to-deployments! conn liquibase #{boundary-deployment-id} (str "deployment " boundary-deployment-id))))

(defn rollback-major-version!
  "Roll back all migrations that ran after the most recent deployment of `target` -- an integer major version (or a
  numeric string like `\"64\"`). The target must be a major recorded in `databasechangelog_version` for a deployment
  in the [[versions/rollback-window]]: by default the current major or the previous recorded major (the last upgrade
  boundary); when `force?` is true, any recorded major in history.

  Without a target, rolls back to the previous *recorded* major -- one recorded major back even when the upgrade
  skipped majors or the current major shipped no migrations.

  Refuses a schema whose newest deployment was made by a development build (see [[refuse-dev-migrated-schema!]]), and,
  unless `force?` is true, one migrated by a NEWER Metabase version than this binary -- see
  [[refuse-to-roll-back-newer-schema!]]; run `migrate down` from the newer binary instead."
  ([conn ^Liquibase liquibase force?]
   (let [deployments (versions/recorded-deployments conn (.getDatabase liquibase))]
     (refuse-dev-migrated-schema! deployments)
     (refuse-to-roll-back-newer-schema! deployments force?)
     (if-let [major (versions/previous-recorded-major deployments force?)]
       (rollback-to-deployments! conn liquibase (deployments-with-major deployments major) major)
       (log/info "No earlier recorded Metabase version to roll back to; nothing to do."))))

  ([conn ^Liquibase liquibase force? target]
   (let [deployments (versions/recorded-deployments conn (.getDatabase liquibase))]
     (refuse-dev-migrated-schema! deployments)
     (refuse-to-roll-back-newer-schema! deployments force?)
     (let [major (resolve-target deployments target force?)]
       (when (nil? major)
         (throw (IllegalArgumentException.
                 (format "%s is not a valid rollback target. Target must be the major version of a recorded deployment (see the %s table)."
                         (pr-str target) versions/databasechangelog-versions-table))))
       (rollback-to-deployments! conn liquibase (deployments-with-major deployments major) target)))))
