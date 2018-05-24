(ns metabase.models.user
    (:require [cemerick.friend.credentials :as creds]
              [clojure.string :as s]
              [clojure.tools.logging :as log]
              [metabase
               [public-settings :as public-settings]
               [util :as u]]
              [metabase.email.messages :as email]
              [metabase.models
               [permissions-group :as group]
               [permissions-group-membership :as perm-membership :refer [PermissionsGroupMembership]]]
              [toucan
               [db :as db]
               [models :as models]])
    (:import java.util.UUID))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel User :core_user)

(defn- pre-insert [{:keys [email password reset_token] :as user}]
  (assert (u/is-email? email)
          (format "Not a valid email: '%s'" email))
  (assert (and (string? password)
               (not (s/blank? password))))
  (assert (not (:password_salt user))
          "Don't try to pass an encrypted password to (insert! User). Password encryption is handled by pre-insert.")
  (let [salt     (str (UUID/randomUUID))
        defaults {:date_joined  (u/new-sql-timestamp)
                  :last_login   nil
                  :is_active    true
                  :is_superuser false}]
    ;; always salt + encrypt the password before putting new User in the DB
    ;; TODO - we should do password encryption in pre-update too instead of in the session code
    (merge defaults user
           {:password_salt salt
            :password      (creds/hash-bcrypt (str salt password))}
           ;; if there's a reset token encrypt that as well
           (when reset_token
                 {:reset_token (creds/hash-bcrypt reset_token)}))))

