(ns metabase.users.models.user
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.premium-features.core :as premium-features]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting :as settings.models]
   [metabase.setup.core :as setup]
   [metabase.system.core :as system]
   [metabase.tenants.core :as tenants]
   [metabase.users.audit :as users.audit]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [trs tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]
   [toucan2.tools.default-fields :as t2.default-fields]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/User [_model] :core_user)
(methodical/defmethod t2/model-for-automagic-hydration [:default :author]     [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :creator]    [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :updated_by] [_original-model _k] :model/User)
(methodical/defmethod t2/model-for-automagic-hydration [:default :user]       [_original-model _k] :model/User)

(doto :model/User
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?)
  (derive :hook/entity-id)
  (derive ::mi/create-policy.superuser))

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
   :settings         (mi/transform-encrypted-json "core_user.settings")
   :sso_source       mi/transform-keyword
   :type             mi/transform-keyword})

(def ^:private default-user-columns
  "Sequence of columns that are normally returned when fetching a User from the DB."
  [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_data_analyst :is_qbnewb :tenant_id])

(t2.default-fields/define-default-fields :model/User default-user-columns)

(defmethod mi/non-internal-filter-clause :model/User
  [_model alias]
  [:not= (h2x/identifier :field alias :type) "internal"])

(defn settings-map
  "Returns the user's `settings` as a map, defaulting to an empty map.

  [[metabase.models.interface/encrypted-json-out]] hands back the raw column value when it decrypts but does not parse
  as JSON, and JSON that parses to a scalar or a vector is not a map either, so a non-map value here means the column
  is unreadable rather than absent. Flag those with [[setting/unreadable-user-settings-key]] so the write that
  overwrites them can warn -- see [[metabase.settings.models.setting]]."
  [settings]
  (if (map? settings)
    settings
    (cond-> {}
      (some? settings) (vary-meta assoc setting/unreadable-user-settings-key true))))

(defn user-local-settings
  "Returns the user's settings (defaulting to an empty map) or `nil` if the user/user-id isn't set"
  [user-or-user-id]
  (when user-or-user-id
    (settings-map
     (if (integer? user-or-user-id)
       (users.db/user-settings user-or-user-id)
       (:settings user-or-user-id)))))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(def ^:private insert-default-values
  {:date_joined     :%now
   :last_login      nil
   :is_active       true
   :is_superuser    false
   :is_data_analyst false})

(defn- check-superuser-has-no-tenant
  "Throws a 400 when `user` is both a superuser and a tenant user."
  [{superuser? :is_superuser tenant-id :tenant_id}]
  (when (and superuser? tenant-id)
    (throw (ex-info (tru "Superusers cannot be tenant users") {:status-code 400}))))

(defn- without-credential-fields
  "Remove password and reset-token fields from a User map. Login passwords live in the user's `password` AuthIdentity
  (via [[metabase.auth-identity.core/set-password!]]) and reset tokens in their `emailed-secret-password-reset`
  AuthIdentity; the legacy `core_user.password` / `.password_salt` / `.reset_token` / `.reset_triggered` columns are no
  longer read or written by this codebase, so we drop any incoming values rather than persisting them."
  [user]
  (dissoc user :password :password_salt :reset_token :reset_triggered))

(defn- with-acknowledged-version
  "Set the `last-acknowledged-version` user-local setting of a new `user` to the current version."
  [user]
  (assoc user :settings (u/assoc-dissoc (settings-map (:settings user))
                                        :last-acknowledged-version
                                        (not-empty (:tag config/mb-version-info)))))

(defn- prepare-archival-timestamp
  "Return a map with deactivated_at field based on is_active status.
  Returns nil if active? is nil (no change to is_active)."
  [active?]
  (cond
    active? {:deactivated_at nil}
    (false? active?) {:deactivated_at :%now}
    :else nil))

(defn- normalize-user-fields
  "Normalize email and locale for database storage."
  [user]
  (cond-> user
    (:email user) (update :email u/lower-case-en)
    (:locale user) (update :locale i18n/normalized-locale-string)))

(t2/define-before-insert :model/User
  [user]
  (check-superuser-has-no-tenant user)
  (-> (merge insert-default-values user)
      with-acknowledged-version
      normalize-user-fields
      without-credential-fields))

