(ns metabase.models.user
  (:require [cemerick.friend.credentials :as creds]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer :all]
                             [org-perm :refer [OrgPerm]])
            [metabase.util :as util]))

(defentity User
  (table :core_user)
  (has-many OrgPerm {:fk :user_id}))

;; fields to return for Users other `*than current-user*`
(defmethod default-fields User [_]
  [:id
   :email
   :date_joined
   :first_name
   :last_name
   :last_login
   :is_superuser])

(def current-user-fields
  "The fields we should return for `*current-user*` (used by `metabase.middleware.current-user`)"
  (concat (default-fields User)
          [:is_active
           :is_staff])) ; but not `password` !

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
      (assoc :org_perms (sel-fn :many OrgPerm :user_id id)
             :perms-for-org (memoize (partial user-perms-for-org id))
             :common_name (str (:first_name user) " " (:last_name user)))))

(defmethod pre-insert User [_ user]
  (let [defaults {:date_joined (util/new-sql-date)
                  :last_login (util/new-sql-date)
                  :is_staff true
                  :is_active true
                  :is_superuser false}]
    (merge defaults user)))


(defn set-user-password
  "Updates the stored password for a specified `User` by hashing the password with a random salt."
  [user-id password]
  (let [salt (.toString (java.util.UUID/randomUUID))
        password (creds/hash-bcrypt (str salt password))]
    ;; NOTE: any password change expires the password reset token
    (upd User user-id
      :password_salt salt
      :password password
      :reset_token nil
      :reset_triggered nil)))


(defn users-for-org
  "Selects the ID and NAME for all users available to the given org-id."
  [org-id]
  (->>
    (sel :many [User :id :first_name :last_name]
      (where {:id [in (subselect OrgPerm (fields :user_id) (where {:organization_id org-id}))]}))
    (map #(select-keys % [:id :common_name]))
    (map #(clojure.set/rename-keys % {:common_name :name}))))
