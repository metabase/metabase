(ns metabase-enterprise.metabot-analytics.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.slackbot.api :as slackbot.api]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-conversation!
  [{:keys [conversation-id user-id created-at summary state slack-team-id slack-channel-id slack-thread-ts ip-address]}]
  (t2/insert! :model/MetabotConversation
              (cond-> {:id      conversation-id
                       :user_id user-id}
                created-at (assoc :created_at created-at)
                summary (assoc :summary summary)
                state (assoc :state state)
                slack-team-id (assoc :slack_team_id slack-team-id)
                slack-channel-id (assoc :slack_channel_id slack-channel-id)
                slack-thread-ts (assoc :slack_thread_ts slack-thread-ts)
                ip-address (assoc :ip_address ip-address))))

(defn- insert-message!
  [{:keys [conversation-id created-at role profile-id total-tokens data deleted-at]}]
  (first (t2/insert-returning-pks!
          :model/MetabotMessage
          (cond-> {:conversation_id conversation-id
                   :role            role
                   :profile_id      profile-id
                   :total_tokens    total-tokens
                   :data            data
                   :external_id     (str (random-uuid))}
            created-at (assoc :created_at created-at)
            deleted-at (assoc :deleted_at deleted-at)))))

(defn- delete-conversations!
  [conversation-ids]
  (let [conversation-ids (vec conversation-ids)]
    (t2/delete! :model/MetabotMessage {:where [:in :conversation_id conversation-ids]})
    (t2/delete! :model/MetabotConversation {:where [:in :id conversation-ids]})))

(defn- insert-feedback!
  [{:keys [message-id positive issue-type freeform created-at updated-at]}]
  (t2/insert! :model/MetabotFeedback
              (cond-> {:message_id        message-id
                       :positive          positive
                       :issue_type        issue-type
                       :freeform_feedback freeform}
                created-at (assoc :created_at created-at)
                updated-at (assoc :updated_at updated-at))))

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
                            :profile-id      "nlq"
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
                            :profile-id      "internal"
                            :total-tokens    11
                            :data            [{:role "assistant" :content "answer"}]})
          (insert-message! {:conversation-id convo-2
                            :created-at      jan-5
                            :role            "assistant"
                            :profile-id      "internal"
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
            (delete-conversations! [convo-1 convo-2 convo-3])))))))

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
        (is (nil? (:profile_id convo-3-response)))
        (is (= 0 (:message_count convo-3-response)))
        (is (= 0 (:assistant_message_count convo-3-response)))
        (is (= 0 (:total_tokens convo-3-response)))
        (is (= {:conversation_id         convo-1
                :summary                 "First conversation"
                :message_count           2
                :user_message_count      1
                :assistant_message_count 1
                :total_tokens            10
                :profile_id              "nlq"
                :user                    {:id         test-user-id
                                          :email      "metabot-analytics-list-test@metabase.com"
                                          :first_name "Metabot"
                                          :last_name  "Analytics"
                                          :tenant_id  nil}}
               (select-keys convo-1-response [:conversation_id :summary :message_count
                                              :user_message_count :assistant_message_count :total_tokens
                                              :profile_id :user])))
        (is (= {:conversation_id         convo-2
                :message_count           3
                :user_message_count      1
                :assistant_message_count 2
                :total_tokens            26
                :profile_id              "internal"}
               (select-keys convo-2-response [:conversation_id :message_count :user_message_count
                                              :assistant_message_count :total_tokens :profile_id])))))))

