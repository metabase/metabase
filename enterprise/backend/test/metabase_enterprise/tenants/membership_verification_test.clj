(ns metabase-enterprise.tenants.membership-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- old-refusal
  "The `[message data]` that the check `add-users-to-groups!` ran before its insert threw for `memberships`, from the
  Users and groups as stored now, or nil when it let them through."
  [memberships]
  (let [members (u/index-by :id (t2/select [:model/User :id :tenant_id :is_superuser]
                                           :id [:in (into #{} (map :user_id) memberships)]))
        tenant? (t2/select-pk->fn :is_tenant_group [:model/PermissionsGroup :id :is_tenant_group]
                                  :id [:in (into #{} (map :group_id) memberships)])]
    (some (fn [{:keys [user_id group_id is_group_manager]}]
            (let [member        (get members user_id)
                  group-tenant? (when (contains? tenant? group_id) (boolean (tenant? group_id)))
                  user-tenant?  (some? (:tenant_id member))]
              (or (when is_group_manager
                    (cond
                      (:tenant_id member)    ["Tenant users cannot be made group managers" {:user-id user_id :status-code 400}]
                      (:is_superuser member) ["Admin cannot be a group manager." {:user-id user_id :status-code 400}]))
                  (when (not= group-tenant? user-tenant?)
                    ["Cannot add non-tenant user to tenant-group or vice versa"
                     {:bad-user-group-pairs [{:user-id          user_id
                                              :group-id         group_id
                                              :user-is-tenant?  user-tenant?
                                              :group-is-tenant? group-tenant?}]
                      :status-code          400}]))))
          memberships)))

(defn- state
  "The memberships, User flags and membership audit rows that `memberships` could change."
  [memberships]
  {:memberships (t2/select-fn-set (juxt :user_id :group_id :is_group_manager) :model/PermissionsGroupMembership
                                  :user_id [:in (into #{} (map :user_id) memberships)])
   :flags       (t2/select-fn-set (juxt :id :is_superuser :is_data_analyst) :model/User
                                  :id [:in (into #{} (map :user_id) memberships)])
   :audit       (t2/count :model/AuditLog :model "PermissionsGroupMembership")})

(defn- outcome!
  "Call `add-users-to-groups!` with `memberships` inside a transaction that is rolled back afterwards, returning the
  refusal it threw as `[message data]` or nil, and whether the state is unchanged after a refusal."
  [memberships]
  (let [result (volatile! nil)]
    (try
      (t2/with-transaction [_conn]
        (let [before (state memberships)
              thrown (try
                       (perms-group-membership/add-users-to-groups!
                        (mapv (fn [{:keys [user_id group_id is_group_manager]}]
                                {:user user_id :group group_id :is-group-manager? is_group_manager})
                              memberships))
                       nil
                       (catch clojure.lang.ExceptionInfo e
                         [(ex-message e) (dissoc (ex-data e) :toucan2/context-trace)]))]
          (vreset! result {:refusal   thrown
                           :unchanged (= before (state memberships))
                           :added     (every? #(t2/exists? :model/PermissionsGroupMembership
                                                           :user_id (:user_id %) :group_id (:group_id %))
                                              memberships)})
          (throw (ex-info "roll back" {::roll-back true}))))
      (catch clojure.lang.ExceptionInfo e
        (when-not (::roll-back (ex-data e))
          (throw e))))
    @result))

(defn- check-case!
  [memberships]
  (let [expected (old-refusal memberships)
        {:keys [refusal unchanged added]} (outcome! memberships)]
    (testing (pr-str memberships)
      (is (= expected refusal))
      (if expected
        (is (true? unchanged))
        (is (true? added))))))

(deftest add-users-to-groups-refuses-exactly-what-the-pre-write-check-refused-test
  (mt/with-premium-features #{:tenants :advanced-permissions}
    (mt/with-temp [:model/Tenant           {tenant-id :id}          {:name "Verified Tenant" :slug "verified-tenant"}
                   :model/User             {personal :id}           {}
                   :model/User             {admin :id}              {:is_superuser true}
                   :model/User             {tenant-user :id}        {:tenant_id tenant-id}
                   :model/User             {api-key-user :id}       {:type :api-key}
                   :model/User             {inactive :id}           {:is_active false}
                   :model/User             {inactive-tenant :id}    {:tenant_id tenant-id :is_active false}
                   :model/PermissionsGroup {tenant-group :id}       {:is_tenant_group true}
                   :model/PermissionsGroup {ordinary-group :id}     {:is_tenant_group false}]
      (let [users  [personal admin tenant-user api-key-user inactive inactive-tenant]
            groups [(u/the-id (perms/admin-group)) (u/the-id (perms/data-analyst-group)) tenant-group ordinary-group]]
        (testing "one membership per call, for every kind of User, group and manager flag"
          (doseq [user-id users
                  group-id groups
                  manager? [false true]]
            (check-case! [{:user_id user-id :group_id group-id :is_group_manager manager?}])))
        (testing "All tenant users, inside the scope that allows changing its members"
          (perms-group-membership/allow-changing-all-external-users-group-members
           (doseq [user-id users
                   manager? [false true]]
             (check-case! [{:user_id user-id :group_id (u/the-id (perms/all-external-users-group)) :is_group_manager manager?}]))))
        (testing "several memberships in one call: one refused row refuses the call, with the first refused row's error"
          (doseq [memberships [[{:user_id personal :group_id ordinary-group :is_group_manager true}
                                {:user_id tenant-user :group_id ordinary-group :is_group_manager false}]
                               [{:user_id tenant-user :group_id tenant-group :is_group_manager true}
                                {:user_id admin :group_id ordinary-group :is_group_manager true}]
                               [{:user_id admin :group_id ordinary-group :is_group_manager true}
                                {:user_id tenant-user :group_id tenant-group :is_group_manager true}]
                               [{:user_id personal :group_id ordinary-group :is_group_manager false}
                                {:user_id tenant-user :group_id tenant-group :is_group_manager false}]]]
            (check-case! memberships)))))))

(defn- old-update-refusal
  "The `[message data]` the check `update-permissions-group-memberships!` ran before its write refused `changes` to the
  memberships with `ids` with, in the order of `ids`, from the rows as stored now, or nil."
  [ids changes]
  (when (:is_group_manager changes)
    (let [memberships (u/index-by :id (t2/select :model/PermissionsGroupMembership :id [:in ids]))
          members     (u/index-by :id (t2/select [:model/User :id :tenant_id :is_superuser]
                                                 :id [:in (map (comp :user_id memberships) ids)]))]
      (some (fn [id]
              (let [{:keys [user_id]} (memberships id)
                    member            (members user_id)]
                (cond
                  (:tenant_id member)    ["Tenant users cannot be made group managers" {:user-id user_id :status-code 400}]
                  (:is_superuser member) ["Admin cannot be a group manager." {:user-id user_id :status-code 400}])))
            ids))))

(defn- check-update-case!
  [memberships changes]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids      (mapv #(t2/insert-returning-pk! :model/PermissionsGroupMembership
                                                   {:user_id (:user_id %) :group_id (:group_id %) :is_group_manager false})
                         memberships)
          expected (old-update-refusal ids changes)
          stored   #(t2/select-fn-set (juxt :id :is_group_manager) :model/PermissionsGroupMembership :id [:in ids])
          before   (stored)
          refusal  (try
                     (perms-group-membership/update-permissions-group-memberships! ids changes)
                     nil
                     (catch clojure.lang.ExceptionInfo e
                       [(ex-message e) (dissoc (ex-data e) :toucan2/context-trace)]))]
      (testing (pr-str {:memberships memberships :changes changes})
        (is (= expected refusal))
        (when expected
          (is (= before (stored))))))))

(deftest update-permissions-group-memberships-refuses-exactly-what-the-pre-write-check-refused-test
  (mt/with-premium-features #{:tenants :advanced-permissions}
    (mt/with-temp [:model/Tenant           {tenant-id :id}      {:name "Update Tenant" :slug "update-tenant"}
                   :model/User             {personal :id}       {}
                   :model/User             {admin :id}          {:is_superuser true}
                   :model/User             {tenant-user :id}    {:tenant_id tenant-id}
                   :model/User             {api-key-user :id}   {:type :api-key}
                   :model/User             {inactive :id}       {:is_active false}
                   :model/PermissionsGroup {tenant-group :id}   {:is_tenant_group true}
                   :model/PermissionsGroup {ordinary-group :id} {:is_tenant_group false}]
      (let [membership (fn [user-id] {:user_id  user-id
                                      :group_id (if (= user-id tenant-user) tenant-group ordinary-group)})]
        (testing "one membership per call, for every kind of User and change"
          (doseq [user-id [personal admin tenant-user api-key-user inactive]
                  changes [{:is_group_manager true} {:is_group_manager false}]]
            (check-update-case! [(membership user-id)] changes)))
        (testing "several memberships in one call: the first refused one gives the message"
          (doseq [user-ids [[personal admin] [tenant-user admin] [admin tenant-user] [personal api-key-user]]]
            (check-update-case! (mapv membership user-ids) {:is_group_manager true})))))))
