(ns metabase.users.models.user
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
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

(defn- assoc-acknowledged-version
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
    (false? active?) {:deactivated_at (users.db/deactivated-at-clause false)}
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
      assoc-acknowledged-version
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

(defn- personal?
  "Whether the new User `row` is a personal user."
  [{user-type :type}]
  (or (nil? user-type) (= user-type :personal)))

(defn- active-personal-rows-before-last
  "The number of the personal rows of `rows` before the last personal one that create active Users."
  [rows]
  (count (remove #(false? (:is_active %)) (butlast (filter personal? rows)))))

(defn- check-user-limit
  "Throws unless the plan's limit leaves room for every personal user of `rows`, created in their order, by these rules:

  - a personal row needs fewer active personal Users than the limit
  - the active personal rows before it count as active personal Users"
  [rows]
  (when (some personal? rows)
    (premium-features/assert-airgap-allows-user-creation!)
    (let [earlier   (active-personal-rows-before-last rows)
          max-users (when (pos? earlier) (premium-features/max-users-allowed))]
      (when (and max-users (>= (+ (users.db/active-personal-user-count) earlier) max-users))
        (throw (Exception.
                (trs "Adding another user would exceed the maximum number of users ({0}) for your plan. Please upgrade to add more users."
                     max-users)))))))

(defn- check-emails-free
  "Throws a 400 unless each email that `rows` give, ignoring case, satisfies these rules:

  - no other row of `rows` gives it
  - no stored User other than the row's own has it"
  [rows]
  (when-let [emails (not-empty (into [] (keep #(some-> (:email %) u/lower-case-en)) rows))]
    (let [email->id (users.db/user-ids-by-emails emails)
          taken?    (fn [{:keys [id email]}]
                      (when-let [owner-id (some-> email u/lower-case-en email->id)]
                        (not= owner-id id)))]
      (when (or (not= (count emails) (count (set emails))) (some taken? rows))
        (throw (ex-info (tru "Email address already in use.")
                        {:status-code 400
                         :errors      {:email (tru "Email address already in use.")}}))))))

(defn- check-new-users
  "Throws unless the new User `rows` of one batch satisfy these rules, against the Users stored by earlier batches:

  - an SSO user needs the initial setup to be complete, see [[check-sso-setup]]
  - the plan's limit leaves room for every personal user, see [[check-user-limit]]
  - each email is free, see [[check-emails-free]]"
  [rows]
  (check-sso-setup rows)
  (check-user-limit rows)
  (check-emails-free rows))

(defn- default-group-ids
  "The ids of the groups a new `user` joins: All Users, or All tenant users for a tenant user, and Administrators for a
  superuser."
  [{superuser? :is_superuser tenant-id :tenant_id}]
  (cond-> [(:id (if tenant-id (perms/all-external-users-group) (perms/all-users-group)))]
    superuser? (conj (:id (perms/admin-group)))))

(defn- add-to-default-groups!
  "Add each of the new `users` to its default groups in one write, publishing the events of the writes."
  [users]
  (perms/allow-changing-all-users-group-members
    (perms/allow-changing-all-external-users-group-members
     (perms/without-is-superuser-sync-on-add-to-admin-group
      (perms-group-membership/add-users-to-groups! (for [user     users
                                                         group-id (default-group-ids user)]
                                                     {:user (:id user) :group group-id}))))))

(defn- create-user-batch!
  "Check and insert the User `rows`, one batch of a call, and return the inserted Users."
  [rows]
  (check-new-users rows)
  (users.db/insert-users! rows))

(mu/defn create-users! :- [:sequential ::users.schema/user]
  "Insert the User `rows` in one transaction and return them in order, each in its default groups, publishing their
  create event; an SSO user before the initial setup, a personal user over the plan's limit or an email in use throw."
  [rows :- [:sequential ::users.schema/user.create]]
  (t2/with-transaction [_conn]
    (let [created (into []
                        (mapcat (comp create-user-batch! vec))
                        (partition-all app-db/create-partition-size rows))]
      (when (seq created)
        (events/publish-event! :event/user-create (events/create-event created))
        (add-to-default-groups! created))
      created)))

(defn- user-after
  "The row of the stored `user` as the hooks of the model leave it after an update of `changes`, which they run here
  again in memory, with the `updated_at` that a timestamp hook sets as SQL taken from the stored row and the
  `deactivated_at` expression replaced by the stored stamp or now."
  [user changes]
  (let [row (t2.before-update/before-update :model/User (merge user changes))]
    (t2/instance :model/User (cond-> (into {} row)
                               (not (instance? java.time.temporal.Temporal (:updated_at row)))
                               (assoc :updated_at (:updated_at user))

                               (vector? (:deactivated_at row))
                               (assoc :deactivated_at (or (:deactivated_at user) (java.time.OffsetDateTime/now)))))))

(mr/def ::write-opts
  [:map {:closed true}
   [:context {:optional true} :metabase.events.schema/context]])

(defn- users-after
  "A map from id to the User as the update leaves it, for each of `updates` over `stored`, a map from id to User."
  [stored updates]
  (into {} (map (fn [{:keys [id] :as row}] [id (user-after (stored id) (dissoc row :id))])) updates))

(defn- ids-of-rows
  "The ids of the rows of `updates` that satisfy `pred`."
  [pred updates]
  (into [] (comp (filter pred) (map :id)) updates))

(defn- set-admin-memberships!
  "Add the Users of `updates` that set `is_superuser` to Administrators and remove those that unset it, leaving their
  flag alone; `admin-ids` holds those already in it. Publishes the events of the writes with `opts`."
  [updates admin-ids opts]
  (let [admin-group-id (:id (perms/admin-group))
        promoted       (ids-of-rows #(and (true? (:is_superuser %)) (not (contains? admin-ids (:id %)))) updates)
        demoted        (ids-of-rows #(and (false? (:is_superuser %)) (contains? admin-ids (:id %))) updates)]
    (perms/without-is-superuser-sync-on-add-to-admin-group
     (perms-group-membership/add-users-to-groups! (for [user-id promoted] {:user user-id :group admin-group-id}) opts)
     (perms-group-membership/remove-users-from-groups! demoted [admin-group-id] opts))))

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
  "The ids of the Users of Tenants that were deactivated with them, see [[users.db/deactivated-with-tenant-user-ids]]."
  users.db/deactivated-with-tenant-user-ids)

(def active-user-ids-of-tenant
  "The ids of the active Users of Tenants, see [[users.db/active-user-ids-of-tenant]]."
  users.db/active-user-ids-of-tenant)

(def active-tenant-user-ids
  "The ids of the active Users of every Tenant, see [[users.db/active-tenant-user-ids]]."
  users.db/active-tenant-user-ids)

(defn- admin-or-activity-change?
  "Whether the update `row` sets the superuser flag or deactivates its User, which cascades to memberships and
  subscriptions."
  [row]
  (or (some? (:is_superuser row)) (false? (:is_active row))))

(defn- demotes-or-deactivates?
  "Whether the update `row` unsets the superuser flag or deactivates its User."
  [row]
  (or (false? (:is_active row)) (false? (:is_superuser row))))

(defn- admin-member-ids
  "The ids of the Users of `updates` that are members of Administrators, read once when some row sets the superuser
  flag or deactivates its User."
  [updates]
  (if-let [user-ids (not-empty (set (ids-of-rows admin-or-activity-change? updates)))]
    (users.db/group-member-ids (:id (perms/admin-group)) user-ids)
    #{}))

(defn- check-admins-remain
  "Throws a 400 unless `updates`, every row of the call together and before anything is written, with `admin-ids` the
  Administrators members among their Users, satisfy these rules:

  - an active superuser member of Administrators remains besides the members whose rows deactivate or demote them"
  [updates admin-ids]
  (when-let [losing-admin-ids (not-empty (filterv admin-ids (ids-of-rows demotes-or-deactivates? updates)))]
    (perms-group-membership/throw-if-last-admins! losing-admin-ids)))

(defn- check-user-updates
  "Throws a 400 unless the `updates` of one batch satisfy these rules, against the Users stored by earlier batches:

  - no two rows have the same id
  - each email is free, see [[check-emails-free]]"
  [updates]
  (when (not= (count updates) (count (into #{} (map :id) updates)))
    (throw (ex-info (tru "A User can be updated only once in a call.") {:status-code 400})))
  (check-emails-free updates))

(defn- update-user-batch!
  "Check and write `updates`, one batch of a call, and return the rows of existing Users with the Users by id as stored
  before and after."
  [updates]
  (let [id->stored (users.db/users-by-ids (mapv :id updates))
        updates    (filterv (comp id->stored :id) updates)]
    (check-user-updates updates)
    (users.db/update-users! updates)
    {:updates     updates
     :id->stored  id->stored
     :id->updated (users-after id->stored updates)}))

(defn- cascade-user-updates!
  "Keep the Administrators memberships and subscriptions of the Users of `updates` in step with them, one write per kind
  for the whole call, with `admin-ids` the Administrators members among them, publishing the events of the writes with
  `opts`."
  [updates admin-ids opts]
  (set-admin-memberships! updates admin-ids opts)
  (when-let [deactivated (not-empty (ids-of-rows #(false? (:is_active %)) updates))]
    (delete-subscriptions! deactivated opts)))

(mu/defn update-users! :- :int
  "Apply `updates`, each the id of a User and the columns to set, in one transaction and return the number of rows of
  existing Users, publishing their update event with `opts`; deactivating or demoting the last admin throws, a change of
  `is_superuser` adds or removes the Administrators membership, and deactivating a User deletes its subscriptions."
  ([updates :- [:sequential ::users.schema/user.update-row]]
   (update-users! updates nil))
  ([updates :- [:sequential ::users.schema/user.update-row]
    opts    :- [:maybe ::write-opts]]
   (t2/with-transaction [_conn]
     (let [admin-ids (admin-member-ids updates)]
       (check-admins-remain updates admin-ids)
       (let [batches (mapv (comp update-user-batch! vec) (partition-all app-db/update-partition-size updates))
             updated (into [] (mapcat :updates) batches)]
         (when (seq updated)
           (events/publish-event! :event/user-update
                                  (events/update-event (into {} (map :id->stored) batches)
                                                       updated
                                                       (assoc opts :objects (into {} (map :id->updated) batches)))))
         (cascade-user-updates! updated admin-ids opts)
         (count updated))))))

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

(defn- set-member-flag!
  "Apply the flag `changes` to the Users with `user-ids` over `stored`, a map from id to User, publishing the update event
  with `opts`, and return `stored` with the rows after the update."
  [stored [user-ids changes] opts]
  (let [updates (into [] (comp (filter stored) (map #(assoc changes :id %))) user-ids)
        event   (events/update-event stored updates (assoc opts :objects (users-after stored updates)))]
    (users.db/update-users! updates)
    (events/publish-event! :event/user-update event)
    (into stored (map (juxt (comp :id :object) :object)) (:changes event))))

(defmethod perms-group-membership/set-member-flags-of! :model/User
  [_model flag-changes opts]
  (let [stored (users.db/users-by-ids (into [] (comp (mapcat first) (distinct)) flag-changes))]
    (reduce #(set-member-flag! %1 %2 opts) stored flag-changes)
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
