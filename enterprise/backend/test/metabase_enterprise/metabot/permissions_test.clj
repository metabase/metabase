(ns metabase-enterprise.metabot.permissions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
    (testing "in group-level mode a user in a group with stored permissions gets those values"
      (mt/with-temporary-setting-values [metabot-advanced-permissions true]
        (mt/with-temp [:model/User {user-id :id} {}
                       :model/PermissionsGroup {group-id :id} {:name "SQL Group"}
                       :model/PermissionsGroupMembership _ {:user_id  user-id
                                                            :group_id group-id}
                       :model/MetabotPermissions _ {:group_id   group-id
                                                    :perm_type  :permission/metabot-sql-generation
                                                    :perm_value :yes}]
          (is (= {:permission/metabot-sql-generation :yes
                  :permission/metabot-nlq            :no}
                 (select-keys (scope/resolve-user-permissions user-id)
                              [:permission/metabot-sql-generation :permission/metabot-nlq]))))))))

(deftest resolve-user-permissions-most-permissive-test
  (mt/with-premium-features #{:ai-controls}
    (testing "most permissive wins across multiple groups"
      (mt/with-temporary-setting-values [metabot-advanced-permissions true]
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
          (is (=? {:permission/metabot-sql-generation :yes
                   :permission/metabot-nlq            :yes}
                  (scope/resolve-user-permissions user-id))))))))

(defn- do-with-empty-metabot-permissions!
  "Run `thunk` with the `metabot_permissions` table emptied, restoring the migration-seeded rows afterwards."
  [thunk]
  (let [snapshot (t2/select :model/MetabotPermissions)]
    (t2/delete! :model/MetabotPermissions)
    (try
      (thunk)
      (finally
        (t2/delete! :model/MetabotPermissions)
        (when (seq snapshot)
          (t2/insert! :model/MetabotPermissions
                      (map #(select-keys % [:group_id :perm_type :perm_value]) snapshot)))))))

(deftest resolve-user-permissions-mode-scoping-test
  (mt/with-premium-features #{:ai-controls}
    (do-with-empty-metabot-permissions!
     (fn []
       (let [all-users-id    (u/the-id (perms/all-users-group))
             data-analyst-id (u/the-id (perms/data-analyst-group))]
         (mt/with-temp [:model/User {user-id :id} {}
                        :model/PermissionsGroup {group-id :id} {:name "Custom Group"}
                        :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                        :model/PermissionsGroupMembership _ {:user_id user-id :group_id data-analyst-id}
                        :model/MetabotPermissions _ {:group_id   all-users-id
                                                     :perm_type  :permission/metabot
                                                     :perm_value :yes}
                        :model/MetabotPermissions _ {:group_id   data-analyst-id
                                                     :perm_type  :permission/metabot-nlq
                                                     :perm_value :yes}
                        :model/MetabotPermissions _ {:group_id   group-id
                                                     :perm_type  :permission/metabot-sql-generation
                                                     :perm_value :yes}]
           (testing "simple mode resolves only the groups it shows, so hidden All Users :no cannot be overridden"
             (mt/with-temporary-setting-values [metabot-advanced-permissions false]
               (is (=? {:permission/metabot                :yes
                        :permission/metabot-nlq            :no
                        :permission/metabot-sql-generation :no}
                       (scope/resolve-user-permissions user-id)))))
           (testing "group-level mode ignores the All Users rows it hides and resolves every other group"
             (mt/with-temporary-setting-values [metabot-advanced-permissions true]
               (is (=? {:permission/metabot                :no
                        :permission/metabot-nlq            :yes
                        :permission/metabot-sql-generation :yes}
                       (scope/resolve-user-permissions user-id)))))))))))
