(ns metabase-enterprise.tenants.membership-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- refusal
  "The `[message data]` of the refusal `kind` for the User with `user-id` and the group with `group-id`, or nil for no
  refusal."
  [kind user-id group-id]
  (case kind
    nil                 nil
    :tenant-manager     ["Tenant users cannot be made group managers" {:user-id user-id :status-code 400}]
    :admin-manager      [(str "Admin cannot be a group manager of "
                              (t2/select-one-fn :name :model/PermissionsGroup :id group-id) ".")
                         {:user-id user-id, :group-id group-id, :status-code 400}]
    (:tenant-in-ordinary
     :ordinary-in-tenant) ["Cannot add non-tenant user to tenant-group or vice versa"
                           {:bad-user-group-pairs [{:user-id          user-id
                                                    :group-id         group-id
                                                    :user-is-tenant?  (= kind :tenant-in-ordinary)
                                                    :group-is-tenant? (= kind :ordinary-in-tenant)}]
                            :status-code          400}]))

(defn- try-write!
  "In a rolled-back transaction, call `write!` with what `setup` returns and check that it refuses with `expected`,
  leaving what `state` reads of the same unchanged, or, when `expected` is nil, that `written?` holds afterwards."
  [setup write! state expected written?]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ctx    (setup)
          before (state ctx)
          thrown (try
                   (write! ctx)
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     [(ex-message e) (dissoc (ex-data e) :toucan2/context-trace)]))]
      (is (= expected thrown))
      (if expected
        (is (= before (state ctx)))
        (is (true? (written?)))))))

(defn- try-add!
  "Check that `add-users-to-groups!` refuses `memberships` with `expected`, or adds every one of them when it is nil."
  [memberships expected]
  (let [user-ids (into #{} (map :user_id) memberships)]
    (testing (pr-str memberships)
      (try-write! (constantly nil)
                  (fn [_] (perms-group-membership/add-users-to-groups!
                           (mapv (fn [{:keys [user_id group_id is_group_manager]}]
                                   {:user user_id :group group_id :is-group-manager? is_group_manager})
                                 memberships)))
                  (fn [_]
                    {:memberships (t2/select-fn-set (juxt :user_id :group_id :is_group_manager)
                                                    :model/PermissionsGroupMembership
                                                    :user_id [:in user-ids])
                     :flags       (t2/select-fn-set (juxt :id :is_superuser :is_data_analyst) :model/User
                                                    :id [:in user-ids])
                     :audit       (t2/count :model/AuditLog :model "PermissionsGroupMembership")})
                  expected
                  #(every? (fn [{:keys [user_id group_id]}]
                             (t2/exists? :model/PermissionsGroupMembership :user_id user_id :group_id group_id))
                           memberships)))))

(deftest add-users-to-groups-refusals-test
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
      (let [groups   [(u/the-id (perms/admin-group)) (u/the-id (perms/data-analyst-group)) tenant-group ordinary-group]
            ordinary [nil nil nil nil :ordinary-in-tenant :ordinary-in-tenant nil nil]
            tenant   [:tenant-in-ordinary :tenant-manager :tenant-in-ordinary :tenant-manager
                      nil :tenant-manager :tenant-in-ordinary :tenant-manager]]
        (testing "one membership per call, for every kind of User and group, without and with the manager flag"
          (doseq [[user-id kinds] [[personal        ordinary]
                                   [admin           [nil :admin-manager nil :admin-manager
                                                     :ordinary-in-tenant :admin-manager nil :admin-manager]]
                                   [tenant-user     tenant]
                                   [api-key-user    ordinary]
                                   [inactive        ordinary]
                                   [inactive-tenant tenant]]
                  [[group-id manager?] kind] (map vector (for [group-id groups, manager? [false true]] [group-id manager?])
                                                  kinds)]
            (try-add! [{:user_id user-id :group_id group-id :is_group_manager manager?}]
                      (refusal kind user-id group-id))))
        (testing "All tenant users, inside the scope that allows changing its members"
          (perms-group-membership/allow-changing-all-external-users-group-members
           (let [group-id (u/the-id (perms/all-external-users-group))]
             (doseq [[user-id kinds] [[personal        [:ordinary-in-tenant :ordinary-in-tenant]]
                                      [admin           [:ordinary-in-tenant :admin-manager]]
                                      [tenant-user     [nil :tenant-manager]]
                                      [api-key-user    [:ordinary-in-tenant :ordinary-in-tenant]]
                                      [inactive        [:ordinary-in-tenant :ordinary-in-tenant]]
                                      [inactive-tenant [nil :tenant-manager]]]
                     [manager? kind] (map vector [false true] kinds)]
               (try-add! [{:user_id user-id :group_id group-id :is_group_manager manager?}]
                         (refusal kind user-id group-id))))))
        (testing "several memberships in one call: one refused row refuses the call, with the first refused row's error"
          (doseq [[memberships expected] [[[{:user_id personal :group_id ordinary-group :is_group_manager true}
                                            {:user_id tenant-user :group_id ordinary-group :is_group_manager false}]
                                           (refusal :tenant-in-ordinary tenant-user ordinary-group)]
                                          [[{:user_id tenant-user :group_id tenant-group :is_group_manager true}
                                            {:user_id admin :group_id ordinary-group :is_group_manager true}]
                                           (refusal :tenant-manager tenant-user tenant-group)]
                                          [[{:user_id admin :group_id ordinary-group :is_group_manager true}
                                            {:user_id tenant-user :group_id tenant-group :is_group_manager true}]
                                           (refusal :admin-manager admin ordinary-group)]
                                          [[{:user_id personal :group_id ordinary-group :is_group_manager false}
                                            {:user_id tenant-user :group_id tenant-group :is_group_manager false}]
                                           nil]]]
            (try-add! memberships expected)))))))

(defn- try-update!
  "Check that `update-permissions-group-memberships!` refuses `changes` to new `memberships` with the refusal `kind` of
  the User with `refused-user-id`, writing nothing, or accepts them when `kind` is nil."
  [memberships changes kind refused-user-id]
  (testing (pr-str {:memberships memberships :changes changes})
    (try-write! #(mapv (fn [{:keys [user_id group_id]}]
                         (t2/insert-returning-pk! :model/PermissionsGroupMembership
                                                  {:user_id user_id :group_id group_id :is_group_manager false}))
                       memberships)
                (fn [ids]
                  (perms-group-membership/update-permissions-group-memberships! (mapv #(assoc changes :id %) ids)))
                #(t2/select-fn-set (juxt :id :is_group_manager) :model/PermissionsGroupMembership :id [:in %])
                (refusal kind refused-user-id (some #(when (= refused-user-id (:user_id %)) (:group_id %)) memberships))
                (constantly true))))

(deftest update-permissions-group-memberships-refusals-test
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
          (doseq [[user-id kind] [[personal nil] [admin :admin-manager] [tenant-user :tenant-manager]
                                  [api-key-user nil] [inactive nil]]
                  [changes kind] [[{:is_group_manager true} kind] [{:is_group_manager false} nil]]]
            (try-update! [(membership user-id)] changes kind user-id)))
        (testing "several memberships in one call: the first refused one gives the message"
          (doseq [[user-ids kind refused-user-id] [[[personal admin] :admin-manager admin]
                                                   [[tenant-user admin] :tenant-manager tenant-user]
                                                   [[admin tenant-user] :admin-manager admin]
                                                   [[personal api-key-user] nil nil]]]
            (try-update! (mapv membership user-ids) {:is_group_manager true} kind refused-user-id)))))))
