(ns metabase-enterprise.workspaces.provisioning
  "Programmatic API for workspaces.

   Two operational surfaces share this namespace:

   - **Manager-side state.** Workspaces and their per-database configs live in the
     `:model/Workspace` and `:model/WorkspaceDatabase` rows. Mutations go through
     [[create-workspace!]] and [[delete-workspace!]]. Provisioning operations are
     synchronous — the caller waits until the warehouse work completes.

   - **Instance-side state.** When a Metabase boots in workspace mode, the
     `:workspace` section loader (`metabase-enterprise.advanced-config.file.workspace`)
     parses `config.yml` and stores the resulting workspace map in the
     `instance-workspace` setting. Workspace-aware code (transform target
     rewriting, table-remapping QP middleware) reads from the setting via
     [[workspace-mode?]] / [[db-workspace-namespace]]. The setting lives in the
     instance's own application database — child instances have their own app DB,
     so storing it there persists the workspace across restarts without leaking
     between parent and child.

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
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.workspaces.core :as ws]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- coerce-database-id-key
  "JSON round-trips through the `instance-workspace` setting return integer
   `Database.id` keys as keywords (e.g. `:1`). Coerce them back to ints."
  [k]
  (cond
    (int? k)     k
    (keyword? k) (parse-long (name k))
    (string? k)  (parse-long k)))

