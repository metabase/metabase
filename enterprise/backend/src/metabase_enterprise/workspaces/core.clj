(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces.

   Two operational surfaces share this namespace:

   - **Manager-side state.** Workspaces and their per-database configs live in the
     `:model/Workspace` and `:model/WorkspaceDatabase` rows. Mutations go through
     [[create-workspace!]] and [[delete-workspace!]]. Provisioning operations are
     synchronous — the caller waits until the warehouse work completes.

   - **Instance-side state.** An instance is a workspace when its `workspaces-enabled`
     setting is on. Each database's database-local `database-workspace-schema` setting
     names the schema its transforms write to. `workspaces-enabled` is set through the
     settings API, `MB_WORKSPACES_ENABLED` or `config.yml`; `database-workspace-schema`
     through `PUT /api/database/:id` or `config.yml`. `POST /current` sets both. While
     `MB_WORKSPACES_ENABLED` is set, `PUT /api/database/:id` and `POST /current` refuse to
     change `database-workspace-schema`. The
     `config.yml` `:workspace` section (`metabase-enterprise.advanced-config.file.workspace`)
     sets both from the format that came before these settings.
     Workspace-aware code (transform target rewriting, table-remapping QP middleware)
     reads them via [[workspace-mode?]] / [[db-workspace-namespace]].

   Per-database lifecycle for the manager-side rows. A create inserts every row
   `provisioning`. Each status, what it means, and what leaves it:

   - `provisioning`: a create has not finished the row. A successful provisioning
     sets it `provisioned`. A failed provisioning sets it `unprovisioned`, or
     deletes the row when the driver reports that it left nothing in the
     warehouse to tear down. A failed create's cleanup deletes a row whose
     provisioning never started, or sets it `never_started` when that delete
     fails.
   - `provisioned`: the warehouse isolation exists. A delete sets the row
     `deprovisioning`. A failed create's cleanup tears the row down: the row is
     deleted, or set `teardown_failed` when the cleanup fails.
   - `unprovisioned`: provisioning failed, and warehouse objects may remain. A
     delete and a failed create's cleanup treat the row as they treat a
     `provisioned` row.
   - `deprovisioning`: a delete is tearing the row down. The row is deleted when
     the teardown succeeds. It is set `teardown_failed` when the warehouse
     teardown fails. It is set back to its previous status when the failure
     comes before the warehouse call, or after a warehouse teardown that
     succeeded.
   - `teardown_failed`: a teardown failed, and warehouse objects may remain. A
     delete sets the row `deprovisioning` and tears it down again.
     [[abandon-teardown-failed-databases!]] deletes the row with no warehouse
     teardown.
   - `never_started`: a failed create could not delete the row, and its
     provisioning never started. A delete removes the row with no warehouse
     teardown, and does not set it `deprovisioning`.

   A delete also takes over a `provisioning` or `deprovisioning` row once every
   row of the workspace is older than [[in-flight-stale-after]]: it sets the row
   `deprovisioning` and tears it down.

   Deleting a workspace tears down each of its databases, except while a create
   or deprovision is running (409). Only a failure of the warehouse teardown itself
   leaves the row `teardown_failed`: warehouse objects may remain, the row keeps
   blocking deletion of its Database, and a retried delete tears it down again. A
   failure before the warehouse call (a lock timeout, a failed connection lookup)
   leaves the row's status as it was, and the next delete retries it.

   A failed create marks a row whose provisioning never started, and that it could
   not delete, `never_started`. The warehouse has nothing of such a row, so a delete
   removes it without a warehouse teardown."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.app-db.sql-errors :as sql-errors]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn engine-namespace-positions
  "Return `{:db ?, :schema ?}` — the values that should populate the `:db` and
   `:schema` AST slots for a Table row in `database`. `table` is optional; pass
   it when you want the schema position derived from the Table's `:schema`
   column (the normal `spec-for-table` case). Pass nil for `table` when you only
   need the `:db` slot (workspace `output_namespace` expansion, GRANT emission).

   `nil` for either slot means \"this driver doesn't emit this AST level.\"
   Empty-string sentinel coercion happens at the storage boundary, not here.

   Driven by [[metabase.driver.sql/table-qualification-style]] +
   [[metabase.driver.sql/db-slot-value]] -- third-party drivers participate by
   implementing those rather than getting a new case branch here."
  ([database]       (engine-namespace-positions database nil))
  ([database table]
   (case (driver.sql/table-qualification-style (:engine database))
     :table-qualification-style/table
     {:db nil
      :schema nil}

     :table-qualification-style/schema-table
     {:db nil
      :schema (:schema table)}

     :table-qualification-style/db-table
     {:db (driver.sql/db-slot-value (:engine database) database)
      :schema nil}

     :table-qualification-style/db-schema-table
     {:db (driver.sql/db-slot-value (:engine database) database)
      :schema (:schema table)})))

