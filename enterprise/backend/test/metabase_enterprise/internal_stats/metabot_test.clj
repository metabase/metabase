(ns metabase-enterprise.internal-stats.metabot-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.internal-stats.metabot :as sut]
   [metabase.metabot.example-question-generator :as eqg]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.test-util :as mut]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;; ---------------------------------------------------------------------------
;; Helpers
;; ---------------------------------------------------------------------------

(defn- send-message!
  "Send a message through the real streaming endpoint, returning the HTTP response body.
   The LLM is mocked to return a simple text response with the given model/usage."
  [conversation-id message model prompt-tokens completion-tokens]
  (let [mock-fn (fn [_]
                  (mut/mock-llm-response
                   [{:type :start :id "msg-1"}
                    {:type :text  :text "Hello!"}
                    {:type  :usage
                     :model model
                     :usage {:promptTokens prompt-tokens :completionTokens completion-tokens}
                     :id    "msg-1"}]))]
    (with-redefs [openrouter/openrouter mock-fn
                  claude/claude         mock-fn
                  openai/openai         mock-fn]
      (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                            {:message         message
                             :context         {}
                             :conversation_id conversation-id
                             :history         []
                             :state           {}}))))

(defn- backdate-messages!
  "Update created_at on all messages and usage log rows for a conversation to the given timestamp."
  [conversation-id created-at]
  (t2/update! :model/MetabotMessage {:conversation_id conversation-id}
              {:created_at created-at})
  (t2/update! :model/AiUsageLog {:conversation_id conversation-id}
              {:created_at created-at}))

(defn- cleanup! [& conv-ids]
  (doseq [cid conv-ids]
    (t2/delete! :model/AiUsageLog :conversation_id cid)
    (t2/delete! :model/MetabotMessage :conversation_id cid)
    (t2/delete! :model/MetabotConversation :id cid)))

;; ---------------------------------------------------------------------------
;; Tests
;; ---------------------------------------------------------------------------

