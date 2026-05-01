(ns metabase-enterprise.metabot.usage-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot.usage :as ee.usage]
   [metabase.api.common :as api]
   [metabase.metabot.usage :as usage]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-usage!
  "Insert a test ai_usage_log row for the given user with the specified total_tokens."
  ([user-id total-tokens]
   (insert-usage! user-id total-tokens nil))
  ([user-id total-tokens tenant-id]
   (t2/insert! :model/AiUsageLog
               (cond-> {:source            "test"
                        :model             "test/model"
                        :prompt_tokens     0
                        :completion_tokens 0
                        :total_tokens      total-tokens
                        :user_id           user-id}
                 tenant-id (assoc :tenant_id tenant-id)))))

(defn- cleanup-test-usage! [user-id]
  (t2/delete! :model/AiUsageLog :user_id user-id :source "test"))

;;; ------------------------------------------------ log-ai-usage! ------------------------------------------------

(deftest log-ai-usage!-records-usage-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! inserts a row into ai_usage_log"
      (let [user-id (mt/user->id :rasta)]
        (mt/with-test-user :rasta
          (let [before-count (t2/count :model/AiUsageLog :user_id user-id :source "metabot_agent")]
            (usage/log-ai-usage!
             {:source            "metabot_agent"
              :model             "anthropic/claude-test"
              :prompt-tokens     100
              :completion-tokens 50
              :ai-proxied        true})
            (try
              (is (= (inc before-count)
                     (t2/count :model/AiUsageLog :user_id user-id :source "metabot_agent")))
              (let [row (t2/select-one :model/AiUsageLog :user_id user-id :source "metabot_agent"
                                       {:order-by [[:id :desc]]})]
                (is (= "anthropic/claude-test" (:model row)))
                (is (= 100 (:prompt_tokens row)))
                (is (= 50 (:completion_tokens row)))
                (is (= 150 (:total_tokens row)))
                (is (= user-id (:user_id row)))
                (is (true? (:ai_proxied row))))
              (finally
                (t2/delete! :model/AiUsageLog :user_id user-id :source "metabot_agent")))))))))

(deftest log-ai-usage!-skips-intent-classification-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! skips user-intent-classification source"
      (let [user-id (mt/user->id :rasta)]
        (mt/with-test-user :rasta
          (let [before-count (t2/count :model/AiUsageLog :user_id user-id
                                       :source "user-intent-classification")]
            (usage/log-ai-usage!
             {:source            "user-intent-classification"
              :model             "anthropic/claude-test"
              :prompt-tokens     10
              :completion-tokens 5})
            (is (= before-count
                   (t2/count :model/AiUsageLog :user_id user-id
                             :source "user-intent-classification")))))))))