(defn expand-output-namespace
  "Expand a driver-opaque `output-namespace` string into the `{:db ?, :schema ?}`
   namespace map QP middleware, transform_hooks, and table_remapping consume.

   For 3-slot drivers (SQL Server, BigQuery) the `:db` slot is filled from
   `Database.details`. For 2-slot drivers the namespace string lands in the
   schema slot. For no-schema drivers (MySQL) it lands in the db slot.

   `output-namespace` blank → `:schema` is `nil`: the workspace database isn't
   provisioned yet and QP/transform consumers treat it as having no output
   mapping."
  [db output-namespace]
  (let [components (set (driver/qualified-name-components (:engine db)))
        positions  (engine-namespace-positions db)
        schema     (when-not (str/blank? output-namespace) output-namespace)]
    (cond-> {}
      (:db components)     (assoc :db (:db positions))
      (:schema components) (assoc :schema schema)
      (and (:db components) (not (:schema components)))
      (assoc :db schema))))

(defn- database-workspace-schema
  "The trimmed, non-blank `database-workspace-schema` database-local setting of `database`,
   or nil. A value that is not a string counts as none."
  [database]
  ;; `PUT /api/database/:id` stores the value untrimmed. An edit of the app DB can store a value that is not a
  ;; string.
  (let [schema (get-in database [:settings :database-workspace-schema])]
    (when (string? schema)
      (not-empty (str/trim schema)))))

(defn instance-workspace
  "The workspace this instance is, as `{:databases {<db-id> <schema>}}`, or nil when
   the `workspaces-enabled` setting is off."
  []
  (when (ws.settings/workspaces-enabled)
    {:databases (into {}
                      (keep (fn [database]
                              (when-let [schema (database-workspace-schema database)]
                                [(:id database) schema])))
                      (ws.db/all-databases))}))

(defenterprise check-database-workspace-schema-write!
  "EE impl: throw a 400 when a write would change a database's `database-workspace-schema` from `stored-schema` to
   `new-schema` while the `MB_WORKSPACES_ENABLED` env var is set, to either value. Does nothing when the two are
   equal, so a write of the stored value passes. Under the env var the schema changes only through `config.yml` or
   a restart with new configuration, which do not call this.

   Ungated like [[workspace-mode?]]: the lock holds whatever the token state."
  :feature :none
  [stored-schema new-schema]
  (when (and (not= stored-schema new-schema)
             (some? (some-> (setting/env-var-value :workspaces-enabled) setting/string->boolean)))
    (throw (ex-info (tru "database-workspace-schema can''t be changed at runtime while the MB_WORKSPACES_ENABLED env var is set. Change it in config.yml, or restart with new configuration.")
                    {:status-code 400}))))

(defn check-instance-workspace-schemas-unlocked!
  "Throw the 400 of [[check-database-workspace-schema-write!]] when [[set-instance-workspace!]] with `schemas`
   would change or clear any database's `database-workspace-schema`."
  [schemas]
  (doseq [database (ws.db/all-databases)]
    (check-database-workspace-schema-write! (database-workspace-schema database)
                                            (some-> (get schemas (:id database)) str/trim)))
  nil)

