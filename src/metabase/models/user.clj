(ns metabase.models.user
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.integrations.common :as integrations.common]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-group-membership
    :as perms-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.serialization :as serdes]
   [metabase.models.session :refer [Session]]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.setup :as setup]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.default-fields :as t2.default-fields]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def User
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/User)

(methodical/defmethod t2/table-name :model/User [_model] :core_user)
(methodical/defmethod t2/model-for-automagic-hydration [:default :author]     [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :creator]    [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :updated_by] [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :user]       [_original-model _k] :model/User)

(doto :model/User
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/User
  {:login_attributes mi/transform-json-no-keywordization
   :settings         mi/transform-encrypted-json
   :sso_source       mi/transform-keyword
   :type             mi/transform-keyword})

(def ^:private allowed-user-types
  #{:internal :personal :api-key})

(def ^:private insert-default-values
  {:date_joined  :%now
   :last_login   nil
   :is_active    true
   :is_superuser false})

(defn- hashed-password-values
  "When User `:password` is specified for an `INSERT` or `UPDATE`, add a new `:password_salt`, and hash the password."
  [{:keys [password], :as user}]
  (when password
    (assert (not (:password_salt user))
            ;; this is dev-facing so it doesn't need to be i18n'ed
            "Don't try to pass an encrypted password to insert! or update!. Password encryption is handled by pre- methods.")
    (let [salt (str (random-uuid))]
      {:password_salt salt
       :password      (u.password/hash-bcrypt (str salt password))})))

(defn user-local-settings
  "Returns the user's settings (defaulting to an empty map) or `nil` if the user/user-id isn't set"
  [user-or-user-id]
  (when user-or-user-id
    (or
     (if (integer? user-or-user-id)
       (:settings (t2/select-one [User :settings] :id user-or-user-id))
       (:settings user-or-user-id))
     {})))

(t2/define-before-insert :model/User
  [{:keys [email password reset_token locale sso_source], :as user}]
  ;; these assertions aren't meant to be user-facing, the API endpoints should be validation these as well.
  (assert (u/email? email))
  (assert ((every-pred string? (complement str/blank?)) password))
  (when-let [user-type (:type user)]
    (assert
     (contains? allowed-user-types user-type)))
  (when locale
    (assert (i18n/available-locale? locale) (tru "Invalid locale: {0}" (pr-str locale))))
  (when (and sso_source (not (setup/has-user-setup)))
    ;; Only allow SSO users to be provisioned if the setup flow has been completed and an admin has been created
    (throw (Exception. (trs "Instance has not been initialized"))))
  (premium-features/airgap-check-user-count)
  (merge
   insert-default-values
   user
   (hashed-password-values user)
   ;; lower-case the email before saving
   {:email (u/lower-case-en email)}
   ;; if there's a reset token encrypt that as well
   (when reset_token
     {:reset_token (u.password/hash-bcrypt reset_token)})
   ;; normalize the locale
   (when locale
     {:locale (i18n/normalized-locale-string locale)})))

(t2/define-after-insert :model/User
  [{user-id :id, superuser? :is_superuser, :as user}]
  (u/prog1 user
    (let [current-version (:tag config/mb-version-info)]
      (log/infof "Setting User %s's last_acknowledged_version to %s, the current version" user-id current-version)
      ;; Can't use mw.session/with-current-user due to circular require
      (binding [api/*current-user-id*       user-id
                setting/*user-local-values* (delay (atom (user-local-settings user)))]
        (setting/set! :last-acknowledged-version current-version)))
    ;; add the newly created user to the magic perms groups.
    (log/infof "Adding User %s to All Users permissions group..." user-id)
    (when superuser?
      (log/infof "Adding User %s to All Users permissions group..." user-id))
    (let [groups (filter some? [(perms-group/all-users)
                                (when superuser? (perms-group/admin))])]
      (binding [perms-group-membership/*allow-changing-all-users-group-members* true]
        ;; do a 'simple' insert against the Table name so we don't trigger the after-insert behavior
        ;; for [[metabase.models.permissions-group-membership]]... we don't want it recursively trying to update
        ;; the user
        (t2/insert! (t2/table-name :model/PermissionsGroupMembership)
                    (for [group groups]
                      {:user_id  user-id
                       :group_id (u/the-id group)}))))))

(t2/define-before-update :model/User
  [{:keys [id] :as user}]
  ;; when `:is_superuser` is toggled add or remove the user from the 'Admin' group as appropriate
  (let [{reset-token :reset_token
         superuser? :is_superuser
         active? :is_active
         :keys [email locale]}    (t2/changes user)
        in-admin-group?           (t2/exists? PermissionsGroupMembership
                                              :group_id (:id (perms-group/admin))
                                              :user_id  id)]
    ;; Do not let the last admin archive themselves
    (when (and in-admin-group?
               (false? active?))
      (perms-group-membership/throw-if-last-admin!))
    (when (some? superuser?)
      (cond
        (and superuser?
             (not in-admin-group?))
        (t2/insert! (t2/table-name PermissionsGroupMembership)
                    :group_id (u/the-id (perms-group/admin))
                    :user_id  id)
        ;; don't use [[t2/delete!]] here because that does the opposite and tries to update this user which leads to a
        ;; stack overflow of calls between the two. TODO - could we fix this issue by using a `post-delete` method?
        (and (not superuser?)
             in-admin-group?)
        (t2/delete! (t2/table-name PermissionsGroupMembership)
                    :group_id (u/the-id (perms-group/admin))
                    :user_id  id)))
    ;; make sure email and locale are valid if set
    (when email
      (assert (u/email? email)))
    (when locale
      (assert (i18n/available-locale? locale) (tru "Invalid locale: {0}" (pr-str locale))))
    ;; delete all subscriptions to pulses/alerts/etc. if the User is getting archived (`:is_active` status changes)
    (when (false? active?)
      (t2/delete! 'PulseChannelRecipient :user_id id))
    ;; If we're setting the reset_token then encrypt it before it goes into the DB
    (cond-> user
      true        (merge (hashed-password-values (t2/changes user)))
      reset-token (update :reset_token u.password/hash-bcrypt)
      locale      (update :locale i18n/normalized-locale-string)
      email       (update :email u/lower-case-en))))

(defn add-common-name
  "Conditionally add a `:common_name` key to `user` by combining their first and last names, or using their email if names are `nil`.
  The key will only be added if `user` contains the required keys to derive it correctly."
  [{:keys [first_name last_name email], :as user}]
  ;; This logic is replicated in SQL in [[metabase-enterprise.query-reference-validation.api]]. If the below logic changes,
  ;; please update the EE ns as well.
  (let [common-name (if (or first_name last_name)
                      (str/trim (str first_name " " last_name))
                      email)]
    (cond-> user
      (and (contains? user :first_name)
           (contains? user :last_name)
           common-name)
      (assoc :common_name common-name))))

(t2/define-after-select :model/User
  [user]
  (add-common-name user))

(def ^:private default-user-columns
  "Sequence of columns that are normally returned when fetching a User from the DB."
  [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb])

(def admin-or-self-visible-columns
  "Sequence of columns that we can/should return for admins fetching a list of all Users, or for the current user
  fetching themselves. Needed to power the admin page."
  (into default-user-columns [:sso_source :is_active :updated_at :login_attributes :locale]))

(def non-admin-or-self-visible-columns
  "Sequence of columns that we will allow non-admin Users to see when fetching a list of Users. Why can non-admins see
  other Users at all? I honestly would prefer they couldn't, but we need to give them a list of emails to power
  Pulses."
  [:id :email :first_name :last_name])

(def group-manager-visible-columns
  "Sequence of columns Group Managers can see when fetching a list of Users.."
  (into non-admin-or-self-visible-columns [:is_superuser :last_login]))

(t2.default-fields/define-default-fields :model/User default-user-columns)

(defmethod serdes/hash-fields User
  [_user]
  [:email])

(defn group-ids
  "Fetch set of IDs of PermissionsGroup a User belongs to."
  [user-or-id]
  (when user-or-id
    (t2/select-fn-set :group_id PermissionsGroupMembership :user_id (u/the-id user-or-id))))

(def UserGroupMembership
  "Group Membership info of a User.
  In which :is_group_manager is only included if `advanced-permissions` is enabled."
  [:map
   [:id ms/PositiveInt]
   ;; is_group_manager only included if `advanced-permissions` is enabled
   [:is_group_manager {:optional true} :boolean]])

(defmethod mi/exclude-internal-content-hsql :model/User
  [_model & {:keys [table-alias]}]
  [:and [:not= (h2x/identifier :field table-alias :type) [:inline "internal"]]])

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn permissions-set
  "Return a set of all permissions object paths that `user-or-id` has been granted access to. (2 DB Calls)"
  [user-or-id]
  (set (when-let [user-id (u/the-id user-or-id)]
         (concat
          ;; Current User always gets readwrite perms for their Personal Collection and for its descendants! (1 DB Call)
          (map perms/collection-readwrite-path (collection/user->personal-collection-and-descendant-ids user-or-id))
          ;; include the other Perms entries for any Group this User is in (1 DB Call)
          (map :object (mdb.query/query {:select [:p.object]
                                         :from   [[:permissions_group_membership :pgm]]
                                         :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                                  [:permissions :p]        [:= :p.group_id :pg.id]]
                                         :where  [:= :pgm.user_id user-id]}))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-batched-hydration-method add-user-group-memberships
  :user_group_memberships
  "Add to each `user` a list of Group Memberships Info with each item is a map with 2 keys [:id :is_group_manager].
  In which `is_group_manager` is only added when `advanced-permissions` is enabled."
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (t2/select [PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager]
                                                             :user_id [:in (set (map u/the-id users))]))
          membership->group    (fn [membership]
                                 (select-keys membership
                                              [:id (when (premium-features/enable-advanced-permissions?)
                                                     :is_group_manager)]))]
      (for [user users]
        (assoc user :user_group_memberships (->> (user-id->memberships (u/the-id user))
                                                 (map membership->group)
                                                 ;; sort these so the id returned is consistent so our tests don't
                                                 ;; randomly fail
                                                 (sort-by :id)))))))

(mi/define-batched-hydration-method add-group-ids
  :group_ids
  "Efficiently add PermissionsGroup `group_ids` to a collection of `users`.
  TODO: deprecate :group_ids and use :user_group_memberships instead"
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (t2/select [PermissionsGroupMembership :user_id :group_id]
                                                    :user_id [:in (set (map u/the-id users))]))]
      (for [user users]
        (assoc user :group_ids (set (map :group_id (user-id->memberships (u/the-id user)))))))))

(mi/define-batched-hydration-method add-has-invited-second-user
  :has_invited_second_user
  "Adds the `has_invited_second_user` flag to a collection of `users`. This should be `true` for only the user who
  underwent the initial app setup flow (with an ID of 1), iff more than one user exists. This is used to modify
  the wording for this user on a homepage banner that prompts them to add their database."
  [users]
  (when (seq users)
    (let [user-count (t2/count User)]
      (for [user users]
        (assoc user :has_invited_second_user (and (= (:id user) 1)
                                                  (> user-count 1)))))))

(mi/define-batched-hydration-method add-is-installer
  :is_installer
  "Adds the `is_installer` flag to a collection of `users`. This should be `true` for only the user who
  underwent the initial app setup flow (with an ID of 1). This is used to modify the experience of the
  starting page for users."
  [users]
  (when (seq users)
    (for [user users]
      (assoc user :is_installer (= (:id user) 1)))))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(declare form-password-reset-url set-password-reset-token!)

(defn- send-welcome-email! [new-user invitor sent-from-setup?]
  (let [reset-token               (set-password-reset-token! (u/the-id new-user))
        should-link-to-login-page (and (public-settings/sso-enabled?)
                                       (not (public-settings/enable-password-login)))
        join-url                  (if should-link-to-login-page
                                    (str (public-settings/site-url) "/auth/login")
                                    ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
                                    (str (form-password-reset-url reset-token) "#new"))]
    (classloader/require 'metabase.email.messages)
    ((resolve 'metabase.email.messages/send-new-user-email!) new-user invitor join-url sent-from-setup?)))

(def LoginAttributes
  "Login attributes, currently not collected for LDAP or Google Auth. Will ultimately be stored as JSON."
  (mu/with-api-error-message
    [:map-of ms/KeywordOrString :any]
    (deferred-tru "login attribute keys must be a keyword or string")))

(def NewUser
  "Required/optionals parameters needed to create a new user (for any backend)"
  [:map
   [:first_name       {:optional true} [:maybe ms/NonBlankString]]
   [:last_name        {:optional true} [:maybe ms/NonBlankString]]
   [:email                             ms/Email]
   [:password         {:optional true} [:maybe ms/NonBlankString]]
   [:login_attributes {:optional true} [:maybe LoginAttributes]]
   [:sso_source       {:optional true} [:maybe ms/NonBlankString]]
   [:locale           {:optional true} [:maybe ms/KeywordOrString]]
   [:type             {:optional true} [:maybe ms/KeywordOrString]]])

(def ^:private Invitor
  "Map with info about the admin creating the user, used in the new user notification code"
  [:map
   [:email      ms/Email]
   [:first_name [:maybe ms/NonBlankString]]])

(mu/defn insert-new-user!
  "Creates a new user, defaulting the password when not provided"
  [new-user :- NewUser]
  (first (t2/insert-returning-instances! User (update new-user :password #(or % (str (random-uuid)))))))

(defn serdes-synthesize-user!
  "Creates a new user with a default password, when deserializing eg. a `:creator_id` field whose email address doesn't
  match any existing user."
  [new-user]
  (insert-new-user! new-user))

(mu/defn create-and-invite-user!
  "Convenience function for inviting a new `User` and sending out the welcome email."
  [new-user :- NewUser invitor :- Invitor setup? :- :boolean]
  ;; create the new user
  (u/prog1 (insert-new-user! new-user)
    (events/publish-event! :event/user-invited
                           {:object
                            (assoc <>
                                   :invite_method "email"
                                   :sso_source (:sso_source new-user))})
    (send-welcome-email! <> invitor setup?)))

(mu/defn create-new-google-auth-user!
  "Convenience for creating a new user via Google Auth. This account is considered active immediately; thus all active
  admins will receive an email right away."
  [new-user :- NewUser]
  (u/prog1 (insert-new-user! (assoc new-user :sso_source "google"))
    ;; send an email to everyone including the site admin if that's set
    (when (integrations.common/send-new-sso-user-admin-email?)
      (classloader/require 'metabase.email.messages)
      ((resolve 'metabase.email.messages/send-user-joined-admin-notification-email!) <>, :google-auth? true))))

(mu/defn create-new-ldap-auth-user!
  "Convenience for creating a new user via LDAP. This account is considered active immediately; thus all active admins
  will receive an email right away."
  [new-user :- NewUser]
  (insert-new-user!
   (-> new-user
       ;; We should not store LDAP passwords
       (dissoc :password)
       (assoc :sso_source "ldap"))))

;;; TODO -- it seems like maybe this should just be part of the [[pre-update]] logic whenever `:password` changes; then
;;; we can remove this function altogether.
(defn set-password!
  "Update the stored password for a specified `User`; kill any existing Sessions and wipe any password reset tokens.

  The password is automatically hashed with a random salt; this happens in [[hashed-password-values]] which is called
  by [[pre-insert]] or [[pre-update]])"
  [user-id password]
  ;; when changing/resetting the password, kill any existing sessions
  (t2/delete! (t2/table-name Session) :user_id user-id)
  ;; NOTE: any password change expires the password reset token
  (t2/update! User user-id
              {:password        password
               :reset_token     nil
               :reset_triggered nil}))

(defn set-password-reset-token!
  "Updates a given `User` and generates a password reset token for them to use. Returns the URL for password reset."
  [user-id]
  {:pre [(integer? user-id)]}
  (u/prog1 (str user-id \_ (random-uuid))
    (t2/update! User user-id
                {:reset_token     <>
                 :reset_triggered (System/currentTimeMillis)})))

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
      (t2/with-transaction [_conn]
       (when (seq to-remove)
         (t2/delete! PermissionsGroupMembership :user_id user-id, :group_id [:in to-remove]))
       ;; a little inefficient, but we need to do a separate `insert!` for each group we're adding membership to,
       ;; because `insert-many!` does not currently trigger methods such as `pre-insert`. We rely on those methods to
       ;; do things like automatically set the `is_superuser` flag for a User
       ;; TODO use multipel insert here
       (doseq [group-id to-add]
         (t2/insert! PermissionsGroupMembership {:user_id user-id, :group_id group-id}))))
    true))

;;; ## ---------------------------------------- USER SETTINGS ----------------------------------------

;; NB: Settings are also defined where they're used, such as in [[metabase.events.view-log]]

(defsetting last-acknowledged-version
  (deferred-tru "The last version for which a user dismissed the 'What's new?' modal.")
  :user-local :only
  :type :string)

(defsetting last-used-native-database-id
  (deferred-tru "The last database a user has selected for a native query or a native model.")
  :user-local :only
  :visibility :authenticated
  :type :integer
  :getter (fn []
            (when-let [id (setting/get-value-of-type :integer :last-used-native-database-id)]
              (when (t2/exists? :model/Database :id id) id))))

(defsetting dismissed-custom-dashboard-toast
  (deferred-tru "Toggle which is true after a user has dismissed the custom dashboard toast.")
  :user-local :only
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)

(defsetting dismissed-browse-models-banner
  (deferred-tru "Whether the user has dismissed the explanatory banner about models that appears on the Browse Data page")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)

(defsetting notebook-native-preview-shown
  (deferred-tru "User preference for the state of the native query preview in the notebook.")
  :user-local :only
  :visibility :authenticated
  :type       :boolean
  :default    false)

(defsetting notebook-native-preview-sidebar-width
  (deferred-tru "Last user set sidebar width for the native query preview in the notebook.")
  :user-local :only
  :visibility :authenticated
  :type       :integer
  :default    nil)

(defsetting expand-browse-in-nav
  (deferred-tru "User preference for whether the 'Browse' section of the nav is expanded.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting expand-bookmarks-in-nav
  (deferred-tru "User preference for whether the 'Bookmarks' section of the nav is expanded.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting browse-filter-only-verified-models
  (deferred-tru "User preference for whether the 'Browse models' page should be filtered to show only verified models.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

;;; ## ------------------------------------------ AUDIT LOG ------------------------------------------

(defmethod audit-log/model-details :model/User
  [entity event-type]
  (case event-type
    :user-update               (select-keys (t2/hydrate entity :user_group_memberships)
                                            [:groups :first_name :last_name :email
                                             :invite_method :sso_source
                                             :user_group_memberships])
    :user-invited              (select-keys (t2/hydrate entity :user_group_memberships)
                                            [:groups :first_name :last_name :email
                                             :invite_method :sso_source
                                             :user_group_memberships])
    :password-reset-initiated  (select-keys entity [:token])
    :password-reset-successful (select-keys entity [:token])
    {}))
