(ns metabase-enterprise.metabot-analytics.v-metabot-messages-test
  "Tests for the `v_metabot_messages` SQL view."
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- query-view
  "Query v_metabot_messages, returning only rows for the given conversation IDs."
  [conversation-ids]
  (t2/query {:select   [:*]
             :from     [:v_metabot_messages]
             :where    [:in :conversation_id conversation-ids]
             :order-by [[:created_at :asc] [:message_id :asc]]}))

(defn- find-row [rows message-id]
  (some #(when (= (:message_id %) message-id) %) rows))

(deftest columns-and-passthrough-test
  (testing "view exposes the expected columns and passes through profile_id, role, total_tokens, slack metadata"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/MetabotMessage {msg-id :id} {:conversation_id convo-id
                                                         :role            "assistant"
                                                         :profile_id      "nlq"
                                                         :total_tokens    42
                                                         :slack_msg_id    "1700000000.000099"
                                                         :channel_id      "C-VIEW"
                                                         :data            []}]
        (let [row (find-row (query-view [convo-id]) msg-id)]
          (is (=? {:message_id      msg-id
                   :conversation_id convo-id
                   :role            "assistant"
                   :profile_id      "nlq"
                   :total_tokens    42
                   :user_id         user-id
                   :slack_msg_id    "1700000000.000099"
                   :channel_id      "C-VIEW"}
                  row))
          (is (some? (:created_at row))))))))

(deftest deleted-messages-excluded-test
  (testing "soft-deleted messages (deleted_at IS NOT NULL) are filtered out of the view"
    (let [convo-id (str (random-uuid))
          now      (java.time.OffsetDateTime/now)]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/MetabotMessage {kept-id    :id} {:conversation_id convo-id
                                                             :role "user"
                                                             :profile_id "nlq"
                                                             :total_tokens 0
                                                             :data []}
                     :model/MetabotMessage {deleted-id :id} {:conversation_id convo-id
                                                             :role "assistant"
                                                             :profile_id "nlq"
                                                             :total_tokens 0
                                                             :data []
                                                             :deleted_at now}]
        (let [rows (query-view [convo-id])]
          (is (= 1 (count rows)))
          (is (some? (find-row rows kept-id)))
          (is (nil?  (find-row rows deleted-id))))))))

(deftest user-id-coalesces-to-conversation-owner-test
  (testing "user_id falls back to metabot_conversation.user_id when metabot_message.user_id is null"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {originator-id :id} {}
                     :model/User {participant-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id originator-id}
                     ;; legacy row — message has no :user_id stamped
                     :model/MetabotMessage {legacy-id :id} {:conversation_id convo-id
                                                            :role "user"
                                                            :profile_id "nlq"
                                                            :total_tokens 0
                                                            :data []}
                     ;; new-style row — message author is stamped
                     :model/MetabotMessage {stamped-id :id} {:conversation_id convo-id
                                                             :role "user"
                                                             :user_id participant-id
                                                             :profile_id "nlq"
                                                             :total_tokens 0
                                                             :data []}]
        (let [rows (query-view [convo-id])]
          (testing "legacy row: user_id falls back to conversation originator"
            (is (= originator-id (:user_id (find-row rows legacy-id)))))
          (testing "stamped row: user_id is the message author, not the originator"
            (is (= participant-id (:user_id (find-row rows stamped-id))))))))))

(deftest excludes-rows-from-other-conversations-test
  (testing "the JOIN to metabot_conversation does not duplicate rows or leak across conversations"
    (let [convo-1 (str (random-uuid))
          convo-2 (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-1 :user_id user-id}
                     :model/MetabotConversation _ {:id convo-2 :user_id user-id}
                     :model/MetabotMessage {m1 :id} {:conversation_id convo-1
                                                     :role "user"
                                                     :profile_id "nlq"
                                                     :total_tokens 0
                                                     :data []}
                     :model/MetabotMessage {m2 :id} {:conversation_id convo-1
                                                     :role "assistant"
                                                     :profile_id "nlq"
                                                     :total_tokens 0
                                                     :data []}
                     :model/MetabotMessage {m3 :id} {:conversation_id convo-2
                                                     :role "user"
                                                     :profile_id "internal"
                                                     :total_tokens 0
                                                     :data []}]
        (let [rows-1 (query-view [convo-1])
              rows-2 (query-view [convo-2])]
          (is (= #{m1 m2} (into #{} (map :message_id) rows-1)))
          (is (= #{m3}    (into #{} (map :message_id) rows-2))))))))

(deftest passes-through-conversation-not-message-created-at-test
  (testing "created_at is the message's own timestamp, not the conversation's"
    (let [convo-id (str (random-uuid))
          msg-time (java.time.OffsetDateTime/parse "2026-02-15T10:30:00Z")]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/MetabotMessage {msg-id :id} {:conversation_id convo-id
                                                         :role "user"
                                                         :profile_id "nlq"
                                                         :total_tokens 0
                                                         :data []
                                                         :created_at msg-time}]
        (let [row (find-row (query-view [convo-id]) msg-id)]
          (is (= (t/instant msg-time) (t/instant (:created_at row)))))))))
