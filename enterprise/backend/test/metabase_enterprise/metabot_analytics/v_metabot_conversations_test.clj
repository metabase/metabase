(ns metabase-enterprise.metabot-analytics.v-metabot-conversations-test
  "Tests for the `v_metabot_conversations` SQL view."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-model "anthropic/claude-sonnet-4-6")

(defn- query-view
  "Query v_metabot_conversations, returning only rows for the given conversation IDs."
  [conversation-ids]
  (map (fn [row]
         (-> row
             (update :total_tokens long)
             (update :prompt_tokens long)
             (update :completion_tokens long)))
       (t2/query {:select [:*]
                  :from   [:v_metabot_conversations]
                  :where  [:in :conversation_id conversation-ids]})))

(defn- find-row [rows conversation-id]
  (some #(when (= (:conversation_id %) conversation-id) %) rows))

(deftest message-counts-and-tokens-test
  (testing "view correctly counts messages by role and sums tokens from ai_usage_log"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id :summary "token counting"}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "user"      :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-id
                                                   :prompt_tokens 100
                                                   :completion_tokens 50
                                                   :total_tokens 150}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-id
                                                   :prompt_tokens 80
                                                   :completion_tokens 30
                                                   :total_tokens 110}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-id
                                                   :prompt_tokens 120
                                                   :completion_tokens 50
                                                   :total_tokens 170}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-id
                                                   :prompt_tokens 200
                                                   :completion_tokens 80
                                                   :total_tokens 280}]
        (is (=? {:message_count           3
                 :user_message_count      1
                 :assistant_message_count 2
                 :prompt_tokens           500
                 :completion_tokens       210
                 :total_tokens            710}
                (first (query-view [convo-id]))))))))

(deftest multi-conversation-aggregation-test
  (testing "tokens aggregate correctly across conversations with varying message and usage-log counts"
    ;; convo-1: 1 user + 2 assistant messages, 4 usage-log entries (multi-turn, multiple LLM calls per message)
    ;; convo-2: 2 user + 1 assistant messages, 3 usage-log entries
    ;; convo-3: 3 user + 3 assistant messages, 5 usage-log entries
    (let [convo-1 (str (random-uuid))
          convo-2 (str (random-uuid))
          convo-3 (str (random-uuid))]
      (mt/with-temp [:model/User              {user-a :id} {}
                     :model/User              {user-b :id} {}
                     :model/MetabotConversation _ {:id convo-1 :user_id user-a :summary "multi-turn chat"}
                     :model/MetabotConversation _ {:id convo-2 :user_id user-b :summary "quick question"}
                     :model/MetabotConversation _ {:id convo-3 :user_id user-a :summary "long conversation"}
                     ;; convo-1: 3 messages
                     :model/MetabotMessage      _ {:conversation_id convo-1 :role "user"      :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-1 :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-1 :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     ;; convo-1: 4 usage-log entries (e.g. tool calls generating extra LLM round-trips)
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-1
                                                   :prompt_tokens 100
                                                   :completion_tokens 40
                                                   :total_tokens 140}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-1
                                                   :prompt_tokens 120
                                                   :completion_tokens 60
                                                   :total_tokens 180}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-1
                                                   :prompt_tokens 150
                                                   :completion_tokens 50
                                                   :total_tokens 200}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-1
                                                   :prompt_tokens 200
                                                   :completion_tokens 80
                                                   :total_tokens 280}
                     ;; convo-2: 3 messages, 3 usage-log entries
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "user"      :profile_id "internal" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "user"      :profile_id "internal" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "assistant" :profile_id "internal" :total_tokens 0 :data []}
                     :model/AiUsageLog          _ {:source "slackbot"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 50
                                                   :completion_tokens 30
                                                   :total_tokens 80}
                     :model/AiUsageLog          _ {:source "slackbot"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 40
                                                   :completion_tokens 20
                                                   :total_tokens 60}
                     :model/AiUsageLog          _ {:source "slackbot"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 60
                                                   :completion_tokens 25
                                                   :total_tokens 85}
                     ;; convo-3: 6 messages, 5 usage-log entries
                     :model/MetabotMessage      _ {:conversation_id convo-3 :role "user"      :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-3 :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-3 :role "user"      :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-3 :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-3 :role "user"      :profile_id "nlq" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-3 :role "assistant" :profile_id "nlq" :total_tokens 0 :data []}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-3
                                                   :prompt_tokens 300
                                                   :completion_tokens 100
                                                   :total_tokens 400}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-3
                                                   :prompt_tokens 350
                                                   :completion_tokens 120
                                                   :total_tokens 470}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-3
                                                   :prompt_tokens 400
                                                   :completion_tokens 150
                                                   :total_tokens 550}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-3
                                                   :prompt_tokens 450
                                                   :completion_tokens 130
                                                   :total_tokens 580}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-3
                                                   :prompt_tokens 500
                                                   :completion_tokens 200
                                                   :total_tokens 700}]
        (let [rows (query-view [convo-1 convo-2 convo-3])
              r1   (find-row rows convo-1)
              r2   (find-row rows convo-2)
              r3   (find-row rows convo-3)]
          (is (=? {:message_count           3
                   :user_message_count      1
                   :assistant_message_count 2
                   :prompt_tokens           570
                   :completion_tokens       230
                   :total_tokens            800
                   :profile_id              "nlq"}
                  r1))
          (is (=? {:message_count           3
                   :user_message_count      2
                   :assistant_message_count 1
                   :prompt_tokens           150
                   :completion_tokens       75
                   :total_tokens            225
                   :profile_id              "internal"}
                  r2))
          (is (=? {:message_count           6
                   :user_message_count      3
                   :assistant_message_count 3
                   :prompt_tokens           2000
                   :completion_tokens       700
                   :total_tokens            2700
                   :profile_id              "nlq"}
                  r3)))))))

