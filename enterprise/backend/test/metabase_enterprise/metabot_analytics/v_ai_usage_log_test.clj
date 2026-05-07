(ns metabase-enterprise.metabot-analytics.v-ai-usage-log-test
  "Tests for the `v_ai_usage_log` SQL view."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-model "anthropic/claude-sonnet-4-6")

(defn- query-view
  "Query v_ai_usage_log for rows by usage_log_id."
  [usage-log-ids]
  (t2/query {:select [:*]
             :from   [:v_ai_usage_log]
             :where  [:in :usage_log_id usage-log-ids]}))

(defn- find-row [rows usage-log-id]
  (some #(when (= (:usage_log_id %) usage-log-id) %) rows))

(deftest one-row-per-usage-log-test
  (testing "view emits exactly one row per ai_usage_log row, columns passed through"
    (let [convo-id (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-id :user_id user-id}
                     :model/AiUsageLog {log-id-1 :id} {:source "agent"
                                                       :model default-model
                                                       :profile_id "nlq"
                                                       :conversation_id convo-id
                                                       :user_id user-id
                                                       :prompt_tokens 100
                                                       :completion_tokens 40
                                                       :total_tokens 140
                                                       :request_id "req-1"}
                     :model/AiUsageLog {log-id-2 :id} {:source "slackbot"
                                                       :model default-model
                                                       :profile_id "slackbot"
                                                       :conversation_id convo-id
                                                       :user_id user-id
                                                       :prompt_tokens 50
                                                       :completion_tokens 25
                                                       :total_tokens 75
                                                       :request_id "req-2"}]
        (let [rows (query-view [log-id-1 log-id-2])
              r1   (find-row rows log-id-1)
              r2   (find-row rows log-id-2)]
          (is (= 2 (count rows)))
          (is (=? {:source            "agent"
                   :model             default-model
                   :profile_id        "nlq"
                   :conversation_id   convo-id
                   :user_id           user-id
                   :prompt_tokens     100
                   :completion_tokens 40
                   :total_tokens      140
                   :request_id        "req-1"}
                  r1))
          (is (=? {:source     "slackbot"
                   :request_id "req-2"
                   :total_tokens 75}
                  r2)))))))

(deftest user-display-name-test
  (testing "user_display_name shows 'first last' when populated, falls back to email when null"
    (mt/with-temp [:model/User {named-id :id}   {:first_name "Alice" :last_name "Smith"
                                                 :email "alice@metabase.com"}
                   :model/User {unnamed-id :id} {:first_name nil :last_name nil
                                                 :email "anon@metabase.com"}
                   :model/AiUsageLog {named-log :id} {:source "agent"
                                                      :model default-model
                                                      :user_id named-id
                                                      :prompt_tokens 1
                                                      :completion_tokens 1
                                                      :total_tokens 2}
                   :model/AiUsageLog {unnamed-log :id} {:source "agent"
                                                        :model default-model
                                                        :user_id unnamed-id
                                                        :prompt_tokens 1
                                                        :completion_tokens 1
                                                        :total_tokens 2}]
      (let [rows (query-view [named-log unnamed-log])]
        (is (= "Alice Smith" (:user_display_name (find-row rows named-log))))
        (is (= "anon@metabase.com" (:user_display_name (find-row rows unnamed-log))))))))

(deftest user-display-name-null-when-user-missing-test
  (testing "user_display_name is null when there is no user_id (LEFT JOIN miss)"
    (mt/with-temp [:model/AiUsageLog {log-id :id} {:source "example-question-generation"
                                                   :model default-model
                                                   :prompt_tokens 1
                                                   :completion_tokens 1
                                                   :total_tokens 2}]
      (is (nil? (:user_display_name (find-row (query-view [log-id]) log-id)))))))

(deftest group-name-skips-all-users-and-picks-alphabetical-first-test
  (testing "group_name returns the alphabetically first non-'All Users' group; null if none"
    (mt/with-temp [:model/User             {user-id :id} {}
                   :model/PermissionsGroup {z-id :id}    {:name "Zebra Team"}
                   :model/PermissionsGroup {a-id :id}    {:name "Analytics Team"}
                   :model/PermissionsGroupMembership _   {:group_id z-id :user_id user-id}
                   :model/PermissionsGroupMembership _   {:group_id a-id :user_id user-id}
                   :model/AiUsageLog {log-id :id} {:source "agent"
                                                   :model default-model
                                                   :user_id user-id
                                                   :prompt_tokens 1
                                                   :completion_tokens 1
                                                   :total_tokens 2}]
      (is (= "Analytics Team"
             (:group_name (find-row (query-view [log-id]) log-id))))))
  (testing "group_name is null when the user only belongs to All Users (group id = 1)"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/AiUsageLog {log-id :id} {:source "agent"
                                                   :model default-model
                                                   :user_id user-id
                                                   :prompt_tokens 1
                                                   :completion_tokens 1
                                                   :total_tokens 2}]
      (is (nil? (:group_name (find-row (query-view [log-id]) log-id)))))))

(deftest ip-address-from-conversation-test
  (testing "ip_address is surfaced from the joined metabot_conversation row"
    (let [convo-with-ip (str (random-uuid))
          convo-no-ip   (str (random-uuid))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/MetabotConversation _ {:id convo-with-ip :user_id user-id :ip_address "10.0.0.42"}
                     :model/MetabotConversation _ {:id convo-no-ip   :user_id user-id}
                     :model/AiUsageLog {with-ip-log :id} {:source "agent"
                                                          :model default-model
                                                          :conversation_id convo-with-ip
                                                          :user_id user-id
                                                          :prompt_tokens 1
                                                          :completion_tokens 1
                                                          :total_tokens 2}
                     :model/AiUsageLog {no-ip-log :id} {:source "agent"
                                                        :model default-model
                                                        :conversation_id convo-no-ip
                                                        :user_id user-id
                                                        :prompt_tokens 1
                                                        :completion_tokens 1
                                                        :total_tokens 2}]
        (let [rows (query-view [with-ip-log no-ip-log])]
          (is (= "10.0.0.42" (:ip_address (find-row rows with-ip-log))))
          (is (nil? (:ip_address (find-row rows no-ip-log)))))))))

(deftest ip-address-null-when-no-conversation-test
  (testing "ip_address is null when the usage log row is not tied to a conversation (LEFT JOIN miss)"
    (mt/with-temp [:model/AiUsageLog {log-id :id} {:source "example-question-generation"
                                                   :model default-model
                                                   :prompt_tokens 1
                                                   :completion_tokens 1
                                                   :total_tokens 2}]
      (let [row (find-row (query-view [log-id]) log-id)]
        (is (nil? (:conversation_id row)))
        (is (nil? (:ip_address row)))))))

(deftest tenant-id-passthrough-test
  (testing "tenant_id passes through from ai_usage_log; null when not set"
    (mt/with-temp [:model/Tenant     {tenant-id :id} {:name "Acme Corp" :slug "acme-corp"}
                   :model/AiUsageLog {tenant-log :id} {:source "agent"
                                                       :model default-model
                                                       :tenant_id tenant-id
                                                       :prompt_tokens 1
                                                       :completion_tokens 1
                                                       :total_tokens 2}
                   :model/AiUsageLog {no-tenant-log :id} {:source "agent"
                                                          :model default-model
                                                          :prompt_tokens 1
                                                          :completion_tokens 1
                                                          :total_tokens 2}]
      (let [rows (query-view [tenant-log no-tenant-log])]
        (is (= tenant-id (:tenant_id (find-row rows tenant-log))))
        (is (nil? (:tenant_id (find-row rows no-tenant-log))))))))
