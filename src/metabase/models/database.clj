(ns metabase.models.database
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org :refer [Org org-can-read org-can-write]]))


(defentity Database
  (table :metabase_database)
  (types {:details :json
          :engine  :keyword})
  timestamped
  (assoc :hydration-keys #{:database
                           :db}))

(defmethod post-select Database [_ {:keys [organization_id] :as db}]
  (assoc db
         :organization (delay (sel :one Org :id organization_id))
         :can_read     (delay (org-can-read organization_id))
         :can_write    (delay (org-can-write organization_id))))

(defmethod pre-cascade-delete Database [_ {:keys [id]}]
  (cascade-delete 'metabase.models.table/Table :db_id id)
  (cascade-delete 'metabase.models.query/Query :database_id id))

(defn databases-for-org
  "Selects the ID and NAME for all databases available to the given org-id."
  [org-id]
  (when-let [org (sel :one Org :id org-id)]
    (if (:inherits org)
      ;; inheriting orgs see ALL databases
      (sel :many [Database :id :name] (order :name :ASC))
      ;; otherwise filter by org-id
      (sel :many [Database :id :name] :organization_id org-id (order :name :ASC)))))
