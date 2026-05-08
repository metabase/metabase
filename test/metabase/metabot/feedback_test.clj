(ns metabase.metabot.feedback-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- source-payload
  [{:keys [message-id source-id source-type positive]
    :or   {source-id   1
           source-type "table"
           positive    true}}]
  {:message_id  message-id
   :source_id   source-id
   :source_type source-type
   :positive    positive})

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

(deftest persist-source-feedback-test
  (testing "persist-source-feedback! records source id and type for the rated message"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user user-id
              (let [returned (metabot.feedback/persist-source-feedback!
                              (source-payload {:message-id  external-id
                                               :source-id   42
                                               :source-type "card"
                                               :positive    false}))
                    row      (t2/select-one :model/MetabotSourceFeedback
                                            :message_id  msg-id
                                            :user_id     user-id
                                            :source_id   42
                                            :source_type "card")]
                (is (= msg-id (:id returned)))
                (is (= conversation-id (:conversation_id returned)))
                (is (some? row))
                (is (false? (:positive row))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-source-feedback-rejects-invalid-source-type-test
  (testing "persist-source-feedback! rejects unsupported source types"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user user-id
              (is (thrown-with-msg? ExceptionInfo
                                    #"Invalid value"
                                    (metabot.feedback/persist-source-feedback!
                                     (source-payload {:message-id  external-id
                                                      :source-id   42
                                                      :source-type "dashboard"}))))
              (is (zero? (t2/count :model/MetabotSourceFeedback :message_id msg-id)))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(deftest persist-source-feedback-updates-existing-row-test
  (testing "persist-source-feedback! updates the existing row for the same message, submitter, and source"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [conversation-id (str (random-uuid))
            external-id     (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
          (let [msg-id (insert-message! conversation-id external-id)]
            (mt/with-current-user user-id
              (metabot.feedback/persist-source-feedback!
               (source-payload {:message-id  external-id
                                :source-id   7
                                :source-type "model"
                                :positive    true}))
              (let [first-row   (t2/select-one :model/MetabotSourceFeedback :message_id msg-id)
                    updated-row (tu/poll-until
                                 2000
                                 (do
                                   (metabot.feedback/persist-source-feedback!
                                    (source-payload {:message-id  external-id
                                                     :source-id   7
                                                     :source-type "model"
                                                     :positive    false}))
                                   (let [updated-row (t2/select-one :model/MetabotSourceFeedback :message_id msg-id)]
                                     (when (not= (:updated_at first-row) (:updated_at updated-row))
                                       updated-row))))]
                (is (= 1 (t2/count :model/MetabotSourceFeedback :message_id msg-id)))
                (is (false? (:positive updated-row)))
                (is (not= (:updated_at first-row) (:updated_at updated-row))))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))
