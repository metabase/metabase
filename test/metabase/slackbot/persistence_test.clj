(ns metabase.slackbot.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.slackbot.persistence :as slackbot.persistence]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(deftest message-history-test
  (let [conv-id (str (random-uuid))]
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
      ;; User message - should be excluded (query filters by role=assistant)
      (t2/insert! :model/MetabotMessage
                  {:conversation_id conv-id
                   :slack_msg_id    "1709567890.000001"
                   :role            "user"
                   :profile_id      "test"
                   :total_tokens    0
                   :data            [{:type "text" :text "what is 2+2?"}]
                   :data_version    2})
      ;; Assistant message with tool calls
      (t2/insert! :model/MetabotMessage
                  {:conversation_id conv-id
                   :slack_msg_id    "1709567890.000002"
                   :role            "assistant"
                   :profile_id      "test"
                   :total_tokens    10
                   :data            [{:type "text" :text "hi"}
                                     {:type       "tool-search"
                                      :toolCallId "x"
                                      :toolName   "search"
                                      :state      "output-available"
                                      :input      {}
                                      :output     "y"}]
                   :data_version    2})

      (testing "only TOOL_CALL and TOOL_RESULT are included, TEXT is filtered out"
        (let [result (slackbot.persistence/message-history conv-id #{"1709567890.000002"})]
          (is (= 2 (count (get result "1709567890.000002"))))
          (is (every? #(#{:assistant :tool} (:role %)) (get result "1709567890.000002")))))

      (testing "user messages are excluded, only assistant role is queried"
        (let [result (slackbot.persistence/message-history conv-id #{"1709567890.000001"})]
          (is (empty? result))))

      (testing "non-matching slack_msg_ids return empty map"
        (let [result (slackbot.persistence/message-history conv-id #{"nonexistent-id"})]
          (is (empty? result))))

      (testing "soft-deleted messages are excluded from message-history but included in deleted-message-ids"
        (let [deleted-ts "1709567890.000003"]
          (t2/insert! :model/MetabotMessage
                      {:conversation_id    conv-id
                       :slack_msg_id       deleted-ts
                       :role               "assistant"
                       :profile_id         "test"
                       :total_tokens       10
                       :data               [{:type       "tool-search"
                                             :toolCallId "y"
                                             :toolName   "search"
                                             :state      "output-available"
                                             :input      {}
                                             :output     "result"}]
                       :data_version       2
                       :deleted_at         (java.time.OffsetDateTime/now)
                       :deleted_by_user_id (mt/user->id :rasta)})
          (is (empty? (slackbot.persistence/message-history conv-id #{deleted-ts})))
          (is (= #{deleted-ts}
                 (slackbot.persistence/deleted-message-ids conv-id #{deleted-ts})))))

      (testing "v1-external-ai-service rows (data_version=1, ai-service shape) migrate transparently through message-history"
        (let [v1-external-ai-service-ts "1709567890.v1a001"]
          (t2/insert! :model/MetabotMessage
                      {:conversation_id conv-id
                       :slack_msg_id    v1-external-ai-service-ts
                       :role            "assistant"
                       :profile_id      "test"
                       :total_tokens    10
                       :data            [{:role "assistant" :_type "TEXT" :content "ok"}
                                         {:role "assistant" :_type "TOOL_CALL"
                                          :tool_calls [{:id "tc1" :name "search"
                                                        :arguments "{\"q\":\"test\"}"}]}
                                         {:role "tool" :_type "TOOL_RESULT"
                                          :tool_call_id "tc1" :content "result"}]
                       :data_version    1})
          (let [parts (get (slackbot.persistence/message-history conv-id #{v1-external-ai-service-ts}) v1-external-ai-service-ts)]
            (is (= 2 (count parts)))
            (is (= :assistant (:role (first parts))))
            (is (= "search" (-> parts first :tool_calls first :name)))
            (is (= :tool (:role (second parts))))
            (is (= "result" (:content (second parts))))))))))

(deftest message-history-error-state-test
  (let [conv-id (str (random-uuid))]
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
      (doseq [{:keys [label errorText expected-content]}
              [{:label            "string errorText passes through"
                :errorText        "plain string error"
                :expected-content "plain string error"}
               {:label            "missing errorText falls back to sentinel"
                :errorText        nil
                :expected-content "Tool execution failed"}]]
        (testing label
          (let [ts (str "1709567890." (random-uuid))]
            (t2/insert! :model/MetabotMessage
                        {:conversation_id conv-id
                         :slack_msg_id    ts
                         :role            "assistant"
                         :profile_id      "test"
                         :total_tokens    10
                         :data            [(cond-> {:type       "tool-search"
                                                    :toolCallId "err"
                                                    :toolName   "search"
                                                    :state      "output-error"
                                                    :input      {}}
                                             (some? errorText) (assoc :errorText errorText))]
                         :data_version    2})
            (let [parts (get (slackbot.persistence/message-history conv-id #{ts}) ts)]
              (is (= 2 (count parts)))
              (is (= :assistant (:role (first parts))))
              (is (= :tool (:role (second parts))))
              (is (= expected-content (:content (second parts)))))))))))

(def ^:private input-available-tool-block
  {:type       "tool-search"
   :toolCallId "ia1"
   :toolName   "search"
   :state      "input-available"
   :input      {}})

(deftest message-history-input-available-test
  (let [conv-id (str (random-uuid))]
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})

      (testing "input-available blocks are filtered out entirely"
        (let [ts "1709567890.ia001"]
          (t2/insert! :model/MetabotMessage
                      {:conversation_id conv-id
                       :slack_msg_id    ts
                       :role            "assistant"
                       :profile_id      "test"
                       :total_tokens    10
                       :data            [input-available-tool-block]
                       :data_version    2})
          (is (empty? (slackbot.persistence/message-history conv-id #{ts})))))

      (testing "input-available blocks are excluded but output-available blocks are kept"
        (let [ts "1709567890.ia002"]
          (t2/insert! :model/MetabotMessage
                      {:conversation_id conv-id
                       :slack_msg_id    ts
                       :role            "assistant"
                       :profile_id      "test"
                       :total_tokens    10
                       :data            [input-available-tool-block
                                         {:type       "tool-search"
                                          :toolCallId "mix2"
                                          :toolName   "search"
                                          :state      "output-available"
                                          :input      {}
                                          :output     "found it"}]
                       :data_version    2})
          (let [parts (get (slackbot.persistence/message-history conv-id #{ts}) ts)]
            (is (= 2 (count parts)))
            (is (= "mix2" (-> parts first :tool_calls first :id)))
            (is (= "found it" (:content (second parts))))))))))

(deftest soft-delete-response-test
  (testing "soft-delete-response! marks the assistant response as deleted"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [channel-id "C123"
            slack-ts   "1709567890.111111"
            user-id    (mt/user->id :rasta)
            conv-id    (str (random-uuid))]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id user-id})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :channel_id      channel-id
                     :role            "assistant"
                     :profile_id      "test"
                     :total_tokens    5
                     :data            []
                     :data_version    2})
        (testing "returns true when a message is soft-deleted"
          (is (true? (slackbot.persistence/soft-delete-response! channel-id slack-ts user-id))))
        (let [msg (t2/select-one :model/MetabotMessage
                                 :channel_id   channel-id
                                 :slack_msg_id slack-ts
                                 :role         "assistant")]
          (testing "deleted_at is set"
            (is (some? (:deleted_at msg))))
          (testing "deleted_by_user_id is set"
            (is (= user-id (:deleted_by_user_id msg))))))))

  (testing "returns nil when required inputs are missing"
    (is (nil? (slackbot.persistence/soft-delete-response! nil "ts" 1)))
    (is (nil? (slackbot.persistence/soft-delete-response! "C123" nil 1)))
    (is (nil? (slackbot.persistence/soft-delete-response! "C123" "ts" nil)))))

(deftest response-owner-user-id-test
  (testing "response-owner-user-id returns the user who triggered the bot response"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [channel-id     "C-OWNER-TEST"
            slack-ts       "1709567890.222222"
            requester-id   (mt/user->id :rasta)
            later-user-id  (mt/user->id :crowberto)
            conv-id        (str (random-uuid))]
        ;; Simulate a later user having overwritten MetabotConversation.user_id
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id later-user-id})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :channel_id      channel-id
                     :role            "assistant"
                     :user_id         requester-id
                     :profile_id      "test"
                     :total_tokens    5
                     :data            []
                     :data_version    2})
        (testing "returns the requester, not the (potentially overwritten) conversation owner"
          (is (= requester-id (slackbot.persistence/response-owner-user-id channel-id slack-ts))))
        (testing "returns nil for an untracked message ts"
          (is (nil? (slackbot.persistence/response-owner-user-id channel-id "nonexistent-ts"))))
        (testing "returns nil when channel does not match"
          (is (nil? (slackbot.persistence/response-owner-user-id "C-WRONG" slack-ts))))

        (testing "two users in the same thread each own only their own bot response"
          (let [second-slack-ts "1709567890.333333"]
            (t2/insert! :model/MetabotMessage
                        {:conversation_id conv-id
                         :slack_msg_id    second-slack-ts
                         :channel_id      channel-id
                         :role            "assistant"
                         :user_id         later-user-id
                         :profile_id      "test"
                         :total_tokens    5
                         :data            []
                         :data_version    2})
            (is (= requester-id  (slackbot.persistence/response-owner-user-id channel-id slack-ts)))
            (is (= later-user-id (slackbot.persistence/response-owner-user-id channel-id second-slack-ts)))))))))
