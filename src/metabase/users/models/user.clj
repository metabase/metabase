(ns metabase.users.models.user
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.setup.core :as setup]
   [metabase.system.core :as system]
   [metabase.tenants.core :as tenants]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.default-fields :as t2.default-fields]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/User [_model] :core_user)
(methodical/defmethod t2/model-for-automagic-hydration [:default :author]     [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :creator]    [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :updated_by] [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :user]       [_original-model _k] :model/User)

(doto :model/User
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?)
  (derive :hook/entity-id))

(defn- stringify-keys-and-values
  "Given a map, convert all the keys and values to strings."
  [m]
  (into {} (map (fn [[k v]] [(u/qualified-name k)
                             ;; Preserve nils and don't stringify maps/lists so existing error handling
                             ;; catches those
                             (cond-> v
                               (and (some? v)
                                    (not (or (vector? v)
                                             (map? v)))) str)]))
        m))

(def ^:private transform-attributes
  "Transform user attributes, which are maps of strings->strings. There may be some existing values in the database
  which are not, so convert on the way out."
  {:in (comp mi/json-in stringify-keys-and-values)
   :out (comp stringify-keys-and-values mi/json-out-without-keywordization)})

(t2/deftransforms :model/User
  {:login_attributes transform-attributes
   :jwt_attributes   transform-attributes
   :settings         mi/transform-encrypted-json
   :sso_source       mi/transform-keyword
   :type             mi/transform-keyword})