(deftest metabot-stats-e2e-test
  (search.tu/with-index-disabled
    (let [clock        (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday    (t/offset-date-time 2026 3 31 10 30 0 0 (t/zone-offset "+00"))
          today        (t/offset-date-time 2026 4 1 9 0 0 0 (t/zone-offset "+00"))
          two-days-ago (t/offset-date-time 2026 3 29 14 0 0 0 (t/zone-offset "+00"))
          conv-1       (str (random-uuid))
          conv-2       (str (random-uuid))
          conv-3       (str (random-uuid))
          conv-4       (str (random-uuid))
          conv-5       (str (random-uuid))
          conv-6       (str (random-uuid))
          all-convs    [conv-1 conv-2 conv-3 conv-4 conv-5 conv-6]
          model        "claude-sonnet-4-6"]
      (t/with-clock clock
        (try
          ;; -- AI proxy conversations (metabase/ prefix) --
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/anthropic/claude-sonnet-4-6"]
            ;; conv-1: yesterday, one model
            (send-message! conv-1 "What is 2+2?" model 100 50)
            (backdate-messages! conv-1 yesterday)

            ;; conv-2: yesterday, same model different usage
            (send-message! conv-2 "Tell me a joke" model 200 80)
            (backdate-messages! conv-2 yesterday)

            ;; conv-3: two days ago — out of window
            (send-message! conv-3 "Old question" model 999 999)
            (backdate-messages! conv-3 two-days-ago)

            ;; conv-4: today — in rolling window
            (send-message! conv-4 "Today's question" model 888 888)
            (backdate-messages! conv-4 today)

            ;; conv-6: today, same model — exercises rolling aggregation
            (send-message! conv-6 "Another today question" model 100 100)
            (backdate-messages! conv-6 today))

          ;; -- BYOK conversation (no metabase/ prefix) --
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "anthropic/claude-sonnet-4-6"]
            (send-message! conv-5 "BYOK question" model 777 777)
            (backdate-messages! conv-5 yesterday))

          ;; -- Verify stored data --

          (testing "ai-proxy messages have ai_proxied = true on ALL rows (user + assistant)"
            (let [msgs (t2/select :model/MetabotMessage :conversation_id conv-1)]
              (is (= 2 (count msgs)) "should have user + assistant messages")
              (is (every? true? (map :ai_proxied msgs)))))

          (testing "ai-proxy usage log has ai_proxied = true"
            (let [logs (t2/select :model/AiUsageLog :conversation_id conv-1)]
              (is (= 1 (count logs)) "should have one usage log row per LLM call")
              (is (every? true? (map :ai_proxied logs)))))

          (testing "BYOK messages have ai_proxied = false on ALL rows"
            (let [msgs (t2/select :model/MetabotMessage :conversation_id conv-5)]
              (is (= 2 (count msgs)))
              (is (every? false? (map :ai_proxied msgs)))))

          (testing "BYOK usage log has ai_proxied = false"
            (let [logs (t2/select :model/AiUsageLog :conversation_id conv-5)]
              (is (= 1 (count logs)) "should have one usage log row per LLM call")
              (is (every? false? (map :ai_proxied logs)))))

          (testing "usage keys are provider/model (metabase/ prefix stripped)"
            ;; accumulate-usage-xf strips metabase/ prefix → "anthropic/claude-sonnet-4-6"
            ;; JSON roundtrip keywordizes → :anthropic/claude-sonnet-4-6
            (let [msg (t2/select-one :model/MetabotMessage :conversation_id conv-1 :role :assistant)]
              (is (contains? (:usage msg) (keyword "anthropic" "claude-sonnet-4-6"))
                  "usage key should be provider/model without metabase/ prefix")))

          ;; -- Verify stats aggregation --

          (let [stats (sut/metabot-stats)]
            (testing ":metabot-tokens sums total_tokens for yesterday's ai-proxied messages only"
              ;; conv-1: 150, conv-2: 280 → total 430
              (is (= 430 (:metabot-tokens stats))))

            (testing ":metabot-usage aggregates combined tokens by model"
              (is (= {"anthropic:claude-sonnet-4-6:tokens" 430}
                     (:metabot-usage stats))))

            (testing ":metabot-queries counts ai-proxied user messages for yesterday"
              (is (= 2 (:metabot-queries stats))))

            (testing ":metabot-users counts distinct users for yesterday"
              (is (= 1 (:metabot-users stats))))

            (testing ":metabot-usage-date is yesterday's date"
              (is (= "2026-03-31" (:metabot-usage-date stats))))

            (testing ":metabot-rolling-usage aggregates today's combined tokens by model"
              (is (= {"anthropic:claude-sonnet-4-6:tokens" 1976}
                     (:metabot-rolling-usage stats))))

            (testing ":metabot-rolling-usage-date is today's date"
              (is (= "2026-04-01" (:metabot-rolling-usage-date stats)))))

          ;; -- BYOK-only scenario --
          (cleanup! conv-1 conv-2 conv-3 conv-4 conv-6)

          (testing "returns nil when only BYOK (non-proxied) messages exist yesterday"
            (is (nil? (sut/metabot-stats))))

          (finally
            (apply cleanup! all-convs)))))))

(deftest metabot-stats-rolling-only-test
  (search.tu/with-index-disabled
    (let [clock   (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          today   (t/offset-date-time 2026 4 1 9 0 0 0 (t/zone-offset "+00"))
          conv-id (str (random-uuid))]
      (t/with-clock clock
        (try
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/anthropic/claude-sonnet-4-6"]
            (send-message! conv-id "Hello" "claude-sonnet-4-6" 500 100)
            (backdate-messages! conv-id today))
          (let [stats (sut/metabot-stats)]
            (testing "returns rolling keys when only today has data"
              (is (= {"anthropic:claude-sonnet-4-6:tokens" 600}
                     (:metabot-rolling-usage stats)))
              (is (= "2026-04-01" (:metabot-rolling-usage-date stats))))
            (testing "yesterday keys are absent when no yesterday data"
              (is (nil? (:metabot-tokens stats)))
              (is (nil? (:metabot-usage stats)))
              (is (nil? (:metabot-usage-date stats)))))
          (finally
            (cleanup! conv-id)))))))

(deftest metabot-usage-anthropic-provider-test
  (search.tu/with-index-disabled
    (let [clock     (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday (t/offset-date-time 2026 3 31 10 0 0 0 (t/zone-offset "+00"))
          conv-id   (str (random-uuid))]
      (t/with-clock clock
        (try
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/anthropic/claude-sonnet-4-6"]
            (send-message! conv-id "Hello" "claude-sonnet-4-6" 1000 250)
            (backdate-messages! conv-id yesterday))
          (let [stats (sut/metabot-stats)]
            (is (= {"anthropic:claude-sonnet-4-6:tokens" 1250}
                   (:metabot-usage stats))))
          (finally
            (cleanup! conv-id)))))))

