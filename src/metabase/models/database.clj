(ns metabase.models.database
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.db :refer :all]
            [metabase.models.interface :refer :all]
            [metabase.util :as u]))

(def ^:const protected-password
  "**MetabasePass**")

(defrecord DatabaseInstance []
  ;; preserve normal IFn behavior so things like ((sel :one Database) :id) work correctly
  clojure.lang.IFn
  (invoke [this k]
    (get this k))

  IModelInstanceApiSerialize
  (api-serialize [this]
    ;; If current user isn't an admin strip out DB details which may include things like password
    (cond-> this
      (get-in this [:details :password])    (assoc-in [:details :password] protected-password)
      (not (:is_superuser @*current-user*)) (dissoc :details))))

(extend-ICanReadWrite DatabaseInstance :read :always, :write :superuser)

(defentity Database
  [(table :metabase_database)
   (hydration-keys database db)
   (types :details :json, :engine :keyword)
   timestamped]

  (post-select [_ {:keys [id] :as database}]
    (map->DatabaseInstance
      (u/assoc* database
        :tables (delay (sel :many 'metabase.models.table/Table :db_id id :active true (order :display_name :ASC))))))

  (pre-cascade-delete [_ {:keys [id] :as database}]
    (cascade-delete 'metabase.models.card/Card :database_id id)
    (cascade-delete 'metabase.models.table/Table :db_id id)))

(extend-ICanReadWrite DatabaseEntity :read :always, :write :superuser)
