(ns metabase.models.user
  (:require [clojure.data :as data]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.collection :as collection]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.permissions-group-membership :as perms-group-membership :refer [PermissionsGroupMembership]]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.session :refer [Session]]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n :refer [deferred-tru trs]]
            [metabase.util.password :as u.password]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models])
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
      :password      (u.password/hash-bcrypt (str salt password))}
     ;; lower-case the email before saving
     {:email (u/lower-case-en email)}
     ;; if there's a reset token encrypt that as well
     (when reset_token
       {:reset_token (u.password/hash-bcrypt reset_token)})
     ;; normalize the locale
     (when locale
       {:locale (i18n/normalized-locale-string locale)}))))

(defn- post-insert [{user-id :id, superuser? :is_superuser, :as user}]
  (u/prog1 user
    ;; add the newly created user to the magic perms groups
    (binding [perms-group-membership/*allow-changing-all-users-group-members* true]
      (log/info (trs "Adding User {0} to All Users permissions group..." user-id))
      (db/insert! PermissionsGroupMembership
        :user_id  user-id
        :group_id (:id (perms-group/all-users))))
    (when superuser?
      (log/info (trs "Adding User {0} to Admin permissions group..." user-id))
      (db/insert! PermissionsGroupMembership
        :user_id  user-id
        :group_id (:id (perms-group/admin))))))

(defn- pre-update
  [{reset-token :reset_token, superuser? :is_superuser, active? :is_active, :keys [email id locale], :as user}]
  ;; when `:is_superuser` is toggled add or remove the user from the 'Admin' group as appropriate
  (when (some? superuser?)
    (let [membership-exists? (db/exists? PermissionsGroupMembership
                               :group_id (:id (perms-group/admin))
                               :user_id  id)]
      (cond
        (and superuser?
             (not membership-exists?))
        (db/insert! PermissionsGroupMembership
          :group_id (u/the-id (perms-group/admin))
          :user_id  id)
        ;; don't use `delete!` here because that does the opposite and tries to update this user
        ;; which leads to a stack overflow of calls between the two
        ;; TODO - could we fix this issue by using `post-delete!`?
        (and (not superuser?)
             membership-exists?)
        (db/simple-delete! PermissionsGroupMembership
          :group_id (u/the-id (perms-group/admin))
          :user_id  id))))
  ;; make sure email and locale are valid if set
  (when email
    (assert (u/email? email)))
  (when locale
    (assert (i18n/available-locale? locale)))
  ;; delete all subscriptions to pulses/alerts/etc. if the User is getting archived (`:is_active` status changes)
  (when (false? active?)
    (db/delete! 'PulseChannelRecipient :user_id id))
  ;; If we're setting the reset_token then encrypt it before it goes into the DB
  (cond-> user
    reset-token (update :reset_token u.password/hash-bcrypt)
    locale      (update :locale i18n/normalized-locale-string)
    email       (update :email u/lower-case-en)))

(defn add-common-name
  "Add a `:common_name` key to `user` by combining their first and last names, or using their email if names are `nil`."
  [{:keys [first_name last_name email], :as user}]
  (let [common-name (if (or first_name last_name)
                      (str/trim (str first_name " " last_name))
                      email)]
    (cond-> user
      common-name (assoc :common_name common-name))))

(defn- post-select [user]
  (add-common-name user))

(def ^:private default-user-columns
  "Sequence of columns that are normally returned when fetching a User from the DB."
  [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb])

(def admin-or-self-visible-columns
  "Sequence of columns that we can/should return for admins fetching a list of all Users, or for the current user
  fetching themselves. Needed to power the admin page."
  (into default-user-columns [:google_auth :ldap_auth :sso_source :is_active :updated_at :login_attributes :locale]))

(def non-admin-or-self-visible-columns
  "Sequence of columns that we will allow non-admin Users to see when fetching a list of Users. Why can non-admins see
  other Users at all? I honestly would prefer they couldn't, but we need to give them a list of emails to power
  Pulses."
  [:id :email :first_name :last_name])

(def group-manager-visible-columns
  "Sequence of columns Group Managers can see when fetching a list of Users.."
  (into non-admin-or-self-visible-columns [:is_superuser :last_login]))

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
          :types          (constantly {:login_attributes :json-no-keywordization
                                       :settings         :encrypted-json})})
  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:email])})

(defn group-ids
  "Fetch set of IDs of PermissionsGroup a User belongs to."
  [user-or-id]
  (when user-or-id
    (db/select-field :group_id PermissionsGroupMembership :user_id (u/the-id user-or-id))))

(def UserGroupMembership
  "Group Membership info of a User.
  In which :is_group_manager is only included if `advanced-permissions` is enabled."
  {:id                                su/IntGreaterThanZero
   ;; is_group_manager only included if `advanced-permissions` is enabled
   (s/optional-key :is_group_manager) s/Bool})

(s/defn user-group-memberships :- (s/maybe [UserGroupMembership])
  "Return a list of group memberships a User belongs to.
  Group membership is a map  with 2 keys [:id :is_group_manager], in which `is_group_manager` will only returned if
  advanced-permissions is available."
  [user-or-id]
  (when user-or-id
    (let [selector (cond-> [PermissionsGroupMembership [:group_id :id]]
                     (premium-features/enable-advanced-permissions?)
                     (conj :is_group_manager))]
      (db/select selector :user_id (u/the-id user-or-id)))))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn permissions-set
  "Return a set of all permissions object paths that `user-or-id` has been granted access to. (2 DB Calls)"
  [user-or-id]
  (set (when-let [user-id (u/the-id user-or-id)]
         (concat
          ;; Current User always gets readwrite perms for their Personal Collection and for its descendants! (1 DB Call)
          (map perms/collection-readwrite-path (collection/user->personal-collection-and-descendant-ids user-or-id))
          ;; include the other Perms entries for any Group this User is in (1 DB Call)
          (map :object (db/query {:select [:p.object]
                                  :from   [[:permissions_group_membership :pgm]]
                                  :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                           [:permissions :p]        [:= :p.group_id :pg.id]]
                                  :where  [:= :pgm.user_id user-id]}))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn add-user-group-memberships
  "Add to each `user` a list of Group Memberships Info with each item is a map with 2 keys [:id :is_group_manager].
  In which `is_group_manager` is only added when `advanced-permissions` is enabled."
  {:batched-hydrate :user_group_memberships}
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (db/select [PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager]
                                                             :user_id [:in (set (map u/the-id users))]))
          membership->group    (fn [membership]
                                 (select-keys membership
                                              [:id (when (premium-features/enable-advanced-permissions?)
                                                     :is_group_manager)]))]
      (for [user users]
        (assoc user :user_group_memberships (map membership->group (user-id->memberships (u/the-id user))))))))

(defn add-group-ids
  "Efficiently add PermissionsGroup `group_ids` to a collection of `users`.
  TODO: deprecate :group_ids and use :user_group_memberships instead"
  {:batched-hydrate :group_ids}
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (db/select [PermissionsGroupMembership :user_id :group_id]
                                                    :user_id [:in (set (map u/the-id users))]))]
      (for [user users]
        (assoc user :group_ids (set (map :group_id (user-id->memberships (u/the-id user)))))))))

(defn add-has-invited-second-user
  "Adds the `has_invited_second_user` flag to a collection of `users`. This should be `true` for only the user who
  underwent the initial app setup flow (with an ID of 1), iff more than one user exists. This is used to modify
  the wording for this user on a homepage banner that prompts them to add their database."
  {:batched-hydrate :has_invited_second_user}
  [users]
  (when (seq users)
    (let [user-count (db/count User)]
      (for [user users]
        (assoc user :has_invited_second_user (and (= (:id user) 1)
                                                  (> user-count 1)))))))

(defn add-is-installer
  "Adds the `is_installer` flag to a collection of `users`. This should be `true` for only the user who
  underwent the initial app setup flow (with an ID of 1). This is used to modify the experience of the
  starting page for users."
  {:batched-hydrate :is_installer}
  [users]
  (when (seq users)
    (for [user users]
      (assoc user :is_installer (= (:id user) 1)))))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(declare form-password-reset-url set-password-reset-token!)

(defn- send-welcome-email! [new-user invitor sent-from-setup?]
  (let [reset-token               (set-password-reset-token! (u/the-id new-user))
        should-link-to-login-page (and (public-settings/sso-configured?)
                                       (not (public-settings/enable-password-login)))
        join-url                  (if should-link-to-login-page
                                    (str (public-settings/site-url) "/auth/login")
                                    ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
                                    (str (form-password-reset-url reset-token) "#new"))]
    (classloader/require 'metabase.email.messages)
    ((resolve 'metabase.email.messages/send-new-user-email!) new-user invitor join-url sent-from-setup?)))

(def LoginAttributes
  "Login attributes, currently not collected for LDAP or Google Auth. Will ultimately be stored as JSON."
  (su/with-api-error-message
      {su/KeywordOrString s/Any}
    (deferred-tru "login attribute keys must be a keyword or string")))

(def NewUser
  "Required/optionals parameters needed to create a new user (for any backend)"
  {(s/optional-key :first_name)       (s/maybe su/NonBlankString)
   (s/optional-key :last_name)        (s/maybe su/NonBlankString)
   :email                             su/Email
   (s/optional-key :password)         (s/maybe su/NonBlankString)
   (s/optional-key :login_attributes) (s/maybe LoginAttributes)
   (s/optional-key :google_auth)      s/Bool
   (s/optional-key :ldap_auth)        s/Bool})

(def ^:private Invitor
  "Map with info about the admin creating the user, used in the new user notification code"
  {:email      su/Email
   :first_name (s/maybe su/NonBlankString)
   s/Any       s/Any})

(s/defn ^:private insert-new-user!
  "Creates a new user, defaulting the password when not provided"
  [new-user :- NewUser]
  (db/insert! User (update new-user :password #(or % (str (UUID/randomUUID))))))

(s/defn create-and-invite-user!
  "Convenience function for inviting a new `User` and sending out the welcome email."
  [new-user :- NewUser, invitor :- Invitor, setup? :- s/Bool]
  ;; create the new user
  (u/prog1 (insert-new-user! new-user)
    (send-welcome-email! <> invitor setup?)))

(s/defn create-new-google-auth-user!
  "Convenience for creating a new user via Google Auth. This account is considered active immediately; thus all active
  admins will receive an email right away."
  [new-user :- NewUser]
  (u/prog1 (insert-new-user! (assoc new-user :google_auth true))
    ;; send an email to everyone including the site admin if that's set
    (classloader/require 'metabase.email.messages)
    ((resolve 'metabase.email.messages/send-user-joined-admin-notification-email!) <>, :google-auth? true)))

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
        password (u.password/hash-bcrypt (str salt password))]
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
  (let [user-id            (u/the-id user-or-id)
        old-group-ids      (group-ids user-id)
        new-group-ids      (set (map u/the-id new-groups-or-ids))
        [to-remove to-add] (data/diff old-group-ids new-group-ids)]
    (when (seq (concat to-remove to-add))
      (db/transaction
       (when (seq to-remove)
         (db/delete! PermissionsGroupMembership :user_id user-id, :group_id [:in to-remove]))
       ;; a little inefficient, but we need to do a separate `insert!` for each group we're adding membership to,
       ;; because `insert-many!` does not currently trigger methods such as `pre-insert`. We rely on those methods to
       ;; do things like automatically set the `is_superuser` flag for a User
       (doseq [group-id to-add]
         (db/insert! PermissionsGroupMembership {:user_id user-id, :group_id group-id}))))
    true))