(deftest deleted-messages-excluded-test
  (testing "soft-deleted messages are excluded from counts"
    (let [convo-id (str (random-uuid))
          now      (java.time.OffsetDateTime/now)
          earlier  (.minusHours now 1)]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "user"      :profile_id "nlq" :total_tokens 0 :data [] :created_at earlier}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "assistant" :profile_id "nlq" :total_tokens 0 :data [] :created_at now}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "assistant" :profile_id "nlq" :total_tokens 0 :data [] :deleted_at now}]
        (is (=? {:message_count           2
                 :user_message_count      1
                 :assistant_message_count 1}
                (first (query-view [convo-id]))))))))

(deftest user-display-name-test
  (testing "user_display_name shows 'first last' when available, falls back to email"
    (let [convo-named   (str (random-uuid))
          convo-unnamed (str (random-uuid))]
      (mt/with-temp [:model/User {named-id :id}   {:first_name "Alice" :last_name "Smith" :email "alice@metabase.com"}
                     :model/User {unnamed-id :id} {:first_name nil :last_name nil :email "anon@metabase.com"}
                     :model/MetabotConversation _ {:id convo-named   :user_id named-id}
                     :model/MetabotConversation _ {:id convo-unnamed :user_id unnamed-id}]
        (let [rows    (query-view [convo-named convo-unnamed])
              named   (find-row rows convo-named)
              unnamed (find-row rows convo-unnamed)]
          (is (=? {:user_display_name "Alice Smith"} named))
          ;; when first_name/last_name are nil, COALESCE falls back to email
          (is (=? {:user_display_name "anon@metabase.com"} unnamed)))))))

(deftest source-from-usage-log-test
  (testing "source is returned from ai_usage_log"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/AiUsageLog          _ {:source "slackbot"
                                                   :model default-model
                                                   :conversation_id convo-id
                                                   :prompt_tokens 10
                                                   :completion_tokens 5
                                                   :total_tokens 15}]
        (is (=? {:source "slackbot"} (first (query-view [convo-id]))))))))

(deftest model-from-usage-log-test
  (testing "model is returned from ai_usage_log"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model "anthropic/claude-haiku-4-5-20251001"
                                                   :conversation_id convo-id
                                                   :prompt_tokens 10
                                                   :completion_tokens 5
                                                   :total_tokens 15}]
        (is (=? {:model "anthropic/claude-haiku-4-5-20251001"} (first (query-view [convo-id]))))))))

(deftest ip-address-test
  (testing "ip_address is surfaced from the conversation row"
    (let [convo-with-ip (str (random-uuid))
          convo-no-ip   (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-with-ip :user_id user-id :ip_address "10.0.0.1"}
                     :model/MetabotConversation _ {:id convo-no-ip   :user_id user-id}]
        (let [rows  (query-view [convo-with-ip convo-no-ip])
              w-ip  (find-row rows convo-with-ip)
              no-ip (find-row rows convo-no-ip)]
          (is (=? {:ip_address "10.0.0.1"} w-ip))
          (is (nil? (:ip_address no-ip))))))))

