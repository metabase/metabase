(ns metabase.permissions.models.permissions-group-membership
  (:require
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.audit :as permissions.audit]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PermissionsGroupMembership [_model] :permissions_group_membership)

(derive :model/PermissionsGroupMembership :metabase/model)
(derive :model/PermissionsGroupMembership :hook/events)

(defmethod events/spec :model/PermissionsGroupMembership
  [_model]
  {:create :event/group-membership-create
   :update :event/group-membership-update
   :delete :event/group-membership-delete})

(defmethod audit/spec :model/PermissionsGroupMembership [_model]
  {:track          [:user_id :group_id :is_group_manager]
   :track-redacted []
   :skip           []
   :changes?       false
   :details        permissions.audit/membership-details
   :subject        permissions.audit/membership-subject
   :topics         {:create :group-membership-create
                    :delete :group-membership-delete}})

(defmethod change-log/spec :model/PermissionsGroupMembership [_model]
  {:track [:user_id :group_id :is_group_manager]
   :skip  []})

(defmethod app-db-copy/spec :model/PermissionsGroupMembership [_model]
  {:skip? false})

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

(defn- check-can-add-to-data-analyst-group
  "Throw a 402 if we're trying to *add* a user to the Data Analysts group without the `:advanced-permissions` premium
  feature. Removals are never gated."
  [group-id]
  (when (and (= group-id (:id (perms-group/data-analyst)))
             (not (premium-features/enable-advanced-permissions?)))
    (throw (ex-info (str fail-to-add-data-analyst-msg)
                    {:status-code 402}))))

(defn- check-admins-remain
  "Throws a 400 when no active superuser member of the Admin group is left besides the Users with `user-ids`; the
  delete hook unsets the superuser flag of each membership it removes, so a statement removing several sees the flags
  its earlier rows unset."
  [user-ids]
  (when (zero? (permissions.db/other-active-member-count (u/the-id (perms-group/admin)) (set user-ids)))
    (throw (ex-info (str fail-to-remove-last-admin-msg)
                    {:status-code 400}))))

(defn throw-if-last-admin!
  "Throw an Exception if there are no admins left besides this one. The assumption is that the one admin is about to be
  archived or have their admin status removed."
  [user-id]
  (check-admins-remain #{user-id}))

(defn- member
  "The tenant id and superuser flag of the User of `membership`."
  [{:keys [user_id]}]
  (first (permissions.db/member-flags #{user_id})))

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

(t2/define-before-insert :model/PermissionsGroupMembership
  [{:keys [group_id] :as membership}]
  (check-not-all-users-group group_id)
  (check-not-all-external-users-group group_id)
  (check-can-add-to-data-analyst-group group_id)
  membership)

(defn- unchecked-rows
  "The `rows` of an INSERT that no build of it in this transaction has checked yet, remembering them by identity, as
  MySQL and MariaDB build the INSERT of each row again to read its key."
  [rows]
  (if-let [state (mdb/transaction-state)]
    (let [checked (::checked-rows (swap! state update ::checked-rows #(or % (java.util.Collections/newSetFromMap
                                                                             (java.util.IdentityHashMap.)))))]
      (locking checked
        (into [] (filter #(.add ^java.util.Set checked %)) rows)))
    rows))

(methodical/defmethod t2.pipeline/build :around [:toucan.query-type/insert.*
                                                 :model/PermissionsGroupMembership
                                                 clojure.lang.IPersistentMap]
  "Checks the Users of every membership an INSERT writes against its group, in one read of them for the statement."
  [query-type model parsed-args resolved-query]
  (check-members (unchecked-rows (or (:rows parsed-args) (:rows resolved-query))))
  (next-method query-type model parsed-args resolved-query))

(t2/define-after-insert :model/PermissionsGroupMembership
  [{:keys [user_id group_id], :as membership}]
  (when (= group_id (:id (perms-group/admin)))
    (permissions.db/update-user! user_id {:is_superuser true}))
  (when (= group_id (:id (perms-group/data-analyst)))
    (permissions.db/update-user! user_id {:is_data_analyst true}))
  membership)

(t2/define-before-update :model/PermissionsGroupMembership
  [membership]
  (let [changes (t2/changes membership)]
    (when (contains? changes :user_id)
      (throw (ex-info (tru "You cannot move a group membership to another user.") {:status-code 400})))
    (when (contains? changes :group_id)
      (throw (ex-info (tru "You cannot move a group membership to another group.") {:status-code 400})))
    (when (:is_group_manager changes)
      (check-group-manager-member membership (member membership)))
    membership))

(t2/define-before-delete :model/PermissionsGroupMembership
  [{:keys [group_id user_id]}]
  (check-not-all-users-group group_id)
  (check-not-all-external-users-group group_id)
  (when (= group_id (:id (perms-group/admin)))
    (check-admins-remain #{user_id})
    (when *update-user-when-added-to-admin-group?*
      (permissions.db/update-user! user_id {:is_superuser false})))
  (when (= group_id (:id (perms-group/data-analyst)))
    (permissions.db/update-user! user_id {:is_data_analyst false})))

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

;;; ------------------------------------------------- Write helpers --------------------------------------------------

(mu/defn add-users-to-groups!
  "Creates permission group memberships from aa sequence of maps of users, groups and is-group-manager?."
  [pgms :- [:sequential
            [:map {:closed true}
             [:group [:or
                      pos-int?
                      ::permissions.schema/permissions-group]]
             [:user [:or pos-int? :metabase.users.schema/user]]
             [:is-group-manager? {:optional true}
              :boolean]]]]
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
          ;; re-adding an existing member is a no-op, so everything below only ever sees genuine additions:
          user-id-group-id->is-group-manager? (apply dissoc user-id-group-id->is-group-manager?
                                                     (permissions.db/existing-membership-pairs
                                                      (keys user-id-group-id->is-group-manager?)))]
      (when (seq user-id-group-id->is-group-manager?)
        (t2/with-transaction [_conn]
          (permissions.db/insert-group-memberships!
           (for [[[user-id group-id] is-group-manager?] user-id-group-id->is-group-manager?]
             {:user_id user-id :group_id group-id :is_group_manager is-group-manager?})))))))

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

(defn remove-user-from-groups!
  "Removes a user from groups."
  [user-id-or-user group-ids-or-groups]
  (when (seq group-ids-or-groups)
    (permissions.db/delete-memberships-for-user-in-groups! (u/the-id user-id-or-user)
                                                           (map u/the-id group-ids-or-groups))))

(defn remove-user-from-group!
  "Removes a user from a group."
  [user-id-or-user group-ids-or-groups]
  (remove-user-from-groups! user-id-or-user [group-ids-or-groups]))

(defn remove-all-users-from-group!
  "Removes all users from a group."
  [group-id]
  (permissions.db/delete-memberships-for-group! group-id))

(defn remove-user-from-all-groups!
  "Removes a user from all groups."
  [user-id]
  (permissions.db/delete-memberships-for-user! user-id))