(defn- normalize-database-keys
  "Coerce the `:databases` map keys to ints. See [[coerce-database-id-key]]."
  [config]
  (some-> config
          (update :databases #(update-keys % coerce-database-id-key))))

(mu/defn set-instance-workspace! :- :any
  "Store the workspace config in the `instance-workspace` setting. Replaces any
   prior value. The shape is validated against `::ws/workspace-instance-config`."
  [config :- ::ws/workspace-instance-config]
  (ws.settings/instance-workspace! config)
  nil)

(defn clear-instance-workspace!
  "Clear the `instance-workspace` setting."
  []
  (ws.settings/instance-workspace! nil)
  nil)

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  (normalize-database-keys (ws.settings/instance-workspace)))

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (the
   `instance-workspace` setting is populated — either from a `:workspace` section
   of `config.yml` at boot or by a `POST /api/ee/advanced-config`). Single
   source of truth for gating features that conflict with workspace remapping
   (DB routing, impersonation, writeback, CSV upload, model persistence). Use
   [[db-workspace-namespace]] when you need per-database scoping.

   Deliberately ungated on premium features: a workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map is
   loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (some? (ws.settings/instance-workspace)))

(defn db-workspace-namespace
  "Return the workspace-isolated output namespace map for `db-id` on this
   instance, or `nil` when this instance is not running a workspace or the
   workspace has no entry for `db-id`. The namespace map is
   `{:db ?, :schema ?}` - either or both keys may be absent depending on
   the driver's `qualified-name-components`. Reads from the `workspace-instance`
   setting."
  [db-id]
  (get-in (instance-workspace) [:databases db-id :output]))

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

;;; ------------------------------------- Manager-side helpers ------------------------------------------------

(defn- assert-database-exists [database-id]
  (or (t2/select-one :model/Database :id database-id)
      (throw (ex-info "Database not found"
                      {:status-code 404 :database_id database-id}))))

(defn- assert-database-eligible-for-workspaces [database]
  (when-not (workspace-database/database-eligible-for-workspaces? database)
    (throw (ex-info "Workspaces are not enabled for this database"
                    {:status-code 400 :database_id (:id database)}))))

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
  cause chain into the response."
  ^Throwable [throwables]
  (let [message       (str/join "; " (map #(or (ex-message %) (str (class %))) throwables))
        ^Throwable ex (ex-info message
                               {:status-code 500
                                :message     message
                                :errors      {:_error message}}
                               (first throwables))]
    (run! #(.addSuppressed ex ^Throwable %) (rest throwables))
    ex))

(mu/defn- provision-workspace-databases!
  "Provision every WorkspaceDatabase of the hydrated workspace `ws` synchronously
  (blocking), failing fast on the first error."
  [ws :- ::ws.schema/workspace]
  (doseq [{wsd-id :id} (:databases ws)]
    (provisioning.database/provision-database! wsd-id)))

(mu/defn- deprovision-workspace-databases!
  "Deprovision every WorkspaceDatabase of `workspace-id` — any state, blocking.
  Mirrors [[provision-workspace-databases!]], but continues past failures so each
  row gets its attempt: rows whose deprovisioning succeeds are deleted immediately
  (progress is persisted per row, so an instance crash midway loses nothing);
  rows whose deprovisioning fails are kept. Throws the combined failures when any
  deprovisioning failed."
  [workspace-id :- ms/PositiveInt]
  (let [failures (into []
                       (keep (fn [wsd]
                               (try
                                 (provisioning.database/deprovision-database! wsd)
                                 nil
                                 (catch Throwable t t))))
                       (t2/select :model/WorkspaceDatabase :workspace_id workspace-id))]
    (when (seq failures)
      (throw (combined-exception failures)))))

(mu/defn- workspace-database-specs
  "Validate each of `database-ids` — the database must exist (404) and be eligible
  for workspaces (400, see [[workspace-database/database-eligible-for-workspaces?]])
  — and return the WorkspaceDatabase specs to attach: each database with all of
  its known schemas as `input_schemas`."
  [database-ids :- [:maybe [:sequential ms/PositiveInt]]]
  (mapv (fn [db-id]
          (let [database (assert-database-exists db-id)]
            (assert-database-eligible-for-workspaces database)
            {:database_id   db-id
             :input_schemas (workspace-database/database-input-schemas database)}))
        database-ids))

(mu/defn- provision-workspace-instance!
  "Provision the child instance for the fully provisioned workspace `ws`
  (blocking), when `workspace-instance-provisioning-enabled` is set. Best-effort:
  a failure is logged and `instance_id`/`instance_url` are left unset — the
  workspace itself is still returned as created."
  [ws :- ::ws.schema/workspace]
  (try
    (when (ws.settings/workspace-instance-provisioning-enabled)
      (provisioning.instance/provision-instance! ws (ws.config/build-workspace-config (:id ws))))
    (catch Throwable t
      (log/warnf t "Failed to provision an instance for workspace %s" (:id ws)))))

(mu/defn- deprovision-workspace-instance!
  "Delete the child instance of `ws`, when it has one. The row's
  `instance_id`/`instance_url` are cleared immediately, so if a later database
  deprovisioning step fails and the workspace is kept, it correctly shows no
  instance. Throws when the provisioner fails to delete the instance."
  [ws :- ::ws.schema/workspace]
  (when (:instance_id ws)
    (provisioning.instance/deprovision-instance! ws)))

(mu/defn create-workspace! :- [:maybe ::ws.schema/workspace]
  "Create a new Workspace, attach the databases with ids `database_ids` (see
   [[workspace-database-specs]]), provision each database (blocking), and — when
   the workspace ends up fully provisioned — provision its child instance. Returns
   the created workspace, hydrated.

   The workspace and its WorkspaceDatabase rows are committed BEFORE provisioning
   starts — deliberately NOT one big transaction. The rows are the durable record
   of warehouse resources that may (partially) exist, so they must survive an
   instance crash mid-provision; a rollback would erase them while the warehouse
   objects live on. Cleanup after a provisioning failure is therefore explicit,
   in the `catch` below: every database is deprovisioned; when that removes
   everything, the Workspace row is deleted and the provisioning error is
   rethrown; when the cleanup itself fails, the workspace is kept — and returned
   like a successful create — with the failed rows (`:unprovisioned`) so the
   leak stays visible and deletable. An instance-provisioning failure never
   fails the create — the workspace is returned without
   `instance_id`/`instance_url` (see [[provision-workspace-instance!]])."
  [{:keys [name creator_id database_ids]} :- [:map
                                              [:name         ms/NonBlankString]
                                              [:creator_id   ms/PositiveInt]
                                              [:database_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]]]
  (let [ws (workspace/create-workspace! {:name       name
                                         :creator_id creator_id
                                         :databases  (workspace-database-specs database_ids)})]
    (try
      (provision-workspace-databases! ws)
      (provision-workspace-instance! ws)
      (catch Throwable provisioning-error
        (let [cleaned-up? (try
                            (deprovision-workspace-databases! (:id ws))
                            true
                            (catch Throwable _ false))]
          (if cleaned-up?
            (do
              (try
                (workspace/delete-workspace! (:id ws))
                (catch Throwable delete-error
                  (.addSuppressed provisioning-error delete-error)))
              (throw (combined-exception [provisioning-error])))
            ;; cleanup failed: deliberately swallow the error — the workspace is
            ;; kept and returned with its failed (:unprovisioned) rows visible
            nil))))
    (workspace/get-workspace (:id ws))))

(mu/defn delete-workspace! :- :nil
  "Deprovision every database's warehouse isolation (any state, blocking), then
  delete the workspace. There is no partial deletion: each WorkspaceDatabase is
  either fully deprovisioned (warehouse footprint confirmed gone, row deleted) or
  kept. Every database gets its deprovisioning attempt even when earlier ones
  fail; if any of them fail, the workspace is kept alongside the failed rows and
  one exception combining all the failures is thrown, so the delete can be
  retried. Progress is persisted per row, so an instance crash midway loses
  nothing. App-DB `TableRemapping` rows are always cleared, so query routing is
  never left dangling. If the workspace has a provisioned child instance, it is
  deleted first; a failure there keeps the workspace so the delete can be
  retried, while a success clears `instance_id`/`instance_url` immediately — so
  when a later database deprovisioning fails and the workspace is kept, it
  correctly shows no instance. Returns nil."
  [{:keys [id] :as ws} :- ::ws.schema/workspace]
  (deprovision-workspace-instance! ws)
  (deprovision-workspace-databases! id)
  (workspace/delete-workspace! id)
  nil)
