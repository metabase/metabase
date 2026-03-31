(ns metabase.metabot.limits-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.limits :as limits]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (limits/clear-cache!) (f)))

(defn- insert-usage!
  "Insert a test ai_usage_log row for the given user with the specified total_tokens."
  [user-id total-tokens]
  (t2/insert! :model/AiUsageLog
              {:source            "test"
               :model             "test/model"
               :prompt_tokens     0
               :completion_tokens 0
               :total_tokens      total-tokens
               :user_id           user-id}))

(deftest check-instance-limit-no-limit-test
  (testing "Instance limit: no limit configured → nil"
    (mt/with-temp-env-var-value! [:mb-metabot-limit-type "tokens"]
      (t2/delete! :model/MetabotInstanceLimit :tenant_id nil)
      (mt/with-test-user :rasta
        (is (nil? (limits/check-usage-limits!)))))))

(deftest check-instance-limit-under-test
  (testing "Instance limit: under limit → nil"
    (mt/with-temp-env-var-value! [:mb-metabot-limit-type "tokens"]
      (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 999999999}]
        (mt/with-test-user :rasta
          (is (nil? (limits/check-usage-limits!))))))))

(deftest check-instance-limit-over-test
  (testing "Instance limit: at/over limit → message"
    (mt/with-temp-env-var-value! [:mb-metabot-limit-type "tokens"]
      (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 100}]
        (let [user-id (mt/user->id :rasta)]
          (insert-usage! user-id 150)
          (try
            (mt/with-test-user :rasta
              (is (string? (limits/check-usage-limits!))))
            (finally
              (t2/delete! :model/AiUsageLog :user_id user-id :source "test"))))))))

(deftest check-user-group-limit-no-limit-test
  (testing "User group limit: no group limit → nil"
    (mt/with-temp-env-var-value! [:mb-metabot-limit-type "tokens"]
      (mt/with-test-user :rasta
        (is (nil? (limits/check-usage-limits!)))))))

(deftest check-user-group-limit-over-test
  (testing "User group limit: user over their group limit → message"
    (mt/with-temp-env-var-value! [:mb-metabot-limit-type "tokens"]
      (let [user-id  (mt/user->id :rasta)
            group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id)
            group-id  (first group-ids)]
        (mt/with-temp [:model/MetabotGroupLimit _ {:group_id group-id :max_usage 50}]
          (insert-usage! user-id 100)
          (try
            (mt/with-test-user :rasta
              (is (string? (limits/check-usage-limits!))))
            (finally
              (t2/delete! :model/AiUsageLog :user_id user-id :source "test"))))))))

(deftest check-conversations-limit-type-test
  (testing "Instance limit with :conversations type counts rows"
    (mt/with-temp-env-var-value! [:mb-metabot-limit-type "conversations"]
      (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 2}]
        (let [user-id (mt/user->id :rasta)]
          (dotimes [_ 3]
            (insert-usage! user-id 1))
          (try
            (mt/with-test-user :rasta
              (is (string? (limits/check-usage-limits!))))
            (finally
              (t2/delete! :model/AiUsageLog :user_id user-id :source "test"))))))))

(deftest check-no-limits-configured-test
  (testing "When no limits are configured at any level, returns nil"
    (t2/delete! :model/MetabotInstanceLimit :tenant_id nil)
    (mt/with-test-user :rasta
      (is (nil? (limits/check-usage-limits!))))))
