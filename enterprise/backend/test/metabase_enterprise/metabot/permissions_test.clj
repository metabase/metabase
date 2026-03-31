(ns metabase-enterprise.metabot.permissions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

(deftest resolve-user-permissions-ee-test
  (mt/with-premium-features #{:ai-controls}
    (testing "user with no stored permissions inherits from all-internal-users migration defaults"
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}
                     :model/PermissionsGroupMembership _ {:user_id  user-id
                                                          :group_id group-id}]
        (let [perms (scope/resolve-user-permissions user-id)]
          ;; all-internal-users magic group has yes/medium from migration
          (is (= :yes (:permission/metabot-sql-generation perms)))
          (is (= :yes (:permission/metabot-nql perms)))
          (is (= :medium (:permission/metabot-model perms))))))

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
          (is (= :yes (:permission/metabot-nql perms))))))

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
                                                  :perm_type  :permission/metabot-model
                                                  :perm_value :small}
                     :model/MetabotPermissions _ {:group_id   group-b
                                                  :perm_type  :permission/metabot-model
                                                  :perm_value :large}]
        (let [perms (scope/resolve-user-permissions user-id)]
          (is (= :yes (:permission/metabot-sql-generation perms))
              ":yes wins over :no")
          (is (= :large (:permission/metabot-model perms))
              ":large wins over :small"))))))