(def ^:private allowed-user-types
  #{:internal :personal :api-key})

(def ^:private insert-default-values
  {:date_joined     :%now
   :last_login      nil
   :is_active       true
   :is_superuser    false
   :is_data_analyst false})

(defn user-local-settings
  "Returns the user's settings (defaulting to an empty map) or `nil` if the user/user-id isn't set"
  [user-or-user-id]
  (when user-or-user-id
    (or
     (if (integer? user-or-user-id)
       (:settings (t2/select-one [:model/User :settings] :id user-or-user-id))
       (:settings user-or-user-id))
     {})))

;;; -------------------------------------------------- Validation Helpers --------------------------------------------------

(defn- validate-user-email!
  "Validate that the email is in a valid format."
  [email]
  (assert (u/email? email) (tru "Invalid email: {0}" (pr-str email))))

(defn- validate-user-locale!
  "Validate that the locale is available in the system."
  [locale]
  (when locale
    (assert (i18n/available-locale? locale) (tru "Invalid locale: {0}" (pr-str locale)))))

(defn- validate-user-type!
  "Validate that the user type is one of the allowed types."
  [user-type]
  (when user-type
    (assert (contains? allowed-user-types user-type)
            (tru "Invalid user type: {0}" (pr-str user-type)))))

(defn- validate-sso-setup!
  "Validate that SSO users can only be created after initial setup is complete."
  [sso-source]
  (when (and sso-source (not (setup/has-user-setup)))
    (throw (Exception. (trs "Metabase instance has not been initialized")))))

(defn- validate-user-insert!
  "Validate all constraints for user insertion."
  [{:keys [email locale sso_source] user-type :type}]
  (validate-user-email! email)
  (validate-user-type! user-type)
  (validate-user-locale! locale)
  (validate-sso-setup! sso_source)
  (when (or (nil? user-type) (= user-type :personal))
    (premium-features/assert-airgap-allows-user-creation!)))

;;; -------------------------------------------------- Password Management --------------------------------------------------

(defn- prepare-password-for-insert
  "Hash password and prepare password fields for insertion.
  Throws an exception if password_salt is already present (passwords should not be pre-hashed)."
  [user]
  (when (contains? user :password_salt)
    (throw (ex-info "Don't try to hash passwords yourself" {})))
  (let [pw (or (:password user) (random-uuid))
        salt (str (random-uuid))
        hash (u.password/hash-bcrypt (str salt pw))]
    {:password hash
     :password_salt salt}))

(defn- prepare-password-for-update
  "Conditionally hash password for updates. Returns password fields or nil.
  Only hashes if password is present and password_salt is not (indicating a plaintext password)."
  [{:keys [password password_salt]}]
  (when (and password (not password_salt))
    (prepare-password-for-insert {:password password})))

(defn- sync-password-to-auth-identity!
  "Synchronize password changes to AuthIdentity model and invalidate sessions."
  [user-id]
  (let [{salt :password_salt password :password} (t2/select-one [:model/User :email :password :password_salt] user-id)
        pw-auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")]
    (when (and password salt)
      (cond
        (nil? pw-auth-identity)
        (t2/with-transaction [_]
          (t2/insert! :model/AuthIdentity {:user_id user-id
                                           :provider "password"
                                           :credentials {:password_hash password
                                                         :password_salt salt}})
          (t2/delete! (t2/table-name :model/Session) :user_id user-id))

        (or (not= password (get-in pw-auth-identity [:credentials :password_hash]))
            (not= salt (get-in pw-auth-identity [:credentials :password_salt])))
        (t2/with-transaction [_]
          (t2/update! :model/AuthIdentity (u/the-id pw-auth-identity) {:credentials {:password_hash password
                                                                                     :password_salt salt}})
          (t2/delete! (t2/table-name :model/Session) :user_id user-id))

        :else nil))))

;;; -------------------------------------------------- Admin Group Management --------------------------------------------------

(defn- handle-superuser-toggle!
  "Add or remove user from admin group based on superuser status change.
  Does nothing if superuser status hasn't changed."
  [user-id superuser? in-admin-group?]
  (when (some? superuser?)
    (cond
      (and superuser? (not in-admin-group?))
      (perms/without-is-superuser-sync-on-add-to-admin-group
       (perms/add-user-to-group! user-id (u/the-id (perms/admin-group))))

      (and (not superuser?) in-admin-group?)
      (perms/without-is-superuser-sync-on-add-to-admin-group
       (perms/remove-user-from-group! user-id (u/the-id (perms/admin-group)))))))

(defn- validate-last-admin-not-archived!
  "Prevent archiving the last admin user by throwing an exception."
  [id in-admin-group? active?]
  (when (and in-admin-group? (false? active?))
    (perms/throw-if-last-admin! id)))

;;; -------------------------------------------------- User Archival --------------------------------------------------

(defn- handle-user-archival!
  "Clean up user subscriptions when user is archived."
  [user-id active?]
  (when (false? active?)
    (t2/delete! 'PulseChannelRecipient :user_id user-id)))

(defn- prepare-archival-timestamp
  "Return a map with deactivated_at field based on is_active status.
  Returns nil if active? is nil (no change to is_active)."
  [active?]
  (cond
    active? {:deactivated_at nil}
    (false? active?) {:deactivated_at :%now}
    :else nil))

;;; -------------------------------------------------- Field Normalization --------------------------------------------------

(defn- normalize-user-fields
  "Normalize email, locale, and reset token for database storage."
  [user]
  (cond-> user
    (:email user) (update :email u/lower-case-en)
    (:locale user) (update :locale i18n/normalized-locale-string)
    ;; Only hash reset_token if it's not already a bcrypt hash (starts with $2a$ or $2b$)
    (and (:reset_token user)
         (not (re-matches #"^\$2[ab]\$.*" (:reset_token user))))
    (update :reset_token u.password/hash-bcrypt)))

(methodical/defmethod t2.pipeline/results-transform [#_query-type :toucan.query-type/insert.instances
                                                     #_model :model/User]
  "Create the initial :model/AuthIdenity from the results of saving a user. We have to do it here rather than in
  define-after-insert because we need to get the hashed password and salt to save to the auth-identity model, and
  those fields are removed by the default-files transformer before after-insert is called."
  [query-type model]
  (comp (map (fn [{:keys [password password_salt id] :as user}]
               (u/prog1 user
                 (when (and password password_salt)
                   (t2/insert! :model/AuthIdentity {:user_id id
                                                    :provider "password"
                                                    :credentials {:password_hash password
                                                                  :password_salt password_salt}})))))
        (binding [t2.default-fields/*skip-default-fields* false]
          (next-method query-type model))))

(t2/define-before-insert :model/User
  [user]
  (validate-user-insert! user)
  (-> (merge insert-default-values user)
      normalize-user-fields
      (merge (prepare-password-for-insert user))))

(t2/define-after-insert :model/User
  [{user-id :id, superuser? :is_superuser, :as user}]
  (u/prog1 user
    (let [current-version (:tag config/mb-version-info)]
      (log/infof "Setting User %s's last_acknowledged_version to %s, the current version" user-id current-version)
      ;; Can't use mw.session/with-current-user due to circular require
      (binding [api/*current-user-id* user-id]
        (setting/with-user-local-values (delay (atom (user-local-settings user)))
          (setting/set! :last-acknowledged-version current-version))))
    ;; add the newly created user to the magic perms groups.
    (log/infof "Adding User %s to All Users permissions group..." user-id)
    (when superuser?
      (log/infof "Adding User %s to All Users permissions group..." user-id))
    (let [groups (filter some? [(when-not (:tenant_id user) (perms/all-users-group))
                                (when (:tenant_id user) (perms/all-external-users-group))
                                (when superuser? (perms/admin-group))])]
      (perms/allow-changing-all-users-group-members
        (perms/allow-changing-all-external-users-group-members
         (perms/without-is-superuser-sync-on-add-to-admin-group
          (perms/add-user-to-groups! user-id (map u/the-id groups))))))
    (sync-password-to-auth-identity! user-id)))

(t2/define-before-update :model/User
  [{:keys [id] :as user}]
  (let [changes (t2/changes user)
        {:keys [email locale]
         superuser? :is_superuser
         active? :is_active} changes
        in-admin-group?           (t2/exists? :model/PermissionsGroupMembership
                                              :group_id (:id (perms/admin-group))
                                              :user_id id)
        hashed-pw (prepare-password-for-update changes)]
    (validate-last-admin-not-archived! id in-admin-group? active?)
    (when email (validate-user-email! email))
    (when locale (validate-user-locale! locale))
    (handle-superuser-toggle! id superuser? in-admin-group?)
    (handle-user-archival! id active?)
    (merge user
           (normalize-user-fields (t2/changes user))
           hashed-pw
           (when (or hashed-pw (and (contains? changes :password) (contains? changes :password_salt)))
             {:reset_token nil :reset_triggered nil})
           (prepare-archival-timestamp active?))))

(t2/define-after-update :model/User
  [{:keys [id] :as user}]
  ;; Query the database to check if we need to sync reset token changes
  ;; We can't rely on t2/changes in after-update hooks, so we compare current state
  (let [{:keys [email reset_token reset_triggered]} (t2/select-one [:model/User :email :reset_token :reset_triggered] :id id)
        current-auth-identity (t2/select-one :model/AuthIdentity
                                             :user_id id
                                             :provider "emailed-secret-password-reset")]
    (sync-password-to-auth-identity! id)
    (cond
      ;; Token being cleared - mark as consumed in AuthIdentity
      (and (nil? reset_token) current-auth-identity)
      (do
        (log/debugf "Syncing User %s reset_token clear to AuthIdentity - marking token consumed" id)
        (t2/update! :model/AuthIdentity (:id current-auth-identity)
                    {:credentials (assoc (:credentials current-auth-identity) :consumed_at (t/instant))}))

      ;; Token being set - create or update AuthIdentity
      (and reset_token reset_triggered)
      (let [ttl-ms (* 48 60 60 1000)
            expires-at (t/plus (t/instant reset_triggered) (t/millis ttl-ms))
            credentials {:token_hash reset_token
                         :expires_at expires-at
                         :consumed_at nil}]
        (if current-auth-identity
          (do
            (log/debugf "Syncing User %s reset_token update to existing AuthIdentity %s" id (:id current-auth-identity))
            (t2/update! :model/AuthIdentity (:id current-auth-identity)
                        {:credentials credentials}))
          (do
            (log/debugf "Syncing User %s reset_token insert to new AuthIdentity" id)
            (t2/insert! :model/AuthIdentity
                        {:user_id id
                         :provider "emailed-secret-password-reset"
                         :credentials credentials
                         :metadata {:email email}}))))))
  user)

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
  [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_data_analyst :is_qbnewb :tenant_id])

(def admin-or-self-visible-columns
  "Sequence of columns that we can/should return for admins fetching a list of all Users, or for the current user
  fetching themselves. Needed to power the admin page."
  (into default-user-columns [:sso_source :is_active :updated_at :login_attributes :jwt_attributes :locale]))

(def non-admin-or-self-visible-columns
  "Sequence of columns that we will allow non-admin Users to see when fetching a list of Users. Why can non-admins see
  other Users at all? I honestly would prefer they couldn't, but we need to give them a list of emails to power
  Pulses."
  [:id :email :first_name :last_name])

(def group-manager-visible-columns
  "Sequence of columns Group Managers can see when fetching a list of Users.."
  (into non-admin-or-self-visible-columns [:is_superuser :last_login]))

(t2.default-fields/define-default-fields :model/User default-user-columns)

(defmethod serdes/hash-fields :model/User
  [_user]
  [:email])

(defn group-ids
  "Fetch set of IDs of PermissionsGroup a User belongs to."
  [user-or-id]
  (when user-or-id
    (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (u/the-id user-or-id))))

(defmethod mi/exclude-internal-content-hsql :model/User
  [_model & {:keys [table-alias]}]
  [:and [:not= (h2x/identifier :field table-alias :type) [:inline "internal"]]])

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-batched-hydration-method add-user-group-memberships
  :user_group_memberships
  "Add to each `user` a list of Group Memberships Info with each item is a map with 2 keys [:id :is_group_manager].
  In which `is_group_manager` is only added when `advanced-permissions` is enabled."
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (t2/select [:model/PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager]
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
    (let [user-id->memberships (group-by :user_id (t2/select [:model/PermissionsGroupMembership :user_id :group_id]
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
    (let [user-count (t2/count :model/User)]
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

(mi/define-batched-hydration-method add-tenant-collection-id
  :tenant_collection_id
  "Efficiently hydrate the `:tenant_collection_id` property of a sequence of Users. (This is the ID of their Tenant's
  Collection, if they belong to a tenant.)"
  [users]
  (when (seq users)
    ;; efficiently create a map of tenant ID -> tenant collection ID
    (let [users-with-tenant-ids (filter :tenant_id users)
          tenant-ids            (set (map :tenant_id users-with-tenant-ids))
          tenant-id->collection-id (when (seq tenant-ids)
                                     (t2/select-pk->fn :tenant_collection_id :model/Tenant
                                                       :id [:in tenant-ids]))]
      ;; now for each User, try to find the corresponding tenant collection ID
      (for [user users]
        (assoc user :tenant_collection_id (when-let [tenant-id (:tenant_id user)]
                                            (get tenant-id->collection-id tenant-id)))))))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(declare form-password-reset-url)

(def ^:private Invitor
  "Map with info about the admin creating the user, used in the new user notification code"
  [:map
   [:email      ms/Email]
   [:first_name [:maybe ms/NonBlankString]]])

(defn serdes-synthesize-user!
  "Creates a new user with a default password, when deserializing eg. a `:creator_id` field whose email address doesn't
  match any existing user."
  [new-user]
  (t2/insert-returning-instance! :model/User new-user))

(mu/defn create-and-invite-user!
  "Convenience function for inviting a new `User` and sending them a welcome email.
  This function will create the user, which will trigger the built-in system event
  notification to send an invite via email."
  [new-user :- users.schema/NewUser invitor :- Invitor setup? :- :boolean]
  ;; create the new user
  (u/prog1 (t2/insert-returning-instance! :model/User new-user)
    ;; TODO make sure the email being sent synchronously.
    (events/publish-event! :event/user-invited
                           {:object
                            (assoc <>
                                   :is_from_setup setup?
                                   :invite_method "email"
                                   :sso_source    (:sso_source new-user))
                            :details {:invitor (select-keys invitor [:email :first_name])}})))

;;; TODO -- this should probably be moved into [[metabase.sso.google]]
(mu/defn create-new-google-auth-user!
  "Convenience for creating a new user via Google Auth. This account is considered active immediately; thus all active
  admins will receive an email right away."
  [new-user :- users.schema/NewUser]
  (u/prog1 (t2/insert-returning-instance! :model/User new-user)
    ;; send an email to everyone including the site admin if that's set
    (when (setting/get :send-new-sso-user-admin-email?)
      ((requiring-resolve 'metabase.channel.email.messages/send-user-joined-admin-notification-email!) <>, :google-auth? true))))

(defn form-password-reset-url
  "Generate a properly formed password reset url given a password reset token."
  [reset-token]
  {:pre [(string? reset-token)]}
  (str (system/site-url) "/auth/reset_password/" reset-token))

;; TODO -- does this belong HERE, or in the `permissions` module?
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
        (perms/remove-user-from-groups! user-id to-remove)
        (perms/add-user-to-groups! user-id to-add)))
    true))

(defn add-attributes
  "Adds the `:attributes` key to a user."
  [{:keys [login_attributes jwt_attributes] :as user}]
  (assoc user :attributes (merge {} (tenants/login-attributes user) jwt_attributes login_attributes)))

;;; Filtering users

(defn- status-clause
  "Figure out what `where` clause to add to the user query when
  we get a fiddly status and include_deactivated query.

  This is to keep backwards compatibility with `include_deactivated` while adding `status."
  [status include_deactivated]
  (if include_deactivated
    nil
    (case status
      "all"         nil
      "deactivated" [:= :is_active false]
      "active"      [:= :is_active true]
      [:= :is_active true])))

(defn- wildcard-query [query] (str "%" (u/lower-case-en query) "%"))

(defn- query-clause
  "Honeysql clause to shove into user query if there's a query"
  [query]
  [:or
   [:like :%lower.first_name (wildcard-query query)]
   [:like :%lower.last_name  (wildcard-query query)]
   [:like :%lower.email      (wildcard-query query)]])

(defn filter-clauses
  "Honeysql clauses for filtering on users.

  Options:
    :status                  - filter by status (\"active\", \"deactivated\", \"all\")
    :query                   - text search on first_name, last_name, email
    :group-ids               - filter by permissions group membership
    :include-deactivated     - legacy alias for status=all
    :is-data-analyst?        - filter by data analyst status (true/false)
    :can-access-data-studio? - filter by Data Studio access (analysts, superusers, or users with table metadata perms)
    :limit                   - pagination limit
    :offset                  - pagination offset"
  [{:keys [status query group-ids include-deactivated is-data-analyst? can-access-data-studio? limit offset]}]
  (cond-> {}
    true                                    (sql.helpers/where [:= :core_user.type "personal"])
    true                                    (sql.helpers/where (status-clause status include-deactivated))
    ;; don't send the internal user
    (perms/sandboxed-or-impersonated-user?) (sql.helpers/where [:= :core_user.id api/*current-user-id*])
    (some? query)                           (sql.helpers/where (query-clause query))
    (some? is-data-analyst?)                (sql.helpers/where (if is-data-analyst?
                                                                 :core_user.is_data_analyst
                                                                 [:not :core_user.is_data_analyst]))
    (some? can-access-data-studio?)         (sql.helpers/where (if can-access-data-studio?
                                                                 [:or
                                                                  :core_user.is_data_analyst
                                                                  :core_user.is_superuser
                                                                  [:in :core_user.id
                                                                   {:select-distinct [:pgm.user_id]
                                                                    :from [[:permissions_group_membership :pgm]]
                                                                    :join [[:data_permissions :p] [:= :p.group_id :pgm.group_id]]
                                                                    :where [:and
                                                                            [:= :p.perm_type "perms/manage-table-metadata"]
                                                                            [:= :p.perm_value "yes"]]}]]
                                                                 [:and
                                                                  [:not :core_user.is_data_analyst]
                                                                  [:not :core_user.is_superuser]
                                                                  [:not-in :core_user.id
                                                                   {:select-distinct [:pgm.user_id]
                                                                    :from [[:permissions_group_membership :pgm]]
                                                                    :join [[:data_permissions :p] [:= :p.group_id :pgm.group_id]]
                                                                    :where [:and
                                                                            [:= :p.perm_type "perms/manage-table-metadata"]
                                                                            [:= :p.perm_value "yes"]]}]]))
    (some? group-ids)                       (sql.helpers/right-join
                                             :permissions_group_membership
                                             [:= :core_user.id :permissions_group_membership.user_id])
    (some? group-ids)                       (sql.helpers/where
                                             [:in :permissions_group_membership.group_id group-ids])
    (some? limit)                           (sql.helpers/limit limit)
    (some? offset)                          (sql.helpers/offset offset)))