(deftest list-conversations-pagination-test
  (with-list-conversations-fixture!
    (fn [{:keys [response-path convo-2]}]
      (let [response (mt/user-http-request :crowberto :get 200
                                           (format "%s&limit=1&offset=1" response-path))]
        (is (= 3 (:total response)))
        (is (= 1 (:limit response)))
        (is (= 1 (:offset response)))
        (is (= [convo-2] (map :conversation_id (:data response)))))
      (testing "total still reflects the full count when paging past the end"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "%s&limit=10&offset=999" response-path))]
          (is (= 3 (:total response)))
          (is (= [] (:data response))))))))

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
                            :profile-id      "ignored-user-profile"
                            :total-tokens    4
                            :data            [{:role "user" :content "hello"}]})
          (insert-message! {:conversation-id conversation-id
                            :created-at      jan-2
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    8
                            :data            [{:type "text" :text "hi there"}]})

          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-analytics/conversations/%s" conversation-id))]
            (is (= conversation-id (:conversation_id response)))
            (is (= "Conversation detail" (:summary response)))
            (is (= {:id         user-id
                    :email      "crowberto@metabase.com"
                    :first_name "Crowberto"
                    :last_name  "Corv"
                    :tenant_id  nil}
                   (:user response)))
            (is (nil? (:slack_permalink response)))
            (is (= "internal" (:profile_id response))
                "profile_id comes from the first assistant message, ignoring user-message placeholders")
            (is (= 2 (count (:chat_messages response))))
            (is (= [] (:feedback response)))
            (let [{:keys [role type externalId]} (last (:chat_messages response))]
              (is (= ["agent" "text"] [role type]))
              (is (string? externalId))))
          (finally
            (delete-conversations! [conversation-id])))))))

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
                            :profile-id      "internal"
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
                            :profile-id      "internal"
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

(defn- search-input-block
  [call-id]
  {:type "tool-input" :id call-id :function "search" :arguments {:q "foo"}})

(defn- search-output-block
  [call-id]
  {:type "tool-output" :id call-id :result {:output "<result>...</result>"}})

(defn- with-search-count-fixture!
  "Seed conversations with varying numbers of search tool-input blocks so we
   can assert both list and detail `:search_count` behavior without perturbing
   the existing list fixture."
  [thunk]
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {test-user-id :id} {:email      "metabot-analytics-search-count@metabase.com"
                                                   :first_name "Search"
                                                   :last_name  "Counter"}]
      (let [convo-none    (str (random-uuid))
            convo-two     (str (random-uuid))
            convo-errored (str (random-uuid))
            jan-1         (offset-date-time "2026-02-01T00:00:00Z")
            jan-2         (offset-date-time "2026-02-02T00:00:00Z")
            jan-3         (offset-date-time "2026-02-03T00:00:00Z")]
        (try
          (insert-conversation! {:conversation-id convo-none
                                 :user-id         test-user-id
                                 :created-at      jan-1
                                 :summary         "no searches"})
          (insert-conversation! {:conversation-id convo-two
                                 :user-id         test-user-id
                                 :created-at      jan-2
                                 :summary         "two searches across two messages"})
          (insert-conversation! {:conversation-id convo-errored
                                 :user-id         test-user-id
                                 :created-at      jan-3
                                 :summary         "one errored search still counts"})
          ;; convo-none: only text, no search calls.
          (insert-message! {:conversation-id convo-none
                            :created-at      jan-1
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    5
                            :data            [{:type "text" :text "no tools here"}]})
          ;; convo-two: one search in msg 1, one search in msg 2 (plus an unrelated tool).
          (insert-message! {:conversation-id convo-two
                            :created-at      jan-2
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    10
                            :data            [(search-input-block "call-a")
                                              (search-output-block "call-a")]})
          (insert-message! {:conversation-id convo-two
                            :created-at      jan-2
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    10
                            :data            [{:type "tool-input" :id "call-x" :function "analyze_chart" :arguments {}}
                                              (search-input-block "call-b")
                                              (search-output-block "call-b")]})
          ;; convo-errored: a single search whose tool-output is marked errored — should still count.
          (insert-message! {:conversation-id convo-errored
                            :created-at      jan-3
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    4
                            :data            [(search-input-block "call-err")
                                              {:type "tool-output" :id "call-err" :error "boom"}]})
          (thunk {:test-user-id  test-user-id
                  :convo-none    convo-none
                  :convo-two     convo-two
                  :convo-errored convo-errored})
          (finally
            (delete-conversations! [convo-none convo-two convo-errored])))))))

