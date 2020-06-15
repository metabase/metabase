(ns metabase.models.user
  (:require [cemerick.friend.credentials :as creds]
            [clojure
             [data :as data]
             [string :as str]]
            [clojure.tools.logging :as log]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.email.messages :as email]
            [metabase.models
             [collection :as collection]
             [permissions :as perms]
             [permissions-group :as group]
             [permissions-group-membership :as perm-membership :refer [PermissionsGroupMembership]]
             [session :refer [Session]]]
            [metabase.util
             [i18n :as i18n :refer [deferred-tru trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]])
  (:import java.util.UUID))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel User :core_user)

(defn- pre-insert [{:keys [email password reset_token locale], :as user}]
  ;; these assertions aren't meant to be user-facing, the API endpoints should be validation these as well.
  (assert (u/email? email))
  (assert ((every-pred string? (complement str/blank?)) password))
  (assert (not (:password_salt user))
          "Don't try to pass an encrypted password to (insert! User). Password encryption is handled by pre-insert.")
  (when locale
    (assert (i18n/available-locale? locale)))
  (let [salt     (str (UUID/randomUUID))
        defaults {:date_joined  :%now
                  :last_login   nil
                  :is_active    true
                  :is_superuser false}]
    ;; always salt + encrypt the password before putting new User in the DB
    ;; TODO - we should do password encryption in pre-update too instead of in the session code
    (merge
     defaults
     user
     {:password_salt salt
      :password      (creds/hash-bcrypt (str salt password))}
     ;; if there's a reset token encrypt that as well
     (when reset_token
       {:reset_token (creds/hash-bcrypt reset_token)})
     ;; normalize the locale
     (when locale
       {:locale (i18n/normalized-locale-string locale)}))))

