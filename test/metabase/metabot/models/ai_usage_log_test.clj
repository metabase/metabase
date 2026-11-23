(ns metabase.metabot.models.ai-usage-log-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.events.test-util :as events.tu]
   [metabase.metabot.models.ai-usage-log :as ai-usage-log]
   [metabase.test :as mt]))

(defn- usage-row
  [conversation-id]
  {:source                "test"
   :model                 "claude"
   :provider              "anthropic"
   :model_name            "claude"
   :prompt_tokens         1
   :completion_tokens     1
   :total_tokens          2
   :user_id               (mt/user->id :rasta)
   :tenant_id             nil
   :conversation_id       conversation-id
   :profile_id            nil
   :request_id            nil
   :ai_proxied            false
   :cache_creation_tokens nil
   :cache_read_tokens     nil})

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/AiUsageLog]
    (let [create! (fn [n]
                    (events.tu/statement-count!
                     #(ai-usage-log/create-ai-usage-logs! (vec (repeat n (usage-row (str (random-uuid))))))))]
      (testing "recording usage"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "deleting the usage of conversations"
        (let [counted (fn [n]
                        (let [ids (vec (repeatedly n #(str (random-uuid))))]
                          (ai-usage-log/create-ai-usage-logs! (mapv usage-row ids))
                          (events.tu/statement-count! #(ai-usage-log/delete-ai-usage-logs! (ai-usage-log/ids-for-conversations ids)))))]
          (counted 1)
          (is (= (counted 2) (counted 6))))))))
