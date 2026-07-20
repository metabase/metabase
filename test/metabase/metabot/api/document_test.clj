(ns metabase.metabot.api.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as mut]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest generate-content-backwards-compatible-route-test
  (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
    (mt/with-dynamic-fn-redefs [openrouter/openrouter
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
      (mt/with-dynamic-fn-redefs [openrouter/openrouter
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

(deftest generate-content-tool-call-produces-draft-card-test
  (testing "a document_construct_sql_chart tool call round trip produces a :draft_card (#73690)"
    ;; resolve the test database *before* process-query gets redefed below, so DB sync (which
    ;; itself calls process-query) isn't affected by the mock
    (let [db-id (mt/id)]
      (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
        (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                    (fn [_]
                                      {:validation-result {:valid? true, :dialect "h2"}
                                       :action-result      {:query-id "q-1"
                                                            :query    {:database db-id
                                                                       :type     "native"
                                                                       :native   {:query         "SELECT COUNT(*) FROM ORDERS"
                                                                                  :template-tags {}}}}})
                                    qp/process-query (fn [_] nil)
                                    openrouter/openrouter
                                    (let [call-count (atom 0)]
                                      (fn [_]
                                        (if (= 1 (swap! call-count inc))
                                          (mut/mock-llm-response
                                           [{:type      :tool-input
                                             :id        "t1"
                                             :function  "document_construct_sql_chart"
                                             :arguments {:database_id  db-id
                                                         :name         "Orders by day"
                                                         :description  "Count of orders"
                                                         :analysis     "Simple count"
                                                         :approach     "Direct SQL"
                                                         :sql          "SELECT COUNT(*) FROM ORDERS"
                                                         :viz_settings {:chart_type "bar"}}}])
                                          (mut/mock-llm-response
                                           [{:type :text :text "Chart created"}]))))]
          (let [response (mt/user-http-request :crowberto
                                               :post 200 "metabot/document/generate-content"
                                               {:instructions "chart it"})]
            (is (=? {:error      nil
                     :draft_card {:name "Orders by day"}}
                    response))))))))

(deftest generate-content-snowplow-test
  (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (let [rasta-id (mt/user->id :rasta)]
        (mt/with-dynamic-fn-redefs [openrouter/openrouter
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
