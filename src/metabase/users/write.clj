(ns metabase.users.write
  "The full writes of a User that the user-facing entry points make: inviting, updating and reactivating a User, and
  setting their group memberships."
  (:require
   [clojure.set :as set]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.tenants.core :as tenants]
   [metabase.users.db :as users.db]
   [metabase.users.models.user :as user]
   [metabase.users.schema :as users.schema]
   [metabase.users.util :as users.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Group memberships -----------------------------------------------

(defn- maybe-set-user-permissions-groups!
  [user-or-id new-groups-or-ids]
  (when (and new-groups-or-ids
             (not= (user/group-ids user-or-id)
                   (set (map u/the-id new-groups-or-ids))))
    (api/check-superuser)
    (user/set-permissions-groups! user-or-id new-groups-or-ids)))

(defenterprise set-group-memberships!
  "Set the group memberships of `user-or-id`. Without advanced permissions only the group IDs count, and changing them
  requires a superuser."
  metabase-enterprise.advanced-permissions.oss-hooks
  [user-or-id new-user-group-memberships]
  (maybe-set-user-permissions-groups! user-or-id (map :id new-user-group-memberships)))

(mu/defn maybe-set-user-group-memberships!
  "Implementation for `POST /api/user` and friends; set the PermissionsGroupMemberships for a `user-or-id`."
  [user-or-id :- ::lib.schema.id/user
   new-user-group-memberships :- [:maybe [:sequential ::users.schema/user-group-membership]]
   & [is-superuser?] :- [:* [:maybe :boolean]]]
  (when new-user-group-memberships
    (when (some? is-superuser?)
      (api/checkp (= is-superuser? (contains? (set (map :id new-user-group-memberships)) (u/the-id (perms/admin-group))))
                  "is_superuser" (tru "Value of is_superuser must correspond to presence of Admin group ID in group_ids.")))
    (set-group-memberships! user-or-id new-user-group-memberships)))

;;; ----------------------------------------------------- Invite -----------------------------------------------------

(mu/defn create-and-invite-user!
  "Creates `new-user` and publishes `:event/user-invited`, whose notification sends the invite mail."
  ([new-user :- users.schema/NewUser
    invitor  :- ::users.schema/user
    setup?   :- :boolean]
   (create-and-invite-user! new-user invitor setup? nil))
  ([new-user      :- users.schema/NewUser
    invitor       :- ::users.schema/user
    setup?        :- :boolean
    invite-target :- [:maybe users.schema/InviteTarget]]
   (u/prog1 (users.db/insert-user! new-user)
     (events/publish-event! :event/user-invited
                            {:object
                             (cond-> (assoc <>
                                            :is_from_setup setup?
                                            :invite_method "email"
                                            :sso_source    (:sso_source new-user))
                               invite-target (assoc :invite_target invite-target))
                             :details {:invitor (select-keys invitor [:email :first_name])}}))))

(mu/defn invite-user!
  "Implementation for `POST /api/user`, invites a user to Metabase."
  [{:keys [email
           user-group-memberships
           source
           tenant-id
           invite-target]
    :as   attributes} :- [:map {:closed true}
                          [:first-name              {:optional true} [:maybe ms/NonBlankString]]
                          [:last-name               {:optional true} [:maybe ms/NonBlankString]]
                          [:email                   ms/Email]
                          [:password                {:optional true} [:maybe ms/NonBlankString]]
                          [:user-group-memberships  {:optional true} [:maybe [:sequential ::users.schema/user-group-membership]]]
                          [:login-attributes        {:optional true} [:maybe users.schema/LoginAttributes]]
                          [:source                  {:optional true, :default :admin} [:enum :setup :admin]]
                          [:tenant-id               {:optional true} [:maybe ms/PositiveInt]]
                          [:invite-target           {:optional true} [:maybe users.schema/InviteTarget]]]]
  (api/check-400 (not (users.db/user-email-exists? (u/lower-case-en email)))
                 {:errors     {:email (tru "Email address already in use.")}
                  :error_code "email-already-in-use"})
  (api/checkp (not (and tenant-id
                        (not (setting/get :use-tenants))))
              "tenant_id"
              (tru "Cannot create a Tenant User as Tenants are not enabled for this instance."))
  (t2/with-transaction [_conn]
    (let [new-user-id (u/the-id
                       (notification/with-skip-sending-notification (boolean tenant-id)
                         (create-and-invite-user!
                          (-> attributes
                              (u/select-non-nil-keys [:first-name :last-name :email :password :login-attributes :tenant-id])
                              (set/rename-keys {:first-name             :first_name
                                                :last-name              :last_name
                                                :user-group-memberships :user_group_memberships
                                                :login-attributes       :login_attributes
                                                :tenant-id              :tenant_id}))
                          @api/*current-user*
                          (= source :setup)
                          invite-target)))]
      (when-let [password (:password attributes)]
        (auth-identity/set-password! new-user-id password))
      (maybe-set-user-group-memberships! new-user-id user-group-memberships)
      (when (= source :setup)
        (maybe-set-user-permissions-groups! new-user-id [(perms/all-users-group) (perms/admin-group)]))
      (analytics/track-event! :snowplow/invite
                              {:event           :invite-sent
                               :invited-user-id new-user-id
                               :source          (or source :admin)})
      (-> (users.util/fetch-user :id new-user-id)
          (t2/hydrate :user_group_memberships)))))

;;; ----------------------------------------------------- Update -----------------------------------------------------

(defn- updated-user-name
  "The first and last name of `user-before-update` with `changes` applied, or nil when neither changes."
  [user-before-update changes]
  (let [[previous current] (map #(select-keys % [:first_name :last_name]) [user-before-update changes])
        updated-names (merge previous current)]
    (when (not= previous updated-names)
      updated-names)))

(defn- maybe-update-user-personal-collection-name!
  "Renames the Personal Collection of `user-before-update`, if it has one, when `changes` change their name."
  [user-before-update changes]
  (when-some [{:keys [first_name last_name]} (updated-user-name user-before-update changes)]
    (when-some [collection (collection/user->existing-personal-collection (u/the-id user-before-update))]
      (let [{email :email} user-before-update
            new-collection-name (collection/format-personal-collection-name first_name last_name email :site)]
        (when-not (= new-collection-name (:name collection))
          (users.db/rename-collection! (:id collection) new-collection-name))))))

(defn- reset-magic-group-membership!
  "Removes `user-id` from every group and adds them to All Users, or to All tenant users when `tenant-id` is set."
  [user-id tenant-id]
  (perms/allow-changing-all-users-group-members
    (perms/allow-changing-all-external-users-group-members
     (perms/remove-user-from-all-groups! user-id)
     (when tenant-id
       (perms/add-user-to-group! user-id (perms/all-external-users-group)))
     (when (nil? tenant-id)
       (perms/add-user-to-group! user-id (perms/all-users-group))))))

(mu/defn update-user!
  "Applies `changes` to `user-before-update` for `PUT /api/user/:id` in one transaction, with the follow-up writes: the
  magic group memberships of a new tenant, the Personal Collection name, the Data Analysts membership when
  `:is-data-analyst?` is given, and the group memberships."
  [user-before-update :- [:map [:id ::lib.schema.id/user]]
   changes            :- ::users.schema/user.update
   {:keys [user-group-memberships is-superuser?] :as opts}
   :- [:map {:closed true}
       [:user-group-memberships {:optional true} [:maybe [:sequential ::users.schema/user-group-membership]]]
       [:is-superuser?          {:optional true} [:maybe :boolean]]
       [:is-data-analyst?       {:optional true} [:maybe :boolean]]]]
  (let [id (u/the-id user-before-update)]
    (t2/with-transaction [_conn]
      (when (seq changes)
        (users.db/update-user! id changes)
        (when (contains? changes :tenant_id)
          (api/check-400 (not (and (:tenant_id changes) (:is_superuser changes)))
                         "Superusers cannot be tenant users")
          (reset-magic-group-membership! id (:tenant_id changes)))
        (maybe-update-user-personal-collection-name! user-before-update changes))
      (when (contains? opts :is-data-analyst?)
        (let [data-analyst-group-id (:id (perms/data-analyst-group))]
          (if (:is-data-analyst? opts)
            (perms/add-user-to-group! id data-analyst-group-id)
            (perms/remove-user-from-group! id data-analyst-group-id))))
      (maybe-set-user-group-memberships! id user-group-memberships is-superuser?))))

;;; --------------------------------------------------- Reactivate ---------------------------------------------------

(mu/defn reactivate-user!
  "Reactivates the inactive `existing-user` as a non-superuser for `PUT /api/user/:id/reactivate`, turning a Google or
  LDAP user whose sign-in method is no longer enabled into a regular user, and returns them."
  [existing-user :- [:map
                     [:id         ::lib.schema.id/user]
                     [:is_active  :boolean]
                     [:sso_source [:maybe :keyword]]
                     [:tenant_id  [:maybe ms/PositiveInt]]]]
  (api/check (not (:is_active existing-user))
             [400 {:message (tru "Not able to reactivate an active user")}])
  (api/check (tenants/tenant-is-active? (:tenant_id existing-user))
             [400 {:message (tru "Not able to reactivate a user in a deactivated tenant")}])
  (users.db/update-user! (u/the-id existing-user)
                         {:is_active    true
                          :is_superuser false
                          :sso_source   (case (:sso_source existing-user)
                                          :google (when (setting/get :google-auth-enabled) :google)
                                          :ldap   (when (setting/get :ldap-enabled) :ldap)
                                          (:sso_source existing-user))})
  (users.util/fetch-user :id (u/the-id existing-user)))