(deftest search-count-test
  (with-search-count-fixture!
    (fn [{:keys [test-user-id convo-none convo-two convo-errored]}]
      (testing "list endpoint surfaces per-conversation search counts (errored calls still count)"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "ee/metabot-analytics/conversations?user-id=%s" test-user-id))
              by-id    (into {} (map (juxt :conversation_id identity)) (:data response))]
          (is (= {convo-none 0, convo-two 2, convo-errored 1}
                 (update-vals by-id :search_count)))))
      (testing "pagination scopes the hydration batch to the page"
        ;; Default sort is created_at desc: [convo-errored convo-two convo-none].
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "ee/metabot-analytics/conversations?user-id=%s&limit=1&offset=1"
                                                     test-user-id))]
          (is (= [convo-two] (map :conversation_id (:data response))))
          (is (= 2 (:search_count (first (:data response)))))))
      (testing "detail endpoint surfaces the same counts"
        (doseq [[convo expected] [[convo-none 0] [convo-two 2] [convo-errored 1]]]
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-analytics/conversations/%s" convo))]
            (is (= expected (:search_count response))
                (format "expected search_count=%d for %s" expected convo))))))))

(defn- query-tool-input-block
  [call-id tool-name]
  {:type "tool-input" :id call-id :function tool-name :arguments {}})

(defn- query-tool-output-block
  [call-id]
  {:type "tool-output" :id call-id :result {:output "ok"}})

(defn- with-query-count-fixture!
  "Seed conversations that exercise `:query_count` (create_sql_query and
   construct_notebook_query). Edit/replace tools and unrelated tools are
   included to verify they are excluded from the count."
  [thunk]
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {test-user-id :id} {:email      "metabot-analytics-query-count@metabase.com"
                                                   :first_name "Query"
                                                   :last_name  "Counter"}]
      (let [convo-none  (str (random-uuid))
            convo-mixed (str (random-uuid))
            convo-edits (str (random-uuid))
            mar-1       (offset-date-time "2026-03-10T00:00:00Z")
            mar-2       (offset-date-time "2026-03-11T00:00:00Z")
            mar-3       (offset-date-time "2026-03-12T00:00:00Z")]
        (try
          (insert-conversation! {:conversation-id convo-none
                                 :user-id         test-user-id
                                 :created-at      mar-1
                                 :summary         "no query tools"})
          (insert-conversation! {:conversation-id convo-mixed
                                 :user-id         test-user-id
                                 :created-at      mar-2
                                 :summary         "one create + one notebook across messages"})
          (insert-conversation! {:conversation-id convo-edits
                                 :user-id         test-user-id
                                 :created-at      mar-3
                                 :summary         "only edit/replace — should not count"})
          ;; convo-none: only a search, no new-query tools.
          (insert-message! {:conversation-id convo-none
                            :created-at      mar-1
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    5
                            :data            [(search-input-block "call-s")
                                              (search-output-block "call-s")]})
          ;; convo-mixed: one create_sql_query in msg 1, one construct_notebook_query
          ;; in msg 2 alongside an excluded edit_sql_query.
          (insert-message! {:conversation-id convo-mixed
                            :created-at      mar-2
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    10
                            :data            [(query-tool-input-block "call-a" "create_sql_query")
                                              (query-tool-output-block "call-a")]})
          (insert-message! {:conversation-id convo-mixed
                            :created-at      mar-2
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    10
                            :data            [(query-tool-input-block "call-b" "edit_sql_query")
                                              (query-tool-output-block "call-b")
                                              (query-tool-input-block "call-c" "construct_notebook_query")
                                              (query-tool-output-block "call-c")]})
          ;; convo-edits: only edit + replace — both excluded from :query_count.
          (insert-message! {:conversation-id convo-edits
                            :created-at      mar-3
                            :role            "assistant"
                            :profile-id      "internal"
                            :total-tokens    4
                            :data            [(query-tool-input-block "call-e" "edit_sql_query")
                                              (query-tool-output-block "call-e")
                                              (query-tool-input-block "call-r" "replace_sql_query")
                                              (query-tool-output-block "call-r")]})
          (thunk {:test-user-id test-user-id
                  :convo-none   convo-none
                  :convo-mixed  convo-mixed
                  :convo-edits  convo-edits})
          (finally
            (delete-conversations! [convo-none convo-mixed convo-edits])))))))

