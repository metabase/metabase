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
                   :data            [{:_type "TEXT" :role "user" :content "what is 2+2?"}]})
      ;; Assistant message with tool calls
      (t2/insert! :model/MetabotMessage
                  {:conversation_id conv-id
                   :slack_msg_id    "1709567890.000002"
                   :role            "assistant"
                   :profile_id      "test"
                   :total_tokens    10
                   :data            [{:_type "TEXT" :role "assistant" :content "hi"}
                                     {:_type "TOOL_CALL" :role "assistant" :tool_calls [{:id "x"}]}
                                     {:_type "TOOL_RESULT" :role "tool" :tool_call_id "x" :content "y"}]})

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
                       :data               [{:_type "TOOL_CALL" :role "assistant" :tool_calls [{:id "y"}]}]
                       :deleted_at         (java.time.OffsetDateTime/now)
                       :deleted_by_user_id (mt/user->id :rasta)})
          (is (empty? (slackbot.persistence/message-history conv-id #{deleted-ts})))
          (is (= #{deleted-ts}
                 (slackbot.persistence/deleted-message-ids conv-id #{deleted-ts}))))))))

(deftest message-history-native-shape-test
  (testing "assistant messages persisted in native-parts shape are translated to AI-SDK messages"
    (let [conv-id    (str (random-uuid))
          slack-ts   "1712000000.000001"
          search-id  "call-search"
          query-id   "call-query"]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :slack_msg_id    slack-ts
                     :role            "assistant"
                     :profile_id      "slackbot"
                     :total_tokens    10
                     :data            [{:type :text :text "Let me check."}
                                       {:type      :tool-input
                                        :id        search-id
                                        :function  "search"
                                        :arguments {:query "orders"}}
                                       {:type   :tool-output
                                        :id     search-id
                                        :result {:output            "<result>orders</result>"
                                                 :structured-output {:query-id "qid-1"}}}
                                       {:type      :tool-input
                                        :id        query-id
                                        :function  "construct_notebook_query"
                                        :arguments {:data_source_ids ["table-1"]}}
                                       {:type   :tool-output
                                        :id     query-id
                                        :result {:output "<result>query</result>"}}]})
        (let [result (slackbot.persistence/message-history conv-id #{slack-ts})
              msgs   (get result slack-ts)]
          (testing "text blocks are skipped — only tool blocks surface"
            (is (= 4 (count msgs))))
          (testing "tool-input → assistant message with :tool_calls"
            (is (= {:role       :assistant
                    :tool_calls [{:id        search-id
                                  :name      "search"
                                  :arguments {:query "orders"}}]}
                   (first msgs))))
          (testing "tool-output → tool message with :content and :tool_call_id"
            (is (= {:role         :tool
                    :tool_call_id search-id
                    :content      "<result>orders</result>"}
                   (second msgs))))
          (testing "order is preserved — matching tool-call/tool-result pairs stay adjacent"
            (is (= [search-id search-id query-id query-id]
                   (mapv #(or (:tool_call_id %)
                              (-> % :tool_calls first :id))
                         msgs)))
            (is (= ["search" "construct_notebook_query"]
                   (->> msgs
                        (filter #(= :assistant (:role %)))
                        (map #(-> % :tool_calls first :name)))))))))))

(deftest message-history-mixed-shape-test
  (testing "a single message row with both legacy and native blocks round-trips both shapes in order"
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
                                        :content      "legacy output"}
                                       {:type      :tool-input
                                        :id        "native-1"
                                        :function  "construct_notebook_query"
                                        :arguments {:data_source_ids ["t1"]}}
                                       {:type   :tool-output
                                        :id     "native-1"
                                        :result {:output "native output"}}]})
        (let [msgs (get (slackbot.persistence/message-history conv-id #{slack-ts}) slack-ts)]
          (is (= 4 (count msgs)))
          (testing "legacy blocks still normalize correctly"
            (is (= :assistant (:role (nth msgs 0))))
            (is (= "legacy-1" (-> (nth msgs 0) :tool_calls first :id)))
            (is (= {:role :tool :tool_call_id "legacy-1" :content "legacy output"}
                   (nth msgs 1))))
          (testing "native blocks translate alongside legacy blocks"
            (is (= "native-1" (-> (nth msgs 2) :tool_calls first :id)))
            (is (= {:role :tool :tool_call_id "native-1" :content "native output"}
                   (nth msgs 3)))))))))

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
                     :data            []})
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
                     :data            []})
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
                         :data            []})
            (is (= requester-id  (slackbot.persistence/response-owner-user-id channel-id slack-ts)))
            (is (= later-user-id (slackbot.persistence/response-owner-user-id channel-id second-slack-ts)))))))))
