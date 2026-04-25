(ns metabase-enterprise.metabot.api.permissions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot.permissions]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private all-perm-types
  #{"permission/metabot"
    "permission/metabot-sql-generation"
    "permission/metabot-nlq"
    "permission/metabot-other-tools"})

(deftest ^:parallel list-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "GET /api/ee/ai-controls/permissions"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/permissions"))))
      (testing "returns default permissions for all groups even with no rows in the table"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions")
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))]
            (is (= all-perm-types (set (map :perm_type perms))))
            (is (every? #(= "no" (:perm_value %)) perms)))))
      (testing "returns stored values when they exist, defaults for the rest"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}
                       :model/MetabotPermissions _ {:group_id   group-id
                                                    :perm_type  :permission/metabot-sql-generation
                                                    :perm_value :yes}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions")
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))
                by-type  (into {} (map (juxt :perm_type :perm_value)) perms)]
            (is (= all-perm-types (set (map :perm_type perms))))
            (is (= "yes" (get by-type "permission/metabot-sql-generation")))
            (is (= "no" (get by-type "permission/metabot-nlq")))
            (is (= "no" (get by-type "permission/metabot-other-tools")))))))))

(deftest update-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "PUT /api/ee/ai-controls/permissions"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/ai-controls/permissions"
                                     {:permissions [{:group_id 1 :perm_type "permission/metabot-sql-generation" :perm_value "yes"}]}))))
      (testing "upserts permissions across multiple groups"
        (mt/with-temp [:model/PermissionsGroup {group-a :id} {:name "Group A"}
                       :model/PermissionsGroup {group-b :id} {:name "Group B"}
                       :model/MetabotPermissions _ {:group_id   group-a
                                                    :perm_type  :permission/metabot-sql-generation
                                                    :perm_value :no}]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/ai-controls/permissions"
                                               {:permissions [{:group_id group-a :perm_type "permission/metabot-sql-generation" :perm_value "yes"}
                                                              {:group_id group-a :perm_type "permission/metabot-nlq" :perm_value "yes"}
                                                              {:group_id group-b :perm_type "permission/metabot-other-tools" :perm_value "yes"}]})
                perms-a  (->> (:permissions response)
                              (filter #(= (:group_id %) group-a)))
                perms-b  (->> (:permissions response)
                              (filter #(= (:group_id %) group-b)))
                by-type  (fn [perms] (into {} (map (juxt :perm_type :perm_value)) perms))]
            (is (= "yes" (get (by-type perms-a) "permission/metabot-sql-generation")))
            (is (= "yes" (get (by-type perms-a) "permission/metabot-nlq")))
            (is (= "yes" (get (by-type perms-b) "permission/metabot-other-tools")))
            (is (= 1 (t2/count :model/MetabotPermissions :group_id group-a
                               :perm_type :permission/metabot-sql-generation))))))
      (testing "returns full permissions for all groups with defaults filled in"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/ai-controls/permissions"
                                               {:permissions [{:group_id group-id :perm_type "permission/metabot-nlq" :perm_value "yes"}]})
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))]
            (is (= all-perm-types (set (map :perm_type perms))))))))))

(deftest ^:parallel user-permissions-with-custom-group-test
  (mt/with-premium-features #{:ai-controls}
    (testing "GET /api/metabot/permissions/user-permissions"
      (testing "user in group with custom permissions gets those values"
        (mt/with-temp [:model/PermissionsGroup           {gid :id} {:name "Test Metabot Perms Group"}
                       :model/PermissionsGroupMembership _         {:group_id gid :user_id (mt/user->id :rasta)}
                       :model/MetabotPermissions         _         {:group_id   gid
                                                                    :perm_type  :permission/metabot-sql-generation
                                                                    :perm_value :yes}]
          (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
            (is (= "yes" (:metabot-sql-generation perms)))))))))

(deftest user-permissions-includes-usage-test
  (mt/with-premium-features #{:ai-controls}
    (t2/delete! :model/MetabotGroupLimit)
    (t2/delete! :model/MetabotInstanceLimit)
    (t2/delete! :model/AiUsageLog)
    (mt/with-temporary-setting-values [metabot-limit-unit "tokens"
                                       metabot-limit-reset-rate "monthly"]
      (testing "GET /api/metabot/permissions/user-permissions includes usage data in EE"
        (let [usage (:usage (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
          (is (= {:user_usage       0.0
                  :user_limit       nil
                  :instance_usage   0.0
                  :instance_limit   nil
                  :limit_unit       "tokens"
                  :limit_reset_rate "monthly"}
                 (dissoc usage :period_start)))
          (is (string? (:period_start usage)))))
      (testing "superuser also gets usage data"
        (let [usage (:usage (mt/user-http-request :crowberto :get 200 "metabot/permissions/user-permissions"))]
          (is (= {:user_usage       0.0
                  :user_limit       nil
                  :instance_usage   0.0
                  :instance_limit   nil
                  :limit_unit       "tokens"
                  :limit_reset_rate "monthly"}
                 (dissoc usage :period_start))))))))

(deftest ^:parallel admin-endpoints-require-ai-controls-feature-test
  (testing "admin endpoints return 402 without :ai-controls feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error "AI Controls"
                                           (mt/user-http-request :crowberto :get 402 "ee/ai-controls/permissions"))
      (mt/assert-has-premium-feature-error "AI Controls"
                                           (mt/user-http-request :crowberto :put 402 "ee/ai-controls/permissions"
                                                                 {:permissions []})))))
