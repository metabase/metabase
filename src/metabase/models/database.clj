(ns metabase.models.database
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.db :refer :all]
            (metabase.models [common :refer [assoc-permissions-sets]]
                             [interface :refer :all])))

(defrecord DatabaseInstance []
  ;; preserve normal IFn behavior so things like ((sel :one Database) :id) work correctly
  clojure.lang.IFn
  (invoke [this k]
    (get this k))

  IModelInstanceApiSerialize
  (api-serialize [this]
    ;; If current user isn't an admin strip out DB details which may include things like password
    (cond-> this
      (not (:is_superuser @*current-user*)) (dissoc :details))))

(defentity Database
  [(table :metabase_database)
   (types {:details :json
           :engine  :keyword})
   timestamped
   (assoc :hydration-keys #{:database
                            :db})]
  (post-select [_ db]
    (map->DatabaseInstance
     (assoc db
            :can_read  (delay true)
            :can_write (delay (:is_superuser @*current-user*)))))

  (pre-cascade-delete [_ {:keys [id] :as database}]
    (cascade-delete 'metabase.models.table/Table :db_id id)))
