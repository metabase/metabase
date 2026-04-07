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

(defn- delete-conversations!
  [conversation-ids]
  (let [conversation-ids (vec conversation-ids)]
    (t2/delete! :model/MetabotMessage {:where [:in :conversation_id conversation-ids]})
    (t2/delete! :model/MetabotConversation {:where [:in :id conversation-ids]})))

(defn- offset-date-time
  [s]
  (java.time.OffsetDateTime/parse s))

(defn- find-conversation
  [conversations conversation-id]
  (some #(when (= (:conversation_id %) conversation-id) %) conversations))

(defn- with-list-conversations-fixture!
  [thunk]
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {test-user-id :id} {:email      "metabot-analytics-list-test@metabase.com"
                                                   :first_name "Metabot"
                                                   :last_name  "Analytics"}]
      (let [response-path (format "ee/metabot-analytics/conversations?user-id=%s" test-user-id)
            convo-1       (str (random-uuid))
            convo-2       (str (random-uuid))
            convo-3       (str (random-uuid))
            jan-1         (offset-date-time "2026-01-01T00:00:00Z")
            jan-2         (offset-date-time "2026-01-02T00:00:00Z")
            jan-3         (offset-date-time "2026-01-03T00:00:00Z")
            jan-4         (offset-date-time "2026-01-04T00:00:00Z")
            jan-5         (offset-date-time "2026-01-05T00:00:00Z")]
        (try
          (insert-conversation! {:conversation-id convo-1
                                 :user-id         test-user-id
                                 :created-at      jan-1
                                 :summary         "First conversation"
                                 :state           {:step "one"}})
          (insert-conversation! {:conversation-id convo-2
                                 :user-id         test-user-id
                                 :created-at      jan-2
                                 :summary         "Second conversation"})
          (insert-conversation! {:conversation-id convo-3
                                 :user-id         test-user-id
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
          (thunk {:test-user-id  test-user-id
                  :response-path response-path
                  :convo-1       convo-1
                  :convo-2       convo-2
                  :convo-3       convo-3})
          (finally
            (delete-conversations! [convo-1 convo-2 convo-3]))))))

  (deftest list-conversations-requires-superuser-test
    (mt/with-premium-features #{:audit-app}
      (testing "GET /api/ee/metabot-analytics/conversations requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/metabot-analytics/conversations"))))))

  (deftest list-conversations-aggregates-data-test
    (with-list-conversations-fixture!
      (fn [{:keys [test-user-id response-path convo-1 convo-2 convo-3]}]
        (let [response         (mt/user-http-request :crowberto :get 200 response-path)
              conversation-ids (map :conversation_id (:data response))
              convo-1-response (find-conversation (:data response) convo-1)
              convo-2-response (find-conversation (:data response) convo-2)
              convo-3-response (find-conversation (:data response) convo-3)]
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
                  :user_id                 test-user-id
                  :message_count           2
                  :user_message_count      1
                  :assistant_message_count 1
                  :total_tokens            10
                  :model                   "gpt-4.1-mini"
                  :user                    {:id         test-user-id
                                            :email      "metabot-analytics-list-test@metabase.com"
                                            :first_name "Metabot"
                                            :last_name  "Analytics"}}
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
                                                :assistant_message_count :total_tokens :model])))))))

  (deftest list-conversations-pagination-test
    (with-list-conversations-fixture!
      (fn [{:keys [response-path convo-2]}]
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "%s&limit=1&offset=1" response-path))]
          (is (= 3 (:total response)))
          (is (= 1 (:limit response)))
          (is (= 1 (:offset response)))
          (is (= [convo-2] (map :conversation_id (:data response))))))))

  (deftest list-conversations-sorting-test
    (with-list-conversations-fixture!
      (fn [{:keys [response-path convo-1 convo-2 convo-3]}]
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "%s&sort-by=message_count&sort-dir=asc" response-path))]
          (is (= [convo-3 convo-1 convo-2] (map :conversation_id (:data response))))))))

  (deftest list-conversations-invalid-sort-test
    (with-list-conversations-fixture!
      (fn [{:keys [response-path]}]
        (is (some? (:errors (mt/user-http-request :crowberto :get 400
                                                  (format "%s&sort-by=drop_table" response-path))))))))

  (deftest get-conversation-detail-test
    (mt/with-premium-features #{:audit-app}
      (testing "GET /api/ee/metabot-analytics/conversations/:id"
        (let [conversation-id (str (random-uuid))
              user-id         (mt/user->id :crowberto)
              jan-1           (offset-date-time "2026-01-01T00:00:00Z")
              jan-2           (offset-date-time "2026-01-02T00:00:00Z")]
          (try
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
              (is (= 2 (count (:chat_messages response)))))
            (finally
              (delete-conversations! [conversation-id]))))))))