(deftest metabot-usage-openai-provider-test
  (search.tu/with-index-disabled
    (let [clock     (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday (t/offset-date-time 2026 3 31 10 0 0 0 (t/zone-offset "+00"))
          conv-id   (str (random-uuid))]
      (t/with-clock clock
        (try
          ;; openai is not currently in the metabase managed allow-list, but we still
          ;; want to test metering in case we ever enable these providers — bypass the
          ;; validator with `with-redefs` to set the provider directly.
          (with-redefs [metabot.settings/llm-metabot-provider (constantly "metabase/openai/gpt-4o")]
            (send-message! conv-id "Hello" "gpt-4o" 600 200)
            (backdate-messages! conv-id yesterday))
          (let [stats (sut/metabot-stats)]
            (is (= {"openai:gpt-4o:tokens" 800}
                   (:metabot-usage stats))))
          (finally
            (cleanup! conv-id)))))))

(deftest metabot-usage-multiple-providers-test
  (search.tu/with-index-disabled
    (let [clock     (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday (t/offset-date-time 2026 3 31 10 0 0 0 (t/zone-offset "+00"))
          conv-1    (str (random-uuid))
          conv-2    (str (random-uuid))
          conv-3    (str (random-uuid))]
      (t/with-clock clock
        (try
          ;; openrouter/openai are not currently in the metabase managed allow-list,
          ;; but we still want to test metering in case we ever enable these providers
          ;; — bypass the validator with `with-redefs` to set the provider directly.
          (with-redefs [metabot.settings/llm-metabot-provider
                        (constantly "metabase/openrouter/anthropic/claude-haiku-4-5")]
            (send-message! conv-1 "Q1" "anthropic/claude-haiku-4-5" 100 50)
            (backdate-messages! conv-1 yesterday))
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/anthropic/claude-sonnet-4-6"]
            (send-message! conv-2 "Q2" "claude-sonnet-4-6" 200 80)
            (backdate-messages! conv-2 yesterday))
          (with-redefs [metabot.settings/llm-metabot-provider
                        (constantly "metabase/openai/gpt-4o")]
            (send-message! conv-3 "Q3" "gpt-4o" 300 120)
            (backdate-messages! conv-3 yesterday))
          (let [stats (sut/metabot-stats)]
            (is (= {"openrouter:anthropic/claude-haiku-4-5:tokens" 150
                    "anthropic:claude-sonnet-4-6:tokens"           280
                    "openai:gpt-4o:tokens"                         420}
                   (:metabot-usage stats))))
          (finally
            (cleanup! conv-1 conv-2 conv-3)))))))

;; ---------------------------------------------------------------------------
;; Example question generation usage tracking
;; ---------------------------------------------------------------------------

(defn- generate-example-questions!
  "Call the example question generator with a mocked LLM that returns structured output
   with the given model/usage."
  [tables model prompt-tokens completion-tokens]
  (let [mock-fn (fn [_]
                  (mut/mock-llm-response
                   [{:type :start :id "msg-eqg"}
                    {:type      :tool-input
                     :id        "tool-1"
                     :function  "json"
                     :arguments {:questions ["What is the total?" "Show me trends"]}}
                    {:type  :usage
                     :model model
                     :usage {:promptTokens prompt-tokens :completionTokens completion-tokens}
                     :id    "msg-eqg"}]))]
    (with-redefs [openrouter/openrouter mock-fn
                  claude/claude         mock-fn
                  openai/openai         mock-fn]
      (eqg/generate-example-questions {:tables tables :metrics []}))))

(defn- max-usage-log-id
  "Return the current max id in ai_usage_log, or 0 if empty."
  []
  (or (:max (t2/query-one {:select [[:%max.id :max]] :from [:ai_usage_log]})) 0))

(defn- cleanup-usage-logs-after! [min-id]
  (t2/delete! :model/AiUsageLog :id [:> min-id]))

;; NOTE: generate-example-questions! uses `future` internally (process-batch-parallel),
;; so ai_usage_log inserts happen on separate threads outside any with-transaction scope.
;; We snapshot max(id) before each test and only delete rows inserted after that.

(deftest example-question-generation-creates-usage-log-test
  (search.tu/with-index-disabled
    (let [baseline  (max-usage-log-id)
          clock     (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday (t/offset-date-time 2026 3 31 10 0 0 0 (t/zone-offset "+00"))
          today     (t/offset-date-time 2026 4 1 9 0 0 0 (t/zone-offset "+00"))
          model     "claude-sonnet-4-6"
          tables    [{:name "Orders" :fields [{:name "id"} {:name "total"}]}]]
      (t/with-clock clock
        (try
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/anthropic/claude-sonnet-4-6"]
            ;; Yesterday's generation
            (generate-example-questions! tables model 400 100)

            (testing "ai_usage_log row is created with ai_proxied = true"
              (is (=? [{:ai_proxied true
                        :total_tokens 500}]
                      (t2/select :model/AiUsageLog :id [:> baseline]))))

            ;; backdate so it lands in yesterday's window
            (t2/update! :model/AiUsageLog {:id [:> baseline]}
                        {:created_at yesterday})

            ;; Today's generation — exercises rolling usage
            (let [before-today (max-usage-log-id)]
              (generate-example-questions! tables model 200 60)
              (t2/update! :model/AiUsageLog {:id [:> before-today]}
                          {:created_at today})))

          (testing "metabot-stats includes yesterday totals and today's rolling usage"
            (is (=? {:metabot-tokens             500
                     :metabot-usage              {"anthropic:claude-sonnet-4-6:tokens" 500}
                     :metabot-rolling-usage      {"anthropic:claude-sonnet-4-6:tokens" 260}
                     :metabot-rolling-usage-date "2026-04-01"}
                    (sut/metabot-stats))))
          (finally
            (cleanup-usage-logs-after! baseline)))))))

(deftest example-question-generation-byok-not-in-stats-test
  (search.tu/with-index-disabled
    (let [baseline  (max-usage-log-id)
          clock     (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday (t/offset-date-time 2026 3 31 10 0 0 0 (t/zone-offset "+00"))
          model     "anthropic/claude-haiku-4-5"
          tables    [{:name "Orders" :fields [{:name "id"} {:name "total"}]}]]
      (t/with-clock clock
        (try
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "openrouter/anthropic/claude-haiku-4-5"]
            (generate-example-questions! tables model 400 100)

            (testing "ai_usage_log row is created with ai_proxied = false for BYOK"
              (is (=? [{:ai_proxied false}]
                      (t2/select :model/AiUsageLog :id [:> baseline]))))

            (t2/update! :model/AiUsageLog {:id [:> baseline]}
                        {:created_at yesterday}))

          (testing "BYOK example question usage does not appear in metabot-stats"
            (is (nil? (sut/metabot-stats))))
          (finally
            (cleanup-usage-logs-after! baseline)))))))

