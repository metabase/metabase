(ns metabase-enterprise.metabot.usage-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.usage :as usage]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ log-ai-usage! ------------------------------------------------

(deftest log-ai-usage!-records-usage-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! inserts a row into ai_usage_log"
      (let [user-id (mt/user->id :rasta)]
        (mt/with-test-user :rasta
          (let [before-count (t2/count :model/AiUsageLog :user_id user-id :source "log-test")]
            (usage/log-ai-usage!
             {:source            "log-test"
              :model             "anthropic/claude-test"
              :prompt-tokens     100
              :completion-tokens 50})
            (try
              (is (= (inc before-count)
                     (t2/count :model/AiUsageLog :user_id user-id :source "log-test")))
              (let [row (t2/select-one :model/AiUsageLog :user_id user-id :source "log-test"
                                       {:order-by [[:id :desc]]})]
                (is (= "anthropic/claude-test" (:model row)))
                (is (= 100 (:prompt_tokens row)))
                (is (= 50 (:completion_tokens row)))
                (is (= 150 (:total_tokens row)))
                (is (= user-id (:user_id row))))
              (finally
                (t2/delete! :model/AiUsageLog :user_id user-id :source "log-test")))))))))

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
           {:source            "binding-test"
            :model             "test/model"
            :prompt-tokens     1
            :completion-tokens 1})
          (try
            (let [row (t2/select-one :model/AiUsageLog :source "binding-test"
                                     {:order-by [[:id :desc]]})]
              (is (= user-id (:user_id row))))
            (finally
              (t2/delete! :model/AiUsageLog :source "binding-test"))))))))

(deftest log-ai-usage!-converts-profile-id-keyword-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! converts keyword profile-id to string"
      (mt/with-test-user :rasta
        (usage/log-ai-usage!
         {:source            "profile-test"
          :model             "test/model"
          :prompt-tokens     1
          :completion-tokens 1
          :profile-id        :internal})
        (try
          (let [row (t2/select-one :model/AiUsageLog :source "profile-test"
                                   {:order-by [[:id :desc]]})]
            (is (= "internal" (:profile_id row))))
          (finally
            (t2/delete! :model/AiUsageLog :source "profile-test")))))))

(deftest log-ai-usage!-explicit-user-id-test
  (mt/with-premium-features #{:ai-controls}
    (testing "log-ai-usage! uses explicitly passed user-id over bound value"
      (let [crowberto-id (mt/user->id :crowberto)]
        (mt/with-test-user :rasta
          (usage/log-ai-usage!
           {:source            "explicit-user-test"
            :model             "test/model"
            :prompt-tokens     1
            :completion-tokens 1
            :user-id           crowberto-id})
          (try
            (let [row (t2/select-one :model/AiUsageLog :source "explicit-user-test"
                                     {:order-by [[:id :desc]]})]
              (is (= crowberto-id (:user_id row))))
            (finally
              (t2/delete! :model/AiUsageLog :source "explicit-user-test"))))))))
