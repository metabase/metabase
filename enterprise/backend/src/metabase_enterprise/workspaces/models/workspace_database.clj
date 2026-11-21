(ns metabase-enterprise.workspaces.models.workspace-database
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
  [rows :- [:sequential ::ws.db/workspace-database.insert]]
  (ws.db/insert-workspace-databases! rows))

(mu/defn update-workspace-database!
  "Apply `changes` to the WorkspaceDatabase with `workspace-database-id`."
  [workspace-database-id :- ms/PositiveInt
   changes               :- ::ws.db/workspace-database.update]
  (ws.db/update-workspace-database! workspace-database-id changes))

(mu/defn transition-workspace-database!
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status` if it is `from-status`, and its
  `updated_at` to this instance's current time. Returns the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::ws.db/status
   to-status             :- ::ws.db/status]
  (ws.db/transition-workspace-database! workspace-database-id from-status to-status))

(mu/defn transition-workspace-database-at!
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status`, and its `updated_at` to
  `updated-at`, if its status is `from-status`. The `UPDATE` statement carries the status condition, so of two
  concurrent calls from the same status only one updates the row. Returns the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::ws.db/status
   to-status             :- ::ws.db/status
   updated-at            :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (ws.db/transition-workspace-database-at! workspace-database-id from-status to-status updated-at))

(mu/defn transition-workspace-databases!
  "Set the status of every WorkspaceDatabase of the Workspace with `workspace-id` that is `from-status` to
  `to-status`, and its `updated_at` to this instance's current time. Returns the number of rows updated."
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

(defenterprise reconcile-workspace-database-refs-before-delete!
  "Enterprise impl of the `:model/Database` before-delete hook. Refuses (409) when any
   non-`:unprovisioned` workspace_database row references `db-id` — anything in a
   `:provisioning`, `:provisioned`, `:deprovisioning`, or `:teardown_failed` state points
   at (or is in flight against) live warehouse schemas/users that must be torn down first, by
   deleting their workspaces. A `:never_started` row has no warehouse objects and refuses too:
   deleting its workspace removes it. Deletes any `:unprovisioned` rows so the `workspace_database.database_id`
   FK RESTRICT doesn't trip on the subsequent Database delete. Deliberately NOT gated
   on a premium feature: a token expiry shouldn't leave workspace_database rows
   un-cleanable, and an active row must refuse the delete regardless of current
   feature state."
  :feature :none
  [db-id]
  (when (ws.db/database-has-active-workspace-databases? db-id)
    (throw (ex-info "Cannot delete a Database with active workspace_database rows; delete their workspaces first (DELETE /api/ee/workspace-manager/:id). For rows in teardown_failed, add ?force=true only when the warehouse is gone for good."
                    {:status-code 409
                     :database_id db-id})))
  (ws.db/delete-unprovisioned-workspace-databases-of-database! db-id))

;;; ----------------------------------------------- Specs -----------------------------------------------

(defmethod app-db-copy/spec :model/WorkspaceDatabase [_model]
  {:skip? false})
