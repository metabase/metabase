(ns metabase.metabot.feedback-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

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
  ([conversation-id external-id]
   (insert-message! conversation-id external-id "assistant" nil))
  ([conversation-id external-id role user-id]
   (first (t2/insert-returning-pks!
           :model/MetabotMessage
           (cond-> {:conversation_id conversation-id
                    :role            role
                    :profile_id      "gpt-x"
                    :external_id     external-id
                    :total_tokens    5
                    :data            [{:type "text" :text "hi"}]}
             user-id (assoc :user_id user-id))))))

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
                (is (= user-id (:user_id row)))
                (is (false? (:positive row)))
                (is (= "not-factual" (:issue_type row)))
                (is (= "bad answer" (:freeform_feedback row))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-writes-one-row-per-message-test
  (testing "each message in a conversation gets its own feedback row, keyed by message id"
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

(deftest persist-feedback-unknown-external-id-404-test
  (testing "persist-feedback! throws 404 when external_id does not resolve to a message"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-current-user user-id
        (is (thrown-with-msg? ExceptionInfo #"Not found"
                              (metabot.feedback/persist-feedback!
                               (payload {:message-id (str (random-uuid))}))))))))

(deftest persist-feedback-rejects-lurker-test
  (testing "persist-feedback! throws 404 and writes nothing when the current user is neither the originator nor a participant"
    (mt/with-temp [:model/User {owner-id     :id} {}
                   :model/User {stranger-id  :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id owner-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user stranger-id
              (is (thrown-with-msg? ExceptionInfo #"Not found"
                                    (metabot.feedback/persist-feedback!
                                     (payload {:message-id external-id :positive true}))))
              (is (nil? (t2/select-one :model/MetabotFeedback :message_id msg-id))
                  "no row written for a lurker submission")))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-allows-participant-non-originator-test
  (testing "persist-feedback! succeeds for a participant who is not the conversation originator, and the row carries the submitter's user_id"
    (mt/with-temp [:model/User {owner-id       :id} {}
                   :model/User {participant-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id owner-id})
          (insert-message! conversation-id (str (random-uuid)) "user" participant-id)
          (let [assistant-msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user participant-id
              (metabot.feedback/persist-feedback!
               (payload {:message-id external-id :positive true :freeform "helpful"}))
              (let [row (t2/select-one :model/MetabotFeedback
                                       :message_id assistant-msg-id
                                       :user_id    participant-id)]
                (is (some? row) "row is written under the participant's user_id")
                (is (true? (:positive row)))
                (is (= "helpful" (:freeform_feedback row))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-feedback-two-users-one-message-test
  (testing "two users in the same conversation can each submit feedback on the same assistant message, producing two rows with distinct user_ids"
    (mt/with-temp [:model/User {owner-id       :id} {}
                   :model/User {participant-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id owner-id})
          (insert-message! conversation-id (str (random-uuid)) "user" participant-id)
          (let [assistant-msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user owner-id
              (metabot.feedback/persist-feedback!
               (payload {:message-id external-id :positive true :freeform "great"})))
            (mt/with-current-user participant-id
              (metabot.feedback/persist-feedback!
               (payload {:message-id external-id :positive false :issue-type "ui-bug" :freeform "not for me"})))
            (let [rows (t2/select :model/MetabotFeedback :message_id assistant-msg-id
                                  {:order-by [[:user_id :asc]]})
                  by-user (into {} (map (juxt :user_id identity)) rows)]
              (is (= 2 (count rows)) "both submissions are persisted as distinct rows")
              (is (true?  (:positive (get by-user owner-id))))
              (is (= "great" (:freeform_feedback (get by-user owner-id))))
              (is (false? (:positive (get by-user participant-id))))
              (is (= "ui-bug" (:issue_type (get by-user participant-id))))
              (is (= "not for me" (:freeform_feedback (get by-user participant-id))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))