(t2/define-before-update :model/User
  [{:keys [id] :as user}]
  (when (and (= id config/internal-mb-user-id) (seq (t2/changes user)))
    (throw (ex-info (tru "Not able to modify the internal user") {:status-code 400})))
  (when (:is_superuser (t2/changes user))
    (check-superuser-has-no-tenant user))
  (let [{active? :is_active} (t2/changes user)]
    (-> user
        (merge (normalize-user-fields (t2/changes user))
               (prepare-archival-timestamp active?))
        without-credential-fields)))

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

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- self-or-superuser?
  "Whether the current user is `user` or a superuser."
  [user]
  (boolean (or api/*is-superuser?* (= (u/the-id user) api/*current-user-id*))))

(defn- group-manager?
  "Whether the current user manages a group, which counts only with advanced permissions."
  []
  (boolean (and (premium-features/enable-advanced-permissions?) api/*is-group-manager?*)))

(methodical/defmethod t2/batched-hydrate [:model/User :can_read]
  "Whether the current user can read each of `users`, which a user can for themselves and a superuser or a group
  manager can for anyone."
  [_model k users]
  (let [group-manager (group-manager?)]
    (for [user users]
      (when user
        (vary-meta user assoc k (or group-manager (self-or-superuser? user)))))))

(methodical/defmethod t2/batched-hydrate [:model/User :can_write]
  "Whether the current user can write each of `users`, which a user can for themselves and a superuser can for anyone."
  [_model k users]
  (for [user users]
    (when user
      (assoc user k (self-or-superuser? user)))))

(def ^:private self-updatable-columns
  "The columns a user may change on their own row."
  #{:first_name :last_name :locale :email :is_qbnewb :is_datasetnewb})

(def ^:private superuser-updatable-columns
  "The columns a superuser may change on any user's row."
  (into self-updatable-columns [:login_attributes :tenant_id :is_superuser :is_data_analyst]))

(defn updatable-columns
  "The columns of `user` the current user may change: those a superuser may change, those of their own row, or none."
  [user]
  (cond
    api/*is-superuser?*                       superuser-updatable-columns
    (= (u/the-id user) api/*current-user-id*) self-updatable-columns
    :else                                     #{}))

(defn- email-change-allowed?
  "Whether the current user may give `user` the `:email` in `changes`, which only a superuser may for a Google or LDAP
  user, or for a `user` selected without its `:sso_source`."
  [{:keys [sso_source email] :as user} changes]
  (or api/*is-superuser?*
      (not (contains? changes :email))
      (= email (:email changes))
      (and (contains? user :sso_source)
           (not (#{:google :ldap} sso_source)))))

(defmethod mi/can-update? :model/User
  [user changes]
  (boolean (and (mi/can-write? user)
                (every? (updatable-columns user) (keys changes))
                (email-change-allowed? user changes))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-batched-hydration-method add-user-group-memberships
  :user_group_memberships
  "Add to each `user` a list of Group Memberships Info with each item is a map with 2 keys [:id :is_group_manager].
  In which `is_group_manager` is only added when `advanced-permissions` is enabled."
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (users.db/group-memberships-for-users (set (map u/the-id users))))
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
    (let [user-id->memberships (group-by :user_id (users.db/user-group-ids-for-users (set (map u/the-id users))))]
      (for [user users]
        (assoc user :group_ids (set (map :group_id (user-id->memberships (u/the-id user)))))))))

(mi/define-batched-hydration-method add-has-invited-second-user
  :has_invited_second_user
  "Adds the `has_invited_second_user` flag to a collection of `users`. This should be `true` for only the user who
  underwent the initial app setup flow (with an ID of 1), iff more than one user exists. This is used to modify
  the wording for this user on a homepage banner that prompts them to add their database."
  [users]
  (when (seq users)
    (let [user-count (users.db/user-count)]
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
                                     (users.db/tenant-collection-ids tenant-ids))]
      ;; now for each User, try to find the corresponding tenant collection ID
      (for [user users]
        (assoc user :tenant_collection_id (when-let [tenant-id (:tenant_id user)]
                                            (get tenant-id->collection-id tenant-id)))))))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

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

(defn group-ids
  "Fetch set of IDs of PermissionsGroup a User belongs to."
  [user-or-id]
  (when user-or-id
    (users.db/user-group-ids (u/the-id user-or-id))))

(declare create-users! form-password-reset-url)

(mu/defn create-and-invite-user!
  "Convenience function for inviting a new `User` and sending them a welcome email.
  This function will create the user, which will trigger the built-in system event
  notification to send an invite via email."
  ([new-user :- users.schema/NewUser
    invitor  :- ::users.schema/user
    setup?   :- :boolean]
   (create-and-invite-user! new-user invitor setup? nil))
  ([new-user      :- users.schema/NewUser
    invitor       :- ::users.schema/user
    setup?        :- :boolean
    invite-target :- [:maybe users.schema/InviteTarget]]
   ;; create the new user
   (u/prog1 (first (create-users! [new-user]))
     (events/publish-event! :event/user-invited
                            {:object
                             (cond-> (assoc <>
                                            :is_from_setup setup?
                                            :invite_method "email"
                                            :sso_source    (:sso_source new-user))
                               invite-target (assoc :invite_target invite-target))
                             :details {:invitor (select-keys invitor [:email :first_name])}}))))

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
        (perms-group-membership/remove-users-from-groups! [user-id] (vec to-remove))
        (perms-group-membership/add-users-to-groups! (for [group-id to-add]
                                                       {:user user-id :group group-id}))))
    true))

(mu/defn add-attributes
  "Adds the `:attributes` key to a user. Only personal users carry attributes; for other user types (API-key, internal)
  this is always `{}`, so e.g. sandboxed queries made with an API key report a missing user attribute instead of
  reading attributes stored on the user row."
  [{:keys [login_attributes jwt_attributes] :as user} :- [:merge
                                                          ::users.schema/user
                                                          [:map {:closed true}
                                                           [:type ::users.schema/user.type]]]]
  (assoc user :attributes (if (= (:type user) :personal)
                            (merge {} (tenants/login-attributes user) jwt_attributes login_attributes)
                            {})))

;;; Filtering users

(defn same-groups-user-ids
  "Return a list of all user-ids in the same group with the user with id `user-id`.
  Ignore the All-user groups."
  [user-id]
  (map :user_id
       (users.db/same-groups-user-ids user-id (:id (perms/all-users-group)))))

(def filter-clauses
  "Honeysql clauses for filtering on users. See [[users.db/filter-clauses]] for the options."
  users.db/filter-clauses)

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-sso-setup
  "Throws when one of `rows` is an SSO user and the initial setup is not complete."
  [rows]
  (when (and (some :sso_source rows) (not (setup/has-user-setup)))
    (throw (Exception. (trs "Metabase instance has not been initialized")))))

(defn- check-user-limit
  "Throws when one of `rows` is a personal user and the plan allows no more users."
  [rows]
  (when (some (fn [{user-type :type}] (or (nil? user-type) (= user-type :personal))) rows)
    (premium-features/assert-airgap-allows-user-creation!)))

(defn- default-group-ids
  "The ids of the groups a new `user` joins: All Users, or All tenant users for a tenant user, and Administrators for a
  superuser."
  [{superuser? :is_superuser tenant-id :tenant_id}]
  (cond-> [(:id (if tenant-id (perms/all-external-users-group) (perms/all-users-group)))]
    superuser? (conj (:id (perms/admin-group)))))

(defn- add-to-default-groups!
  "Add each of the new `users` to its default groups, publishing the events of the writes."
  [users]
  (perms/allow-changing-all-users-group-members
    (perms/allow-changing-all-external-users-group-members
     (perms/without-is-superuser-sync-on-add-to-admin-group
      (perms-group-membership/add-users-to-groups! (for [user     users
                                                         group-id (default-group-ids user)]
                                                     {:user (:id user) :group group-id}))))))

(mu/defn create-users! :- [:sequential ::users.schema/user]
  "Insert the User `rows` and return them in order, each in its default groups, publishing the events of the writes; an
  SSO user before the initial setup or a personal user over the plan's limit throws."
  [rows :- [:sequential ::users.schema/user.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (check-sso-setup rows)
      (check-user-limit rows)
      (let [users (users.db/insert-users! rows)]
        (events/publish-event! :event/user-create (events/create-event users))
        (add-to-default-groups! users)
        users))))

(defn- user-after
  "The row of the stored `user` as the hooks of the model leave it after an update of `changes`, which they run here
  again in memory, with the `updated_at` that a timestamp hook sets as SQL taken from the stored row."
  [user changes]
  (let [row (t2.before-update/before-update :model/User (merge user changes))]
    (t2/instance :model/User (cond-> (into {} row)
                               (not (instance? java.time.temporal.Temporal (:updated_at row)))
                               (assoc :updated_at (:updated_at user))))))

(mr/def ::write-opts
  [:map {:closed true}
   [:context {:optional true} :metabase.events.schema/context]])

(defn- write-users!
  "Apply `changes` to the Users whose stored rows are `users`, publishing the update event with `opts` and returning
  the number updated."
  [users changes opts]
  (u/prog1 (users.db/update-users! (mapv :id users) changes)
    (events/publish-event! :event/user-update
                           (events/update-event (u/index-by :id users)
                                                (mapv #(assoc changes :id (:id %)) users)
                                                (assoc opts :objects (into {} (map (fn [user] [(:id user) (user-after user changes)])) users))))))

(defn- set-admin-memberships!
  "Add the Users with `user-ids` to Administrators when `superuser?`, else remove them, leaving their `is_superuser`
  flag alone; `admin-ids` holds those already in it. Publishes the events of the writes with `opts`."
  [user-ids admin-ids superuser? opts]
  (let [admin-group-id (:id (perms/admin-group))]
    (perms/without-is-superuser-sync-on-add-to-admin-group
     (if superuser?
       (perms-group-membership/add-users-to-groups! (for [user-id user-ids
                                                          :when   (not (contains? admin-ids user-id))]
                                                      {:user user-id :group admin-group-id})
                                                    opts)
       (perms-group-membership/remove-users-from-groups! (filterv #(contains? admin-ids %) user-ids)
                                                         [admin-group-id]
                                                         opts)))))

(defmulti delete-for-users!
  "Deletes the rows of `model` that belong to the deactivated Users with `user-ids`, which a model that follows its
  Users implements with its own write function, publishing its events with the `:context` of `opts`."
  {:arglists '([model user-ids opts])}
  (fn [model _user-ids _opts] model))

(defn- delete-subscriptions!
  "Delete the dashboard subscription recipients of the deactivated Users with `user-ids`."
  [user-ids opts]
  (binding [api/*current-user-id* nil]
    (t2/resolve-model :model/PulseChannelRecipient)
    (delete-for-users! :model/PulseChannelRecipient user-ids opts)))

(def user-ids-of-type
  "The ids among a sequence of user ids of the Users of a type, see [[users.db/user-ids-of-type]]."
  users.db/user-ids-of-type)

(def deactivated-with-tenant-user-ids
  "The ids of the Users of a Tenant that were deactivated with it, see [[users.db/deactivated-with-tenant-user-ids]]."
  users.db/deactivated-with-tenant-user-ids)

(def active-user-ids-of-tenant
  "The ids of the active Users of a Tenant, see [[users.db/active-user-ids-of-tenant]]."
  users.db/active-user-ids-of-tenant)

(def active-tenant-user-ids
  "The ids of the active Users of every Tenant, see [[users.db/active-tenant-user-ids]]."
  users.db/active-tenant-user-ids)

(mu/defn update-users! :- :int
  "Apply `changes` to the Users with `user-ids` and return the number updated, publishing the events of the writes with
  `opts`; deactivating or demoting the last admin throws, a change of `is_superuser` adds or removes the
  Administrators membership, and deactivating a User deletes its subscriptions."
  ([user-ids :- [:sequential ::lib.schema.id/user]
    changes  :- ::users.schema/user.update]
   (update-users! user-ids changes nil))
  ([user-ids :- [:sequential ::lib.schema.id/user]
    changes  :- ::users.schema/user.update
    opts     :- [:maybe ::write-opts]]
   (t2/with-transaction [_conn]
     (let [superuser?   (:is_superuser changes)
           deactivates? (false? (:is_active changes))
           users        (users.db/users-by-ids user-ids)]
       (cond
         (empty? users)
         0

         (not (or (some? superuser?) deactivates?))
         (write-users! users changes opts)

         :else
         (let [user-ids  (into #{} (map :id) users)
               admin-ids (users.db/group-member-ids (:id (perms/admin-group)) user-ids)]
           (when (or deactivates? (false? superuser?))
             (perms-group-membership/throw-if-last-admins! admin-ids))
           (u/prog1 (write-users! users changes opts)
             (when (some? superuser?)
               (set-admin-memberships! user-ids admin-ids superuser? opts))
             (when deactivates?
               (delete-subscriptions! user-ids opts)))))))))

(defn- publish-own-write!
  "Publish the update event of the write of `columns` to the User with `user-id`, a column the product sets that only
  the change log records, with the id and the written columns as the rows before and after, so that it reads nothing."
  [user-id columns]
  (let [stored (t2/instance :model/User {:id user-id})]
    (events/publish-event! :event/user-update
                           (events/update-event {user-id stored}
                                                [(assoc columns :id user-id)]
                                                {:objects {user-id (merge stored columns)}}))))

(mu/defn set-last-login-now!
  "Set the `last_login` of the User with `user-id` to now, publishing the update event."
  [user-id :- ::lib.schema.id/user]
  (t2/with-transaction [_conn]
    (u/prog1 (users.db/set-user-last-login-now! user-id)
      (when (pos? <>)
        (publish-own-write! user-id {:last_login :%now})))))

(mu/defn set-settings! :- :int
  "Store `settings-json` as the user-local setting values of the User with `user-id` in one statement, publishing the
  update event, and return the number updated."
  [user-id       :- ::lib.schema.id/user
   settings-json :- :string]
  (t2/with-transaction [_conn]
    (u/prog1 (users.db/update-user-settings! user-id settings-json)
      (when (pos? <>)
        (publish-own-write! user-id {:settings settings-json})))))

(defmethod settings.models/store-user-local-values! :model/User
  [_model user-id settings-json]
  (set-settings! user-id settings-json))

(defmethod perms-group-membership/set-member-flags-of! :model/User
  [_model flag-changes opts]
  (let [stored (u/index-by :id (users.db/users-by-ids (into [] (comp (mapcat first) (distinct)) flag-changes)))]
    (reduce (fn [rows [user-ids changes]]
              (users.db/update-users! (vec user-ids) changes)
              (let [event (events/update-event rows
                                               (mapv #(assoc changes :id %) user-ids)
                                               (assoc opts :objects (into {} (keep #(when-let [user (get rows %)] [% (user-after user changes)])) user-ids)))]
                (events/publish-event! :event/user-update event)
                (into rows (map (juxt (comp :id :object) :object)) (:changes event))))
            stored
            flag-changes)
    nil))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/User [_model]
  {:skip? false})

(defmethod change-log/spec :model/User [_model]
  {:track [:email :first_name :last_name :password :password_salt :date_joined :last_login :is_superuser :is_active
           :reset_token :reset_triggered :is_qbnewb :login_attributes :sso_source :locale :is_datasetnewb :settings
           :type :entity_id :deactivated_at :tenant_id :jwt_attributes :deactivated_with_tenant :is_data_analyst]
   :skip  []})

(defmethod serialization/insert-stub-users! :model/User [rows]
  (create-users! rows))

(defmethod audit/spec :model/User [_model]
  {:track          [:first_name :last_name :email :sso_source :tenant_id]
   :track-redacted [:date_joined :deactivated_with_tenant :is_data_analyst :is_datasetnewb :is_superuser
                    :jwt_attributes :locale :login_attributes :type]
   :skip           [:deactivated_at :entity_id :is_active :is_qbnewb :last_login :password :password_salt
                    :reset_token :reset_triggered :settings]
   :hydrate        users.audit/hydrate
   :details        users.audit/details
   :topics         {:update users.audit/update-topic}
   :moments        [{:topic :user-reactivated, :when users.audit/reactivated?}
                    {:topic :user-deactivated, :when users.audit/deactivated?}]})

(defmethod eid-translation/spec :model/User [_model]
  {:names [:user]})