(mu/defn set-instance-workspace! :- :nil
  "Make this instance a workspace: set each database's `database-workspace-schema` from
   `schemas`, a map of database id to schema, then turn `workspaces-enabled` on. Clears
   the schema of every database not in `schemas`. A database whose schema changes, or is
   cleared because it is not in `schemas`, loses its remap rows. The writes run in one
   transaction, and the flag is written last. If the flag write throws, no schema is
   stored. Other nodes see the flag only after the commit, so they see every schema no
   later than the flag. On this node, other threads see the flag before the commit.
   When the transaction rolls back, reloads this process's settings cache, so that
   [[workspace-mode?]] matches the stored flag.
   Throws a 400 for an unknown database id, when this instance manages workspaces, or
   while `MB_WORKSPACES_ENABLED=false`.
   Trims each schema, so a repeat call with `\" ws \"` matches the stored `\"ws\"`
   and keeps the remap rows."
  [schemas :- [:map-of ::lib.schema.id/database ms/NonBlankString]]
  (try
    (t2/with-transaction [_conn]
      (let [schemas   (update-vals schemas str/trim)
            databases (ws.db/all-databases)]
        (when-let [unknown (seq (remove (set (map :id databases)) (keys schemas)))]
          (throw (ex-info (str "Unknown database ids: " (pr-str (vec unknown)))
                          {:status-code 400 :database_ids (vec unknown)})))
        (doseq [{:keys [id settings] :as database} databases
                :let [schema (get schemas id)]
                :when (not= schema (database-workspace-schema database))]
          (ws.db/update-database-settings! id (if schema
                                                (assoc settings :database-workspace-schema schema)
                                                (dissoc settings :database-workspace-schema)))
          ;; Rows pointing at the old schema would keep redirecting reads there.
          (ws.db/delete-table-remappings-of-database! id))
        (ws.settings/workspaces-enabled! true)))
    (catch Throwable e
      ;; The setter puts the flag in this process's settings cache before the commit, and a rollback does not
      ;; undo that. Reload the cache from the app DB.
      (setting/restore-cache!)
      (throw e)))
  nil)

(defn delete-stale-table-remappings!
  "Delete the remap rows of `database` when its `database-workspace-schema`
   differs from that of `previous-database`, the same row before the write, and that had one. Those rows
   point at the old schema and would keep redirecting reads there. A database that had no schema has no
   rows of its own, and keeps the ones an upgrade carried over."
  [previous-database database]
  (when (and (some? (database-workspace-schema previous-database))
             (not= (database-workspace-schema previous-database) (database-workspace-schema database)))
    (ws.db/delete-table-remappings-of-database! (:id database)))
  nil)

(defn clear-instance-workspace!
  "Turn `workspaces-enabled` off and delete every `:model/TableRemapping` row.
   Leaves each database's `database-workspace-schema` in place; it has no effect
   while the instance is not a workspace. Throws a 400 when `MB_WORKSPACES_ENABLED=true`,
   since that value wins over the stored one."
  []
  (ws.settings/workspaces-enabled! false)
  ;; The setting's setter deletes the remap rows only when the value changes. Delete
  ;; them here too, so that rows left while the setting was already off also go.
  (ws.db/delete-all-table-remappings!)
  nil)

(defn translate-instance-workspace-setting!
  "Startup step for the removed `instance-workspace` setting, stored or set by
   `MB_INSTANCE_WORKSPACE`. When it names a workspace and `workspaces-enabled` is neither
   stored nor set by its env var, store each of its databases' schemas as
   `database-workspace-schema`, skipping database ids that no longer exist, then turn
   `workspaces-enabled` on. The remap rows stay: they point at the schemas the old setting
   named, which are the ones stored. Then delete the stored value, so that only the new
   settings say whether this instance is a workspace. Without this step an upgraded sidecar
   leaves workspace mode, and its transforms write the production tables."
  []
  (when-let [{:keys [databases]} (ws.settings/instance-workspace)]
    (when-not (or (setting/db-stored-value :workspaces-enabled)
                  (setting/env-var-value :workspaces-enabled))
      (log/warn (str "Translating the removed instance-workspace setting into workspaces-enabled and"
                     " database-workspace-schema"))
      (t2/with-transaction [_conn]
        (doseq [[database-id {:keys [output]}] databases
                :let  [database (ws.db/database (parse-long (name database-id)))
                       schema   (some-> (or (:schema output) (:db output)) str/trim not-empty)]
                :when (and database schema)]
          (ws.db/update-database-settings! (:id database)
                                           (assoc (:settings database) :database-workspace-schema schema)))
        (ws.settings/workspaces-enabled! true)))
    (when (setting/db-stored-value :instance-workspace)
      (ws.settings/instance-workspace! nil)))
  nil)

(defenterprise workspace-mode?
  "EE impl: true iff this instance is a workspace (the `workspaces-enabled` setting
   is on). Single source of truth for gating features that conflict with workspace
   remapping (DB routing, impersonation, writeback, CSV upload, model persistence).
   Use [[db-workspace-namespace]] when you need per-database scoping.

   Deliberately ungated on premium features: a workspace instance may boot from
   `config.yml` or env vars *before* its token is installed; if it is a workspace,
   we refuse incompatible features regardless of token state."
  :feature :none
  []
  (ws.settings/workspaces-enabled))

