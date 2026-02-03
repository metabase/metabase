(ns metabase.permissions.models.permissions-group-membership
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/PermissionsGroupMembership [_model] :permissions_group_membership)

(derive :model/PermissionsGroupMembership :metabase/model)

(def fail-to-remove-last-admin-msg
  "Exception message when try to remove the last admin."
  (deferred-tru "You cannot remove the last member of the ''Admin'' group!"))

(def ^:dynamic *allow-changing-all-users-group-members*
  "Should we allow people to be added to or removed from the All Users permissions group? By default, this is `false`,
  but enable it when adding or deleting users."
  false)

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

(defn throw-if-last-admin!
  "Throw an Exception if there are no admins left besides this one. The assumption is that the one admin is about to be
  archived or have their admin status removed."
  [user-id]
  (when (zero?
         (t2/count :model/PermissionsGroupMembership
                   {:join   [[:core_user :user] [:= :user.id :user_id]]
                    :where  [:and
                             [:= :group_id (u/the-id (perms-group/admin))]
                             [:= :user.is_active true]
                             [:not= :user.id user-id]]}))
    (throw (ex-info (str fail-to-remove-last-admin-msg)
                    {:status-code 400}))))

(def ^:dynamic ^:private *update-user-when-added-to-admin-group?* true)

