(ns metabase-enterprise.metabot-analytics.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-conversation!
  [{:keys [conversation-id user-id created-at summary state]}]
  (t2/insert! :model/MetabotConversation
              (cond-> {:id      conversation-id
                       :user_id user-id}
                created-at (assoc :created_at created-at)
                summary (assoc :summary summary)
                state (assoc :state state))))

(defn- insert-message!
  [{:keys [conversation-id created-at role profile-id total-tokens data deleted-at]}]
  (t2/insert! :model/MetabotMessage
              (cond-> {:conversation_id conversation-id
                       :role            role
                       :profile_id      profile-id
                       :total_tokens    total-tokens
                       :data            data}
                created-at (assoc :created_at created-at)
                deleted-at (assoc :deleted_at deleted-at))))

(deftest list-conversations-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/metabot-analytics/conversations"))))
      (mt/with-model-cleanup [:model/MetabotMessage
                              [:model/MetabotConversation :created_at]]
        (let [crowberto-id      (mt/user->id :crowberto)
              rasta-id          (mt/user->id :rasta)
              convo-1           (str (random-uuid))
              convo-2           (str (random-uuid))
              convo-3           (str (random-uuid))
              jan-1             (java.time.OffsetDateTime/parse "2026-01-01T00:00:00Z")
              jan-2             (java.time.OffsetDateTime/parse "2026-01-02T00:00:00Z")
              jan-3             (java.time.OffsetDateTime/parse "2026-01-03T00:00:00Z")
              jan-4             (java.time.OffsetDateTime/parse "2026-01-04T00:00:00Z")
              jan-5             (java.time.OffsetDateTime/parse "2026-01-05T00:00:00Z")]
          (insert-conversation! {:conversation-id convo-1
                                 :user-id         crowberto-id
                                 :created-at      jan-1
                                 :summary         "First conversation"
                                 :state           {:step "one"}})
          (insert-conversation! {:conversation-id convo-2
                                 :user-id         rasta-id
                                 :created-at      jan-2
                                 :summary         "Second conversation"})
          (insert-conversation! {:conversation-id convo-3
                                 :user-id         crowberto-id
                                 :created-at      jan-3
                                 :summary         "Third conversation"})
          (insert-message! {:conversation-id convo-1
                            :created-at      jan-2
                            :role            "user"
                            :profile-id      "ignored-user-model"
                            :total-tokens    3
                            :data            [{:role "user" :content "hello"}]})
          (insert-message! {:conversation-id convo-1
                            :created-at      jan-3
                            :role            "assistant"
                            :profile-id      "gpt-4.1-mini"
                            :total-tokens    7
                            :data            [{:role "assistant" :content "hi"}]})
          (insert-message! {:conversation-id convo-2
                            :created-at      jan-4
                            :role            "user"
                            :profile-id      "ignored-user-model"
                            :total-tokens    2
                            :data            [{:role "user" :content "question"}]})
          (insert-message! {:conversation-id convo-2
                            :created-at      jan-5
                            :role            "assistant"
                            :profile-id      "gpt-5"
                            :total-tokens    11
                            :data            [{:role "assistant" :content "answer"}]})
          (insert-message! {:conversation-id convo-2
                            :created-at      jan-5
                            :role            "assistant"
                            :profile-id      "gpt-5"
                            :total-tokens    13
                            :data            [{:role "assistant" :content "follow-up"}]})
          (insert-message! {:conversation-id convo-3
                            :created-at      jan-4
                            :role            "assistant"
                            :profile-id      "deleted-model"
                            :total-tokens    99
                            :data            [{:role "assistant" :content "deleted"}]
                            :deleted-at      jan-5})

          (testing "returns aggregated conversation data"
            (let [response          (mt/user-http-request :crowberto :get 200 "ee/metabot-analytics/conversations")
                  conversation-ids  (map :conversation_id (:data response))
                  convo-1-response  (some #(when (= (:conversation_id %) convo-1) %) (:data response))
                  convo-2-response  (some #(when (= (:conversation_id %) convo-2) %) (:data response))
                  convo-3-response  (some #(when (= (:conversation_id %) convo-3) %) (:data response))]
              (is (= 3 (:total response)))
              (is (= 50 (:limit response)))
              (is (= 0 (:offset response)))
              (is (= [convo-3 convo-2 convo-1] conversation-ids))
              (is (nil? (:model convo-3-response)))
              (is (= 0 (:message_count convo-3-response)))
              (is (= 0 (:assistant_message_count convo-3-response)))
              (is (= 0 (:total_tokens convo-3-response)))
              (is (= {:conversation_id         convo-1
                      :summary                 "First conversation"
                      :user_id                 crowberto-id
                      :message_count           2
                      :user_message_count      1
                      :assistant_message_count 1
                      :total_tokens            10
                      :model                   "gpt-4.1-mini"
                      :user                    {:id         crowberto-id
                                                :email      "crowberto@metabase.com"
                                                :first_name "Crowberto"
                                                :last_name  "Corv"}}
                     (select-keys convo-1-response [:conversation_id :summary :user_id :message_count
                                                    :user_message_count :assistant_message_count :total_tokens
                                                    :model :user])))
              (is (= {:conversation_id         convo-2
                      :message_count           3
                      :user_message_count      1
                      :assistant_message_count 2
                      :total_tokens            26
                      :model                   "gpt-5"}
                     (select-keys convo-2-response [:conversation_id :message_count :user_message_count
                                                    :assistant_message_count :total_tokens :model])))))

          (testing "respects pagination parameters"
            (let [response (mt/user-http-request :crowberto :get 200
                                                 "ee/metabot-analytics/conversations?limit=1&offset=1")]
              (is (= 3 (:total response)))
              (is (= 1 (:limit response)))
              (is (= 1 (:offset response)))
              (is (= [convo-2] (map :conversation_id (:data response))))))

          (testing "supports whitelisted sorting"
            (let [response (mt/user-http-request :crowberto :get 200
                                                 "ee/metabot-analytics/conversations?sort-by=message_count&sort-dir=asc")]
              (is (= [convo-3 convo-1 convo-2] (map :conversation_id (:data response))))))

          (testing "rejects invalid sort-by values"
            (is (some? (:errors (mt/user-http-request :crowberto :get 400
                                                      "ee/metabot-analytics/conversations?sort-by=drop_table"))))))))))

(deftest get-conversation-detail-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations/:id"
      (mt/with-model-cleanup [:model/MetabotMessage
                              [:model/MetabotConversation :created_at]]
        (let [conversation-id (str (random-uuid))
              user-id         (mt/user->id :crowberto)
              jan-1           (java.time.OffsetDateTime/parse "2026-01-01T00:00:00Z")
              jan-2           (java.time.OffsetDateTime/parse "2026-01-02T00:00:00Z")]
          (insert-conversation! {:conversation-id conversation-id
                                 :user-id         user-id
                                 :created-at      jan-1
                                 :summary         "Conversation detail"
                                 :state           {:foo "bar"}})
          (insert-message! {:conversation-id conversation-id
                            :created-at      jan-1
                            :role            "user"
                            :profile-id      "ignored-user-model"
                            :total-tokens    4
                            :data            [{:role "user" :content "hello"}]})
          (insert-message! {:conversation-id conversation-id
                            :created-at      jan-2
                            :role            "assistant"
                            :profile-id      "gpt-5"
                            :total-tokens    8
                            :data            [{:type "text" :text "hi there"}]})

          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-analytics/conversations/%s" conversation-id))]
            (is (= conversation-id (:conversation_id response)))
            (is (= "Conversation detail" (:summary response)))
            (is (= {:id         user-id
                    :email      "crowberto@metabase.com"
                    :first_name "Crowberto"
                    :last_name  "Corv"}
                   (:user response)))
            (is (= ["user" "assistant"] (map :role (:messages response))))
            (is (= ["ignored-user-model" "gpt-5"] (map :model (:messages response))))
            (is (= 2 (count (:chat_messages response))))))))))
