(ns metabase.models.database
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.db :refer :all]
            [metabase.models.interface :refer :all]))

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

(extend-ICanReadWrite DatabaseInstance :read :always, :write :superuser)

(defentity Database
  [(table :metabase_database)
   (hydration-keys database db)
   (types :details :json, :engine :keyword)
   timestamped]

  (post-select [_ db]
    (map->DatabaseInstance db))

  (pre-cascade-delete [_ {:keys [id] :as database}]
    (cascade-delete 'metabase.models.table/Table :db_id id)))

(extend-ICanReadWrite DatabaseEntity :read :always, :write :superuser)