(t2/define-before-delete :model/PermissionsGroupMembership
  [{:keys [group_id user_id]}]
  (check-not-all-users-group group_id)
  (check-not-all-external-users-group group_id)
  ;; If this is the Admin group...
  (when (= group_id (:id (perms-group/admin)))
    ;; ...and this is the last membership, throw an exception
    (throw-if-last-admin! user_id)
    ;; ...otherwise we're ok. Unset the `:is_superuser` flag for the user whose membership was revoked
    (when *update-user-when-added-to-admin-group?*
      (t2/update! 'User user_id {:is_superuser false})))
  ;; If this is the Data Analysts group, unset the `:is_data_analyst` flag
  (when (= group_id (:id (perms-group/data-analyst)))
    (t2/update! 'User user_id {:is_data_analyst false})))

(defmacro without-is-superuser-sync-on-add-to-admin-group
  "When inserting a superuser, we don't want the group membership insert to trigger a recursive update on the
  just-inserted user."
  [& body]
  `(binding [*update-user-when-added-to-admin-group?* false]
     (do ~@body)))

(t2/define-before-insert :model/PermissionsGroupMembership
  [membership]
  ;; this should generally only be set by the `with-temp` defaults for `:model/PermissionsGroupMembership`. Ideally we'll move to only
  (if-not (:__test-only-sigil-allowing-direct-insertion-of-permissions-group-memberships membership)
    (throw (ex-info "Do not use `t2/insert!` with PermissionsGroupMembership directly. Use `add-users-to-groups` or related instead"
                    {}))
    (dissoc membership
            :__test-only-sigil-allowing-direct-insertion-of-permissions-group-memberships)))

(mu/defn- add-users-to-groups-sql
  "Generates SQL for adding users to groups"
  [user-id-group-id->is-group-manager? :- [:map-of
                                           [:tuple pos-int? pos-int?]
                                           :boolean]]
  (when (seq user-id-group-id->is-group-manager?)
    {:insert-into [[:permissions_group_membership [:group_id :user_id :is_group_manager]]
                   {:select [:g.id :u.id [(into [:case]
                                                (mapcat (fn [[[user-id group-id] is-group-manager?]]
                                                          [[[:and
                                                             [:= :u.id user-id]
                                                             [:= :g.id group-id]]]
                                                           is-group-manager?])
                                                        user-id-group-id->is-group-manager?))]]
                    :from [[:permissions_group :g]]
                    :join [[:core_user :u] (into [:or]
                                                 (for [[[user-id group-id] _] user-id-group-id->is-group-manager?]
                                                   [:and
                                                    [:= :u.id user-id]
                                                    [:= :g.id group-id]
                                                    [:=
                                                     :g.is_tenant_group
                                                     [:not= :u.tenant_id nil]]]))]}]}))

(mu/defn add-users-to-groups!
  "Creates permission group memberships from aa sequence of maps of users, groups and is-group-manager?."
  [pgms :- [:sequential
            [:map
             [:group [:or
                      pos-int?
                      [:map [:id pos-int?]]]]
             [:user [:or
                     pos-int?
                     [:map [:id pos-int?]]]]
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
          [user-ids group-ids] (->> user-id-group-id->is-group-manager?
                                    keys
                                    (reduce (fn [[uids gids] [user-id group-id]]
                                              [(conj uids user-id)
                                               (conj gids group-id)])
                                            [#{} #{}]))
          group-id->tenant? (t2/select-pk->fn (comp boolean :is_tenant_group)
                                              [:model/PermissionsGroup :id :is_tenant_group]
                                              :id [:in group-ids])
          user-id->tenant? (t2/select-pk->fn (comp (complement nil?) :tenant_id)
                                             [:model/User :id :tenant_id]
                                             :id [:in user-ids])

          bad-user-group-pairs (->> (keys user-id-group-id->is-group-manager?)
                                    (keep (fn [[user-id group-id]]
                                            (when (not= (group-id->tenant? group-id)
                                                        (user-id->tenant? user-id))
                                              {:user-id user-id
                                               :group-id group-id
                                               :user-is-tenant? (user-id->tenant? user-id)
                                               :group-is-tenant? (group-id->tenant? group-id)}))))
          _ (doseq [group-id group-ids]
              (check-not-all-users-group group-id)
              (check-not-all-external-users-group group-id))
          _ (doseq [[[user-id group-id] is-group-manager?] user-id-group-id->is-group-manager?]
              (when (and is-group-manager? (user-id->tenant? user-id))
                (throw (ex-info (tru "Tenant users cannot be made group managers")
                                {:bad-user-group-pair [user-id group-id]
                                 :status-code 400}))))
          _ (when (seq bad-user-group-pairs)
              (throw (ex-info (tru "Cannot add non-tenant user to tenant-group or vice versa")
                              {:bad-user-group-pairs bad-user-group-pairs
                               :status-code 400})))

          new-admin-ids (->> user-id-group-id->is-group-manager?
                             keys
                             (keep (fn [[user-id group-id]]
                                     (when (= group-id (:id (perms-group/admin)))
                                       user-id))))

          new-data-analyst-ids (->> user-id-group-id->is-group-manager?
                                    keys
                                    (keep (fn [[user-id group-id]]
                                            (when (= group-id (:id (perms-group/data-analyst)))
                                              user-id))))

          sql (add-users-to-groups-sql user-id-group-id->is-group-manager?)]
      (t2/with-transaction [_conn]
        (when (< (t2/query-one sql)
                 (count user-id-group-id->is-group-manager?))
          ;; Theoretically, there could be a race condition in the above check: a user or group may be changed to a tenant
          ;; user/group or vice versa AFTER we check (above) but BEFORE the insert (below). So just make sure that the
          ;; number of inserted rows is correct - if not, throw an exception and we'll roll back.
          (throw (ex-info (tru "Error inserting Permissions Group Membership") {})))
        (when (seq new-admin-ids)
          (t2/update! :model/User :id [:in new-admin-ids] {:is_superuser true}))
        (when (seq new-data-analyst-ids)
          (t2/update! :model/User :id [:in new-data-analyst-ids] {:is_data_analyst true}))
        ;; Publish events for each new membership
        (doseq [[[user-id group-id] is-group-manager?] user-id-group-id->is-group-manager?]
          (events/publish-event! :event/group-membership-create
                                 {:user-id api/*current-user-id*
                                  :object (t2/instance :model/PermissionsGroupMembership
                                                       {:user_id user-id
                                                        :group_id group-id
                                                        :is_group_manager is-group-manager?})}))))))

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
    (let [user-id (u/the-id user-id-or-user)
          group-ids (map u/the-id group-ids-or-groups)
          ;; Get the memberships that will be deleted for event publishing
          memberships (t2/select :model/PermissionsGroupMembership
                                 :user_id user-id
                                 :group_id [:in group-ids])]
      ;; Delete the memberships (this will trigger the before-delete hooks)
      (t2/delete! :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids])
      (doseq [membership memberships]
        (events/publish-event! :event/group-membership-delete {:object membership
                                                               :user-id api/*current-user-id*})))))

(defn remove-user-from-group!
  "Removes a user from a group."
  [user-id-or-user group-ids-or-groups]
  (remove-user-from-groups! user-id-or-user [group-ids-or-groups]))