(defenterprise workspace-database-exists?
  "EE impl: whether any WorkspaceDatabase row references the Database with `database-id`.
   Ungated like [[workspace-mode?]]: rows outlive a lapsed token, and their teardown
   still connects to the database."
  :feature :none
  [database-id]
  (ws.db/database-has-workspace-databases? database-id))

(defn db-workspace-namespace
  "Return the workspace output namespace map `{:db ?, :schema ?}` for `db-id`, or
   `nil` when this instance is not a workspace or the database has no
   `database-workspace-schema`. Either key may be absent depending on the driver's
   `qualified-name-components`."
  [db-id]
  (when (ws.settings/workspaces-enabled)
    (when-let [database (ws.db/database db-id)]
      (some->> (database-workspace-schema database)
               (expand-output-namespace database)))))

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (ws.db/table-remappings))

;;; ------------------------------------- Manager-side helpers ------------------------------------------------

(defn- assert-workspace-exists [workspace-id]
  (when-not (ws.db/workspace-exists? workspace-id)
    (throw (ex-info "Workspace not found"
                    {:status-code 404 :workspace_id workspace-id}))))

(def ^:private in-flight-stale-after
  "How long after the last write to any of a workspace's database rows a row of
  that workspace that marks running work still counts as in flight. After that,
  such a row is treated as left behind by a crashed instance, so a delete tears
  it down instead of refusing. A create or deprovision that spends longer than
  this on one database also looks crashed. The two busy checks share this
  window and count different statuses: see [[assert-workspace-not-busy]] and
  [[assert-create-not-running]]. Each status write sets the row's `updated_at`
  from this instance's clock when the write runs, and the cutoff uses the same
  clock."
  (t/minutes 15))

(defn- workspace-busy-exception
  "The 409 with error code `workspace_busy` for the workspace `workspace-id`."
  [workspace-id]
  (ex-info "Workspace is busy: a create or deprovision is still running on one of its databases. Nothing was changed. Retry once it finishes."
           {:status-code  409
            :error-code   "workspace_busy"
            :workspace_id workspace-id}))

(defn- assert-workspace-not-busy
  "Refuse (409, error code `workspace_busy`) while a create or deprovision is still
  running on any of the workspace's databases. Without this, a delete waits on
  the row lock that the running provisioning holds, then fails, or wins the lock
  and makes the create fail. It counts a `:provisioning` or `:deprovisioning` row
  while any row of the workspace was last updated within
  [[in-flight-stale-after]]. It does not count an
  `:unprovisioned` row: a failed create can leave one, and its 500 asks for a
  delete."
  [workspace-id]
  (when (ws.db/workspace-has-in-flight-databases? workspace-id
                                                  (t/minus (t/offset-date-time) in-flight-stale-after))
    (throw (workspace-busy-exception workspace-id))))

(defn- assert-database-exists [database-id]
  (or (ws.db/database database-id)
      (throw (ex-info "Database not found"
                      {:status-code 404 :database_id database-id}))))

(defn- assert-database-eligible-for-workspaces [database]
  (when-not (workspace-database/database-eligible-for-workspaces? database)
    (throw (ex-info "Workspaces are not enabled for this database"
                    {:status-code 400 :database_id (:id database)}))))

(defn- assert-input-schemas
  "Return `input-schemas`, refusing (400) an empty list for a driver that has schemas.
   On such a driver an empty list leaves the workspace nothing to read. On the
   `schema-filters` drivers (Postgres, Redshift, SQL Server) it is also unsafe: the
   workspace config's inclusion filter is then blank, and a blank filter syncs every
   schema, the workspace's own output schema included. Empty is legitimate only for
   schemaless drivers (MySQL), where the connection's bound database scopes sync instead.
   The `:schemas` check matches the drivers [[metabase-enterprise.workspaces.config]]
   builds a schema filter for; keep the two in step."
  [database input-schemas]
  (when (and (empty? input-schemas)
             (driver.u/supports? (:engine database) :schemas database))
    (throw (ex-info "Database has no synced schemas to use as workspace inputs; sync it first"
                    {:status-code 400 :database_id (:id database)})))
  input-schemas)

;;; ------------------------------------- Manager-side reads --------------------------------------------------

(defn get-workspace
  "Return the Workspace with the given `id`, hydrated with `:databases` and `:creator`.
   Returns nil if not found."
  [id]
  (workspace/get-workspace id))