(deftest get-conversation-detail-queries-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations/:id returns generated queries"
      (let [conversation-id (str (random-uuid))
            user-id         (mt/user->id :crowberto)
            jan-1           (offset-date-time "2026-01-01T00:00:00Z")
            jan-2           (offset-date-time "2026-01-02T00:00:00Z")
            jan-3           (offset-date-time "2026-01-03T00:00:00Z")
            sql             "SELECT * FROM orders"]
        (try
          (insert-conversation! {:conversation-id conversation-id
                                 :user-id         user-id
                                 :created-at      jan-1
                                 :summary         "Conversation with queries"})
          ;; user prompt
          (insert-message! {:conversation-id conversation-id
                            :created-at      jan-1
                            :role            "user"
                            :profile-id      "ignored-user-model"
                            :total-tokens    3
                            :data            [{:role "user" :content "show me orders"}]})
          ;; successful create_sql_query — should appear in :queries
          (insert-message! {:conversation-id conversation-id
                            :created-at      jan-2
                            :role            "assistant"
                            :profile-id      "gpt-5"
                            :total-tokens    20
                            :data            [{:type "text" :text "Sure, here it is."}
                                              {:type     "tool-input"
                                               :id       "call-success"
                                               :function "create_sql_query"
                                               :arguments {:database_id (mt/id) :sql_query sql}}
                                              {:type   "tool-output"
                                               :id     "call-success"
                                               :result {:output "<result>...</result>"
                                                        :structured-output {:query-id      "qid-success"
                                                                            :query-content sql
                                                                            :query         {:database (mt/id)
                                                                                            :type     :native
                                                                                            :native   {:query sql}}
                                                                            :database      (mt/id)}}}]})
          ;; failed create_sql_query (only :output, no :structured-output) — should NOT appear in :queries
          (insert-message! {:conversation-id conversation-id
                            :created-at      jan-3
                            :role            "assistant"
                            :profile-id      "gpt-5"
                            :total-tokens    10
                            :data            [{:type     "tool-input"
                                               :id       "call-failed"
                                               :function "create_sql_query"
                                               :arguments {:database_id (mt/id) :sql_query "SELEKT bad"}}
                                              {:type   "tool-output"
                                               :id     "call-failed"
                                               :result {:output "<result>SQL query construction failed.</result>"}}]})

          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-analytics/conversations/%s" conversation-id))
                queries  (:queries response)]
            (is (= 1 (count queries))
                "errored tool call should be filtered out")
            (let [q (first queries)]
              (is (= "create_sql_query" (:tool q)))
              (is (= "sql"               (:query_type q)))
              (is (= "qid-success"       (:query_id q)))
              (is (= sql                 (:sql q)))
              (is (nil?                  (:mbql q)))
              (is (= (mt/id)             (:database_id q)))
              ;; Tables extraction goes through the real Macaw path — sample data has an "orders" table.
              (is (contains? (set (:tables q)) "orders"))))
          (finally
            (delete-conversations! [conversation-id])))))))