(defn- post-insert [{user-id :id, superuser? :is_superuser, :as user}]
  (u/prog1 user
           ;; add the newly created user to the magic perms groups
           (binding [perm-membership/*allow-changing-all-users-group-members* true]
                    (log/info (format "Adding user %d to All Users permissions group..." user-id))
                    (db/insert! PermissionsGroupMembership
                                :user_id  user-id
                                :group_id (:id (group/all-users))))
           (when superuser?
                 (log/info (format "Adding user %d to Admin permissions group..." user-id))
                 (db/insert! PermissionsGroupMembership
                             :user_id  user-id
                             :group_id (:id (group/admin))))))

(defn- pre-update [{:keys [email reset_token is_superuser id] :as user}]
  ;; when `:is_superuser` is toggled add or remove the user from the 'Admin' group as appropriate
  (when-not (nil? is_superuser)
            (let [membership-exists? (db/exists? PermissionsGroupMembership
                                                 :group_id (:id (group/admin))
                                                 :user_id  id)]
              (cond
               (and is_superuser
                    (not membership-exists?)) (db/insert! PermissionsGroupMembership
                                                          :group_id (:id (group/admin))
                                                          :user_id  id)
               (and (not is_superuser)
                    membership-exists?)       (db/simple-delete! PermissionsGroupMembership ; don't use `delete!` here because that does the opposite and tries to update this user
                                                                 :group_id (:id (group/admin))               ; which leads to a stack overflow of calls between the two
                                                                 :user_id  id))))                            ; TODO - could we fix this issue by using `post-delete!`?
  (when email
        (assert (u/is-email? email)))
  ;; If we're setting the reset_token then encrypt it before it goes into the DB
  (cond-> user
          reset_token (assoc :reset_token (creds/hash-bcrypt reset_token))))

(defn- post-select [{:keys [first_name last_name], :as user}]
  (cond-> user
          (or first_name last_name) (assoc :common_name (str first_name " " last_name))))

(defn- pre-delete [{:keys [id]}]
  (binding [perm-membership/*allow-changing-all-users-group-members* true]
           (doseq [[model k] [['Activity                   :user_id]
                              ['Card                       :creator_id]
                              ['Card                       :made_public_by_id]
                              ['Dashboard                  :creator_id]
                              ['Dashboard                  :made_public_by_id]
                              ['Metric                     :creator_id]
                              ['Pulse                      :creator_id]
                              ['QueryExecution             :executor_id]
                              ['Revision                   :user_id]
                              ['Segment                    :creator_id]
                              ['Session                    :user_id]
                              [PermissionsGroupMembership :user_id]
                              ['PermissionsRevision        :user_id]
                              ['ViewLog                    :user_id]]]
             (db/delete! model k id))))

(u/strict-extend (class User)
                 models/IModel
                 (merge models/IModelDefaults
                        {:default-fields (constantly [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb])
                         :hydration-keys (constantly [:author :creator :user])
                         :pre-insert     pre-insert
                         :post-insert    post-insert
                         :pre-update     pre-update
                         :post-select    post-select
                         :pre-delete     pre-delete}))


;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(declare form-password-reset-url set-password-reset-token!)

(defn- send-welcome-email! [new-user invitor]
  (let [reset-token (set-password-reset-token! (u/get-id new-user))
        ;; the new user join url is just a password reset with an indicator that this is a first time user
        join-url    (str (form-password-reset-url reset-token) "#new")]
    (email/send-new-user-email! new-user invitor join-url)))

(defn invite-user!
  "Convenience function for inviting a new `User` and sending out the welcome email."
  [first-name last-name email-address password invitor]
  {:pre [(string? first-name) (string? last-name) (u/is-email? email-address) (u/maybe? string? password) (map? invitor)]}
  ;; create the new user
  (u/prog1 (db/insert! User
                       :email       email-address
                       :first_name  first-name
                       :last_name   last-name
                       :password    (or password (str (UUID/randomUUID))))
           (send-welcome-email! <> invitor)))

(defn create-new-google-auth-user!
  "Convenience for creating a new user via Google Auth. This account is considered active immediately; thus all active
  admins will recieve an email right away."
  [first-name last-name email-address]
  {:pre [(string? first-name) (string? last-name) (u/is-email? email-address)]}
  (u/prog1 (db/insert! User
                       :email       email-address
                       :first_name  first-name
                       :last_name   last-name
                       :password    (str (UUID/randomUUID))
                       :google_auth true)
           ;; send an email to everyone including the site admin if that's set
           (email/send-user-joined-admin-notification-email! <>, :google-auth? true)))

(defn create-new-ldap-auth-user!
  "Convenience for creating a new user via LDAP. This account is considered active immediately; thus all active admins
  will recieve an email right away."
  [first-name last-name email-address password]
  {:pre [(string? first-name) (string? last-name) (u/is-email? email-address)]}
  (db/insert! User :email      email-address
              :first_name first-name
              :last_name  last-name
              :password   password
              :ldap_auth  true))

(defn- reactivate-user! [existing-user first-name last-name]
  (when-not (:is_active existing-user)
            (db/update! User (u/get-id existing-user)
                        :first_name    first-name
                        :last_name     last-name
                        :is_active     true
                        :is_superuser  false
                        ;; if the user orignally logged in via Google Auth and it's no longer enabled, convert them into a regular user
                        ;; (see Issue #3323)
                        :google_auth   false
                        :ldap_auth     false))
  ;; now return the existing user whether they were originally active or not
  (User (u/get-id existing-user)))

(defn create-new-header-auth-user!
  "Convenience for creating a new user via LDAP. This account is considered active immediately; thus all active admins
  will recieve an email right away."
  [first-name last-name email-address is_superuser]
  {:pre [(string? first-name) (string? last-name) (u/is-email? email-address)]}
  (if-let [existing-user (db/select-one [User :id :is_active :google_auth], :email email-address)]
    ;; this user already exists but is inactive, so simply reactivate the account
    (reactivate-user! existing-user first-name last-name)
    ;; new user account, so create it
    (db/insert! User :email      email-address
                :first_name first-name
                :last_name  last-name
                :password   (str (UUID/randomUUID))
                :is_superuser is_superuser)))

(defn set-password!
  "Updates the stored password for a specified `User` by hashing the password with a random salt."
  [user-id password]
  (let [salt     (str (UUID/randomUUID))
        password (creds/hash-bcrypt (str salt password))]
    ;; NOTE: any password change expires the password reset token
    (db/update! User user-id
                :password_salt   salt
                :password        password
                :reset_token     nil
                :reset_triggered nil)))

(defn set-password-reset-token!
  "Updates a given `User` and generates a password reset token for them to use. Returns the URL for password reset."
  [user-id]
  {:pre [(integer? user-id)]}
  (u/prog1 (str user-id \_ (UUID/randomUUID))
           (db/update! User user-id
                       :reset_token     <>
                       :reset_triggered (System/currentTimeMillis))))

(defn form-password-reset-url
  "Generate a properly formed password reset url given a password reset token."
  [reset-token]
  {:pre [(string? reset-token)]}
  (str (public-settings/site-url) "/auth/reset_password/" reset-token))


;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn permissions-set
  "Return a set of all permissions object paths that USER-OR-ID has been granted access to."
  [user-or-id]
  (set (when-let [user-id (u/get-id user-or-id)]
         (map :object (db/query {:select [:p.object]
                                 :from   [[:permissions_group_membership :pgm]]
                                 :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                          [:permissions :p]        [:= :p.group_id :pg.id]]
                                 :where  [:= :pgm.user_id user-id]})))))