(defn list-workspaces
  "Return all Workspaces, each hydrated with `:databases` and `:creator`."
  []
  (workspace/list-workspaces))

;;; ------------------------------------- Manager-side writes -------------------------------------------------

(defn- combined-exception
  "One exception carrying every failure in `throwables`: the first is the cause,
  the rest are attached as suppressed (the JDK mechanism for multiple failures
  on one throwable). The message is the messages the databases returned, joined
  into one line. The ex-data is shaped so the API error middleware returns just
  that message — without it, an uncaught 500 dumps the full `Throwable->map`
  cause chain into the response. `data` is merged in, and must carry the
  `:status-code`."
  ^Throwable [throwables data]
  (let [message       (str/join "; " (map #(or (ex-message %) (str (class %))) throwables))
        ^Throwable ex (ex-info message
                               (merge {:message message
                                       :errors  {:_error message}}
                                      data)
                               (first throwables))]
    (run! #(.addSuppressed ex ^Throwable %) (rest throwables))
    ex))

(defn- provision-workspace-databases!
  "Provision every `:provisioning` WorkspaceDatabase of the hydrated workspace `ws`
  synchronously (blocking), stopping at the first error. Returns nil when every
  database is provisioned, else `{:error t, :never-started ids}`: the error, and
  the ids of the rows after the failed one, whose provisioning never started."
  [ws]
  (loop [[wsd-id & more] (map :id (:databases ws))]
    (when wsd-id
      (if-let [t (try
                   (provisioning/provision-workspace-database! wsd-id provisioning/dispatching-provisioner)
                   nil
                   (catch Throwable t t))]
        {:error t, :never-started more}
        (recur more)))))

(defn- delete-never-started-workspace-database!
  "Delete the row `wsd-id`, whose provisioning never started, under its per-row lock. Init never ran for it, so the
  warehouse has nothing of its, and a teardown would drop a user and schema of its computed names that another
  parent may own."
  [wsd-id]
  (provisioning/with-workspace-database-lock wsd-id
    (ws.db/delete-workspace-database! wsd-id)))

(defn- restore-workspace-database-status!
  "Set the WorkspaceDatabase `wsd` back to the status and `updated_at` it has in `wsd`, if it is `:deprovisioning`.
  `wsd` is the row as read before [[mark-workspace-databases-deprovisioning!]] marked it. The old `updated_at` matters
  for a row a crashed instance left `:provisioning` or `:deprovisioning`: with a new one, the busy check would refuse
  the next delete."
  [wsd]
  (ws.db/transition-workspace-database-at! (:id wsd) :deprovisioning (:status wsd) (:updated_at wsd)))

(defn- mark-workspace-databases-deprovisioning!
  "Set every WorkspaceDatabase of `workspace-id` to `:deprovisioning`, so the busy checks refuse other requests while
  a delete tears the workspace down. Refuses (409, error code `workspace_busy`) while a create or deprovision is
  running. Returns the rows as they were before the mark; each keeps the status and `updated_at` to set back when
  its teardown fails before the warehouse call. A `:never_started` row is not marked: its teardown only deletes it.

  Two concurrent deletes cannot both mark a row. This one reads the rows before the busy check, and each mark is
  conditional on the status it read. So another delete's mark either shows in the busy check, or makes a mark here
  update no row. Then this delete sets back the rows it marked and refuses. A workspace whose rows are all older
  than [[in-flight-stale-after]] is not covered: two deletes can both take over a stale `:deprovisioning` row."
  [workspace-id]
  (let [wsds (ws.db/workspace-databases workspace-id)
        now  (t/offset-date-time)]
    (assert-workspace-not-busy workspace-id)
    (reduce (fn [marked wsd]
              (when-not (pos? (ws.db/transition-workspace-database-at! (:id wsd) (:status wsd) :deprovisioning now))
                (run! restore-workspace-database-status! marked)
                (throw (workspace-busy-exception workspace-id)))
              (conj marked wsd))
            []
            (remove #(= :never_started (:status %)) wsds))
    wsds))

(defn- teardown-workspace-databases!
  "Tear down every WorkspaceDatabase of `workspace-id` — any state, blocking.
  Marks them `:deprovisioning` first, see [[mark-workspace-databases-deprovisioning!]].
  Mirrors [[provision-workspace-databases!]], but continues past failures so each
  row gets its attempt: rows whose teardown succeeds are deleted immediately
  (progress is persisted per row, so an instance crash midway loses nothing);
  rows whose teardown fails are kept. A failed destroy leaves its row
  `:teardown_failed`. A row whose teardown failed and that is still
  `:deprovisioning` is set back to the status it had: the failure came before the
  warehouse call (a lock timeout, a failed lookup), or after a destroy that
  succeeded. An error from setting the status back is attached to that row's
  failure as suppressed, and the row stays `:deprovisioning`, so the busy check
  refuses a delete until every row of the workspace is older than
  [[in-flight-stale-after]]. Throws the combined failures when any teardown
  failed: with the failure's own `:status-code` when there is one failure, else 500."
  [workspace-id]
  (let [failures (into []
                       (keep (fn [wsd]
                               (try
                                 (provisioning/teardown-workspace-database! wsd provisioning/dispatching-provisioner)
                                 nil
                                 (catch Throwable t
                                   (try
                                     (restore-workspace-database-status! wsd)
                                     (catch Throwable restore-t
                                       (.addSuppressed t restore-t)))
                                   t))))
                       (mark-workspace-databases-deprovisioning! workspace-id))]
    (when (seq failures)
      ;; a single failure keeps its status, such as a driver's 409 naming what must happen before a retry
      (throw (combined-exception failures
                                 {:status-code (or (when (= 1 (count failures))
                                                     (:status-code (ex-data (first failures))))
                                                   500)})))))

(defn- clean-up-failed-create!
  "Clean up every WorkspaceDatabase of `workspace-id` after its create failed. Deletes the rows with ids in
  `never-started`, see [[delete-never-started-workspace-database!]], and tears down every other row. Continues past
  failures, so each row gets its attempt. Sets a never-started row that it cannot delete to `:never_started`, so a
  later delete skips the warehouse teardown of that row. Sets any other row whose cleanup fails to
  `:teardown_failed`: a failed destroy already does, and a failure before the destroy leaves the row's status as it
  was. A row left `:provisioning` would refuse a delete as busy, and a row left `:provisioned` would make the failed
  create look like one that succeeded. Throws the combined failures (500) when any cleanup failed. An error from
  setting the status is attached to that row's failure as suppressed."
  [workspace-id never-started]
  (let [never-started? (set never-started)
        failures       (into []
                             (keep (fn [wsd]
                                     (try
                                       (if (never-started? (:id wsd))
                                         (delete-never-started-workspace-database! (:id wsd))
                                         (provisioning/teardown-workspace-database! wsd provisioning/dispatching-provisioner))
                                       nil
                                       (catch Throwable t
                                         (try
                                           (if (never-started? (:id wsd))
                                             (provisioning/mark-workspace-database-never-started! (:id wsd))
                                             (provisioning/mark-workspace-database-teardown-failed! (:id wsd)))
                                           (catch Throwable mark-t
                                             (.addSuppressed t mark-t)))
                                         t))))
                             (ws.db/workspace-databases workspace-id))]
    (when (seq failures)
      (throw (combined-exception failures {:status-code 500})))))

(defn- create-running-exception
  "The 409 with error code `workspace_busy` for a same-key retry while a create or a delete of the workspace with that
  key is still running. `ws-id` is that workspace, or nil when a failed create has already deleted it."
  [ws-id]
  (ex-info "A create or delete of the workspace with this idempotency key is still running. Retry once it finishes."
           (cond-> {:status-code 409
                    :error-code  "workspace_busy"}
             ws-id (assoc :workspace_id ws-id))))

(defn- idempotency-key-violation?
  "Whether `t` is a duplicate-key error on the unique index `idx_workspace_idempotency_key_creator_id`. H2, PostgreSQL,
  MySQL and MariaDB all name the violated index in the error message; H2 writes it in upper case."
  [^Throwable t]
  (and (= :duplicate-key (sql-errors/error-kind t))
       (boolean (some #(some-> (ex-message %)
                               u/lower-case-en
                               (str/includes? "idx_workspace_idempotency_key_creator_id"))
                      (take-while some? (iterate ex-cause t))))))

(defn- insert-workspace-or-find-retried!
  "Insert the Workspace and its WorkspaceDatabase rows. Returns `{:created ws}`, or
  `{:retried ws-id}` when the creator already has a Workspace with `idempotency_key`.
  The unique index on (idempotency_key, creator_id) decides which of two concurrent
  requests inserts; the other inserts nothing. When the workspace with this key was
  deleted, by a failed create, between the insert and the lookup, refuses (409,
  error code `workspace_busy`) as for a create that is still running: the database's
  error names the index, the key and the creator. Rethrows a duplicate-key error
  that comes from another constraint."
  [{:keys [creator_id idempotency_key] :as params}]
  (try
    {:created (workspace/create-workspace! params)}
    (catch Throwable t
      (if-let [ws-id (and idempotency_key
                          (= :duplicate-key (sql-errors/error-kind t))
                          (ws.db/workspace-id-by-idempotency-key creator_id idempotency_key))]
        {:retried ws-id}
        (throw (if (and idempotency_key (idempotency-key-violation? t))
                 (create-running-exception nil)
                 t))))))

(defn- assert-create-not-running
  "Refuse (409, error code `workspace_busy`) while a database of workspace `ws-id` is
  `:unprovisioned`, `:provisioning` or `:deprovisioning` and any database of the
  workspace was last updated within [[in-flight-stale-after]]. A create inserts
  all its rows `:provisioning`, then provisions them one at a time. A row whose
  provisioning fails turns `:unprovisioned` before the create's cleanup tears it
  down, so an `:unprovisioned` row counts too while any database of the workspace
  was last updated within the window. One query checks all three statuses: with
  one query per status, a row that changes status between the queries could be
  seen by neither. A running delete sets its rows `:deprovisioning`, so a retry
  during a delete is refused too."
  [ws-id]
  (when (ws.db/workspace-has-unfinished-databases-since? ws-id
                                                         (t/minus (t/offset-date-time) in-flight-stale-after))
    (throw (create-running-exception ws-id))))

(defn- retried-workspace
  "Returns the hydrated workspace `ws-id`, which an earlier create with the same
  idempotency key made. Refuses (409, `workspace_busy`) while that create, or a
  delete of the workspace, is still running, see [[assert-create-not-running]]. When the workspace has no databases,
  or a database that is not `:provisioned`, the retry answers 500 with `workspace_id`
  and `cleanup_required`: the create failed and kept the workspace, the create
  stopped (a crash) and no database of the workspace was updated within
  [[in-flight-stale-after]], or a later delete failed. The key stays taken until
  the workspace is deleted."
  [ws-id]
  (assert-create-not-running ws-id)
  (let [ws (workspace/get-workspace ws-id)]
    (when (or (empty? (:databases ws))
              (not-every? #(= :provisioned (:status %)) (:databases ws)))
      (let [message "The workspace created with this idempotency key is not fully provisioned: its create failed or stopped, or a later delete failed. Delete the workspace (`workspace_id`), then create again with a new key."]
        (throw (ex-info message
                        {:status-code      500
                         :message          message
                         :errors           {:_error message}
                         :workspace_id     ws-id
                         :cleanup_required true
                         :response/keys    #{:workspace_id :cleanup_required}}))))
    ws))

(defn create-workspace!
  "Create a new Workspace, attach the databases with ids `database_ids` — each must
   exist (404) and be eligible for workspaces (400, see
   [[workspace-database/database-eligible-for-workspaces?]]) — with all of their
   known schemas as `input_schemas` (400 when a driver with schemas has none, see
   [[assert-input-schemas]]), and provision each database (blocking).
   Returns the created workspace, hydrated.

   The workspace and its WorkspaceDatabase rows are committed BEFORE provisioning
   starts — deliberately NOT one big transaction. Every row is inserted
   `:provisioning`, so a delete gets the 409 `workspace_busy` until the create
   ends, also before a row's turn comes. The rows are the durable record of
   warehouse resources that may (partially) exist, so they must survive an
   instance crash mid-provision; a rollback would erase them while the warehouse
   objects live on. Cleanup after a provisioning failure is therefore explicit:
   the rows whose provisioning never started are deleted, and every other
   database is torn down. When the cleanup removes everything, the Workspace
   row is deleted and the provisioning error is rethrown with its own
   `:status-code` (500 when it has none). When the cleanup itself fails, the
   workspace is kept with the failed rows, so the leak stays visible and the
   teardown can be retried via delete, and the error is a 500, as it is when the
   cleanup succeeds but deleting the Workspace row fails. A kept row is
   `:teardown_failed`, or `:never_started` when its provisioning never started.
   When the status write fails, or the read of the rows, a row keeps the status
   it had.
   Either way the error's `:cleanup_required` says whether the workspace was kept
   and still needs that delete.

   An optional `idempotency_key` makes the create safe to retry. It is stored on the
   Workspace row, unique per creator. When the creator already has a workspace with
   that key, nothing is provisioned: the call returns that workspace, refuses with
   409 (`workspace_busy`) while a create or delete of that workspace is still running, or
   answers 500 with `workspace_id` and `cleanup_required` when that workspace has
   no databases or one that is not `:provisioned`. The rest of a retry's params
   are not compared with the original's. A failed create whose cleanup deleted its
   workspace frees the key."
  [{:keys [name creator_id database_ids idempotency_key]}]
  (let [databases (mapv (fn [db-id]
                          (let [database (assert-database-exists db-id)]
                            (assert-database-eligible-for-workspaces database)
                            ;; `:provisioning` from the insert, so the busy check refuses a delete
                            ;; before this database's turn comes
                            {:database_id   db-id
                             :input_schemas (assert-input-schemas
                                             database
                                             (workspace-database/database-input-schemas database))
                             :status        :provisioning}))
                        database_ids)
        {ws :created retried-id :retried}
        (insert-workspace-or-find-retried! {:name            name
                                            :creator_id      creator_id
                                            :idempotency_key idempotency_key
                                            :databases       databases})]
    (if retried-id
      (retried-workspace retried-id)
      (do
        (when-let [{t :error, never-started :never-started} (provision-workspace-databases! ws)]
          (let [cleanup-error (try
                                (clean-up-failed-create! (:id ws) never-started)
                                nil
                                ;; Cleanup failed: the workspace and the failed rows are
                                ;; kept so the teardown can be retried via delete. The
                                ;; errors are not logged (raw warehouse errors are
                                ;; sensitive), but the caller gets them in the
                                ;; response, as it does from a failed delete.
                                (catch Throwable cleanup-t cleanup-t))
                delete-error  (when-not cleanup-error
                                (try
                                  (workspace/delete-workspace! (:id ws))
                                  nil
                                  ;; a fixed message: a raw app-DB error can name tables
                                  (catch Throwable delete-t
                                    (ex-info "Could not delete the workspace row." {} delete-t))))
                ;; either way the Workspace row survives, and only a delete removes it
                kept-error    (or cleanup-error delete-error)]
            ;; a single failure keeps its status, like a driver's 409 for a role it refuses
            ;; a kept workspace's id goes to the client, which must delete it
            (throw (combined-exception (cond-> [t] kept-error (conj kept-error))
                                       (cond-> {:status-code      (if kept-error
                                                                    500
                                                                    (or (:status-code (ex-data t)) 500))
                                                :cleanup_required (some? kept-error)
                                                :response/keys    #{:cleanup_required}}
                                         kept-error (-> (assoc :workspace_id (:id ws))
                                                        (update :response/keys conj :workspace_id)))))))
        (workspace/get-workspace (:id ws))))))

(defn abandon-teardown-failed-databases!
  "Delete every `:teardown_failed` WorkspaceDatabase of workspace `id` without a
  warehouse teardown, logging the identifiers of what may remain. Use it when the
  warehouse is gone for good and the teardown can never succeed. Refuses with a
  409 (`workspace_busy`), deleting nothing, while a create or deprovision is
  running on any of the workspace's databases. Returns nil."
  [id]
  (assert-workspace-exists id)
  (assert-workspace-not-busy id)
  (run! provisioning/abandon-teardown-failed-workspace-database! (ws.db/workspace-databases id)))

(defn delete-workspace!
  "Tear down every database's warehouse isolation (blocking), then
  delete the workspace. There is no partial deletion: each WorkspaceDatabase is
  either fully torn down (warehouse footprint confirmed gone, row deleted) or
  kept. Every database gets its teardown attempt even when earlier ones fail; if
  any of them fail, the workspace is kept alongside the failed rows and one
  exception combining all the failures is thrown, so the delete can be retried.
  Progress is persisted per row, so an instance crash midway loses nothing.
  App-DB `TableRemapping` rows are always cleared, so query routing is never
  left dangling. Refuses with a 409 (`workspace_busy`) while a create or
  deprovision is still running on any of its databases; a `:provisioning` or
  `:deprovisioning` row left behind by a crashed instance is torn down once
  every row of the workspace is older than [[in-flight-stale-after]]. Before its first warehouse call, the
  delete sets every database `:deprovisioning`, so a second delete gets that 409
  while this one runs. Returns nil."
  [id]
  (assert-workspace-exists id)
  (teardown-workspace-databases! id)
  (workspace/delete-workspace! id)
  nil)
