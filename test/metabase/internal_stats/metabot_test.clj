(ns metabase.internal-stats.metabot-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.internal-stats.metabot :as sut]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.test-util :as mut]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; ---------------------------------------------------------------------------
;; Helpers
;; ---------------------------------------------------------------------------

(defn- send-message!
  "Send a message through the real streaming endpoint, returning the HTTP response body.
   The LLM is mocked to return a simple text response with the given model/usage."
  [conversation-id message model prompt-tokens completion-tokens]
  (with-redefs [openrouter/openrouter
                (fn [_]
                  (mut/mock-llm-response
                   [{:type :start :id "msg-1"}
                    {:type :text  :text "Hello!"}
                    {:type  :usage
                     :model model
                     :usage {:promptTokens prompt-tokens :completionTokens completion-tokens}
                     :id    "msg-1"}]))]
    (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                          {:message         message
                           :context         {}
                           :conversation_id conversation-id
                           :history         []
                           :state           {}})))

(defn- backdate-messages!
  "Update created_at on all messages for a conversation to the given timestamp."
  [conversation-id created-at]
  (t2/update! :model/MetabotMessage {:conversation_id conversation-id}
              {:created_at created-at}))

(defn- cleanup! [& conv-ids]
  (doseq [cid conv-ids]
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
          all-convs    [conv-1 conv-2 conv-3 conv-4 conv-5]
          ;; OpenRouter returns model names like "anthropic/claude-haiku-4-5" in its API.
          ;; This is the bare model name that flows from the SSE adapter → extract-usage → DB.
          model        "anthropic/claude-haiku-4-5"]
      (t/with-clock clock
        (try
          ;; -- AI proxy conversations (metabase/ prefix) --
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "metabase/openrouter/anthropic/claude-haiku-4-5"]
            ;; conv-1: yesterday, one model
            (send-message! conv-1 "What is 2+2?" model 100 50)
            (backdate-messages! conv-1 yesterday)

            ;; conv-2: yesterday, same model different usage
            (send-message! conv-2 "Tell me a joke" model 200 80)
            (backdate-messages! conv-2 yesterday)

            ;; conv-3: two days ago — out of window
            (send-message! conv-3 "Old question" model 999 999)
            (backdate-messages! conv-3 two-days-ago)

            ;; conv-4: today — out of window
            (send-message! conv-4 "Today's question" model 888 888)
            (backdate-messages! conv-4 today))

          ;; -- BYOK conversation (no metabase/ prefix) --
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                             "openrouter/anthropic/claude-haiku-4-5"]
            (send-message! conv-5 "BYOK question" model 777 777)
            (backdate-messages! conv-5 yesterday))

          ;; -- Verify stored data --

          (testing "ai-proxy messages have ai_proxied = true on ALL rows (user + assistant)"
            (let [msgs (t2/select :model/MetabotMessage :conversation_id conv-1)]
              (is (= 2 (count msgs)) "should have user + assistant messages")
              (is (every? true? (map :ai_proxied msgs)))))

          (testing "BYOK messages have ai_proxied = false on ALL rows"
            (let [msgs (t2/select :model/MetabotMessage :conversation_id conv-5)]
              (is (= 2 (count msgs)))
              (is (every? false? (map :ai_proxied msgs)))))

          (testing "usage keys are provider/model (metabase/ prefix stripped)"
            ;; accumulate-usage-xf strips metabase/ prefix → "openrouter/anthropic/claude-haiku-4-5"
            ;; JSON roundtrip keywordizes → :openrouter/anthropic/claude-haiku-4-5
            (let [msg (t2/select-one :model/MetabotMessage :conversation_id conv-1 :role :assistant)]
              (is (contains? (:usage msg) (keyword "openrouter" "anthropic/claude-haiku-4-5"))
                  "usage key should be provider/model without metabase/ prefix")))

          ;; -- Verify stats aggregation --

          (let [stats (sut/metabot-stats)]
            (testing ":metabot-tokens sums total_tokens for yesterday's ai-proxied messages only"
              ;; conv-1: 150, conv-2: 280 → total 430
              (is (= 430 (:metabot-tokens stats))))

            (testing ":metabot-usage aggregates by model:in/out"
              (is (= {"openrouter:anthropic/claude-haiku-4-5:in"  300
                      "openrouter:anthropic/claude-haiku-4-5:out" 130}
                     (:metabot-usage stats))))

            (testing ":metabot-queries counts ai-proxied user messages for yesterday"
              (is (= 2 (:metabot-queries stats))))

            (testing ":metabot-users counts distinct users for yesterday"
              (is (= 1 (:metabot-users stats))))

            (testing ":metabot-usage-date is yesterday's date"
              (is (= "2026-03-31" (:metabot-usage-date stats)))))

          ;; -- BYOK-only scenario --
          (cleanup! conv-1 conv-2 conv-3 conv-4)

          (testing "returns nil when only BYOK (non-proxied) messages exist yesterday"
            (is (nil? (sut/metabot-stats))))

          (finally
            (apply cleanup! all-convs)))))))
