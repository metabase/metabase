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
  (when-let [{superuser? :is_superuser} (sel :one [User :is_superuser] :id user-id)]
    (if superuser? :admin
        (when-let [{admin? :admin} (sel :one [OrgPerm :admin] :user_id user-id :organization_id org-id)]
          (if admin? :admin :default)))))

(defmethod post-select User [_ {:keys [id] :as user}]
  (-> user
      (assoc :org_perms (sel-fn :many OrgPerm :user_id id)
             :perms-for-org (memoize (partial user-perms-for-org id))
             :common_name (str (:first_name user) " " (:last_name user)))))

(defmethod pre-insert User [_ {:keys [email password] :as user}]
  (assert (util/is-email? email))
  (assert (and (string? password)
               (not (clojure.string/blank? password))))
  (assert (not (:password_salt user))
          "Don't try to pass an encrypted password to (ins User). Password encryption is handled by pre-insert.")
  (let [salt (.toString (java.util.UUID/randomUUID))
        defaults {:date_joined (util/new-sql-timestamp)
                  :last_login (util/new-sql-timestamp)
                  :is_staff true
                  :is_active true
                  :is_superuser false}]
    ;; always salt + encrypt the password before put new User in the DB
    (merge defaults user {:password_salt salt
                          :password (creds/hash-bcrypt (str salt password))})))

(defmethod pre-update User [_ {:keys [email] :as user}]
  (when email
    (assert (util/is-email? email)))
  user)

(defmethod pre-cascade-delete User [_ {:keys [id]}]
  (cascade-delete 'metabase.models.org-perm/OrgPerm :user_id id)
  (cascade-delete 'metabase.models.session/Session :user_id id))


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
