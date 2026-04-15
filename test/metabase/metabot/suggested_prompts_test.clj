(ns metabase.metabot.suggested-prompts-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.suggested-prompts :as suggested-prompts]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest record-usage-inserts-conversation-and-message-test
  (testing "record-usage! creates MetabotConversation and MetabotMessage with correct fields"
    (let [user-id (mt/user->id :rasta)
          usage   {"openrouter/anthropic/claude-haiku-4-5" {:prompt 100 :completion 20}}]
      (mt/with-model-cleanup [:model/MetabotMessage :model/MetabotConversation]
        (mt/with-temporary-setting-values [llm-metabot-provider "openrouter/anthropic/claude-haiku-4-5"]
          (#'suggested-prompts/record-usage! user-id usage)
          (let [conversation (t2/select-one :model/MetabotConversation :user_id user-id
                                            {:order-by [[:created_at :desc]]})
                message      (t2/select-one :model/MetabotMessage
                                            :conversation_id (:id conversation))]
            (is (some? conversation))
            (is (= user-id (:user_id conversation)))
            (is (=? {:role         :assistant
                     :profile_id   "example-question-generation"
                     :total_tokens 120
                     :ai_proxied   false}
                    message))
            (is (= 100 (get-in (:usage message)
                               [(keyword "openrouter/anthropic/claude-haiku-4-5") :prompt])))
            (is (= 20 (get-in (:usage message)
                              [(keyword "openrouter/anthropic/claude-haiku-4-5") :completion])))))))))

(deftest record-usage-sets-ai-proxied-for-metabase-provider-test
  (testing "record-usage! sets ai_proxied=true when provider starts with metabase/"
    (let [user-id (mt/user->id :rasta)
          usage   {"anthropic/claude-haiku-4-5" {:prompt 50 :completion 10}}]
      (mt/with-model-cleanup [:model/MetabotMessage :model/MetabotConversation]
        (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-haiku-4-5"]
          (mt/with-premium-features #{:metabase-ai-managed}
            (#'suggested-prompts/record-usage! user-id usage)
            (let [conversation (t2/select-one :model/MetabotConversation :user_id user-id
                                              {:order-by [[:created_at :desc]]})
                  message      (t2/select-one :model/MetabotMessage
                                              :conversation_id (:id conversation))]
              (is (true? (:ai_proxied message))))))))))

(deftest record-usage-skips-empty-usage-test
  (testing "record-usage! does nothing when usage is empty"
    (let [user-id       (mt/user->id :rasta)
          count-before  (t2/count :model/MetabotConversation)]
      (#'suggested-prompts/record-usage! user-id {})
      (#'suggested-prompts/record-usage! user-id nil)
      (is (= count-before (t2/count :model/MetabotConversation))))))
