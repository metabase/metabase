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

 {:created_at #inst "2015-06-30T19:51:45.294000000-00:00",
   :engine :h2,
   :id 3,
   :details
   {:db
    "file:/Users/camsaul/metabase/target/Test_Database;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"},
   :updated_at #inst "2015-06-30T19:51:45.294000000-00:00",
   :name "Test Database",
   :organization_id nil,
   :description nil}

{:description nil,
   :organization_id nil,
   :name "Test Database",
   :updated_at #inst "2015-06-30T19:51:45.294000000-00:00",
   :details
   {:db
    "file:/Users/camsaul/metabase/target/Test_Database;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"},
   :id 3,
   :engine "h2",
   :created_at #inst "2015-06-30T19:51:45.294000000-00:00"}


(defmethod pre-cascade-delete Database [_ {:keys [id] :as database}]
  (cascade-delete 'metabase.models.table/Table :db_id id))
