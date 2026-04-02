(ns metabase.internal-stats.metabot-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.internal-stats.metabot :as sut]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- store-user-message!
  "Store a user message via the real persistence path."
  [conversation-id user-id message & {:keys [ai-proxy?]}]
  (binding [api/*current-user-id* user-id]
    (metabot.persistence/store-message!
     conversation-id "internal"
     [{:role "user" :content message}]
     :ai-proxy? ai-proxy?)))

(defn- store-assistant-message!
  "Store an assistant message with usage via the real persistence path."
  [conversation-id user-id usage & {:keys [ai-proxy?]}]
  (binding [api/*current-user-id* user-id]
    (metabot.persistence/store-message!
     conversation-id "internal"
     [{:role    "assistant"
       :content "Hello!"}
      {:_type :FINISH_MESSAGE
       :usage usage}]
     :ai-proxy? ai-proxy?)))

(defn- backdate-messages!
  "Update created_at on all messages for a conversation to the given timestamp."
  [conversation-id created-at]
  (t2/update! :model/MetabotMessage {:conversation_id conversation-id}
              {:created_at created-at}))

(deftest metabot-stats-test
  (search.tu/with-index-disabled
    (let [;; pin the clock so "yesterday" is deterministic
          clock        (t/mock-clock (t/instant "2026-04-01T12:00:00Z") "UTC")
          yesterday    (t/offset-date-time 2026 3 31 10 30 0 0 (t/zone-offset "+00"))
          today        (t/offset-date-time 2026 4 1 9 0 0 0 (t/zone-offset "+00"))
          two-days-ago (t/offset-date-time 2026 3 29 14 0 0 0 (t/zone-offset "+00"))
          conv-id-1    (str (random-uuid))
          conv-id-2    (str (random-uuid))
          conv-id-3    (str (random-uuid))
          conv-id-4    (str (random-uuid))
          conv-id-5    (str (random-uuid))]
      (t/with-clock clock
        (testing "returns nil when there are no messages yesterday"
          (mt/with-temp [:model/User u1 {}]
            (mt/with-model-cleanup [:model/MetabotMessage :model/MetabotConversation]
              (store-user-message! conv-id-3 (u/the-id u1) "hello")
              (backdate-messages! conv-id-3 today)
              (is (nil? (sut/metabot-stats))))))

        (testing "returns correct stats for yesterday's messages"
          (mt/with-temp [:model/User u1 {}
                         :model/User u2 {}]
            (mt/with-model-cleanup [:model/MetabotMessage :model/MetabotConversation]
              (let [u1-id (u/the-id u1)
                    u2-id (u/the-id u2)]
                ;; conversation 1: user 1 asks, ai-proxied assistant responds with one model
                (store-user-message! conv-id-1 u1-id "What is 2+2?" :ai-proxy? true)
                (store-assistant-message! conv-id-1 u1-id
                                          {"anthropic/claude-sonnet-4-6"
                                           {:prompt 100 :completion 50}}
                                          :ai-proxy? true)
                (backdate-messages! conv-id-1 yesterday)

                ;; conversation 2: user 2 asks, ai-proxied assistant responds with two models
                (store-user-message! conv-id-2 u2-id "Tell me a joke" :ai-proxy? true)
                (store-assistant-message! conv-id-2 u2-id
                                          {"anthropic/claude-sonnet-4-6"
                                           {:prompt 200 :completion 80}
                                           "anthropic/claude-haiku-4-5"
                                           {:prompt 50 :completion 20}}
                                          :ai-proxy? true)
                (backdate-messages! conv-id-2 yesterday)

                ;; out-of-window: two days ago
                (store-assistant-message! conv-id-3 u1-id
                                          {"anthropic/claude-sonnet-4-6"
                                           {:prompt 999 :completion 999}}
                                          :ai-proxy? true)
                (backdate-messages! conv-id-3 two-days-ago)

                ;; out-of-window: today
                (store-assistant-message! conv-id-4 u1-id
                                          {"anthropic/claude-sonnet-4-6"
                                           {:prompt 888 :completion 888}}
                                          :ai-proxy? true)
                (backdate-messages! conv-id-4 today)

                ;; excluded: yesterday but NOT ai-proxied (BYOK)
                (store-user-message! conv-id-5 u1-id "BYOK question")
                (store-assistant-message! conv-id-5 u1-id
                                          {"anthropic/claude-sonnet-4-6"
                                           {:prompt 777 :completion 777}})
                (backdate-messages! conv-id-5 yesterday)

                (let [stats (sut/metabot-stats)]
                  (testing ":metabot-tokens sums total_tokens for yesterday only"
                    (is (= 500 (:metabot-tokens stats))))

                  (testing ":metabot-usage aggregates by provider:model:in/out"
                    (is (= {"anthropic:claude-sonnet-4-6:in"  300
                            "anthropic:claude-sonnet-4-6:out" 130
                            "anthropic:claude-haiku-4-5:in"   50
                            "anthropic:claude-haiku-4-5:out"  20}
                           (:metabot-usage stats))))

                  (testing ":metabot-queries counts user messages for yesterday"
                    (is (= 2 (:metabot-queries stats))))

                  (testing ":metabot-users counts distinct users for yesterday"
                    (is (= 2 (:metabot-users stats))))

                  (testing ":metabot-usage-date is yesterday's date"
                    (is (= "2026-03-31" (:metabot-usage-date stats))))))))

          (testing "returns nil when only non-proxied (BYOK) messages exist yesterday"
            (mt/with-temp [:model/User u1 {}]
              (mt/with-model-cleanup [:model/MetabotMessage :model/MetabotConversation]
                (let [u1-id  (u/the-id u1)
                      conv-a (str (random-uuid))
                      conv-b (str (random-uuid))]
                  (store-user-message! conv-a u1-id "BYOK question 1")
                  (store-assistant-message! conv-a u1-id
                                            {"anthropic/claude-sonnet-4-6"
                                             {:prompt 500 :completion 500}})
                  (backdate-messages! conv-a yesterday)

                  (store-user-message! conv-b u1-id "BYOK question 2")
                  (store-assistant-message! conv-b u1-id
                                            {"anthropic/claude-haiku-4-5"
                                             {:prompt 300 :completion 300}})
                  (backdate-messages! conv-b yesterday)

                  (is (nil? (sut/metabot-stats))))))))))))
