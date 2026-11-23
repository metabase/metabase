(ns metabase.permissions.models.permissions-group-membership-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as app-db]
   [metabase.events.test-util :as events.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest set-is-superuser-test
  (testing "when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp [:model/User user]
      (perms-group-membership/add-users-to-groups! [{:user user :group (perms-group/admin)}])
      (is (true? (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))

(deftest remove-is-superuser-test
  (testing "when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-model-cleanup [:model/User]
      (let [[user] (user/create-users! [{:email "remove-superuser@example.com" :is_superuser true}])]
        (perms-group-membership/remove-users-from-groups! [user] [(perms-group/admin)])
        (is (= false
               (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))
  (testing "it should not let you remove the last admin"
    (mt/with-single-admin-user! [{id :id}]
      (is (thrown? Exception
                   (perms-group-membership/remove-users-from-groups! [id] [(perms-group/admin)])))))
  (testing "it should not let you remove the last non-archived admin"
    (mt/with-single-admin-user! [{id :id}]
      (mt/with-temp [:model/User _ {:is_active    false
                                    :is_superuser true}]
        (is (thrown? Exception
                     (perms-group-membership/remove-users-from-groups! [id] [(perms-group/admin)])))))))

(deftest permissions-group-membership-audit-add-test
  (testing "PermissionsGroupMembership audit events"
    (mt/with-premium-features #{:audit-app}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/User {user-id :id} {}
                       :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
          (let [initial-audit-count (t2/count :model/AuditLog)]
            (testing "adding user to group is audited"
              (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
              (is (> (t2/count :model/AuditLog) initial-audit-count))
              (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-create" {:order-by [[:id :desc]]})]
                (is (some? audit-entry))
                (is (= "PermissionsGroupMembership" (:model audit-entry)))
                (is (= user-id (get-in audit-entry [:details :user_id])))
                (is (= group-id (get-in audit-entry [:details :group_id])))))
            (testing "removing user from group is audited"
              (let [before-remove-count (t2/count :model/AuditLog)]
                (perms-group-membership/remove-users-from-groups! [user-id] [group-id])
                (is (> (t2/count :model/AuditLog) before-remove-count))
                (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-delete" {:order-by [[:id :desc]]})]
                  (is (some? audit-entry))
                  (is (= "PermissionsGroupMembership" (:model audit-entry)))
                  (is (= user-id (get-in audit-entry [:details :user_id])))
                  (is (= group-id (get-in audit-entry [:details :group_id]))))))))))))

(deftest delete-membership-api-audit-test
  (testing "DELETE /api/permissions/membership/:id creates audit log entry"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
        (let [membership-id (:id (t2/select-one :model/PermissionsGroupMembership
                                                :user_id user-id :group_id group-id))
              before-count  (t2/count :model/AuditLog :topic "group-membership-delete")]
          (mt/user-http-request :crowberto :delete 204
                                (format "permissions/membership/%d" membership-id))
          (is (= (inc before-count)
                 (t2/count :model/AuditLog :topic "group-membership-delete")))
          (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-delete"
                                           {:order-by [[:id :desc]]})]
            (is (= "PermissionsGroupMembership" (:model audit-entry)))
            (is (= user-id (get-in audit-entry [:details :user_id])))
            (is (= group-id (get-in audit-entry [:details :group_id])))))))))

(deftest clear-group-membership-api-audit-test
  (testing "PUT /api/permissions/membership/:group-id/clear creates audit log entries"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {user-1-id :id} {}
                     :model/User {user-2-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (perms-group-membership/add-users-to-groups! [{:user user-1-id :group group-id}])
        (perms-group-membership/add-users-to-groups! [{:user user-2-id :group group-id}])
        (let [before-count (t2/count :model/AuditLog :topic "group-membership-delete")]
          (mt/user-http-request :crowberto :put 204
                                (format "permissions/membership/%d/clear" group-id))
          (is (= (+ 2 before-count)
                 (t2/count :model/AuditLog :topic "group-membership-delete"))))))))

(defn- all-users-group-id []
  (u/the-id (perms-group/all-users)))

(defn- admin-group-id []
  (u/the-id (perms-group/admin)))

(deftest all-users-group-membership-is-locked-test
  (mt/with-model-cleanup [:model/User]
    (let [[{user-id :id}] (user/create-users! [{:email "all-users-locked@example.com"}])]
      (testing "removing a member of All Users is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"'All Users' group"
                              (perms-group-membership/remove-users-from-groups! [user-id] [(all-users-group-id)])))
        (is (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id (all-users-group-id))))
      (testing "adding a member to All Users is refused"
        (perms/allow-changing-all-users-group-members
          (perms-group-membership/remove-users-from-groups! [user-id] [(all-users-group-id)]))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"'All Users' group"
                              (perms-group-membership/add-users-to-groups! [{:user user-id :group (all-users-group-id)}])))
        (is (not (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id (all-users-group-id))))))))

