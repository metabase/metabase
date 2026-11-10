(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces.

   Two operational surfaces share this namespace:

   - **Manager-side state.** Workspaces and their per-database configs live in the
     `:model/Workspace` and `:model/WorkspaceDatabase` rows. Mutations go through
     [[create-workspace!]] and [[delete-workspace!]]. Provisioning operations are
     synchronous — the caller waits until the warehouse work completes.

   - **Instance-side state.** An instance is a workspace when its `workspaces-enabled`
     setting is on. Each database's database-local `database-workspace-schema` setting
     names the schema its transforms write to. Both are ordinary settings: the settings
     API, env vars, or `config.yml` set them (the `:workspace` section loader,
     `metabase-enterprise.advanced-config.file.workspace`, translates the older form).
     Workspace-aware code (transform target rewriting, table-remapping QP middleware)
     reads them via [[workspace-mode?]] / [[db-workspace-namespace]].

   Per-database lifecycle for the manager-side rows:

                    provision
    unprovisioned ────────────► provisioning ──────► provisioned
         ▲                           │                    │
         │                  failure  │                    │ deprovision
         │                           ▼                    ▼
         │                     unprovisioned ◄──── deprovisioning
         │                                                │
         │                                       failure  │
         │                                                ▼
         └──────────────────────────────────────── provisioned"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
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
   or nil. `PUT /api/database/:id` stores the value untrimmed, so every reader trims here."
  [database]
  (some-> (get-in database [:settings :database-workspace-schema]) str/trim not-empty))

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

(defn- check-not-set-by-env-var!
  "Throw a 400 when `MB_WORKSPACES_ENABLED` holds a value other than `wanted`: the env
   var wins over the stored value, so a write would report success and change nothing."
  [wanted]
  (when-let [env-value (setting/env-var-value :workspaces-enabled)]
    (when (not= (str wanted) (u/lower-case-en env-value))
      (throw (ex-info (str "workspaces-enabled is set to " env-value " by the MB_WORKSPACES_ENABLED env var"
                           " and can't be changed at runtime.")
                      {:status-code 400})))))

(mu/defn set-instance-workspace! :- :nil
  "Make this instance a workspace: set each database's `database-workspace-schema` from
   `schemas`, a map of database id to schema, then turn `workspaces-enabled` on. Clears
   the schema, and the remap rows, of every database not in `schemas`. One transaction,
   flag last, so no transform sees workspace mode with a schema missing. Throws a 400
   for an unknown database id, on a parent, or when `MB_WORKSPACES_ENABLED=false`.
   Trims each schema, so a repeat call with `\" ws \"` matches the stored `\"ws\"`
   and keeps the remap rows."
  [schemas :- [:map-of ::lib.schema.id/database ms/NonBlankString]]
  (check-not-set-by-env-var! true)
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
  nil)

(defn delete-stale-table-remappings!
  "Delete the remap rows of `database` when its `database-workspace-schema`
   differs from that of `previous-database`, the same row before the write. Those rows
   point at the old schema and would keep redirecting reads there. For writes that skip
   [[set-instance-workspace!]]: `PUT /api/database/:id` and the `config.yml` loader."
  [previous-database database]
  (when (not= (database-workspace-schema previous-database) (database-workspace-schema database))
    (ws.db/delete-table-remappings-of-database! (:id database)))
  nil)