(deftest example-question-generation-combined-with-chat-test
  (search.tu/with-index-disabled
    (let [baseline  (max-usage-log-id)
          clock     (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday (t/offset-date-time 2026 3 31 10 0 0 0 (t/zone-offset "+00"))
          model     "claude-sonnet-4-6"
          tables    [{:name "Orders" :fields [{:name "id"} {:name "total"}]}]
          conv-id   (str (random-uuid))]
      (t/with-clock clock
        (try
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/anthropic/claude-sonnet-4-6"]
            ;; Chat conversation
            (send-message! conv-id "What is 2+2?" model 200 50)
            (backdate-messages! conv-id yesterday)

            ;; Example question generation (no conversation)
            (generate-example-questions! tables model 300 100)
            (t2/update! :model/AiUsageLog {:id [:> baseline]
                                           :source "example-question-generation"}
                        {:created_at yesterday}))

          (testing "metabot-stats includes both chat and example question generation"
            ;; chat: 250, eqg: 400 → total 650
            (is (=? {:metabot-tokens  650
                     :metabot-queries 1
                     :metabot-usage   {"anthropic:claude-sonnet-4-6:tokens" 650}}
                    (sut/metabot-stats))))
          (finally
            (cleanup-usage-logs-after! baseline)
            (cleanup! conv-id)))))))
