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
   [toucan2.core :as t2]))

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

(defn throw-if-last-admin!
  "Throw an Exception if there are no admins left besides this one. The assumption is that the one admin is about to be
  archived or have their admin status removed."
  [user-id]
  (check-admins-remain #{user-id}))

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
  "Throws a 400 when one of `memberships` makes a tenant user or an admin a group manager or puts a User in a group of
  the other tenancy, with the Users and groups of all of them read once."
  [memberships]
  (when (seq memberships)
    (let [members           (u/index-by :id (permissions.db/member-flags (into #{} (map :user_id) memberships)))
          group-id->tenant? (permissions.db/group-tenant-flags (into #{} (map :group_id) memberships))]
      (doseq [membership memberships
              :let       [member (get members (:user_id membership))]]
        (check-group-manager-member membership member)
        (check-tenancy-matches membership member group-id->tenant?)))))

(defmulti set-member-flags-of!
  "Set the flags a membership implies on the rows of `model`, `flag-changes` holding `[user-ids changes]` pairs of
  `is_superuser` or `is_data_analyst` applied in their order, without the cascades of an ordinary update, publishing
  the events of the writes with `context`. The User model, whose namespace requires this one, implements it with its own
  write function."
  {:arglists '([model flag-changes context])}
  (fn [model _flag-changes _context] model))

(defn- set-member-flags!
  "Set the `is_superuser` flag of the Users of `memberships` in the Administrators group, and the `is_data_analyst` flag
  of those in the Data Analysts group, to `value`, publishing the events of the writes with `context`."
  [memberships value context]
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
      (set-member-flags-of! :model/User flag-changes context))))

(defn- delete-memberships!
  "Delete `memberships`, keeping at least one active admin, and unset the flags their Administrators and Data Analysts
  rows set on their Users, publishing the events of the writes with `context`."
  [memberships context]
  (when (seq memberships)
    (t2/with-transaction [_conn]
      (check-magic-group-members-unchanged (map :group_id memberships))
      (let [admin-id    (:id (perms-group/admin))
            admin-rows? #(= admin-id (:group_id %))]
        (when-let [admin-user-ids (not-empty (into #{} (comp (filter admin-rows?) (map :user_id)) memberships))]
          (check-admins-remain admin-user-ids))
        (events/publish-event! :event/group-membership-delete (events/delete-event (vec memberships) context))
        (permissions.db/delete-group-memberships! (mapv :id memberships))
        (set-member-flags! (cond->> memberships
                             (not *update-user-when-added-to-admin-group?*) (remove admin-rows?))
                           false
                           context)))))

(mr/def ::new-memberships
  [:sequential
   [:map {:closed true}
    [:group [:or
             pos-int?
             ::permissions.schema/permissions-group]]
    [:user [:or pos-int? :metabase.users.schema/user]]
    [:is-group-manager? {:optional true}
     :boolean]]])

(mu/defn add-users-to-groups! :- :nil
  "Creates permission group memberships from a sequence of maps of users, groups and is-group-manager?, publishing the
  events of the writes with `context`."
  ([pgms :- ::new-memberships]
   (add-users-to-groups! pgms nil))
  ([pgms    :- ::new-memberships
    context :- [:maybe :metabase.events.schema/context]]
   (when (seq pgms)
     (let [pgms (->> pgms
                     (map (fn [{:keys [user group is-group-manager?]}]
                            {:user-id (u/the-id user)
                             :group-id (u/the-id group)
                             :is-group-manager? is-group-manager?})))
           user-id-group-id->is-group-manager? (->> pgms
                                                    (group-by (juxt :user-id :group-id))
                                                    (m/map-vals (fn [pgms]
                                                                  (when-not (= 1 (count (distinct pgms)))
                                                                    (throw (ex-info "Conflicting permissions group memberships"
                                                                                    {:conflicts (distinct pgms)})))
                                                                  (boolean (:is-group-manager? (first pgms))))))
           existing    (permissions.db/existing-membership-pairs (keys user-id-group-id->is-group-manager?))
           memberships (for [[[user-id group-id] is-group-manager?] user-id-group-id->is-group-manager?
                             :when (not (contains? existing [user-id group-id]))]
                         {:user_id user-id :group_id group-id :is_group_manager is-group-manager?})]
       (when (seq memberships)
         (t2/with-transaction [_conn]
           (check-magic-group-members-unchanged (map :group_id memberships))
           (check-can-add-to-data-analyst-group (map :group_id memberships))
           (check-members memberships)
           (let [created (permissions.db/insert-group-memberships! (vec memberships))]
             (events/publish-event! :event/group-membership-create (events/create-event created context))
             (set-member-flags! (cond->> created
                                  (not *update-user-when-added-to-admin-group?*)
                                  (remove #(= (:id (perms-group/admin)) (:group_id %))))
                                true
                                context))))))
   nil))

(defn add-user-to-groups!
  "Add a user to multiple groups"
  ([user-id-or-user group-ids-or-groups] (add-user-to-groups! user-id-or-user group-ids-or-groups false))
  ([user-id-or-user group-ids-or-groups is-group-manager?]
   (add-users-to-groups! (for [group-id-or-group group-ids-or-groups]
                           {:group group-id-or-group
                            :user user-id-or-user
                            :is-group-manager? is-group-manager?}))))

(defn add-user-to-group!
  "Add a user to a group."
  ([user-id-or-user group-id-or-group] (add-user-to-group! user-id-or-user group-id-or-group false))
  ([user-id-or-user group-id-or-group is-group-manager?] (add-user-to-groups! user-id-or-user [group-id-or-group] is-group-manager?)))

(mu/defn remove-users-from-group! :- :nil
  "Remove the Users with `user-ids` from the group with `group-id`, publishing the events of the writes with `context`."
  ([user-ids :- [:sequential pos-int?]
    group-id :- pos-int?]
   (remove-users-from-group! user-ids group-id nil))
  ([user-ids :- [:sequential pos-int?]
    group-id :- pos-int?
    context  :- [:maybe :metabase.events.schema/context]]
   (when (seq user-ids)
     (delete-memberships! (permissions.db/memberships-for-users-in-group user-ids group-id) context))
   nil))

(defn remove-user-from-groups!
  "Removes a user from groups."
  ([user-id-or-user group-ids-or-groups]
   (remove-user-from-groups! user-id-or-user group-ids-or-groups nil))
  ([user-id-or-user group-ids-or-groups context]
   (when (seq group-ids-or-groups)
     (delete-memberships! (permissions.db/memberships-for-user-in-groups (u/the-id user-id-or-user)
                                                                         (map u/the-id group-ids-or-groups))
                          context))))

(defn remove-user-from-group!
  "Removes a user from a group."
  [user-id-or-user group-ids-or-groups]
  (remove-user-from-groups! user-id-or-user [group-ids-or-groups]))

(defn remove-all-users-from-group!
  "Removes all users from a group."
  [group-id]
  (delete-memberships! (permissions.db/memberships-for-group group-id) nil))

(defn remove-user-from-all-groups!
  "Removes a user from all groups."
  [user-id]
  (delete-memberships! (permissions.db/memberships-for-user user-id) nil))

(mu/defn update-permissions-group-membership!
  "Apply `changes` to the PermissionsGroupMembership with `id`, returning the number updated and publishing the event of
  the write; making a tenant user or an admin a group manager is a 400."
  [id      :- ms/PositiveInt
   changes :- ::permissions.schema/permissions-group-membership.update]
  (t2/with-transaction [_conn]
    (let [stored (permissions.db/group-membership id)]
      (when (and stored (:is_group_manager changes))
        (check-group-manager-member (merge stored changes)
                                    (first (permissions.db/member-flags #{(:user_id stored)}))))
      (u/prog1 (permissions.db/update-group-membership! id changes)
        (when stored
          (events/publish-event! :event/group-membership-update
                                 (events/update-event {id stored} [(assoc changes :id id)])))))))

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