(deftest add-to-admin-group-sets-is-superuser-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (perms-group-membership/add-users-to-groups! [{:user user-id :group (admin-group-id)}])
    (is (true? (t2/select-one-fn :is_superuser :model/User :id user-id)))
    (testing "and removing it unsets the flag"
      (perms-group-membership/remove-users-from-groups! [user-id] [(admin-group-id)])
      (is (false? (t2/select-one-fn :is_superuser :model/User :id user-id))))))

(deftest removing-every-admin-at-once-is-refused-test
  (mt/with-temp [:model/User _ {:is_superuser true}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"last member of the 'Admin' group"
                          (perms-group-membership/remove-users-from-groups!
                           (t2/select-fn-vec :user_id :model/PermissionsGroupMembership :group_id (admin-group-id))
                           [(admin-group-id)])))
    (is (t2/exists? :model/PermissionsGroupMembership :group_id (admin-group-id) :user_id (mt/user->id :crowberto)))
    (is (true? (t2/select-one-fn :is_superuser :model/User :id (mt/user->id :crowberto))))))

(deftest admin-cannot-be-group-manager-test
  (mt/with-temp [:model/User             {admin-id :id} {:is_superuser true}
                 :model/User             {user-id :id}  {}
                 :model/PermissionsGroup {group-id :id} {}]
    (testing "adding an admin as group manager is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Admin cannot be a group manager"
                            (perms-group-membership/add-users-to-groups! [{:user admin-id :group group-id :is-group-manager? true}])))
      (is (not (t2/exists? :model/PermissionsGroupMembership :user_id admin-id :group_id group-id))))
    (testing "making an admin's membership a group manager is refused"
      (perms-group-membership/add-users-to-groups! [{:user admin-id :group group-id}])
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Admin cannot be a group manager"
                            (perms-group-membership/update-permissions-group-memberships!
                             [{:id               (t2/select-one-pk :model/PermissionsGroupMembership :user_id admin-id :group_id group-id)
                               :is_group_manager true}])))
      (is (false? (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership
                                    :user_id admin-id :group_id group-id))))
    (testing "user who is not an admin can be made group manager"
      (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
      (perms-group-membership/update-permissions-group-memberships!
       [{:id               (t2/select-one-pk :model/PermissionsGroupMembership :user_id user-id :group_id group-id)
         :is_group_manager true}])
      (is (true? (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership
                                   :user_id user-id :group_id group-id))))))

(deftest membership-cannot-move-to-another-user-or-group-test
  (mt/with-temp [:model/User             {user-id :id}        {}
                 :model/User             {other-user-id :id}  {}
                 :model/PermissionsGroup {group-id :id}       {}
                 :model/PermissionsGroup {other-group-id :id} {}]
    (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
    (let [membership-id (t2/select-one-pk :model/PermissionsGroupMembership :user_id user-id :group_id group-id)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"another user"
                            (t2/update! :model/PermissionsGroupMembership :id membership-id {:user_id other-user-id})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"another group"
                            (t2/update! :model/PermissionsGroupMembership :id membership-id {:group_id other-group-id})))
      (is (=? {:user_id user-id :group_id group-id}
              (t2/select-one :model/PermissionsGroupMembership :id membership-id))))))

(defn- data-analyst-group-id []
  (u/the-id (perms-group/data-analyst)))

(defn- in-data-analyst-group? [user-id]
  (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id (data-analyst-group-id)))

(defn- is-data-analyst-flag [user-id]
  (t2/select-one-fn :is_data_analyst :model/User :id user-id))

(deftest add-to-data-analyst-group-without-advanced-permissions-test
  (testing "adding a user to the Data Analysts group is refused without the :advanced-permissions feature"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Advanced Permissions"
             (perms-group-membership/add-users-to-groups! [{:user user-id :group (data-analyst-group-id)}])))
        (testing "no membership is created"
          (is (not (in-data-analyst-group? user-id))))
        (testing "the is_data_analyst flag is not set"
          (is (not (is-data-analyst-flag user-id))))))))