(deftest query-count-test
  (with-query-count-fixture!
    (fn [{:keys [test-user-id convo-none convo-mixed convo-edits]}]
      (testing "list endpoint: counts create_sql_query + construct_notebook_query, excludes edit/replace"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "ee/metabot-analytics/conversations?user-id=%s" test-user-id))
              by-id    (into {} (map (juxt :conversation_id identity)) (:data response))]
          (is (= {convo-none 0, convo-mixed 2, convo-edits 0}
                 (update-vals by-id :query_count)))))
      (testing "detail endpoint surfaces the same counts"
        (doseq [[convo expected] [[convo-none 0] [convo-mixed 2] [convo-edits 0]]]
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-analytics/conversations/%s" convo))]
            (is (= expected (:query_count response))
                (format "expected query_count=%d for %s" expected convo))))))))

(deftest get-conversation-detail-slack-permalink-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations/:id returns a Slack permalink when metadata is present"
      (let [conversation-id (str (random-uuid))
            user-id         (mt/user->id :crowberto)
            permalink       "https://example.slack.com/archives/C123/p1712785577123456"]
        (try
          (insert-conversation! {:conversation-id  conversation-id
                                 :user-id          user-id
                                 :summary          "Slack conversation"
                                 :slack-team-id    "T123"
                                 :slack-channel-id "C123"
                                 :slack-thread-ts  "1712785577.123456"})
          (with-redefs [slackbot.api/conversation-permalink (fn [channel ts]
                                                              (is (= "C123" channel))
                                                              (is (= "1712785577.123456" ts))
                                                              permalink)]
            (let [response (mt/user-http-request :crowberto :get 200
                                                 (format "ee/metabot-analytics/conversations/%s" conversation-id))]
              (is (= permalink (:slack_permalink response)))))
          (finally
            (delete-conversations! [conversation-id])))))))

(defn- with-ip-address-fixture!
  "Seed conversations with varying IP-address state so we can assert both list
   and detail `:ip_address` behavior without perturbing the list fixture."
  [thunk]
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {test-user-id :id} {:email      "metabot-analytics-ip@metabase.com"
                                                   :first_name "IP"
                                                   :last_name  "Tester"}]
      (let [convo-web   (str (random-uuid))
            convo-slack (str (random-uuid))
            convo-null  (str (random-uuid))
            jan-1       (offset-date-time "2026-03-01T00:00:00Z")
            jan-2       (offset-date-time "2026-03-02T00:00:00Z")
            jan-3       (offset-date-time "2026-03-03T00:00:00Z")]
        (try
          (insert-conversation! {:conversation-id convo-web
                                 :user-id         test-user-id
                                 :created-at      jan-1
                                 :summary         "web conversation"
                                 :ip-address      "1.2.3.4"})
          (insert-conversation! {:conversation-id convo-slack
                                 :user-id         test-user-id
                                 :created-at      jan-2
                                 :summary         "slack conversation"
                                 :slack-team-id   "T123"
                                 :slack-channel-id "C123"
                                 :slack-thread-ts  "1712785577.123456"})
          (insert-conversation! {:conversation-id convo-null
                                 :user-id         test-user-id
                                 :created-at      jan-3
                                 :summary         "legacy conversation with no ip"})
          (thunk {:test-user-id test-user-id
                  :convo-web    convo-web
                  :convo-slack  convo-slack
                  :convo-null   convo-null})
          (finally
            (delete-conversations! [convo-web convo-slack convo-null])))))))

