(ns metabase.models.database
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [*current-user*]]
            [metabase.db :refer :all]
            [metabase.models.common :refer [assoc-permissions-sets]]))


(defentity Database
  (table :metabase_database)
  (types {:details :json
          :engine  :keyword})
  timestamped
  (assoc :hydration-keys #{:database
                           :db}))

(defmethod post-select Database [_ db]
  (assoc db
         :can_read     (delay true)
         :can_write    (delay (:is_superuser @*current-user*))))

(defmethod pre-cascade-delete Database [_ {:keys [id] :as database}]
  (println (format "DATABASE %d IS GOING TO BE DESTROYED..." id))
  (cascade-delete 'metabase.models.table/Table :db_id id))