(defn clear-instance-workspace!
  "Turn `workspaces-enabled` off and delete every `:model/TableRemapping` row.
   Leaves each database's `database-workspace-schema` in place; it has no effect
   while the instance is not a workspace. Throws a 400 when `MB_WORKSPACES_ENABLED=true`,
   since that value wins over the stored one."
  []
  (check-not-set-by-env-var! false)
  (ws.settings/workspaces-enabled! false)
  ;; The setting's :on-change deletes them only when the value changes; delete them
  ;; here too so stale rows from an earlier run go regardless.
  (ws.db/delete-all-table-remappings!)
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
  "Provision every WorkspaceDatabase of the hydrated workspace `ws` synchronously
  (blocking), stopping at the first error. Returns nil when every database is
  provisioned, else `{:error t, :never-started ids}`: the error, and the ids of
  the rows after the failed one, whose provisioning never started."
  [ws]
  (loop [[wsd-id & more] (map :id (:databases ws))]
    (when wsd-id
      (if-let [t (try
                   (provisioning/provision-single! wsd-id)
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

(defn- teardown-workspace-databases!
  "Tear down every WorkspaceDatabase of `workspace-id` — any state, blocking.
  Mirrors [[provision-workspace-databases!]], but continues past failures so each
  row gets its attempt: rows whose teardown succeeds are deleted immediately
  (progress is persisted per row, so an instance crash midway loses nothing);
  rows whose teardown fails are kept. Throws the combined failures when any
  teardown failed: with the failure's own `:status-code` when there is one
  failure, else 500."
  [workspace-id]
  (let [failures (into []
                       (keep (fn [wsd]
                               (try
                                 (provisioning/teardown-workspace-database! wsd provisioning/dispatching-provisioner)
                                 nil
                                 (catch Throwable t t))))
                       (ws.db/workspace-databases workspace-id))]
    (when (seq failures)
      ;; a single failure keeps its status, such as a driver's 409 naming what must happen before a retry
      (throw (combined-exception failures
                                 {:status-code (or (when (= 1 (count failures))
                                                     (:status-code (ex-data (first failures))))
                                                   500)})))))

(defn create-workspace!
  "Create a new Workspace, attach the databases with ids `database_ids` — each must
   exist (404) and be eligible for workspaces (400, see
   [[workspace-database/database-eligible-for-workspaces?]]) — with all of their
   known schemas as `input_schemas` (400 when a driver with schemas has none, see
   [[assert-input-schemas]]), and provision each database (blocking).
   Returns the created workspace, hydrated.

   The workspace and its WorkspaceDatabase rows are committed BEFORE provisioning
   starts — deliberately NOT one big transaction. The rows are the durable record
   of warehouse resources that may (partially) exist, so they must survive an
   instance crash mid-provision; a rollback would erase them while the warehouse
   objects live on. Cleanup after a provisioning failure is therefore explicit:
   the rows whose provisioning never started are deleted, and every other
   database is torn down. When the cleanup removes everything, the Workspace
   row is deleted and the provisioning error is rethrown with its own
   `:status-code` (500 when it has none). When the cleanup itself fails, the
   workspace is kept with the failed rows (`:unprovisioned`), so the leak stays
   visible and the teardown can be retried via delete, and the error is a 500,
   as it is when the cleanup succeeds but deleting the Workspace row fails.
   Either way the error's `:cleanup_required` says whether the workspace was kept
   and still needs that delete."
  [{:keys [name creator_id database_ids]}]
  (let [databases (mapv (fn [db-id]
                          (let [database (assert-database-exists db-id)]
                            (assert-database-eligible-for-workspaces database)
                            {:database_id   db-id
                             :input_schemas (assert-input-schemas
                                             database
                                             (workspace-database/database-input-schemas database))}))
                        database_ids)
        ws        (workspace/create-workspace! {:name       name
                                                :creator_id creator_id
                                                :databases  databases})]
    (when-let [{t :error, never-started :never-started} (provision-workspace-databases! ws)]
      (let [cleanup-error (try
                            (run! delete-never-started-workspace-database! never-started)
                            (teardown-workspace-databases! (:id ws))
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
        (throw (combined-exception (cond-> [t] kept-error (conj kept-error))
                                   {:status-code      (if kept-error
                                                        500
                                                        (or (:status-code (ex-data t)) 500))
                                    :cleanup_required (some? kept-error)
                                    :response/keys    #{:cleanup_required}}))))
    (workspace/get-workspace (:id ws))))

(defn delete-workspace!
  "Tear down every database's warehouse isolation (any state, blocking), then
  delete the workspace. There is no partial deletion: each WorkspaceDatabase is
  either fully torn down (warehouse footprint confirmed gone, row deleted) or
  kept. Every database gets its teardown attempt even when earlier ones fail; if
  any of them fail, the workspace is kept alongside the failed rows and one
  exception combining all the failures is thrown, so the delete can be retried.
  Progress is persisted per row, so an instance crash midway loses nothing.
  App-DB `TableRemapping` rows are always cleared, so query routing is never
  left dangling. Returns nil."
  [id]
  (assert-workspace-exists id)
  (teardown-workspace-databases! id)
  (workspace/delete-workspace! id)
  nil)
