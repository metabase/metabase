(ns metabase.metabot.feedback-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- payload
  [{:keys [message-id positive issue-type freeform]
    :or   {positive   true
           freeform   "looks good"
           issue-type nil}}]
  {:message_id        message-id
   :positive          positive
   :issue_type        issue-type
   :freeform_feedback freeform})

(defn- insert-message!
  [conversation-id external-id]
  (first (t2/insert-returning-pks!
          :model/MetabotMessage
          {:conversation_id conversation-id
           :role            "assistant"
           :profile_id      "gpt-x"
           :external_id     external-id
           :total_tokens    5
           :data            [{:type "text" :text "hi"}]})))

(deftest persist-feedback-resolves-by-external-id-test
  (testing "persist-feedback! looks up the rated message by metabot_message.external_id"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user user-id
              (let [returned (metabot.feedback/persist-feedback!
                              (payload {:message-id external-id
                                        :positive   false
                                        :issue-type "not-factual"
                                        :freeform   "bad answer"}))
                    row      (t2/select-one :model/MetabotFeedback :message_id msg-id)]
                (is (= msg-id (:id returned)))
                (is (= conversation-id (:conversation_id returned)))
                (is (= msg-id (:message_id row)))
                (is (false? (:positive row)))
                (is (= "not-factual" (:issue_type row)))
                (is (= "bad answer" (:freeform_feedback row))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-distinguishes-sibling-messages-test
  (testing "two feedback submissions against sibling messages in the same conversation land on distinct rows"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id-1   (str (random-uuid))
            external-id-2   (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id-1 (insert-message! conversation-id external-id-1)
                msg-id-2 (insert-message! conversation-id external-id-2)]
            (mt/with-current-user user-id
              (metabot.feedback/persist-feedback!
               (payload {:message-id external-id-1 :positive true  :freeform "first"}))
              (metabot.feedback/persist-feedback!
               (payload {:message-id external-id-2 :positive false :freeform "second"}))
              (let [row-1 (t2/select-one :model/MetabotFeedback :message_id msg-id-1)
                    row-2 (t2/select-one :model/MetabotFeedback :message_id msg-id-2)]
                (is (true?  (:positive row-1)))
                (is (= "first" (:freeform_feedback row-1)))
                (is (false? (:positive row-2)))
                (is (= "second" (:freeform_feedback row-2)))
                (is (= 2 (t2/count :model/MetabotFeedback :message_id [:in [msg-id-1 msg-id-2]]))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-updates-existing-row-test
  (testing "persist-feedback! updates the existing row for the same message and bumps updated_at"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user user-id
              (metabot.feedback/persist-feedback!
               (payload {:message-id external-id :positive true :freeform "good"}))
              (let [first-row (t2/select-one :model/MetabotFeedback :message_id msg-id)]
                ;; clock resolution: ensure the second write lands on a later instant
                (Thread/sleep 50)
                (metabot.feedback/persist-feedback!
                 (payload {:message-id external-id
                           :positive   false
                           :issue-type "ui-bug"
                           :freeform   "actually it's broken"}))
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

(deftest persist-feedback-unknown-external-id-no-op-test
  (testing "persist-feedback! returns nil and writes nothing when external_id does not resolve"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-current-user user-id
        (is (nil? (metabot.feedback/persist-feedback!
                   (payload {:message-id (str (random-uuid))}))))))))

(deftest persist-feedback-rejects-non-owner-test
  (testing "persist-feedback! refuses to write when the current user doesn't own the conversation"
    (mt/with-temp [:model/User {owner-id     :id} {}
                   :model/User {stranger-id  :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id owner-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user stranger-id
              (is (nil? (metabot.feedback/persist-feedback!
                         (payload {:message-id external-id :positive true}))))
              (is (nil? (t2/select-one :model/MetabotFeedback :message_id msg-id))
                  "no row written for a non-owner submission")))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-no-positive-no-op-test
  (testing "persist-feedback! returns nil when `positive` is missing"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-current-user user-id
        (is (nil? (metabot.feedback/persist-feedback!
                   {:message_id (str (random-uuid))})))))))
