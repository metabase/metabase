(ns metabase-enterprise.metabot-v3.api.document-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase-enterprise.metabot-v3.test-util :as mut]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest native-generate-content-prometheus-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/with-prometheus-system! [_ system]
      (with-redefs [openrouter/openrouter
                    (fn [_]
                      (mut/mock-llm-response
                       [{:type :start :id "msg-1"}
                        {:type :text :text "No chart available"}
                        {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                         :model "test-model" :id "msg-1"}]))]
        (mt/user-http-request :crowberto
                              :post 200 "ee/metabot-v3/document/native-generate-content"
                              {:instructions "Show me sales data"}))
      (is (== 1 (mt/metric-value system :metabase-metabot/agent-requests
                                 {:profile-id "document-generate-content"})))
      (is (== 1 (:sum (mt/metric-value system :metabase-metabot/agent-iterations
                                       {:profile-id "document-generate-content"}))))
      (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests
                                 {:model "anthropic/claude-haiku-4-5" :source "agent"})))
      (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                   {:model "test-model" :source "agent"})))
      (is (== 20 (mt/metric-value system :metabase-metabot/llm-output-tokens
                                  {:model "test-model" :source "agent"}))))))

(deftest native-generate-content-snowplow-test
  (mt/with-premium-features #{:metabot-v3}
    (let [rasta-id (mt/user->id :rasta)]
      (with-redefs [openrouter/openrouter
                    (fn [_]
                      (mut/mock-llm-response
                       [{:type :start :id "msg-1"}
                        {:type :text :text "No chart available"}
                        {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                         :model "test-model" :id "msg-1"}]))]
        (snowplow-test/with-fake-snowplow-collector
          (mt/user-http-request :rasta
                                :post 200 "ee/metabot-v3/document/native-generate-content"
                                {:instructions "Show me sales data"})
          (is (=? [{:user-id (str rasta-id)
                    :data    {"model_id"           "test-model"
                              "total_tokens"        120
                              "prompt_tokens"       100
                              "completion_tokens"   20
                              "estimated_costs_usd" 0.0
                              "duration_ms"         nat-int?
                              "source"              "document_generate_content"
                              "tag"                 "agent"}}]
                  (snowplow-test/pop-event-data-and-user-id!))))))))
