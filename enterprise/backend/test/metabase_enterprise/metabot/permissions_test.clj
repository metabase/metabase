(ns metabase-enterprise.metabot.permissions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

(deftest resolve-user-permissions-default-test
  (mt/with-premium-features #{:ai-controls}
    (testing "user with no stored permissions inherits from all-internal-users migration defaults"
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}
                     :model/PermissionsGroupMembership _ {:user_id  user-id
                                                          :group_id group-id}]
        (let [perms (scope/resolve-user-permissions user-id)]
          ;; all-internal-users magic group has yes from migration
          (is (= :yes (:permission/metabot-sql-generation perms)))
          (is (= :yes (:permission/metabot-nlq perms))))))))

(deftest resolve-user-permissions-stored-test
  (mt/with-premium-features #{:ai-controls}
    (testing "user in group with stored permissions gets those values"
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "SQL Group"}
                     :model/PermissionsGroupMembership _ {:user_id  user-id
                                                          :group_id group-id}
                     :model/MetabotPermissions _ {:group_id   group-id
                                                  :perm_type  :permission/metabot-sql-generation
                                                  :perm_value :yes}]
        (let [perms (scope/resolve-user-permissions user-id)]
          (is (= :yes (:permission/metabot-sql-generation perms)))
          ;; all-internal-users magic group has :yes for nql from migration
          (is (= :yes (:permission/metabot-nlq perms))))))))

(deftest resolve-user-permissions-most-permissive-test
  (mt/with-premium-features #{:ai-controls}
    (testing "most permissive wins across multiple groups"
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-a :id} {:name "Group A"}
                     :model/PermissionsGroup {group-b :id} {:name "Group B"}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-a}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-b}
                     :model/MetabotPermissions _ {:group_id   group-a
                                                  :perm_type  :permission/metabot-sql-generation
                                                  :perm_value :no}
                     :model/MetabotPermissions _ {:group_id   group-b
                                                  :perm_type  :permission/metabot-sql-generation
                                                  :perm_value :yes}
                     :model/MetabotPermissions _ {:group_id   group-a
                                                  :perm_type  :permission/metabot-nlq
                                                  :perm_value :no}
                     :model/MetabotPermissions _ {:group_id   group-b
                                                  :perm_type  :permission/metabot-nlq
                                                  :perm_value :yes}]
        (let [perms (scope/resolve-user-permissions user-id)]
          (is (= :yes (:permission/metabot-sql-generation perms))
              ":yes wins over :no for sql-generation")
          (is (= :yes (:permission/metabot-nlq perms))
              ":yes wins over :no for nql"))))))
