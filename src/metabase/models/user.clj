(ns metabase.models.user
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org-perm :refer [OrgPerm]]))

(defentity User
  (table :core_user)
  (has-many OrgPerm {:fk :user_id}))

(defmethod default-fields User [_]
  [:id
   :email
   :date_joined
   :first_name
   :is_active
   :is_staff
   :is_superuser
   :last_login
   :last_name]) ; don't return :password!

(defn user-perms-for-org
  "Return the permissions level User with USER-ID has for Org with ORG-ID.
   nil      -> no permissions
   :default -> default permissions
   :admin   -> admin permissions"
  [user-id org-id]
  (let [{:keys [admin] :as op} (sel :one [OrgPerm :admin] :user_id user-id :organization_id org-id)]
    (when op
      (if admin :admin :default))))

(defmethod post-select User [_ {:keys [id] :as user}]
  (-> user
      (assoc :org_perms (sel-fn :many OrgPerm :user_id id))
      (assoc :perms-for-org (memoize (partial user-perms-for-org id)))))
