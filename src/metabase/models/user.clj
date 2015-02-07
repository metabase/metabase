(ns metabase.models.user
  (:use korma.core
        [metabase.models.org-perm :only (OrgPerm)]))

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

(defmethod post-select User [_ {:keys [id] :as result}]
  (-> result
      (assoc :org_perms (sel-fn :many OrgPerm :user_id id))))
