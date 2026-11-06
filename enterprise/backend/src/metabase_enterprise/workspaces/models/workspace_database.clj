(ns metabase-enterprise.workspaces.models.workspace-database
  (:require
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDatabase [_model] :workspace_database)

(doto :model/WorkspaceDatabase
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceDatabase
  {:database_details mi/transform-encrypted-json
   :input_schemas    mi/transform-json
   :status           mi/transform-keyword})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; WorkspaceDatabases are superuser-only: read, write, and create all require admin.

(defmethod mi/can-read? :model/WorkspaceDatabase
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/WorkspaceDatabase
  ([_instance]
   api/*is-superuser?*)
  ([_model _pk]
   api/*is-superuser?*))

(defmethod mi/can-create? :model/WorkspaceDatabase
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod t2/batched-hydrate [:model/WorkspaceDatabase :database]
  [_model k workspace-databases]
  (mi/instances-with-hydrated-data
   workspace-databases k
   (fn []
     (when-let [ids (seq (distinct (keep :database_id workspace-databases)))]
       (t2/select-pk->fn identity :model/Database :id [:in ids])))
   :database_id
   {:default nil}))

;;; --------------------------------------- Database eligibility ---------------------------------------

(defn database-eligible-for-workspaces?
  "True iff `database`'s driver supports the `:workspace` feature and the
   `database-enable-workspaces` database-local setting is enabled for it."
  [database]
  (and (driver.u/supports? (:engine database) :workspace database)
       (boolean (setting/with-database database
                  (ws.settings/database-enable-workspaces)))))

(defn database-input-schemas
  "The distinct non-blank schema names of `database`'s active tables, sorted.
   Empty for schemaless drivers (e.g. MySQL)."
  [database]
  (->> (t2/select-fn-set :schema :model/Table :db_id (:id database) :active true)
       (remove #(or (nil? %) (= % "")))
       sort
       vec))

(defenterprise reconcile-workspace-database-refs-before-delete!
  "Enterprise impl of the `:model/Database` before-delete hook. Refuses (409) when any
   non-`:unprovisioned` workspace_database row references `db-id` — anything in a
   `:provisioning`, `:provisioned`, or `:deprovisioning` state points at (or is in
   flight against) live warehouse schemas/users that must be unprovisioned explicitly
   first. Deletes any `:unprovisioned` rows so the `workspace_database.database_id`
   FK RESTRICT doesn't trip on the subsequent Database delete. Deliberately NOT gated
   on a premium feature: a token expiry shouldn't leave workspace_database rows
   un-cleanable, and an active row must refuse the delete regardless of current
   feature state."
  :feature :none
  [db-id]
  (when (t2/exists? :model/WorkspaceDatabase
                    :database_id db-id
                    :status [:not= :unprovisioned])
    (throw (ex-info "Cannot delete a Database with active workspace_database rows; deprovision them first"
                    {:status-code 409
                     :database_id db-id})))
  (t2/delete! :model/WorkspaceDatabase :database_id db-id :status :unprovisioned))