(deftest log-ai-usage!-defaults-user-id-from-binding-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! uses api/*current-user-id* when user-id not provided"
      (let [user-id (mt/user->id :rasta)]
        (mt/with-test-user :rasta
          (usage/log-ai-usage!
           {:source            "document_generate_content"
            :model             "test/model"
            :prompt-tokens     1
            :completion-tokens 1})
          (try
            (let [row (t2/select-one :model/AiUsageLog :source "document_generate_content"
                                     {:order-by [[:id :desc]]})]
              (is (= user-id (:user_id row))))
            (finally
              (t2/delete! :model/AiUsageLog :source "document_generate_content"))))))))

(deftest log-ai-usage!-converts-profile-id-keyword-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! converts keyword profile-id to string"
      (mt/with-test-user :rasta
        (usage/log-ai-usage!
         {:source            "example_question_generation_batch"
          :model             "test/model"
          :prompt-tokens     1
          :completion-tokens 1
          :profile-id        :internal})
        (try
          (let [row (t2/select-one :model/AiUsageLog :source "example_question_generation_batch"
                                   {:order-by [[:id :desc]]})]
            (is (= "internal" (:profile_id row))))
          (finally
            (t2/delete! :model/AiUsageLog :source "example_question_generation_batch")))))))

(deftest log-ai-usage!-explicit-user-id-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! uses explicitly passed user-id over bound value"
      (let [crowberto-id (mt/user->id :crowberto)]
        (mt/with-test-user :rasta
          (usage/log-ai-usage!
           {:source            "slack"
            :model             "test/model"
            :prompt-tokens     1
            :completion-tokens 1
            :user-id           crowberto-id})
          (try
            (let [row (t2/select-one :model/AiUsageLog :source "slack"
                                     {:order-by [[:id :desc]]})]
              (is (= crowberto-id (:user_id row))))
            (finally
              (t2/delete! :model/AiUsageLog :source "slack"))))))))

(deftest log-ai-usage!-ai-proxied-defaults-to-nil-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! stores nil for ai_proxied when not provided"
      (mt/with-test-user :rasta
        (usage/log-ai-usage!
         {:source            "oss-sql-gen"
          :model             "test/model"
          :prompt-tokens     1
          :completion-tokens 1})
        (try
          (let [row (t2/select-one :model/AiUsageLog :source "oss-sql-gen"
                                   {:order-by [[:id :desc]]})]
            (is (nil? (:ai_proxied row))))
          (finally
            (t2/delete! :model/AiUsageLog :source "oss-sql-gen")))))))

(deftest log-ai-usage!-throws-on-unknown-source-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! throws when source is not in the known set"
      (mt/with-test-user :rasta
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unknown ai_usage_log source"
             (usage/log-ai-usage!
              {:source            "made-up-source"
               :model             "test/model"
               :prompt-tokens     1
               :completion-tokens 1})))))))

(deftest log-ai-usage!-throws-on-unknown-profile-id-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! throws when profile-id is not in the known set"
      (mt/with-test-user :rasta
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unknown ai_usage_log profile-id"
             (usage/log-ai-usage!
              {:source            "metabot_agent"
               :model             "test/model"
               :prompt-tokens     1
               :completion-tokens 1
               :profile-id        :made-up-profile})))))))

;;; ------------------------------------------ check-usage-limits! ------------------------------------------

(deftest no-limits-configured-returns-nil-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (testing "check-usage-limits! returns nil when no limits are configured"
      (mt/with-test-user :rasta
        (is (nil? (usage/check-usage-limits!)))))))

(deftest instance-limit-nil-max-usage-returns-nil-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (testing "Instance limit with nil max_usage means unlimited"
      (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage nil}]
        (let [user-id (mt/user->id :rasta)]
          (insert-usage! user-id 999999)
          (try
            (mt/with-test-user :rasta
              (is (nil? (usage/check-usage-limits!))))
            (finally
              (cleanup-test-usage! user-id))))))))

(deftest instance-limit-under-returns-nil-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (testing "Instance limit: under limit returns nil"
      (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 999999999}]
        (mt/with-test-user :rasta
          (is (nil? (usage/check-usage-limits!))))))))

(deftest instance-limit-exceeded-returns-message-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-quota-reached-message "test limit reached"]
      (testing "Instance limit: at/over limit returns quota message"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 100}]
          (let [user-id (mt/user->id :rasta)]
            (insert-usage! user-id 150000000)
            (try
              (mt/with-test-user :rasta
                (is (= "test limit reached" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

(deftest instance-limit-exactly-at-limit-returns-message-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-quota-reached-message "test limit reached"]
      (testing "Instance limit: exactly at limit returns quota message (>= check)"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 100}]
          (let [user-id (mt/user->id :rasta)]
            (insert-usage! user-id 100000000)
            (try
              (mt/with-test-user :rasta
                (is (= "test limit reached" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

;;; ------------------------------------------ Tenant limit tests ------------------------------------------

(deftest tenant-limit-exceeded-returns-message-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-quota-reached-message "test limit reached"]
      (testing "Tenant limit: over limit returns quota message"
        (mt/with-temp [:model/Tenant {tenant-id :id} {}
                       :model/MetabotInstanceLimit _ {:tenant_id tenant-id :max_usage 50}]
          (let [user-id (mt/user->id :rasta)]
            (insert-usage! user-id 100000000 tenant-id)
            (try
              (binding [api/*current-user-id* user-id
                        api/*current-user*    (delay {:tenant_id tenant-id})]
                (is (= "test limit reached" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

(deftest tenant-limit-nil-max-usage-returns-nil-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (testing "Tenant limit with nil max_usage means unlimited"
      (mt/with-temp [:model/Tenant {tenant-id :id} {}
                     :model/MetabotInstanceLimit _ {:tenant_id tenant-id :max_usage nil}]
        (let [user-id (mt/user->id :rasta)]
          (insert-usage! user-id 999999 tenant-id)
          (try
            (binding [api/*current-user-id* user-id
                      api/*current-user*    (delay {:tenant_id tenant-id})]
              (is (nil? (usage/check-usage-limits!))))
            (finally
              (cleanup-test-usage! user-id))))))))

(deftest no-tenant-skips-tenant-check-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (testing "User without a tenant skips tenant limit check"
      (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 999999999}]
        (mt/with-test-user :rasta
          (is (nil? (usage/check-usage-limits!))))))))

;;; ------------------------------------------ User group limit tests ------------------------------------------

(deftest user-group-limit-exceeded-returns-message-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-quota-reached-message "test limit reached"]
      (testing "User group limit: user over their group limit returns message"
        (let [user-id   (mt/user->id :rasta)
              group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id)
              group-id  (first group-ids)]
          (mt/with-temp [:model/MetabotGroupLimit _ {:group_id group-id :max_usage 50}]
            (insert-usage! user-id 100000000)
            (try
              (mt/with-test-user :rasta
                (is (= "test limit reached" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

(deftest user-group-limit-takes-max-across-groups-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (t2/delete! :model/MetabotInstanceLimit :tenant_id nil)
    (testing "User group limit: takes the max limit across all groups the user is in"
      (let [user-id (mt/user->id :rasta)]
        (mt/with-temp [:model/PermissionsGroup {g1 :id} {:name "Low limit group"}
                       :model/PermissionsGroup {g2 :id} {:name "High limit group"}
                       :model/PermissionsGroupMembership _ {:group_id g1 :user_id user-id}
                       :model/PermissionsGroupMembership _ {:group_id g2 :user_id user-id}
                       :model/MetabotGroupLimit _ {:group_id g1 :max_usage 10}
                       :model/MetabotGroupLimit _ {:group_id g2 :max_usage 1000}]
          (insert-usage! user-id 50000000)
          (try
            (mt/with-test-user :rasta
              ;; 50 < 1000 (the max across groups), so should pass
              (is (nil? (usage/check-usage-limits!))))
            (finally
              (cleanup-test-usage! user-id))))))))

(deftest user-group-null-limit-means-unlimited-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (t2/delete! :model/MetabotInstanceLimit :tenant_id nil)
    (testing "User group limit: if any of the user's groups has no limit configured, user is unlimited"
      (let [user-id (mt/user->id :rasta)]
        (mt/with-temp [:model/PermissionsGroup {g1 :id} {:name "Limited group"}
                       :model/PermissionsGroup {g2 :id} {:name "Unlimited group"}
                       :model/PermissionsGroupMembership _ {:group_id g1 :user_id user-id}
                       :model/PermissionsGroupMembership _ {:group_id g2 :user_id user-id}
                       :model/MetabotGroupLimit _ {:group_id g1 :max_usage 10}]
          ;; g2 has no limit row — being in any unlimited group makes the user unlimited
          (insert-usage! user-id 50000000)
          (try
            (mt/with-test-user :rasta
              (is (nil? (usage/check-usage-limits!))))
            (finally
              (cleanup-test-usage! user-id))))))))

(deftest user-group-no-limit-configured-returns-nil-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (testing "User with no group limits configured returns nil"
      (let [user-id (mt/user->id :rasta)]
        (insert-usage! user-id 999999)
        (try
          (mt/with-test-user :rasta
            (is (nil? (usage/check-usage-limits!))))
          (finally
            (cleanup-test-usage! user-id)))))))

;;; ------------------------------------------ Messages limit type ------------------------------------------

(deftest messages-limit-type-counts-rows-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-limit-unit "messages"
                                       metabot-quota-reached-message "test limit reached"]
      (testing "Instance limit with :messages type counts rows, not tokens"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 2}]
          (let [user-id (mt/user->id :rasta)]
            ;; Insert 3 rows each with 1 token — row count (3) exceeds limit (2)
            (dotimes [_ 3]
              (insert-usage! user-id 1))
            (try
              (mt/with-test-user :rasta
                (is (= "test limit reached" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

(deftest messages-under-limit-returns-nil-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-limit-unit "messages"]
      (testing "Instance limit with :messages type: under limit returns nil"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 100}]
          (let [user-id (mt/user->id :rasta)]
            (insert-usage! user-id 1)
            (try
              (mt/with-test-user :rasta
                (is (nil? (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

;;; ------------------------------------------ Custom quota message ------------------------------------------

(deftest custom-quota-message-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-quota-reached-message "Custom limit message"]
      (testing "check-usage-limits! returns the configured quota message"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 1}]
          (let [user-id (mt/user->id :rasta)]
            (insert-usage! user-id 2000000)
            (try
              (mt/with-test-user :rasta
                (is (= "Custom limit message" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))

;;; ------------------------------------------ Priority ordering ------------------------------------------

(deftest instance-limit-checked-first-test
  (mt/with-premium-features #{:ai-controls}
    (ee.usage/clear-limit-cache!)
    (mt/with-temporary-setting-values [metabot-quota-reached-message "test limit reached"]
      (testing "Instance limit blocks even when user group limit would allow"
        (let [user-id   (mt/user->id :rasta)
              group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id)
              group-id  (first group-ids)]
          (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 1}
                         :model/MetabotGroupLimit _ {:group_id group-id :max_usage 999999}]
            (insert-usage! user-id 2000000)
            (try
              (mt/with-test-user :rasta
                (is (= "test limit reached" (usage/check-usage-limits!))))
              (finally
                (cleanup-test-usage! user-id)))))))))
