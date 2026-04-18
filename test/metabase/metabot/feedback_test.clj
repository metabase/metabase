(ns metabase.metabot.feedback-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- payload
  [{:keys [message-id positive issue-type freeform conversations]
    :or   {positive   true
           freeform   "looks good"
           issue-type nil}}]
  {:metabot_id        1
   :feedback          {:positive          positive
                       :message_id        message-id
                       :issue_type        issue-type
                       :freeform_feedback freeform}
   :conversation_data {:conversations conversations}})

(deftest persist-feedback-inserts-row-keyed-by-message-id-test
  (testing "persist-feedback! upserts a metabot_feedback row keyed by the latest assistant message id"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (first (t2/insert-returning-pks!
                               :model/MetabotMessage
                               {:conversation_id conversation-id
                                :role            "assistant"
                                :profile_id      "gpt-x"
                                :total_tokens    5
                                :data            [{:type "text" :text "hi"}]}))]
            (mt/with-current-user user-id
              (let [returned (metabot.feedback/persist-feedback!
                              (payload {:message-id    "msg_abc"
                                        :positive      false
                                        :issue-type    "not-factual"
                                        :freeform      "bad answer"
                                        :conversations {"omnibot" {:conversationId conversation-id
                                                                   :messages       [{:id "msg_abc"}]}}}))
                    row      (t2/select-one :model/MetabotFeedback :message_id msg-id)]
                (is (= msg-id returned))
                (is (= msg-id (:message_id row)))
                (is (false? (:positive row)))
                (is (= "not-factual" (:issue_type row)))
                (is (= "bad answer" (:freeform_feedback row)))
                (is (= user-id (:user_id row))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-updates-existing-row-test
  (testing "persist-feedback! updates the existing row for the same message and bumps updated_at"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (first (t2/insert-returning-pks!
                               :model/MetabotMessage
                               {:conversation_id conversation-id
                                :role            "assistant"
                                :profile_id      "gpt-x"
                                :total_tokens    5
                                :data            [{:type "text" :text "hi"}]}))]
            (mt/with-current-user user-id
              (metabot.feedback/persist-feedback!
               (payload {:message-id    "msg_a"
                         :positive      true
                         :freeform      "good"
                         :conversations {"omnibot" {:conversationId conversation-id :messages []}}}))
              (let [first-row (t2/select-one :model/MetabotFeedback :message_id msg-id)]
                ;; clock resolution: ensure the second write lands on a later instant
                (Thread/sleep 50)
                (metabot.feedback/persist-feedback!
                 (payload {:message-id    "msg_a"
                           :positive      false
                           :issue-type    "ui-bug"
                           :freeform      "actually it's broken"
                           :conversations {"omnibot" {:conversationId conversation-id :messages []}}}))
                (let [updated-row (t2/select-one :model/MetabotFeedback :message_id msg-id)]
                  (is (= 1 (t2/count :model/MetabotFeedback :message_id msg-id))
                      "still only one row per message")
                  (is (false? (:positive updated-row)))
                  (is (= "ui-bug" (:issue_type updated-row)))
                  (is (= "actually it's broken" (:freeform_feedback updated-row)))
                  (is (not= (:updated_at first-row) (:updated_at updated-row))
                      "updated_at gets bumped on edit")))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-no-assistant-message-no-op-test
  (testing "persist-feedback! returns nil and writes nothing when no assistant message can be resolved"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (mt/with-current-user user-id
            (is (nil? (metabot.feedback/persist-feedback!
                       (payload {:message-id    "msg_x"
                                 :conversations {"omnibot" {:conversationId conversation-id
                                                            :messages       []}}})))))
          (finally
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-no-positive-no-op-test
  (testing "persist-feedback! returns nil when `positive` is missing"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-current-user user-id
        (is (nil? (metabot.feedback/persist-feedback!
                   {:feedback {:message_id "msg_y"}})))))))
