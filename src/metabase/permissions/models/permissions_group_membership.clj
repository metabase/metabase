(ns metabase.permissions.models.permissions-group-membership
  (:require
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PermissionsGroupMembership [_model] :permissions_group_membership)

(derive :model/PermissionsGroupMembership :metabase/model)

(def fail-to-remove-last-admin-msg
  "Exception message when try to remove the last admin."
  (deferred-tru "You cannot remove the last member of the ''Admin'' group!"))

(def fail-to-add-data-analyst-msg
  "Exception message when trying to add a member to the Data Analysts group without the `:advanced-permissions`
  premium feature."
  (deferred-tru (str "Adding people to the ''Data Analysts'' group requires the Advanced Permissions feature, "
                     "which is not enabled on this instance.")))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *allow-changing-all-users-group-members*
  "Should we allow people to be added to or removed from the All Users permissions group? By default, this is `false`,
  but enable it when adding or deleting users."
  false)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *allow-changing-all-external-users-group-members*
  "Should we allow people to be added to or removed from the All tenant users permissions group? By default, this is
  `false`, but enable it when adding or deleting users."
  false)

(defmacro allow-changing-all-users-group-members
  "Allow people to be added to or removed from the All Users permissions group? By default, this is disallowed."
  {:style/indent 0}
  [& body]
  `(binding [*allow-changing-all-users-group-members* true]
     ~@body))

(defmacro allow-changing-all-external-users-group-members
  "Allow users to be added to or removed from the All tenant users permissions group? By default, this is disallowed."
  {:style/indent 0}
  [& body]
  `(binding [*allow-changing-all-external-users-group-members* true]
     ~@body))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private *update-user-when-added-to-admin-group?* true)

