(ns metabase-enterprise.metabot.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.settings :as ee.metabot.settings]
   [metabase-enterprise.metabot.usage :as ee.metabot.usage]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.test-util :as mut]
   [metabase.metabot.tools.search :as metabot-search]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(deftest agent-streaming-quota-exceeded-test
  (testing "POST /api/metabot/agent-streaming short-circuits with the quota message once an instance usage limit is exceeded"
    (mt/with-premium-features #{:ai-controls}
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
        (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
          (with-redefs [config/is-dev? true]
            (try
              (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 0}]
                (ee.metabot.usage/clear-limit-cache!)
                (let [llm-called? (atom false)]
                  (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                                      (reset! llm-called? true)
                                                                      (mut/mock-llm-response
                                                                       [{:type :text :text "should not be reached"}]))]
                    (mt/with-model-cleanup [:model/MetabotMessage
                                            [:model/MetabotConversation :created_at]]
                      (let [response   (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                             {:message         "Hi"
                                                              :context         {}
                                                              :conversation_id (str (random-uuid))
                                                              :history         []
                                                              :state           {}})
                            events      (->> (str/split-lines response)
                                             (filter #(str/starts-with? % "data: "))
                                             (remove #(= "data: [DONE]" %))
                                             (map #(json/decode+kw (subs % 6))))
                            error-event (first (filter #(= "error" (:type %)) events))]
                        (is (false? @llm-called?)
                            "the LLM must never be called once the instance limit is exceeded")
                        (is (some? error-event)
                            "an SSE error event is streamed")
                        (is (= (ee.metabot.settings/metabot-quota-reached-message)
                               (:errorText error-event))
                            "the quota message is the error event's errorText")
                        (is (str/includes? response "ai_usage_limit_reached")
                            "the ai_usage_limit_reached code surfaces on the finish event"))))))
              ;; the limit check is TTL-memoized process-wide; bust it so the now-removed temp limit
              ;; doesn't leak a stale "exceeded" verdict into other tests
              (finally
                (ee.metabot.usage/clear-limit-cache!)))))))))

(defn- sse-events
  "The decoded events of the SSE `response` of the agent-streaming endpoint."
  [response]
  (->> (str/split-lines response)
       (filter #(str/starts-with? % "data: "))
       (remove #(= "data: [DONE]" %))
       (map #(json/decode+kw (subs % 6)))))

(deftest agent-streaming-message-limit-counts-turns-test
  (testing "a message limit counts turns: a turn that calls a tool takes one message, not one per LLM call"
    (mt/with-premium-features #{:ai-controls}
      (mt/with-temporary-setting-values [llm.settings/llm-providers            llm.tu/default-connections
                                         metabot.settings/llm-metabot-provider test-provider
                                         metabot-limit-unit                    "messages"]
        (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
          (with-redefs [config/is-dev? true]
            (let [conversation-ids (repeatedly 3 #(str (random-uuid)))
                  llm-calls        (atom 0)
                  ;; the first call of a turn asks for a search, the call after the tool result answers
                  mock-llm         (fn [{:keys [input]}]
                                     (swap! llm-calls inc)
                                     (if (= :tool-output (:type (last input)))
                                       (mut/mock-llm-response
                                        [{:type :start :id "msg-2"}
                                         {:type :text :text "Found it."}
                                         {:type :usage :id "msg-2" :model "test-model"
                                          :usage {:promptTokens 20 :completionTokens 5}}])
                                       (mut/mock-llm-response
                                        [{:type :start :id "msg-1"}
                                         {:type :tool-input :id "call-1" :function "search"
                                          :arguments {:keyword_queries ["orders"]}}
                                         {:type :usage :id "msg-1" :model "test-model"
                                          :usage {:promptTokens 10 :completionTokens 5}}])))
                  send-message     (fn [conversation-id]
                                     (sse-events
                                      (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                            {:message         "How many orders?"
                                                             :context         {}
                                                             :conversation_id conversation-id
                                                             :state           {}})))
                  error-text       (fn [events]
                                     (:errorText (first (filter #(= "error" (:type %)) events))))]
              (try
                (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 2}]
                  (ee.metabot.usage/clear-limit-cache!)
                  (mt/with-dynamic-fn-redefs [openrouter/openrouter          mock-llm
                                              metabot-search/search          (constantly [])
                                              conversation-title/ensure-title! (constantly {:status :ready
                                                                                            :title  "Orders"})]
                    (mt/with-model-cleanup [:model/MetabotMessage
                                            [:model/MetabotConversation :created_at]]
                      (testing "the first two turns stream their answer, two LLM calls each"
                        (doseq [conversation-id (take 2 conversation-ids)]
                          (ee.metabot.usage/clear-limit-cache!)
                          (let [events (send-message conversation-id)]
                            (is (nil? (error-text events)))
                            (is (= "Found it." (apply str (map :delta (filter #(= "text-delta" (:type %)) events)))))))
                        (is (= 4 @llm-calls)))
                      (testing "the third turn is blocked with the quota message before any LLM call"
                        (ee.metabot.usage/clear-limit-cache!)
                        (let [events (send-message (last conversation-ids))]
                          (is (= (ee.metabot.settings/metabot-quota-reached-message) (error-text events)))
                          (is (= 4 @llm-calls))))
                      (testing "the log holds more LLM calls than messages"
                        (let [rows (t2/select :model/AiUsageLog :conversation_id [:in conversation-ids])]
                          (is (= 4 (count rows)))
                          (is (= 2 (count (distinct (map :request_id rows))))))))))
                (finally
                  (t2/delete! :model/AiUsageLog :conversation_id [:in conversation-ids])
                  (ee.metabot.usage/clear-limit-cache!))))))))))

(deftest usage-get-returns-token-status-usage-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/with-dynamic-fn-redefs [premium-features/token-status (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value      12345
                                                                                                                         :meter-free-units 1337
                                                                                                                         :meter-updated-at "2026-04-02T19:29:12Z"}}})]
      (is (= {:tokens       12345
              :free_tokens  1337
              :updated_at   "2026-04-02T19:29:12Z"
              :is_locked    nil}
             (-> (mt/user-http-request :crowberto :get 200 "ee/metabot/usage")
                 (update :updated_at str)))))))

(deftest usage-permissions-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/user-http-request :rasta :get 403 "ee/metabot/usage")))
