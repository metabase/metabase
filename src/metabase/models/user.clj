(ns metabase.models.user
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org-perm :refer [OrgPerm]]))

(defentity User
  (table :core_user)
  (has-many OrgPerm {:fk :user_id}))

(defmethod post-select User [_ {:keys [id] :as result}]
  (-> result
      (dissoc :password)
      (assoc :org_perms (sel-fn :many OrgPerm :user_id id))))