(deftest ^:parallel get-conversation-detail-requires-superuser-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403
                                   (format "ee/metabot-analytics/conversations/%s"
                                           (str (random-uuid)))))))))

(deftest ^:parallel get-conversation-detail-404-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations/:id 404s for unknown conversations"
      (mt/user-http-request :crowberto :get 404
                            (format "ee/metabot-analytics/conversations/%s"
                                    (str (random-uuid)))))))

(deftest get-conversation-detail-feedback-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/ee/metabot-analytics/conversations/:id surfaces user-submitted feedback on the :feedback key, ordered by submission time"
      (let [conversation-id (str (random-uuid))
            user-id         (mt/user->id :crowberto)
            jan-1           (offset-date-time "2026-04-01T00:00:00Z")
            jan-2           (offset-date-time "2026-04-02T00:00:00Z")
            jan-3           (offset-date-time "2026-04-03T00:00:00Z")]
        (try
          (insert-conversation! {:conversation-id conversation-id
                                 :user-id         user-id
                                 :created-at      jan-1
                                 :summary         "feedback conversation"})
          (let [msg-1 (insert-message! {:conversation-id conversation-id :created-at jan-2
                                        :role "assistant" :profile-id "gpt-5" :total-tokens 5
                                        :data [{:type "text" :text "first answer"}]})
                msg-2 (insert-message! {:conversation-id conversation-id :created-at jan-3
                                        :role "assistant" :profile-id "gpt-5" :total-tokens 7
                                        :data [{:type "text" :text "second answer"}]})]
            (run! insert-feedback!
                  [{:message-id msg-1 :positive true  :freeform "great" :created-at jan-2}
                   {:message-id msg-2 :positive false :issue-type "not-factual"
                    :freeform "wrong" :created-at jan-3}])
            (let [feedback (:feedback (mt/user-http-request :crowberto :get 200
                                                            (format "ee/metabot-analytics/conversations/%s"
                                                                    conversation-id)))]
              (is (= 2 (count feedback)))
              (is (= [true false] (map :positive feedback)))
              (is (= [msg-1 msg-2] (map :message_id feedback)))
              (is (= "not-factual" (:issue_type (second feedback))))
              (is (every? (comp string? :external_id) feedback)
                  "each feedback row carries the parent metabot_message.external_id so the admin UI can link to it")
              (is (every? #(not (contains? % :user)) feedback)
                  "feedback rows do not hydrate a per-row user — the submitter is always the conversation owner")))
          (finally
            (delete-conversations! [conversation-id])))))))

(deftest ip-address-test
  (with-ip-address-fixture!
    (fn [{:keys [test-user-id convo-web convo-slack convo-null]}]
      (testing "list endpoint surfaces IP for web conversations, nil for Slack/legacy"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "ee/metabot-analytics/conversations?user-id=%s" test-user-id))
              by-id    (into {} (map (juxt :conversation_id identity)) (:data response))]
          (is (= {convo-web "1.2.3.4", convo-slack nil, convo-null nil}
                 (update-vals by-id :ip_address)))))
      (testing "pagination preserves ip_address for rows on page 2"
        ;; Default sort is created_at desc: [convo-null convo-slack convo-web].
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "ee/metabot-analytics/conversations?user-id=%s&limit=1&offset=1"
                                                     test-user-id))]
          (is (= [convo-slack] (map :conversation_id (:data response))))
          (is (nil? (:ip_address (first (:data response)))))))
      (testing "detail endpoint surfaces the same values"
        (doseq [[convo expected] [[convo-web "1.2.3.4"] [convo-slack nil] [convo-null nil]]]
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-analytics/conversations/%s" convo))]
            (is (= expected (:ip_address response))
                (format "expected ip_address=%s for %s" (pr-str expected) convo))))))))
