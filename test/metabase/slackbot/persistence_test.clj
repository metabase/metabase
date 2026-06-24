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
      ;; Assistant message with a resolved tool call
      (t2/insert! :model/MetabotMessage
                  {:conversation_id conv-id
                   :slack_msg_id    "1709567890.000002"
                   :role            "assistant"
                   :profile_id      "test"
                   :total_tokens    10
                   :data            [{:type "text" :text "hi"}
                                     {:type "tool-search" :toolCallId "x" :state "output-available"
                                      :input {} :output {:output "y"}}]
                   :data_version    2})
      (testing "only tool parts are included, text is filtered out"
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
                       :data               [{:type "tool-search" :toolCallId "y" :state "output-available"
                                             :input {} :output {:output "z"}}]
                       :data_version       2
                       :deleted_at         (java.time.OffsetDateTime/now)
                       :deleted_by_user_id (mt/user->id :rasta)})
          (is (empty? (slackbot.persistence/message-history conv-id #{deleted-ts})))
          (is (= #{deleted-ts}
                 (slackbot.persistence/deleted-message-ids conv-id #{deleted-ts}))))))))

(deftest message-history-v2-parts-test
  (testing "stored v2 tool parts are translated to AI-SDK message pairs"
    (let [conv-id    (str (random-uuid))
          slack-ts   "1712000000.000001"
          search-id  "call-search"
          query-id   "call-query"
          orphan-id  "call-orphan"
          failed-id  "call-failed"]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :role            "assistant"
                     :profile_id      "slackbot"
                     :total_tokens    10
                     :data            [{:type "text" :text "Let me check."}
                                       {:type         "tool-search"
                                        :toolCallId   search-id
                                        :state        "output-available"
                                        :input        {:query "orders"}
                                        :output       {:output            "<result>orders</result>"
                                                       :structured_output {:query-id "qid-1"}}}
                                       {:type         "tool-construct_notebook_query"
                                        :toolCallId   query-id
                                        :state        "output-available"
                                        :input        {:data_source_ids ["table-1"]}
                                        :output       {:output "<result>query</result>"}}
                                       {:type         "tool-search"
                                        :toolCallId   orphan-id
                                        :state        "input-available"
                                        :input        {:query "never finished"}}
                                       {:type         "tool-search"
                                        :toolCallId   failed-id
                                        :state        "output-error"
                                        :input        {:query "boom"}
                                        :errorText    "it broke"}]
                     :data_version    2})
        (let [result (slackbot.persistence/message-history conv-id #{slack-ts})
              msgs   (get result slack-ts)]
          (testing "text parts and unresolved tool parts are skipped"
            (is (= 6 (count msgs))))
          (testing "tool part → assistant message with :tool_calls, input JSON-encoded"
            (is (= {:role       :assistant
                    :tool_calls [{:id        search-id
                                  :name      "search"
                                  :arguments "{\"query\":\"orders\"}"}]}
                   (first msgs))))
          (testing "tool part → tool message with :content from the inner output"
            (is (= {:role         :tool
                    :tool_call_id search-id
                    :content      "<result>orders</result>"}
                   (second msgs))))
          (testing "errored tool part replays its error text"
            (is (= {:role         :tool
                    :tool_call_id failed-id
                    :content      "it broke"}
                   (last msgs))))
          (testing "order is preserved — call/result pairs stay adjacent"
            (is (= [search-id search-id query-id query-id failed-id failed-id]
                   (mapv #(or (:tool_call_id %)
                              (-> % :tool_calls first :id))
                         msgs)))))))))

(deftest message-history-degenerate-parts-test
  (testing "nil input and outputs without an inner :output string replay safely"
    (let [conv-id  (str (random-uuid))
          slack-ts "1712000000.000002"
          call-id  "call-degenerate"]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :role            "assistant"
                     :profile_id      "slackbot"
                     :total_tokens    10
                     :data            [{:type       "tool-search"
                                        :toolCallId call-id
                                        :state      "output-available"
                                        :input      nil
                                        :output     {}}]
                     :data_version    2})
        (let [msgs (get (slackbot.persistence/message-history conv-id #{slack-ts}) slack-ts)]
          (testing "nil input encodes as an empty JSON object, not \"null\""
            (is (= "{}" (-> msgs first :tool_calls first :arguments))))
          (testing "a successful call with no LLM-facing output replays as empty content, not a failure"
            (is (= {:role         :tool
                    :tool_call_id call-id
                    :content      ""}
                   (second msgs)))))))))

(deftest message-history-flat-string-output-test
  (testing "a tool part whose :output is a bare string (not a map) replays that string as the tool content"
    (let [conv-id  (str (random-uuid))
          slack-ts "1712000000.000003"
          call-id  "call-flat"]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :role            "assistant"
                     :profile_id      "slackbot"
                     :total_tokens    3
                     :data            [{:type       "tool-search"
                                        :toolCallId call-id
                                        :state      "output-available"
                                        :input      {:q "x"}
                                        :output     "just a string"}]
                     :data_version    2})
        (let [msgs (get (slackbot.persistence/message-history conv-id #{slack-ts}) slack-ts)]
          (is (= {:role         :tool
                  :tool_call_id call-id
                  :content      "just a string"}
                 (second msgs))))))))

(deftest message-history-migrates-v1-rows-test
  (testing "data_version 1 rows are upgraded on read and replay through the v2 history reader"
    (let [conv-id  (str (random-uuid))
          slack-ts "1712000000.000002"]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :role            "assistant"
                     :profile_id      "slackbot"
                     :total_tokens    5
                     :data            [{:_type      "TOOL_CALL"
                                        :role       "assistant"
                                        :tool_calls [{:id "legacy-1" :name "search" :arguments "{}"}]}
                                       {:_type        "TOOL_RESULT"
                                        :role         "tool"
                                        :tool_call_id "legacy-1"
                                        :content      "legacy output"}]
                     :data_version    1})
        (let [msgs (get (slackbot.persistence/message-history conv-id #{slack-ts}) slack-ts)]
          (is (= [{:role       :assistant
                   :tool_calls [{:id "legacy-1" :name "search" :arguments "{}"}]}
                  {:role         :tool
                   :tool_call_id "legacy-1"
                   :content      "legacy output"}]
                 msgs)))))))

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
