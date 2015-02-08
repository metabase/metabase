(ns metabase.models.user
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org-perm :refer [OrgPerm]]))

(defentity User
  (table :core_user)
  (has-many OrgPerm {:fk :user_id}))

(defmethod default-fields User [_]
  [:id
   :date_joined
   :first_name
   :is_active
   :is_staff
   :is_superuser
   :last_login
   :last_name]) ; don't return :password!

(defmethod post-select User [_ {:keys [id] :as user}]
  (-> user
      (assoc :org_perms (sel-fn :many OrgPerm :user_id id))))
