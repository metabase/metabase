(ns metabase.models.user
  (:require [cemerick.friend.credentials :as creds]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.email.messages :as email]
            (metabase.models [org-perm :refer [OrgPerm]])
            [metabase.util :as u]))

;; ## Enity + DB Multimethods

(defentity User
  (table :core_user)
  (has-many OrgPerm {:fk :user_id})
  (assoc :hydration-keys #{:author :creator :user}))

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
      (assoc :org_perms     (delay (sel :many OrgPerm :user_id id))
             :perms-for-org (memoize (partial user-perms-for-org id))
             :common_name   (str (:first_name user) " " (:last_name user)))))

(defmethod pre-insert User [_ {:keys [email password] :as user}]
  (assert (u/is-email? email))
  (assert (and (string? password)
               (not (clojure.string/blank? password))))
  (assert (not (:password_salt user))
          "Don't try to pass an encrypted password to (ins User). Password encryption is handled by pre-insert.")
  (let [salt (.toString (java.util.UUID/randomUUID))
        defaults {:date_joined (u/new-sql-timestamp)
                  :last_login (u/new-sql-timestamp)
                  :is_staff true
                  :is_active true
                  :is_superuser false}]
    ;; always salt + encrypt the password before put new User in the DB
    (merge defaults user {:password_salt salt
                          :password (creds/hash-bcrypt (str salt password))})))

(defmethod pre-update User [_ {:keys [email] :as user}]
  (when email
    (assert (u/is-email? email)))
  user)

(defmethod pre-cascade-delete User [_ {:keys [id]}]
  (cascade-delete 'metabase.models.org-perm/OrgPerm :user_id id)
  (cascade-delete 'metabase.models.session/Session :user_id id)
  (cascade-delete 'metabase.models.emailreport-recipients/EmailReportRecipients :user_id id))


;; ## Related Functions

(defn create-user
  "Convenience function for creating a new `User` and sending out the welcome email."
  [first-name last-name email-address & {:keys [send-welcome reset-url]
                                         :or {send-welcome false}}]
  {:pre [(string? first-name)
         (string? last-name)
         (string? email-address)]}
  (when-let [new-user (ins User
                        :email email-address
                        :first_name first-name
                        :last_name last-name
                        :password (str (java.util.UUID/randomUUID)))]
    (if send-welcome
      (email/send-new-user-email first-name email-address reset-url))
    ;; return the newly created user
    new-user))

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
