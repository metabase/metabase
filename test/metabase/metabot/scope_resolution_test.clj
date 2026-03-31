(ns metabase.metabot.scope-resolution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

(deftest user-metabot-perms->scopes-test
  (testing "sql-generation :yes grants sql, transforms, snippets scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :yes
                   :permission/metabot-nql            :no
                   :permission/metabot-other-tools    :no
                   :permission/metabot-model          :small})]
      (is (contains? scopes "agent:sql:*"))
      (is (contains? scopes "agent:transforms:*"))
      (is (contains? scopes "agent:snippets:*"))
      (is (not (contains? scopes "agent:notebook:*")))
      (is (not (contains? scopes "agent:viz:*")))))

  (testing "nql :yes grants notebook, query, table, metric scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nql            :yes
                   :permission/metabot-other-tools    :no
                   :permission/metabot-model          :small})]
      (is (contains? scopes "agent:notebook:*"))
      (is (contains? scopes "agent:query:*"))
      (is (contains? scopes "agent:table:*"))
      (is (contains? scopes "agent:metric:*"))
      (is (not (contains? scopes "agent:sql:*")))))

  (testing "other-tools :yes grants viz, dashboard, document, alert scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nql            :no
                   :permission/metabot-other-tools    :yes
                   :permission/metabot-model          :small})]
      (is (contains? scopes "agent:viz:*"))
      (is (contains? scopes "agent:dashboard:*"))
      (is (contains? scopes "agent:document:*"))
      (is (contains? scopes "agent:alert:*"))
      (is (not (contains? scopes "agent:sql:*")))))

  (testing "always-granted scopes present regardless of permissions"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nql            :no
                   :permission/metabot-other-tools    :no
                   :permission/metabot-model          :small})]
      (is (contains? scopes "agent:search"))
      (is (contains? scopes "agent:resource:*"))
      (is (contains? scopes "agent:todo:*"))
      (is (contains? scopes "agent:metadata:*"))))

  (testing "all-yes grants all scopes"
    (let [scopes (scope/user-metabot-perms->scopes scope/all-yes-permissions)]
      (is (contains? scopes "agent:sql:*"))
      (is (contains? scopes "agent:notebook:*"))
      (is (contains? scopes "agent:viz:*"))
      (is (contains? scopes "agent:search"))))

  (testing "nil permissions falls back to defaults (all :no)"
    (let [scopes (scope/user-metabot-perms->scopes nil)]
      (is (contains? scopes "agent:search"))
      (is (not (contains? scopes "agent:sql:*")))
      (is (not (contains? scopes "agent:notebook:*")))
      (is (not (contains? scopes "agent:viz:*"))))))

(deftest resolve-user-permissions-test
  (testing "nil user-id returns defaults"
    (let [perms (scope/resolve-user-permissions nil)]
      (is (= :no (:permission/metabot-sql-generation perms)))
      (is (= :no (:permission/metabot-nql perms)))
      (is (= :no (:permission/metabot-other-tools perms)))
      (is (= :small (:permission/metabot-model perms)))))

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
            ":large wins over :small")))))
