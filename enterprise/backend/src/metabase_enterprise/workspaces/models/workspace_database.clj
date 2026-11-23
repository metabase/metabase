(ns metabase-enterprise.workspaces.models.workspace-database
  (:require
   [malli.util :as mut]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDatabase [_model] :workspace_database)

(doto :model/WorkspaceDatabase
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceDatabase
  {:database_details (mi/transform-encrypted-json "workspace_database.database_details")
   :input_schemas    mi/transform-json
   :status           mi/transform-keyword})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; WorkspaceDatabases are superuser-only: read, write, and create all require admin.

(methodical/defmethod t2/simple-hydrate [:model/WorkspaceDatabase :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean api/*is-superuser?*)))

(methodical/defmethod t2/simple-hydrate [:model/WorkspaceDatabase :can_write]
  [_model k instance]
  (assoc instance k (boolean api/*is-superuser?*)))

(defmethod mi/can-create? :model/WorkspaceDatabase
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod t2/batched-hydrate [:model/WorkspaceDatabase :database]
  [_model k workspace-databases]
  (mi/instances-with-hydrated-data
   workspace-databases k
   (fn []
     (when-let [ids (seq (distinct (keep :database_id workspace-databases)))]
       (ws.db/database-id->database ids)))
   :database_id
   {:default nil}))

;;; --------------------------------------- Database eligibility ---------------------------------------

(defn database-eligible-for-workspaces?
  "True iff `database`'s driver supports the `:workspace` feature, the
   `database-enable-workspaces` database-local setting is enabled for it, and it is
   neither a router nor a destination database. Every connection to a router resolves
   to the current user's destination, so provisioning DDL would land wherever the
   provisioning admin happens to be routed, and teardown wherever the deleting admin is."
  [database]
  (and (driver.u/supports? (:engine database) :workspace database)
       (not (database-routing/db-routing-enabled? (driver.u/lib-database (:id database))))
       (boolean (setting/with-database database
                  (ws.settings/database-enable-workspaces)))))

(defn database-input-schemas
  "The distinct non-blank schema names of `database`'s active tables, sorted.
   Empty for schemaless drivers (e.g. MySQL)."
  [database]
  (->> (ws.db/active-table-schemas (:id database))
       (remove #(or (nil? %) (= % "")))
       sort
       vec))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-workspace-databases!
  "Insert `rows`."
  [rows :- [:sequential ::ws.db/workspace-database.create]]
  (ws.db/insert-workspace-databases! rows))

(mu/defn update-workspace-database!
  "Apply `changes` to the WorkspaceDatabase with `workspace-database-id`."
  [workspace-database-id :- ms/PositiveInt
   changes               :- (mut/select-keys ::ws.db/workspace-database.update
                                             [:output_namespace :database_details :status :updated_at])]
  (ws.db/update-workspace-database! workspace-database-id changes))

(mu/defn transition-workspace-database!
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status` if it is `from-status`, and its
  `updated_at` to this instance's current time, returning the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::ws.db/status
   to-status             :- ::ws.db/status]
  (ws.db/transition-workspace-database! workspace-database-id from-status to-status))

(mu/defn transition-workspace-database-at!
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status`, and its `updated_at` to
  `updated-at`, if its status is `from-status`, in one statement that carries the status condition so that of two
  concurrent calls from the same status only one updates the row, returning the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::ws.db/status
   to-status             :- ::ws.db/status
   updated-at            :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (ws.db/transition-workspace-database-at! workspace-database-id from-status to-status updated-at))

(mu/defn transition-workspace-databases!
  "Set the status of every WorkspaceDatabase of the Workspace with `workspace-id` that is `from-status` to
  `to-status`, and its `updated_at` to this instance's current time, returning the number of rows updated."
  [workspace-id :- ms/PositiveInt
   from-status  :- ::ws.db/status
   to-status    :- ::ws.db/status]
  (ws.db/transition-workspace-databases! workspace-id from-status to-status))

(mu/defn delete-workspace-database!
  "Delete the WorkspaceDatabase with `workspace-database-id`."
  [workspace-database-id :- ms/PositiveInt]
  (ws.db/delete-workspace-database! workspace-database-id))

(mu/defn delete-workspace-databases!
  "Delete the WorkspaceDatabases with ids in `workspace-database-ids`."
  [workspace-database-ids :- [:sequential ms/PositiveInt]]
  (ws.db/delete-workspace-databases! workspace-database-ids))

(mu/defn delete-workspace-databases-of-databases! :- :nil
  "Delete the `:unprovisioned` WorkspaceDatabases of the Databases with `database-ids`, as those Databases are deleted,
  so that the `workspace_database.database_id` foreign key does not refuse the delete, refusing (409), whatever the
  premium features, when one of them is in another status: a `:provisioning`, `:provisioned`, `:deprovisioning` or
  `:teardown_failed` row points at, or is in flight against, live warehouse schemas and users that must be torn down
  first by deleting its workspace, and a `:never_started` row is removed by deleting its workspace."
  [database-ids :- [:sequential ms/PositiveInt]]
  (when-let [db-id (ws.db/database-id-with-active-workspace-databases database-ids)]
    (throw (ex-info "Cannot delete a Database with active workspace_database rows; delete their workspaces first (DELETE /api/ee/workspace-manager/:id). For rows in teardown_failed, add ?force=true only when the warehouse is gone for good."
                    {:status-code 409
                     :database_id db-id})))
  (ws.db/delete-unprovisioned-workspace-databases-of-databases! database-ids)
  nil)

(defmethod database/delete-for-databases! :model/WorkspaceDatabase
  [_model databases]
  (delete-workspace-databases-of-databases! (mapv :id databases)))

;;; ----------------------------------------------- Specs -----------------------------------------------

(defmethod app-db-copy/spec :model/WorkspaceDatabase [_model]
  {:skip? false})