(defn- post-insert [{user-id :id, superuser? :is_superuser, :as user}]
  (u/prog1 user
    ;; add the newly created user to the magic perms groups
    (binding [perm-membership/*allow-changing-all-users-group-members* true]
      (log/info (trs "Adding User {0} to All Users permissions group..." user-id))
      (db/insert! PermissionsGroupMembership
        :user_id  user-id
        :group_id (:id (group/all-users))))
    (when superuser?
      (log/info (trs "Adding User {0} to Admin permissions group..." user-id))
      (db/insert! PermissionsGroupMembership
        :user_id  user-id
        :group_id (:id (group/admin))))))

(defn- pre-update [{:keys [email reset_token is_superuser id locale] :as user}]
  ;; when `:is_superuser` is toggled add or remove the user from the 'Admin' group as appropriate
  (when-not (nil? is_superuser)
    (let [membership-exists? (db/exists? PermissionsGroupMembership
                               :group_id (:id (group/admin))
                               :user_id  id)]
      (cond
        (and is_superuser
             (not membership-exists?))
        (db/insert! PermissionsGroupMembership
          :group_id (u/get-id (group/admin))
          :user_id  id)

        ;; don't use `delete!` here because that does the opposite and tries to update this user
        ;; which leads to a stack overflow of calls between the two
        ;; TODO - could we fix this issue by using `post-delete!`?
        (and (not is_superuser)
             membership-exists?)
        (db/simple-delete! PermissionsGroupMembership
          :group_id (u/get-id (group/admin))
          :user_id  id))))
  (when email
    (assert (u/email? email)))
  (when locale
    (assert (i18n/available-locale? locale)))
  ;; If we're setting the reset_token then encrypt it before it goes into the DB
  (cond-> user
    reset_token (update :reset_token creds/hash-bcrypt)
    locale      (update :locale i18n/normalized-locale-string)))

(defn add-common-name
  "Add a `:common_name` key to `user` by combining their first and last names."
  [{:keys [first_name last_name], :as user}]
  (cond-> user
    (or first_name last_name) (assoc :common_name (str first_name " " last_name))))

(defn- post-select [user]
  (add-common-name user))

(def ^:private default-user-columns
  "Sequence of columns that are normally returned when fetching a User from the DB."
  [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb])

(def admin-or-self-visible-columns
  "Sequence of columns that we can/should return for admins fetching a list of all Users, or for the current user
  fetching themselves. Needed to power the admin page."
  (into default-user-columns [:google_auth :ldap_auth :is_active :updated_at :login_attributes :locale]))

(def non-admin-or-self-visible-columns
  "Sequence of columns that we will allow non-admin Users to see when fetching a list of Users. Why can non-admins see
  other Users at all? I honestly would prefer they couldn't, but we need to give them a list of emails to power
  Pulses."
  [:id :email :first_name :last_name])

(u/strict-extend (class User)
  models/IModel
  (merge models/IModelDefaults
         {:default-fields (constantly default-user-columns)
          :hydration-keys (constantly [:author :creator :user])
          :properties     (constantly {:updated-at-timestamped? true})
          :pre-insert     pre-insert
          :post-insert    post-insert
          :pre-update     pre-update
          :post-select    post-select
          :types          (constantly {:login_attributes :json-no-keywordization})}))

(defn group-ids
  "Fetch set of IDs of PermissionsGroup a User belongs to."
  [user-or-id]
  (when user-or-id
    (db/select-field :group_id PermissionsGroupMembership :user_id (u/get-id user-or-id))))

(defn add-group-ids
  "Efficiently add PermissionsGroup `group_ids` to a collection of `users`."
  {:batched-hydrate :group_ids}
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (db/select [PermissionsGroupMembership :user_id :group_id]
                                                    :user_id [:in (set (map u/get-id users))]))]
      (for [user users]
        (assoc user :group_ids (set (map :group_id (user-id->memberships (u/get-id user)))))))))


;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(declare form-password-reset-url set-password-reset-token!)

(defn- send-welcome-email! [new-user invitor]
  (let [reset-token (set-password-reset-token! (u/get-id new-user))
        ;; the new user join url is just a password reset with an indicator that this is a first time user
        join-url    (str (form-password-reset-url reset-token) "#new")]
    (email/send-new-user-email! new-user invitor join-url)))

(def LoginAttributes
  "Login attributes, currently not collected for LDAP or Google Auth. Will ultimately be stored as JSON."
  (su/with-api-error-message
      {su/KeywordOrString s/Any}
    (deferred-tru "login attribute keys must be a keyword or string")))

(def NewUser
  "Required/optionals parameters needed to create a new user (for any backend)"
  {:first_name                        su/NonBlankString
   :last_name                         su/NonBlankString
   :email                             su/Email
   (s/optional-key :password)         (s/maybe su/NonBlankString)
   (s/optional-key :login_attributes) (s/maybe LoginAttributes)
   (s/optional-key :google_auth)      s/Bool
   (s/optional-key :ldap_auth)        s/Bool})

(def ^:private Invitor
  "Map with info about the admin admin creating the user, used in the new user notification code"
  {:email      su/Email
   :first_name su/NonBlankString
   s/Any       s/Any})

(s/defn ^:private insert-new-user!
  "Creates a new user, defaulting the password when not provided"
  [new-user :- NewUser]
  (db/insert! User (update new-user :password #(or % (str (UUID/randomUUID))))))

(s/defn create-and-invite-user!
  "Convenience function for inviting a new `User` and sending out the welcome email."
  [new-user :- NewUser, invitor :- Invitor]
  ;; create the new user
  (u/prog1 (insert-new-user! new-user)
    (send-welcome-email! <> invitor)))

(s/defn create-new-google-auth-user!
  "Convenience for creating a new user via Google Auth. This account is considered active immediately; thus all active
  admins will receive an email right away."
  [new-user :- NewUser]
  (u/prog1 (insert-new-user! (assoc new-user :google_auth true))
    ;; send an email to everyone including the site admin if that's set
    (email/send-user-joined-admin-notification-email! <>, :google-auth? true)))

(s/defn create-new-ldap-auth-user!
  "Convenience for creating a new user via LDAP. This account is considered active immediately; thus all active admins
  will receive an email right away."
  [new-user :- NewUser]
  (insert-new-user!
   (-> new-user
       ;; We should not store LDAP passwords
       (dissoc :password)
       (assoc :ldap_auth true))))

(defn set-password!
  "Updates the stored password for a specified `User` by hashing the password with a random salt."
  [user-id password]
  (let [salt     (str (UUID/randomUUID))
        password (creds/hash-bcrypt (str salt password))]
    ;; when changing/resetting the password, kill any existing sessions
    (db/simple-delete! Session :user_id user-id)
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

(defn set-permissions-groups!
  "Set the user's group memberships to equal the supplied group IDs. Returns `true` if updates were made, `nil`
  otherwise."
  [user-or-id new-groups-or-ids]
  (let [user-id            (u/get-id user-or-id)
        old-group-ids      (group-ids user-id)
        new-group-ids      (set (map u/get-id new-groups-or-ids))
        [to-remove to-add] (data/diff old-group-ids new-group-ids)]
    (when (seq (concat to-remove to-add))
      (db/transaction
        (when (seq to-remove)
          (db/delete! PermissionsGroupMembership :user_id user-id, :group_id [:in to-remove]))
        ;; a little inefficient, but we need to do a separate `insert!` for each group we're adding membership to,
        ;; because `insert-many!` does not currently trigger methods such as `pre-insert`. We rely on those methods to
        ;; do things like automatically set the `is_superuser` flag for a User
        (doseq [group-id to-add]
          (db/insert! PermissionsGroupMembership {:user_id user-id, :group_id group-id})))
      true)))


;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn permissions-set
  "Return a set of all permissions object paths that `user-or-id` has been granted access to. (2 DB Calls)"
  [user-or-id]
  (set (when-let [user-id (u/get-id user-or-id)]
         (concat
          ;; Current User always gets readwrite perms for their Personal Collection and for its descendants! (1 DB Call)
          (map perms/collection-readwrite-path (collection/user->personal-collection-and-descendant-ids user-or-id))
          ;; include the other Perms entries for any Group this User is in (1 DB Call)
          (map :object (db/query {:select [:p.object]
                                  :from   [[:permissions_group_membership :pgm]]
                                  :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                           [:permissions :p]        [:= :p.group_id :pg.id]]
                                  :where  [:= :pgm.user_id user-id]}))))))
