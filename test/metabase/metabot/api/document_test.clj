(ns metabase.metabot.api.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as mut]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest generate-content-backwards-compatible-route-test
  (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
    (with-redefs [openrouter/openrouter
                  (fn [_]
                    (mut/mock-llm-response
                     [{:type :start :id "msg-1"}
                      {:type :text :text "No chart available"}
                      {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                       :model "test-model" :id "msg-1"}]))]
      (is (= {:draft_card nil
              :description nil
              :error "No chart available"}
             (mt/user-http-request :crowberto
                                   :post 200 "metabot/document/generate-content"
                                   {:instructions "Show me sales data"}))))))

(deftest generate-content-prometheus-test
  (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
    (mt/with-prometheus-system! [_ system]
      (with-redefs [openrouter/openrouter
                    (fn [_]
                      (mut/mock-llm-response
                       [{:type :start :id "msg-1"}
                        {:type :text :text "No chart available"}
                        {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                         :model "anthropic/claude-haiku-4-5" :id "msg-1"}]))]
        (mt/user-http-request :crowberto
                              :post 200 "metabot/document/generate-content"
                              {:instructions "Show me sales data"}))
      (is (== 1 (mt/metric-value system :metabase-metabot/agent-requests
                                 {:profile-id "document-generate-content"})))
      (is (== 1 (:sum (mt/metric-value system :metabase-metabot/agent-iterations
                                       {:profile-id "document-generate-content"}))))
      (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests
                                 {:model "openrouter/anthropic/claude-haiku-4-5" :source "agent"})))
      (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                   {:model "openrouter/anthropic/claude-haiku-4-5" :source "agent"})))
      (is (== 20 (mt/metric-value system :metabase-metabot/llm-output-tokens
                                  {:model "openrouter/anthropic/claude-haiku-4-5" :source "agent"}))))))

(deftest generate-content-snowplow-test
  (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (let [rasta-id (mt/user->id :rasta)]
        (with-redefs [openrouter/openrouter
                      (fn [_]
                        (mut/mock-llm-response
                         [{:type :start :id "msg-1"}
                          {:type :text :text "No chart available"}
                          {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                           :model "anthropic/claude-haiku-4-5" :id "msg-1"}]))]
          (snowplow-test/with-fake-snowplow-collector
            (mt/user-http-request :rasta
                                  :post 200 "metabot/document/generate-content"
                                  {:instructions "Show me sales data"})
            (let [events       (snowplow-test/pop-event-data-and-user-id!)
                  token-events (filter #(contains? (:data %) "total_tokens") events)]
              (is (=? [{:user-id (str rasta-id)
                        :data    {"model_id"           "openrouter/anthropic/claude-haiku-4-5"
                                  "total_tokens"        120
                                  "prompt_tokens"       100
                                  "completion_tokens"   20
                                  "estimated_costs_usd" 0.0
                                  "duration_ms"         nat-int?
                                  "source"              "document_generate_content"
                                  "tag"                 "agent"}}]
                      token-events)))))))))