(deftest tenant-id-and-name-test
  (testing "tenant_id and tenant_name come from ai_usage_log joined with tenant table"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User   {user-id :id}   {}
                     :model/Tenant {tenant-id :id} {:name "Acme Corp" :slug "acme-corp"}
                     :model/MetabotConversation  _ {:id convo-id :user_id user-id}
                     :model/AiUsageLog           _ {:source "agent"
                                                    :model default-model
                                                    :conversation_id convo-id
                                                    :prompt_tokens 10
                                                    :completion_tokens 5
                                                    :total_tokens 15
                                                    :tenant_id tenant-id}]
        (is (=? {:tenant_id   tenant-id
                 :tenant_name "Acme Corp"}
                (first (query-view [convo-id]))))))))

(deftest no-tenant-returns-nil-test
  (testing "tenant_id and tenant_name are nil when no ai_usage_log rows exist"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}]
        (let [row (first (query-view [convo-id]))]
          (is (nil? (:tenant_id row)))
          (is (nil? (:tenant_name row))))))))

(deftest group-name-test
  (testing "group_name comes from user's first non-'All Users' permissions group (alphabetical)"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User             {user-id :id}  {}
                     :model/PermissionsGroup {group-id :id} {:name "Analytics Team"}
                     :model/PermissionsGroupMembership    _ {:group_id group-id :user_id user-id}
                     :model/MetabotConversation           _ {:id convo-id :user_id user-id}]
        (is (=? {:group_name "Analytics Team"} (first (query-view [convo-id]))))))))

(deftest conversation-with-no-messages-test
  (testing "conversation with no messages returns zero counts and nil profile_id"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id :summary "empty conversation"}]
        (is (=? {:summary                 "empty conversation"
                 :message_count           0
                 :user_message_count      0
                 :assistant_message_count 0
                 :total_tokens            0
                 :prompt_tokens           0
                 :completion_tokens       0}
                (first (query-view [convo-id]))))
        (let [row (first (query-view [convo-id]))]
          (is (nil? (:profile_id row)))
          (is (nil? (:last_message_at row))))))))

(deftest last-message-at-test
  (testing "last_message_at reflects the most recent non-deleted message"
    (let [convo-id (str (random-uuid))
          t1       (java.time.OffsetDateTime/parse "2026-01-01T12:00:00Z")
          t2-ts    (java.time.OffsetDateTime/parse "2026-01-02T12:00:00Z")
          t3       (java.time.OffsetDateTime/parse "2026-01-03T12:00:00Z")]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "user"      :profile_id "nlq" :total_tokens 0 :data [] :created_at t1}
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "assistant" :profile_id "nlq" :total_tokens 0 :data [] :created_at t2-ts}
                     ;; newest message is deleted — should not count
                     :model/MetabotMessage      _ {:conversation_id convo-id :role "assistant" :profile_id "nlq" :total_tokens 0 :data [] :created_at t3 :deleted_at t3}]
        (let [row (first (query-view [convo-id]))]
          ;; Compare instants to avoid DB-specific timestamp type differences
          (is (= (.toInstant t2-ts) (.toInstant (:last_message_at row)))))))))

(deftest multiple-conversations-independent-test
  (testing "multiple conversations aggregate independently"
    (let [convo-1 (str (random-uuid))
          convo-2 (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-1 :user_id user-id :summary "conversation one"}
                     :model/MetabotConversation _ {:id convo-2 :user_id user-id :summary "conversation two"}
                     :model/MetabotMessage      _ {:conversation_id convo-1 :role "user"      :profile_id "nlq"      :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-1 :role "assistant" :profile_id "nlq"      :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "user"      :profile_id "internal" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "user"      :profile_id "internal" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "assistant" :profile_id "internal" :total_tokens 0 :data []}
                     :model/MetabotMessage      _ {:conversation_id convo-2 :role "assistant" :profile_id "internal" :total_tokens 0 :data []}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-1
                                                   :prompt_tokens 10
                                                   :completion_tokens 5
                                                   :total_tokens 15}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-1
                                                   :prompt_tokens 20
                                                   :completion_tokens 10
                                                   :total_tokens 30}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 50
                                                   :completion_tokens 25
                                                   :total_tokens 75}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 30
                                                   :completion_tokens 15
                                                   :total_tokens 45}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 40
                                                   :completion_tokens 20
                                                   :total_tokens 60}
                     :model/AiUsageLog          _ {:source "agent"
                                                   :model default-model
                                                   :conversation_id convo-2
                                                   :prompt_tokens 20
                                                   :completion_tokens 10
                                                   :total_tokens 30}]
        (let [rows (query-view [convo-1 convo-2])]
          (is (=? {:message_count 2
                   :total_tokens  45
                   :profile_id    "nlq"}
                  (find-row rows convo-1)))
          (is (=? {:message_count 4
                   :total_tokens  210
                   :profile_id    "internal"}
                  (find-row rows convo-2))))))))
