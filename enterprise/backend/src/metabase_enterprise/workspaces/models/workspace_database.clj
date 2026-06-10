(ns metabase-enterprise.workspaces.models.workspace-database
  (:require
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
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
;;; - read:          Data Analyst.
;;; - write/create:  Data Analyst + `:perms/workspaces :yes` for `:database_id`.

(defmethod mi/can-read? :model/WorkspaceDatabase
  ([_instance]
   (api/is-data-analyst?))
  ([_model _pk]
   (api/is-data-analyst?)))

(defmethod mi/can-write? :model/WorkspaceDatabase
  ([{:keys [database_id]}]
   (and (api/is-data-analyst?)
        (perms/has-db-workspaces-permission? api/*current-user-id* database_id)))
  ([_model pk]
   (when-let [wsd (t2/select-one :model/WorkspaceDatabase :id pk)]
     (mi/can-write? wsd))))

(defmethod mi/can-create? :model/WorkspaceDatabase
  [_model {:keys [database_id]}]
  (and (api/is-data-analyst?)
       (perms/has-db-workspaces-permission? api/*current-user-id* database_id)))

;;; ------------------------------------------ Database discovery ------------------------------------------

(defn eligible-databases
  "Return every Database that can participate in a workspace: the driver supports the
   `:workspace` feature and the database-local `database-enable-workspaces` setting is
   enabled for that database."
  []
  (into []
        (filter (fn [db]
                  (and (get-in db [:settings :database-enable-workspaces])
                       (driver.u/supports? (:engine db) :workspace db))))
        (t2/select :model/Database {:order-by [[:id :asc]]})))

(defn- database-input-schemas
  "Derive the input schemas for an auto-discovered workspace database: every distinct
   schema of its active synced tables. Databases without schema support get `[]`."
  [db]
  (if (driver.u/supports? (:engine db) :schemas db)
    (->> (t2/select-fn-set :schema :model/Table
                           :db_id (:id db)
                           :active true
                           {:where [:not= :schema nil]})
         sort
         vec)
    []))

(defn create-workspace-database!
  "Insert the WorkspaceDatabase row attaching `database` to `workspace-id`, with
   server-managed defaults and input schemas derived from the database's synced
   tables. Returns the new row's id; the row starts `:unprovisioned`."
  [workspace-id database]
  (t2/insert-returning-pk! :model/WorkspaceDatabase
                           {:workspace_id     workspace-id
                            :database_id      (:id database)
                            :input_schemas    (database-input-schemas database)
                            :database_details {}
                            :output_namespace ""}))

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
