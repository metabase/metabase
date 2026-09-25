(ns metabase-enterprise.mcp.permissions-test
  "How a user's effective MCP policy is collected from their groups' `mcp_group_permission` rows."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.mcp.permissions]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private no-access-policy
  [])

(defn- listed-tool-names
  "The names `tools/list` returns for the current user."
  []
  (into #{} (map :name) (registry/list-tools)))

(deftest ^:parallel without-ai-controls-feature-rows-are-ignored-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                   :model/PermissionsGroupMembership _              {:group_id group-id
                                                                     :user_id  (mt/user->id :rasta)}
                   :model/McpGroupPermission         _              {:group_id    group-id
                                                                     :mcp_enabled false
                                                                     :tool_access {"test_echo" "no"}}]
      (is (= mcp.perms/unrestricted-policy (mcp.perms/effective-policy (mt/user->id :rasta)))))))

(deftest stored-entries-override-defaults-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [mcp-advanced-permissions true]
      (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                     :model/PermissionsGroupMembership _              {:group_id group-id
                                                                       :user_id  (mt/user->id :rasta)}
                     :model/McpGroupPermission         _              {:group_id    group-id
                                                                       :mcp_enabled true
                                                                       :tool_access {"search"              "no"
                                                                                     "test_off_by_default" "yes"
                                                                                     "dodo"                "no"}}]
        (mt/with-current-user (mt/user->id :rasta)
          (testing "the row's map is the policy, string keys and values as stored"
            (is (= [{"search" "no" "test_off_by_default" "yes" "dodo" "no"}] (mcp.perms/policy-for-current-user))))
          (let [names (listed-tool-names)]
            (testing "explicit no hides a tool allowed by default"
              (is (not (contains? names "search"))))
            (testing "explicit yes shows a tool denied by default"
              (is (contains? names "test_off_by_default")))
            (testing "a tool with no entry takes its default"
              (is (contains? names "test_echo")))))))))

(deftest any-enabled-group-allowing-wins-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [mcp-advanced-permissions true]
      (mt/with-temp [:model/PermissionsGroup           {denying-id :id}   {}
                     :model/PermissionsGroup           {allowing-id :id}  {}
                     :model/PermissionsGroup           {untouched-id :id} {}
                     :model/PermissionsGroupMembership _                  {:group_id denying-id
                                                                           :user_id  (mt/user->id :rasta)}
                     :model/PermissionsGroupMembership _                  {:group_id allowing-id
                                                                           :user_id  (mt/user->id :rasta)}
                     :model/PermissionsGroupMembership _                  {:group_id untouched-id
                                                                           :user_id  (mt/user->id :rasta)}
                     :model/McpGroupPermission         _                  {:group_id    denying-id
                                                                           :mcp_enabled true
                                                                           :tool_access {"test_echo" "no"
                                                                                         "search"    "no"}}
                     :model/McpGroupPermission         _                  {:group_id    allowing-id
                                                                           :mcp_enabled true
                                                                           :tool_access {"search" "yes"}}
                     :model/McpGroupPermission         _                  {:group_id    untouched-id
                                                                           :mcp_enabled true
                                                                           :tool_access {}}]
        (mt/with-current-user (mt/user->id :rasta)
          (let [names (listed-tool-names)]
            (testing "yes in one group beats no in another"
              (is (contains? names "search")))
            (testing "an untouched group's default allowed beats another group's explicit no"
              (is (contains? names "test_echo")))
            (testing "a tool denied by default stays hidden until some group says yes"
              (is (not (contains? names "test_off_by_default"))))))))))

(deftest disabled-group-contributes-nothing-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [mcp-advanced-permissions true]
      (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                     :model/PermissionsGroupMembership _              {:group_id group-id
                                                                       :user_id  (mt/user->id :rasta)}
                     :model/McpGroupPermission         _              {:group_id    group-id
                                                                       :mcp_enabled false
                                                                       :tool_access {"test_echo" "yes"}}]
        (testing "a disabled group's entries are not read, so its yes enables nothing"
          (is (= no-access-policy (mcp.perms/effective-policy (mt/user->id :rasta)))))
        (testing "a group with no row is the same as a disabled one"
          (mt/with-temp [:model/PermissionsGroup           {rowless-id :id} {}
                         :model/PermissionsGroupMembership _                {:group_id rowless-id
                                                                             :user_id  (mt/user->id :rasta)}]
            (is (= no-access-policy (mcp.perms/effective-policy (mt/user->id :rasta))))))))))

(deftest hidden-group-rows-are-ignored-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                   :model/PermissionsGroupMembership _              {:group_id group-id
                                                                     :user_id  (mt/user->id :rasta)}
                   :model/McpGroupPermission         _              {:group_id    group-id
                                                                     :mcp_enabled false
                                                                     :tool_access {}}]
      (testing "simple mode reads only the magic groups, so All Users' seeded row enables the user"
        (mt/with-temporary-setting-values [mcp-advanced-permissions false]
          (is (= [{}] (mcp.perms/effective-policy (mt/user->id :rasta))))))
      (testing "group-level mode ignores All Users, so the disabled group is all the user has"
        (mt/with-temporary-setting-values [mcp-advanced-permissions true]
          (is (= no-access-policy (mcp.perms/effective-policy (mt/user->id :rasta)))))))))
