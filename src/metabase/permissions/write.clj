(ns metabase.permissions.write
  "The write functions of the permissions models, through which every writer creates, updates and deletes
  PermissionsGroups, their memberships, Permissions and DataPermissions rows and the permission revisions."
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.permissions.util :as perms.u]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

;;; ------------------------------------------------- Magic groups --------------------------------------------------

(defn- magic-group
  "A function of no arguments returning the magic PermissionsGroup of `magic-group-type`, read once per app DB."
  [magic-group-type]
  (mdb/memoize-for-application-db
   (fn []
     (u/prog1 (permissions.db/magic-group magic-group-type)
       (when-not <>
         (throw (ex-info (format "Fatal error: magic Permissions Group '%s' has gone missing." magic-group-type)
                         {:magic-group-type magic-group-type})))))))

(def all-users-magic-group-type
  "The magic-group type of the \"All Users\" magic group."
  "all-internal-users")

(def all-external-users-magic-group-type
  "The magic group type of the \"All tenant users\" magic group."
  "all-external-users")

(def admin-magic-group-type
  "The magic-group type of the \"Administrators\" magic group."
  "admin")

(def data-analyst-magic-group-type
  "The magic-group type of the \"Data Analysts\" magic group."
  "data-analyst")

(def ^{:arglists '([])} all-users
  "Fetch the `All Users` permissions group."
  (magic-group all-users-magic-group-type))

(def ^{:arglists '([])} all-external-users
  "Fetch the `All tenant users` permissions group."
  (magic-group all-external-users-magic-group-type))

(def ^{:arglists '([])} admin
  "Fetch the `Administrators` permissions group."
  (magic-group admin-magic-group-type))

(def ^{:arglists '([])} data-analyst
  "Fetch the `Data Analysts` permissions group."
  (magic-group data-analyst-magic-group-type))

;;; ------------------------------------------------ PermissionsGroup -----------------------------------------------

(defn check-name-not-already-taken
  "Throws a 400 when a PermissionsGroup named `group-name`, ignoring case, exists; for inserts and renames."
  [group-name]
  (when (permissions.db/group-exists-with-lower-name? (u/lower-case-en (name group-name)))
    (throw (ex-info (tru "A group with that name already exists.") {:status-code 400}))))

(defn- check-not-magic-group
  "Throws a 400 when the group with `id` is one of the magic groups, which cannot be renamed or deleted."
  [id]
  (doseq [magic-group [(all-users) (all-external-users) (admin) (data-analyst)]]
    (when (= id (:id magic-group))
      (throw (ex-info (tru "You cannot edit or delete the ''{0}'' permissions group!" (:name magic-group))
                      {:status-code 400})))))

(defn- check-group-changes
  "Throws unless `changes`, the changed columns of the PermissionsGroup with `id`, are an update a group allows."
  [id changes]
  (when (contains? changes :name)
    (check-not-magic-group id))
  (when-let [group-name (:name changes)]
    (check-name-not-already-taken group-name))
  (when (contains? changes :is_tenant_group)
    (throw (ex-info (tru "You cannot change whether a group is a tenant group.") {:status-code 400})))
  (when (contains? changes :magic_group_type)
    (throw (ex-info (tru "You cannot change the type of a group.") {:status-code 400}))))

(mu/defn create-group!
  "Insert `group`, whose after-insert hook gives it the default data permissions and publishes its create event,
  returning the inserted PermissionsGroup; for the REST API, SCIM and the testing API."
  [group :- [:map {:closed true}
             [:name            :string]
             [:entity_id       {:optional true} [:maybe :string]]
             [:is_tenant_group {:optional true} :boolean]]]
  (events/with-batched-events
    (permissions.db/insert-group! group)))

(mu/defn update-group! :- :int
  "Apply `changes` to `group-or-id`, a PermissionsGroup the caller already loaded or the id of one, and publish its
  update event, returning the number of groups updated; for the REST API and SCIM."
  [group-or-id :- [:or ms/PositiveInt :map]
   changes     :- ::permissions.schema/permissions-group.update
   _opts       :- ::permissions.schema/group-write-opts]
  (let [group   (if (map? group-or-id) group-or-id (permissions.db/group group-or-id))
        changes (when group (changed group changes))]
    (if (empty? changes)
      0
      (do
        (check-group-changes (:id group) changes)
        (events/with-batched-events
          (u/prog1 (permissions.db/update-group! (:id group) changes)
            (events/updated! :model/PermissionsGroup (merge group changes) group)))))))

(defn- remove-groups-from-ldap-mappings!
  "Remove the groups with `ids` from the LDAP group mappings setting."
  [ids]
  (let [ids (set ids)]
    (setting/set-value-of-type!
     :json :ldap-group-mappings
     (when-let [mappings (setting/get :ldap-group-mappings)]
       (zipmap (keys mappings)
               (for [group-ids (vals mappings)]
                 (remove ids group-ids)))))))

(mu/defn delete-groups! :- :int
  "Delete the PermissionsGroups with `ids`, none of them a magic group, drop them from the LDAP group mappings and
  publish their delete events, returning the number deleted; for the REST API and SCIM."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::permissions.schema/group-write-opts]
  (let [groups (when (seq ids) (permissions.db/groups ids))]
    (if (empty? groups)
      0
      (events/with-batched-events
        (events/deleting! :model/PermissionsGroup groups
                          (fn []
                            (run! (comp check-not-magic-group :id) groups)
                            (remove-groups-from-ldap-mappings! (map :id groups))
                            (permissions.db/delete-groups! (mapv :id groups))))))))

(mu/defn delete-group! :- :int
  "Delete the PermissionsGroup with `id` and publish its delete event, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::permissions.schema/group-write-opts]
  (delete-groups! [id] opts))

;;; ------------------------------------------- PermissionsGroupMembership ------------------------------------------

(def fail-to-remove-last-admin-msg
  "Exception message when try to remove the last admin."
  (deferred-tru "You cannot remove the last member of the ''Admin'' group!"))

(def fail-to-add-data-analyst-msg
  "Exception message when trying to add a member to the Data Analysts group without the `:advanced-permissions`
  premium feature."
  (deferred-tru (str "Adding people to the ''Data Analysts'' group requires the Advanced Permissions feature, "
                     "which is not enabled on this instance.")))

(defn- check-magic-membership
  "Throws a 400 when `group-id` is the All Users or All tenant users group and `opts` do not allow adding or removing
  its members."
  [group-id {:keys [allow-all-users-group? allow-all-external-users-group?]}]
  (when (and (= group-id (:id (all-users))) (not allow-all-users-group?))
    (throw (ex-info (tru "You cannot add or remove users to/from the ''All Users'' group.")
                    {:status-code 400})))
  (when (and (= group-id (:id (all-external-users))) (not allow-all-external-users-group?))
    (throw (ex-info (tru "You cannot add or remove users to/from the ''All tenant users'' group.")
                    {:status-code 400}))))

(defn check-can-add-to-data-analyst-group
  "Throws a 402 when `group-id` is the Data Analysts group and the `:advanced-permissions` feature is off; removals are
  never gated."
  [group-id]
  (when (and (= group-id (:id (data-analyst)))
             (not (premium-features/enable-advanced-permissions?)))
    (throw (ex-info (str fail-to-add-data-analyst-msg)
                    {:status-code 402}))))

(defn- check-admins-remain
  "Throws a 400 when no active superuser member of the Admin group is left besides the Users with `user-ids`."
  [user-ids]
  (when (zero? (permissions.db/other-active-member-count (u/the-id (admin)) (set user-ids)))
    (throw (ex-info (str fail-to-remove-last-admin-msg)
                    {:status-code 400}))))

(defn throw-if-last-admin!
  "Throw an Exception if there are no admins left besides this one, who is about to be archived or have their admin
  status removed."
  [user-id]
  (check-admins-remain #{user-id}))

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
  (let [group-tenant? (when (contains? group-id->tenant? group_id)
                        (boolean (group-id->tenant? group_id)))
        user-tenant?  (some? (:tenant_id member))]
    (when (not= group-tenant? user-tenant?)
      (throw (ex-info (tru "Cannot add non-tenant user to tenant-group or vice versa")
                      {:bad-user-group-pairs [{:user-id          user_id
                                               :group-id         group_id
                                               :user-is-tenant?  user-tenant?
                                               :group-is-tenant? group-tenant?}]
                       :status-code          400})))))

(defn check-members
  "Throws a 400 when one of `memberships` makes a tenant user or an admin a group manager or puts a User in a group of
  the other tenancy, with the Users and groups of all of them read once; the INSERT of memberships calls it."
  [memberships]
  (when (seq memberships)
    (let [members           (u/index-by :id (permissions.db/member-flags (into #{} (map :user_id) memberships)))
          group-id->tenant? (permissions.db/group-tenant-flags (into #{} (map :group_id) memberships))]
      (doseq [membership memberships
              :let       [member (get members (:user_id membership))]]
        (check-group-manager-member membership member)
        (check-tenancy-matches membership member group-id->tenant?)))))

(defn- update-member!
  "Apply `changes` to the User with `user-id` through its write function."
  [user-id changes opts]
  ((:update! (mi/write-fns :model/User)) user-id changes opts))

(defn sync-member-flags-on-insert!
  "Set the `is_superuser` or `is_data_analyst` flag of the User of `membership`, a new membership of the Admin or the Data
  Analysts group; the after-insert hook calls it, so every insert keeps the flags in step."
  [{:keys [user_id group_id]}]
  (when (= group_id (:id (admin)))
    (update-member! user_id {:is_superuser true} {}))
  (when (= group_id (:id (data-analyst)))
    (update-member! user_id {:is_data_analyst true} {})))

(mu/defn create-memberships! :- :int
  "Insert `memberships`, refusing those of the All Users and All tenant users groups unless `opts` allow them, whose
  hooks check their Users, keep the Users' flags in step and publish their create events, returning the number
  inserted."
  [memberships :- [:sequential [:map {:closed true}
                                [:user_id          ::lib.schema.id/user]
                                [:group_id         ms/PositiveInt]
                                [:is_group_manager :boolean]]]
   opts        :- ::permissions.schema/membership-write-opts]
  (doseq [{:keys [group_id]} memberships]
    (check-magic-membership group_id opts))
  (if (empty? memberships)
    0
    (events/with-batched-events
      (permissions.db/insert-group-memberships! memberships))))

(def ^:private MembershipsToAdd
  "The memberships [[add-users-to-groups!]] adds: maps of a user, a group and whether the user manages it."
  [:sequential
   [:map {:closed true}
    [:group [:or
             pos-int?
             ::permissions.schema/permissions-group]]
    [:user [:or pos-int? :metabase.users.schema/user]]
    [:is-group-manager? {:optional true}
     :boolean]]])

(mu/defn add-users-to-groups!
  "Creates permission group memberships from a sequence of maps of users, groups and is-group-manager?, skipping those
  that exist; `opts` as [[create-memberships!]] takes them."
  ([pgms :- MembershipsToAdd]
   (add-users-to-groups! pgms {}))
  ([pgms :- MembershipsToAdd
    opts :- ::permissions.schema/membership-write-opts]
   (when (seq pgms)
     (let [pgms (->> pgms
                     (map (fn [{:keys [user group is-group-manager?]}]
                            {:user-id           (u/the-id user)
                             :group-id          (u/the-id group)
                             :is-group-manager? is-group-manager?})))
           user-id-group-id->is-group-manager? (->> pgms
                                                    (group-by (juxt :user-id :group-id))
                                                    (m/map-vals (fn [pgms]
                                                                  (when-not (= 1 (count (distinct pgms)))
                                                                    (throw (ex-info "Conflicting permissions group memberships"
                                                                                    {:conflicts (distinct pgms)})))
                                                                  (boolean (:is-group-manager? (first pgms))))))
           user-id-group-id->is-group-manager? (apply dissoc user-id-group-id->is-group-manager?
                                                      (permissions.db/existing-membership-pairs
                                                       (keys user-id-group-id->is-group-manager?)))]
       (when (seq user-id-group-id->is-group-manager?)
         (create-memberships! (for [[[user-id group-id] is-group-manager?] user-id-group-id->is-group-manager?]
                                {:user_id user-id :group_id group-id :is_group_manager is-group-manager?})
                              opts))))))

(defn add-user-to-groups!
  "Add a user to multiple groups."
  ([user-id-or-user group-ids-or-groups]
   (add-user-to-groups! user-id-or-user group-ids-or-groups false))
  ([user-id-or-user group-ids-or-groups is-group-manager?]
   (add-user-to-groups! user-id-or-user group-ids-or-groups is-group-manager? {}))
  ([user-id-or-user group-ids-or-groups is-group-manager? opts]
   (add-users-to-groups! (for [group-id-or-group group-ids-or-groups]
                           {:group             group-id-or-group
                            :user              user-id-or-user
                            :is-group-manager? is-group-manager?})
                         opts)))

(defn add-user-to-group!
  "Add a user to a group."
  ([user-id-or-user group-id-or-group]
   (add-user-to-group! user-id-or-user group-id-or-group false))
  ([user-id-or-user group-id-or-group is-group-manager?]
   (add-user-to-group! user-id-or-user group-id-or-group is-group-manager? {}))
  ([user-id-or-user group-id-or-group is-group-manager? opts]
   (add-user-to-groups! user-id-or-user [group-id-or-group] is-group-manager? opts)))

(defn- check-membership-changes
  "Throws unless `changes`, the changed columns of `membership`, are an update a membership allows."
  [membership changes]
  (when (contains? changes :user_id)
    (throw (ex-info (tru "You cannot move a group membership to another user.") {:status-code 400})))
  (when (contains? changes :group_id)
    (throw (ex-info (tru "You cannot move a group membership to another group.") {:status-code 400})))
  (when (:is_group_manager changes)
    (check-group-manager-member (merge membership changes)
                                (first (permissions.db/member-flags #{(:user_id membership)})))))

(mu/defn update-membership! :- :int
  "Apply `changes` to `membership-or-id`, a PermissionsGroupMembership the caller already loaded or the id of one, and
  publish its update event, returning the number of memberships updated; for the REST API."
  [membership-or-id :- [:or ms/PositiveInt :map]
   changes          :- ::permissions.schema/permissions-group-membership.update
   _opts            :- ::permissions.schema/membership-write-opts]
  (let [membership (if (map? membership-or-id) membership-or-id (first (permissions.db/memberships [membership-or-id])))
        changes    (when membership (changed membership changes))]
    (if (empty? changes)
      0
      (do
        (check-membership-changes membership changes)
        (events/with-batched-events
          (u/prog1 (permissions.db/update-membership! (:id membership) changes)
            (events/updated! :model/PermissionsGroupMembership (merge membership changes) membership)))))))

(defn- before-membership-delete!
  "Refuse the delete of `membership` as master's delete hook did, and unset the flag of its User that its group sets;
  each membership is checked after the flags of the ones before it are unset."
  [{:keys [group_id user_id]} {:keys [skip-superuser-sync?] :as opts}]
  (check-magic-membership group_id opts)
  (when (= group_id (:id (admin)))
    (check-admins-remain #{user_id})
    (when-not skip-superuser-sync?
      (update-member! user_id {:is_superuser false} {:skip-admin-group-sync? true})))
  (when (= group_id (:id (data-analyst)))
    (update-member! user_id {:is_data_analyst false} {})))

(defn- delete-membership-rows!
  "Delete `memberships`, loaded rows, and publish their delete events, returning the number deleted."
  [memberships opts]
  (if (empty? memberships)
    0
    (events/with-batched-events
      (events/deleting! :model/PermissionsGroupMembership memberships
                        (fn []
                          (run! #(before-membership-delete! % opts) memberships)
                          (permissions.db/delete-memberships! (mapv :id memberships)))))))

(mu/defn delete-memberships! :- :int
  "Delete the PermissionsGroupMemberships with `ids`, refusing those of the All Users groups unless `opts` allow them and
  the last admin's, and publish their delete events, returning the number deleted."
  [ids  :- [:maybe [:sequential ms/PositiveInt]]
   opts :- ::permissions.schema/membership-write-opts]
  (delete-membership-rows! (when (seq ids) (permissions.db/memberships ids)) opts))

(defn remove-user-from-groups!
  "Removes a user from groups; `opts` as [[delete-memberships!]] takes them."
  ([user-id-or-user group-ids-or-groups]
   (remove-user-from-groups! user-id-or-user group-ids-or-groups {}))
  ([user-id-or-user group-ids-or-groups opts]
   (when (seq group-ids-or-groups)
     (delete-membership-rows! (permissions.db/memberships-for-user-in-groups (u/the-id user-id-or-user)
                                                                             (map u/the-id group-ids-or-groups))
                              opts))))

(defn remove-user-from-group!
  "Removes a user from a group."
  ([user-id-or-user group-id-or-group]
   (remove-user-from-group! user-id-or-user group-id-or-group {}))
  ([user-id-or-user group-id-or-group opts]
   (remove-user-from-groups! user-id-or-user [group-id-or-group] opts)))

(defn remove-all-users-from-group!
  "Removes all users from a group."
  [group-id]
  (delete-membership-rows! (permissions.db/memberships-for-group group-id) {}))

(defn remove-user-from-all-groups!
  "Removes a user from all groups; `opts` as [[delete-memberships!]] takes them."
  ([user-id]
   (remove-user-from-all-groups! user-id {}))
  ([user-id opts]
   (delete-membership-rows! (permissions.db/memberships-for-user user-id) opts)))

;;; --------------------------------------------------- Permissions -------------------------------------------------

(defn- check-not-admin-group
  "Throws a 400 when `permission` belongs to the Admin group and `opts` do not allow it."
  [{:keys [group_id]} {:keys [allow-admin-group?]}]
  (when (and (= group_id (:id (admin)))
             (not allow-admin-group?))
    (throw (ex-info (tru "You cannot create or revoke permissions for the ''Admin'' group.")
                    {:status-code 400}))))

(defn- check-valid-object
  "Throws a 400 when the `:object` of `permission` is no valid path, the root path `/` being one only when `opts`
  allow it."
  [{:keys [object]} {:keys [allow-root?]}]
  (when (and object
             (not (perms.u/valid-path? object))
             (or (not= object "/")
                 (not allow-root?)))
    (throw (ex-info (tru "Invalid permissions object path: ''{0}''." object)
                    {:status-code 400, :path object}))))

(mu/defn create-permissions! :- [:maybe :int]
  "Insert the Permissions `rows`, refusing invalid paths and rows of the Admin group unless `opts` allow them, returning
  the number inserted; for the grant functions, Collection permission copies and the test restore of permissions."
  [rows :- [:sequential (mut/select-keys ::permissions.schema/permissions.update [:group_id :object])]
   opts :- ::permissions.schema/permissions-write-opts]
  (doseq [row rows]
    (check-not-admin-group row opts)
    (check-valid-object row opts))
  (when (seq rows)
    (permissions.db/insert-permissions! rows)))

(defn- delete-permission-rows!
  "Delete `rows`, loaded Permissions rows, refusing those of the Admin group unless `opts` allow them, returning the
  number deleted."
  [rows opts]
  (doseq [row rows]
    (log/debug (u/format-color :red "Revoking permissions for group %s: %s" (:group_id row) (:object row)))
    (check-not-admin-group row opts))
  (if (empty? rows)
    0
    (permissions.db/delete-permissions! (mapv :id rows))))

(mu/defn delete-permissions! :- :int
  "Delete the Permissions rows with `ids`, refusing those of the Admin group unless `opts` allow them, returning the
  number deleted."
  [ids  :- [:maybe [:sequential ms/PositiveInt]]
   opts :- ::permissions.schema/permissions-write-opts]
  (delete-permission-rows! (if (seq ids) (permissions.db/permissions-rows ids) []) opts))

(mu/defn delete-related-permissions!
  "Delete all 'related' permissions for `group-or-id`, those that grant full or partial access to `path`: its ancestor
  and its descendant paths, so `/db/1/schema/PUBLIC/` deletes `/db/1/` and `/db/1/schema/PUBLIC/table/2/`."
  [group-or-id :- [:or ms/PositiveInt :map]
   path        :- perms.u/PathSchema]
  (let [group-id (u/the-id group-or-id)
        paths    (conj (perms.u/->v2-path path) path)
        rows     (permissions.db/related-permissions group-id path paths)]
    (when (seq rows)
      (log/debug (u/format-color 'red "Revoking permissions for group %d: %s" group-id (into #{} (map :object) rows)))
      (delete-permission-rows! rows {}))))

(mu/defn delete-collection-permissions! :- :int
  "Delete the Permissions rows attached to the Collection with `collection-id`, returning the number deleted; for the
  Library collections."
  [collection-id :- ::lib.schema.id/collection]
  (delete-permission-rows! (permissions.db/collection-permissions collection-id) {}))

(mu/defn delete-database-permissions! :- :int
  "Delete the Permissions rows on paths of the Database with `database-id`, returning the number deleted; for the audit
  Database."
  [database-id :- ::lib.schema.id/database]
  (delete-permission-rows! (permissions.db/database-permissions database-id) {}))

(defn- refuse-permissions-update
  "Throws the 400 refusing an update of a Permissions or DataPermissions row when `changes` has any column."
  [_id changes _opts]
  (when (seq changes)
    (throw (ex-info (tru "You cannot update a permissions entry! Delete it and create a new one.") {:status-code 400})))
  0)

(mu/defn update-permissions! :- :int
  "Refuse any change of a Permissions row, which is deleted and created again instead."
  [id      :- ms/PositiveInt
   changes :- :map
   opts    :- ::permissions.schema/permissions-write-opts]
  (refuse-permissions-update id changes opts))

(mu/defn update-data-permissions! :- :int
  "Refuse any change of a DataPermissions row, which is deleted and created again instead."
  [id      :- ms/PositiveInt
   changes :- :map
   opts    :- ::permissions.schema/permissions-write-opts]
  (refuse-permissions-update id changes opts))

;;; ---------------------------------------------------- Revisions --------------------------------------------------

(defn- refuse-revision-update
  "Throws the 400 refusing an update of a PermissionsRevision when `changes` has any column."
  [changes]
  (when (seq changes)
    (throw (ex-info (tru "You cannot update a PermissionsRevision!") {:status-code 400})))
  0)

(mu/defn update-permissions-revision! :- :int
  "Refuse any change of a PermissionsRevision."
  [_id     :- ms/PositiveInt
   changes :- :map
   _opts   :- ::permissions.schema/revision-write-opts]
  (refuse-revision-update changes))

(mu/defn update-application-permissions-revision! :- :int
  "Refuse any change of an ApplicationPermissionsRevision."
  [_id     :- ms/PositiveInt
   changes :- :map
   _opts   :- ::permissions.schema/revision-write-opts]
  (refuse-revision-update changes))

(defn- check-collection-graph-revision-changes
  "Throws unless `changes`, the changed columns of `revision`, fill in its empty details and nothing else."
  [revision changes]
  (when (seq (dissoc changes :before :after))
    (throw (ex-info (tru "You cannot update a PermissionsRevision!") {:status-code 400})))
  (when (and (contains? changes :before) (seq (:before revision)))
    (throw (ex-info (tru "You cannot change the details of a PermissionsRevision once they are filled in.")
                    {:status-code 400})))
  (when (and (contains? changes :after) (seq (:after revision)))
    (throw (ex-info (tru "You cannot change the details of a PermissionsRevision once they are filled in.")
                    {:status-code 400}))))

(mu/defn update-collection-graph-revision! :- :int
  "Fill in the empty `:before` and `:after` of the CollectionPermissionGraphRevision with `revision-id`, the only
  change a revision allows, returning the number updated; for the collection graph update."
  [revision-id :- ms/PositiveInt
   changes     :- ::permissions.schema/collection-permission-graph-revision.changes
   _opts       :- ::permissions.schema/revision-write-opts]
  (let [revision (permissions.db/collection-graph-revision revision-id)
        changes  (when revision (changed revision changes))]
    (if (empty? changes)
      0
      (do
        (check-collection-graph-revision-changes revision changes)
        (permissions.db/update-collection-graph-revision! revision-id changes)))))

;;; -------------------------------------------------- Write lookup -------------------------------------------------

(defmethod mi/write-fns :model/PermissionsGroup
  [_model]
  {:update! update-group!
   :delete! delete-groups!})

(defmethod mi/write-fns :model/PermissionsGroupMembership
  [_model]
  {:update! update-membership!
   :delete! delete-memberships!})

(defmethod mi/write-fns :model/Permissions
  [_model]
  {:update! update-permissions!
   :delete! delete-permissions!})

(defmethod mi/write-fns :model/DataPermissions
  [_model]
  {:update! update-data-permissions!})

(defmethod mi/write-fns :model/PermissionsRevision
  [_model]
  {:update! update-permissions-revision!})

(defmethod mi/write-fns :model/ApplicationPermissionsRevision
  [_model]
  {:update! update-application-permissions-revision!})

(defmethod mi/write-fns :model/CollectionPermissionGraphRevision
  [_model]
  {:update! update-collection-graph-revision!})