(defmacro without-is-superuser-sync-on-add-to-admin-group
  "When inserting a superuser, we don't want the group membership insert to trigger a recursive update on the
  just-inserted user."
  [& body]
  `(binding [*update-user-when-added-to-admin-group?* false]
     (do ~@body)))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/PermissionsGroupMembership
  [membership]
  (let [changes (t2/changes membership)]
    (when (contains? changes :user_id)
      (throw (ex-info (tru "You cannot move a group membership to another user.") {:status-code 400})))
    (when (contains? changes :group_id)
      (throw (ex-info (tru "You cannot move a group membership to another group.") {:status-code 400})))
    membership))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroupMembership :can_read]
  "Whether the current user can read each of `memberships`, which they can when they manage its group."
  [_model k memberships]
  (let [manages? (perms-group/manageable-group-id-fn)]
    (for [membership memberships]
      (when membership
        (vary-meta membership assoc k (manages? (:group_id membership)))))))

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroupMembership :can_write]
  "Whether the current user can write each of `memberships`, which they can when they manage its group."
  [_model k memberships]
  (let [manages? (perms-group/manageable-group-id-fn)]
    (for [membership memberships]
      (when membership
        (assoc membership k (manages? (:group_id membership)))))))

(defmethod mi/can-create? :model/PermissionsGroupMembership
  [_model {:keys [group_id]}]
  ((perms-group/manageable-group-id-fn) group_id))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-not-all-users-group
  "Throw an Exception if we're trying to add or remove a user to the All Users group."
  [group-id]
  (when (= group-id (:id (perms-group/all-users)))
    (when-not *allow-changing-all-users-group-members*
      (throw (ex-info (tru "You cannot add or remove users to/from the ''All Users'' group.")
                      {:status-code 400})))))

(defn- check-not-all-external-users-group
  "Throw an Exception if we're trying to add or remove a user to the All Users group."
  [group-id]
  (when (= group-id (:id (perms-group/all-external-users)))
    (when-not *allow-changing-all-external-users-group-members*
      (throw (ex-info (tru "You cannot add or remove users to/from the ''All tenant users'' group.")
                      {:status-code 400})))))

(defn- check-magic-group-members-unchanged
  "Throws a 400 when `group-ids` hold All Users or All tenant users outside the scope that allows changing their
  members."
  [group-ids]
  (doseq [group-id (distinct group-ids)]
    (check-not-all-users-group group-id)
    (check-not-all-external-users-group group-id)))

(defn- check-can-add-to-data-analyst-group
  "Throw a 402 if we're trying to *add* a user to the Data Analysts group without the `:advanced-permissions` premium
  feature. Removals are never gated."
  [group-ids]
  (when (and (some #{(:id (perms-group/data-analyst))} group-ids)
             (not (premium-features/enable-advanced-permissions?)))
    (throw (ex-info (str fail-to-add-data-analyst-msg)
                    {:status-code 402}))))

(defn- check-admins-remain
  "Throws a 400 when no active superuser member of the Admin group is left besides the Users with `user-ids`."
  [user-ids]
  (when (zero? (permissions.db/other-active-member-count (u/the-id (perms-group/admin)) (set user-ids)))
    (throw (ex-info (str fail-to-remove-last-admin-msg)
                    {:status-code 400}))))

(defn throw-if-last-admins!
  "Throw an Exception if there are no admins left besides the Users with `user-ids`, which are about to be archived or
  have their admin status removed, in one query."
  [user-ids]
  (when (seq user-ids)
    (check-admins-remain (set user-ids))))

(defn- check-group-manager-member
  "Throws a 400 when `membership` makes `member`, its User, a tenant user or an admin a group manager."
  [{:keys [user_id is_group_manager]} member]
  (when is_group_manager
    (when (:tenant_id member)
      (throw (ex-info (tru "Tenant users cannot be made group managers")
                      {:user-id user_id :status-code 400})))
    (when (:is_superuser member)
      (throw (ex-info (tru "Admin cannot be a group manager.")
                      {:user-id user_id :status-code 400})))))

(defn- check-tenancy-matches
  "Throws a 400 when `membership` puts `member`, its User, a tenant user in a non-tenant group or a non-tenant user in a
  tenant group, by the `:is_tenant_group` of each group `group-id->tenant?` holds."
  [{:keys [user_id group_id]} member group-id->tenant?]
  (let [group-tenant?     (when (contains? group-id->tenant? group_id)
                            (boolean (group-id->tenant? group_id)))
        user-tenant?      (some? (:tenant_id member))]
    (when (not= group-tenant? user-tenant?)
      (throw (ex-info (tru "Cannot add non-tenant user to tenant-group or vice versa")
                      {:bad-user-group-pairs [{:user-id          user_id
                                               :group-id         group_id
                                               :user-is-tenant?  user-tenant?
                                               :group-is-tenant? group-tenant?}]
                       :status-code          400})))))

(defn- check-members
  "Throws a 400 unless every one of `memberships` satisfies these rules, with the Users and groups of all of them read
  once and the message of the first that breaks one:

  - a tenant user is not a group manager
  - an admin is not a group manager
  - a tenant user is in a tenant group, and a user outside every tenant in a group that is not one"
  [memberships]
  (when (seq memberships)
    (let [members           (u/index-by :id (permissions.db/member-flags (into #{} (map :user_id) memberships)))
          group-id->tenant? (permissions.db/group-tenant-flags (into #{} (map :group_id) memberships))]
      (doseq [membership memberships
              :let       [member (get members (:user_id membership))]]
        (check-group-manager-member membership member)
        (check-tenancy-matches membership member group-id->tenant?)))))

(mr/def ::write-opts
  [:map {:closed true}
   [:context {:optional true} :metabase.events.schema/context]])

(defmulti set-member-flags-of!
  "Set the flags a membership implies on the rows of `model`, `flag-changes` holding `[user-ids changes]` pairs of
  `is_superuser` or `is_data_analyst` applied in their order, without the cascades of an ordinary update, publishing
  the events of the writes with the `:context` of `opts`; the User model, whose namespace requires this one, implements it."
  {:arglists '([model flag-changes opts])}
  (fn [model _flag-changes _opts] model))

(defn- set-member-flags!
  "Set the `is_superuser` flag of the Users of `memberships` in the Administrators group, and the `is_data_analyst` flag
  of those in the Data Analysts group, to `value`, publishing the events of the writes with `opts`."
  [memberships value opts]
  (let [flag-changes (into []
                           (keep (fn [[group-id flag]]
                                   (let [user-ids (into #{} (comp (filter #(= group-id (:group_id %))) (map :user_id))
                                                        memberships)]
                                     (when (seq user-ids)
                                       [user-ids {flag value}]))))
                           [[(:id (perms-group/admin)) :is_superuser]
                            [(:id (perms-group/data-analyst)) :is_data_analyst]])]
    (when (seq flag-changes)
      (t2/resolve-model :model/User)
      (set-member-flags-of! :model/User flag-changes opts))))

(defn- delete-memberships!
  "Delete `memberships`, keeping at least one active admin, and unset the flags their Administrators and Data Analysts
  rows set on their Users, publishing the events of the writes with `opts`."
  [memberships opts]
  (when (seq memberships)
    (t2/with-transaction [_conn]
      (check-magic-group-members-unchanged (map :group_id memberships))
      (let [admin-id    (:id (perms-group/admin))
            admin-rows? #(= admin-id (:group_id %))]
        (when-let [admin-user-ids (not-empty (into #{} (comp (filter admin-rows?) (map :user_id)) memberships))]
          (check-admins-remain admin-user-ids))
        (events/publish-event! :event/group-membership-delete (events/delete-event (vec memberships) opts))
        (permissions.db/delete-group-memberships! (mapv :id memberships))
        (set-member-flags! (cond->> memberships
                             (not *update-user-when-added-to-admin-group?*) (remove admin-rows?))
                           false
                           opts)))))

(mr/def ::new-memberships
  [:sequential
   [:map {:closed true}
    [:group [:or
             pos-int?
             ::permissions.schema/permissions-group]]
    [:user [:or pos-int? :metabase.users.schema/user]]
    [:is-group-manager? {:optional true}
     [:maybe :boolean]]]])

(defn- requested-memberships
  "The map from `[user-id group-id]` to whether the User manages the group, for the `pgms`, maps of a user, a group and
  `:is-group-manager?`; two of them for the same user and group that disagree throw."
  [pgms]
  (->> pgms
       (map (fn [{:keys [user group is-group-manager?]}]
              {:user-id           (u/the-id user)
               :group-id          (u/the-id group)
               :is-group-manager? is-group-manager?}))
       (group-by (juxt :user-id :group-id))
       (m/map-vals (fn [pgms]
                     (when-not (= 1 (count (distinct pgms)))
                       (throw (ex-info "Conflicting permissions group memberships"
                                       {:conflicts (distinct pgms)})))
                     (boolean (:is-group-manager? (first pgms)))))))

(defn- missing-memberships
  "The membership rows of `requested`, the map from `[user-id group-id]` to the manager flag, whose user and group are
  not members already, with the existing pairs read once."
  [requested]
  (let [existing (permissions.db/existing-membership-pairs (keys requested))]
    (for [[[user-id group-id] is-group-manager?] requested
          :when (not (contains? existing [user-id group-id]))]
      {:user_id user-id :group_id group-id :is_group_manager is-group-manager?})))

(mu/defn add-users-to-groups! :- :nil
  "Create the memberships of the `pgms`, maps of a user, a group and `:is-group-manager?`, that do not exist yet,
  publishing the events of the writes with `opts`."
  ([pgms :- ::new-memberships]
   (add-users-to-groups! pgms nil))
  ([pgms :- ::new-memberships
    opts :- [:maybe ::write-opts]]
   (when (seq pgms)
     (let [memberships (missing-memberships (requested-memberships pgms))]
       (when (seq memberships)
         (t2/with-transaction [_conn]
           (check-magic-group-members-unchanged (map :group_id memberships))
           (check-can-add-to-data-analyst-group (map :group_id memberships))
           (check-members memberships)
           (let [created (permissions.db/insert-group-memberships! (vec memberships))]
             (events/publish-event! :event/group-membership-create (events/create-event created opts))
             (set-member-flags! (cond->> created
                                  (not *update-user-when-added-to-admin-group?*)
                                  (remove #(= (:id (perms-group/admin)) (:group_id %))))
                                true
                                opts))))))
   nil))

(mu/defn remove-users-from-groups! :- :nil
  "Remove each of the `users` from each of the `groups`, given as instances or ids, publishing the events of the writes
  with `opts`."
  ([users  :- [:sequential [:or pos-int? :metabase.users.schema/user]]
    groups :- [:sequential [:or pos-int? ::permissions.schema/permissions-group]]]
   (remove-users-from-groups! users groups nil))
  ([users  :- [:sequential [:or pos-int? :metabase.users.schema/user]]
    groups :- [:sequential [:or pos-int? ::permissions.schema/permissions-group]]
    opts   :- [:maybe ::write-opts]]
   (when (and (seq users) (seq groups))
     (delete-memberships! (permissions.db/memberships-for-users-in-groups (mapv u/the-id users) (mapv u/the-id groups))
                          opts))
   nil))

(defn- check-membership-update
  "Throws a 400 unless `changes` to the PermissionsGroupMembership stored as `before`, of the User `member`, satisfy
  these rules, in this order:

  - a tenant user is not made a group manager
  - an admin is not made a group manager
  - the membership moves to no other user or group"
  [before changes member]
  (when (:is_group_manager changes)
    (check-group-manager-member (merge before changes) member))
  (t2.before-update/before-update :model/PermissionsGroupMembership (merge before changes)))

(mu/defn update-permissions-group-memberships! :- :nil
  "Apply `changes` to the PermissionsGroupMemberships with `ids`, publishing the event of the write; making a tenant
  user or an admin a group manager is a 400. The refusal of the first refused membership in the order of `ids` is the
  one thrown."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- ::permissions.schema/permissions-group-membership.update]
  (t2/with-transaction [_conn]
    (let [stored  (if (seq ids) (u/index-by :id (permissions.db/group-memberships-by-ids ids)) {})
          ids     (into [] (comp (distinct) (filter stored)) ids)
          members (if (and (:is_group_manager changes) (seq ids))
                    (u/index-by :id (permissions.db/member-flags (into #{} (map (comp :user_id stored)) ids)))
                    {})]
      (doseq [id ids
              :let [before (stored id)]]
        (check-membership-update before changes (get members (:user_id before))))
      (when (seq ids)
        (permissions.db/update-group-memberships! ids changes)
        (events/publish-event! :event/group-membership-update
                               (events/update-event stored (mapv #(assoc changes :id %) ids))))))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/PermissionsGroupMembership [_model]
  {:skip? false})

(defmethod change-log/spec :model/PermissionsGroupMembership [_model]
  {:track [:user_id :group_id :is_group_manager]
   :skip  []})

(defmethod audit/spec :model/PermissionsGroupMembership [_model]
  {:track          [:id :user_id :group_id :is_group_manager]
   :track-redacted []
   :skip           []
   :topics         {:create :group-membership-create
                    :delete :group-membership-delete}})