(mt/when-ee-evailable
 (deftest existing-data-analysts-are-grandfathered-test
   (testing "an existing member keeps their membership when the feature goes away"
     (mt/with-temp [:model/User {user-id :id} {}]
       (mt/with-premium-features #{:advanced-permissions}
         (perms-group-membership/add-users-to-groups! [{:user user-id :group (data-analyst-group-id)}]))
       (mt/with-premium-features #{}
         (testing "nothing revokes the membership or the flag"
           (is (in-data-analyst-group? user-id))
           (is (true? (boolean (is-data-analyst-flag user-id)))))
         (testing "but the group can only shrink from here"
           (mt/with-temp [:model/User {other-user-id :id} {}]
             (is (thrown-with-msg?
                  clojure.lang.ExceptionInfo #"Advanced Permissions"
                  (perms-group-membership/add-users-to-groups! [{:user other-user-id :group (data-analyst-group-id)}]))))))))))

(mt/when-ee-evailable
 (deftest add-to-data-analyst-group-with-advanced-permissions-test
   (testing "adding a user to the Data Analysts group works with the :advanced-permissions feature"
     (mt/with-temp [:model/User {user-id :id} {}]
       (mt/with-premium-features #{:advanced-permissions}
         (perms-group-membership/add-users-to-groups! [{:user user-id :group (data-analyst-group-id)}])
         (is (in-data-analyst-group? user-id))
         (testing "and mirrors the membership onto the is_data_analyst flag"
           (is (true? (boolean (is-data-analyst-flag user-id))))))))))

(mt/when-ee-evailable
 (deftest remove-from-data-analyst-group-is-never-gated-test
   (testing "removing a user from the Data Analysts group works without the :advanced-permissions feature"
     (mt/with-temp [:model/User {user-id :id} {}]
       (mt/with-premium-features #{:advanced-permissions}
         (perms-group-membership/add-users-to-groups! [{:user user-id :group (data-analyst-group-id)}]))
       (mt/with-premium-features #{}
         (perms-group-membership/remove-users-from-groups! [user-id] [(data-analyst-group-id)])
         (is (not (in-data-analyst-group? user-id)))
         (testing "and unsets the is_data_analyst flag"
           (is (not (is-data-analyst-flag user-id)))))))))

(deftest add-to-other-groups-is-not-gated-test
  (testing "the Data Analysts gate does not affect other groups"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (mt/with-premium-features #{}
        (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
        (is (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))))))

(deftest re-adding-an-existing-member-is-a-no-op-test
  (testing "adding a user to a group they are already in changes nothing"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
      (let [before (t2/select-one :model/PermissionsGroupMembership :user_id user-id :group_id group-id)]
        (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
        (is (= before (t2/select-one :model/PermissionsGroupMembership :user_id user-id :group_id group-id)))))))

(mt/when-ee-evailable
 (deftest re-adding-an-existing-data-analyst-is-not-gated-test
   (testing "re-asserting an existing Data Analyst's membership without the feature adds nothing, so nothing is refused"
     (mt/with-temp [:model/User {user-id :id} {}]
       (mt/with-premium-features #{:advanced-permissions}
         (perms-group-membership/add-users-to-groups! [{:user user-id :group (data-analyst-group-id)}]))
       (mt/with-premium-features #{}
         (perms-group-membership/add-users-to-groups! [{:user user-id :group (data-analyst-group-id)}])
         (is (in-data-analyst-group? user-id))
         (is (true? (boolean (is-data-analyst-flag user-id)))))))))

(deftest add-to-data-analyst-group-in-a-batch-is-gated-test
  (testing "a batched add that includes the Data Analysts group is refused entirely"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Advanced Permissions"
             (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}
                                                           {:user user-id :group (data-analyst-group-id)}])))
        (is (not (in-data-analyst-group? user-id)))
        (testing "and the rest of the batch is not applied either"
          (is (not (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))))))))

(deftest adding-members-reads-their-users-once-test
  (testing "adding Users to a group costs the same number of queries for two Users as for eight"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
      (let [users   (vec (repeatedly 11 #(t2/insert-returning-pk! :model/User {:email      (str (random-uuid) "@example.com")
                                                                               :first_name "Test"
                                                                               :last_name  "User"
                                                                               :password   (str (random-uuid))})))
            queries (fn [user-ids]
                      (t2/with-call-count [call-count]
                        (perms-group-membership/add-users-to-groups! (for [user-id user-ids] {:user user-id :group group-id}))
                        (call-count)))]
        (try
          (queries (subvec users 0 1))
          (is (= (queries (subvec users 1 3)) (queries (subvec users 3 11))))
          (is (= 11 (t2/count :model/PermissionsGroupMembership :group_id group-id)))
          (finally
            (t2/delete! :model/User :id [:in users])))))))

(deftest adding-members-in-batch-keeps-user-rules-test
  (testing "a batch holding one membership that makes an admin a group manager is refused as a whole"
    (mt/with-temp [:model/User             {admin-id :id} {:is_superuser true}
                   :model/User             {user-id :id}  {}
                   :model/PermissionsGroup {group-id :id} {}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Admin cannot be a group manager"
                            (perms-group-membership/add-users-to-groups!
                             [{:user user-id :group group-id :is-group-manager? true}
                              {:user admin-id :group group-id :is-group-manager? true}])))
      (is (not (t2/exists? :model/PermissionsGroupMembership :group_id group-id))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (mt/with-model-cleanup [:model/User]
      (let [users!  (fn [n]
                      (mapv :id (user/create-users! (vec (repeatedly n #(hash-map :email      (str (mt/random-name) "@example.com")
                                                                                  :first_name "Test"
                                                                                  :last_name  "User"))))))
            add!    (fn [user-ids]
                      (perms-group-membership/add-users-to-groups! (mapv #(hash-map :user % :group group-id) user-ids)))]
        (testing "adding members, half of them in the group already"
          (let [counted (fn [n]
                          (let [user-ids (users! n)]
                            (add! (take-nth 2 user-ids))
                            (events.tu/statement-count! #(add! user-ids))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))
        (testing "removing members, half of them not in the group"
          (let [counted (fn [n]
                          (let [user-ids (users! n)]
                            (add! (take-nth 2 user-ids))
                            (events.tu/statement-count! #(perms-group-membership/remove-users-from-groups! user-ids [group-id]))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))
        (testing "making members group managers, half of them managers already"
          (let [update! (fn [user-ids]
                          (let [memberships (t2/select :model/PermissionsGroupMembership
                                                       :group_id group-id :user_id [:in user-ids])]
                            (perms-group-membership/update-permissions-group-memberships!
                             (mapv #(hash-map :id (:id %) :is_group_manager true) memberships))))
                counted (fn [n]
                          (let [user-ids (users! n)]
                            (add! user-ids)
                            (update! (take-nth 2 user-ids))
                            (events.tu/statement-count! #(update! user-ids))))]
            (counted 1)
            (let [c2 (counted 2) c4 (counted 4) c6 (counted 6)]
              (testing "an update grows by each row's own statements only, its hook's SELECT and its UPDATE"
                (is (= (- c6 c4) (- c4 c2)))))))))))

(deftest update-permissions-group-memberships-refuses-in-input-order-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                 :model/User             {member-id :id} {}
                 :model/User             {admin-id :id}  {:is_superuser true}
                 :model/PermissionsGroupMembership {member :id} {:user_id member-id :group_id group-id}
                 :model/PermissionsGroupMembership {admin :id}  {:user_id admin-id :group_id group-id}]
    (testing "the first refused row gives the message and nothing is written"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"move a group membership to another user"
                            (perms-group-membership/update-permissions-group-memberships!
                             [{:id member :user_id admin-id}
                              {:id admin :is_group_manager true}])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Admin cannot be a group manager"
                            (perms-group-membership/update-permissions-group-memberships!
                             [{:id admin :is_group_manager true}
                              {:id member :user_id admin-id}])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Admin cannot be a group manager"
                            (perms-group-membership/update-permissions-group-memberships!
                             [{:id member :is_group_manager true}
                              {:id admin :is_group_manager true}])))
      (is (false? (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership :id member))))
    (testing "the rows that exist are returned"
      (is (= [{:id member :is_group_manager true}]
             (perms-group-membership/update-permissions-group-memberships!
              [{:id member :is_group_manager true} {:id Integer/MAX_VALUE :is_group_manager true}])))
      (is (true? (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership :id member))))))

(deftest memberships-of-more-users-than-one-batch-are-written-completely-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                 :model/User             {user-1 :id}   {}
                 :model/User             {user-2 :id}   {}
                 :model/User             {user-3 :id}   {}]
    (let [user-ids [user-1 user-2 user-3]
          members  #(t2/select-fn-set :user_id :model/PermissionsGroupMembership :group_id group-id)]
      (with-redefs [app-db/create-partition-size 1
                    app-db/delete-partition-size 1]
        (testing "an addition of three users with constants lowered adds all three and publishes one event"
          (is (= [:event/group-membership-create]
                 (events.tu/published-topics!
                  #(perms-group-membership/add-users-to-groups! (for [user-id user-ids] {:user user-id :group group-id}))))))
        (is (= (set user-ids) (members)))
        (testing "a removal of three users with constants lowered removes all three and publishes one event"
          (is (= [:event/group-membership-delete]
                 (events.tu/published-topics!
                  #(perms-group-membership/remove-users-from-groups! user-ids [group-id]))))
          (is (empty? (members))))))))
