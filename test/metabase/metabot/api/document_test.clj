(ns metabase.metabot.api.document-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as mut]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest generate-content-backwards-compatible-route-test
  (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                     llm-metabot-provider test-provider]
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

(deftest generate-content-permission-denied-body-test
  (testing "the 403 body is the plain denial sentence, not a map carrying a stack trace"
    (binding [scope/*current-user-metabot-permissions* {:permission/metabot             :yes
                                                        :permission/metabot-other-tools :no}]
      (is (= "You do not have permission to use the document-generate-content assistant."
             (mt/user-http-request :rasta
                                   :post 403 "metabot/document/generate-content"
                                   {:instructions "Show me sales data"}))))))

(deftest generate-content-free-limit-body-test
  (testing "the 402 body is the message and error code alone, not a map carrying a stack trace"
    (mt/with-dynamic-fn-redefs [metabot.usage/managed-free-limit-reached? (constantly true)]
      (is (= {:message    "You've used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key."
              :error-code "metabase_ai_managed_locked"}
             (mt/user-http-request :crowberto
                                   :post 402 "metabot/document/generate-content"
                                   {:instructions "Show me sales data"}))))))

(deftest generate-content-prometheus-test
  (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                     llm-metabot-provider test-provider]
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
                                 {:model "openrouter/anthropic/claude-haiku-4-5" :source "agent" :provider "openrouter"})))
      (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                   {:model "openrouter/anthropic/claude-haiku-4-5" :source "agent" :provider "openrouter"})))
      (is (== 20 (mt/metric-value system :metabase-metabot/llm-output-tokens
                                  {:model "openrouter/anthropic/claude-haiku-4-5" :source "agent" :provider "openrouter"}))))))

(deftest generate-content-tool-call-produces-draft-card-test
  (testing "a document_construct_sql_chart tool call round trip produces a :draft_card (#73690)"
    ;; resolve the test database *before* process-query gets redefed below, so DB sync (which
    ;; itself calls process-query) isn't affected by the mock
    (let [db-id (mt/id)]
      (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                         llm-metabot-provider test-provider]
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

(defn- scripted-llm
  "A stand-in for `openrouter/openrouter` that records each request in the `requests` atom and answers the nth request
  with the nth entry of `responses`, then with a text reply."
  [requests responses]
  (fn [request]
    (let [n (count (swap! requests conj request))]
      (mut/mock-llm-response
       (get responses (dec n) [{:type :text :text "Chart created"}])))))

(defn- input-includes?
  "Whether some string in the input of the LLM `request` includes `text`."
  [request text]
  (some #(and (string? %) (str/includes? % text))
        (tree-seq coll? seq (:input request))))

(defn- request-body-bytes
  "The size in UTF-8 bytes of the JSON body that OpenRouter gets for the LLM `request`."
  ^long [request]
  (alength (.getBytes ^String (json/encode (openrouter/openrouter-request-body request)) "UTF-8")))

(defn- sized-text
  "`text`, padded with \"x\" or cut to `n` characters."
  [text n]
  (subs (str text (apply str (repeat n "x"))) 0 n))

(defn- insert-sized-cards!
  "Insert `n` cards of `card-type` over ORDERS into `collection-id`. Each card gets the name and description that
  `text-fn` gives for its index and name, as `[name description]`. Every card gets one `last_used_at`, so the order
  does not depend on the insert time."
  [n card-type collection-id text-fn]
  (let [mp     (mt/metadata-provider)
        orders (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
    (t2/insert! :model/Card (for [i (range n)
                                  :let [[card-name description] (text-fn i (str "Stats " (name card-type) " " i))]]
                              {:name                   card-name
                               :description            description
                               :type                   card-type
                               :display                :table
                               :dataset_query          (cond-> orders
                                                         (= card-type :metric) (lib/aggregate (lib/count)))
                               :visualization_settings {}
                               :collection_id          collection-id
                               :creator_id             (mt/user->id :crowberto)
                               :database_id            (mt/id)
                               :last_used_at           (java.time.OffsetDateTime/parse "2026-01-01T00:00:00Z")}))))

(defn- listing-request!
  "Insert the cards that `insert!` adds to a new collection, given its id, with the internal Metabot confined to that
  collection. Return request 2 of a turn whose first reply calls `list_available_data_sources`."
  [insert!]
  (mt/initialize-if-needed! :db)
  (mt/with-temp [:model/Collection {coll-id :id} {}]
    (mt/with-model-cleanup [:model/Card]
      (insert! coll-id)
      ;; The endpoint uses the internal Metabot, so the test confines it to the new collection for exact counts.
      (mt/with-temp-vals-in-db :model/Metabot (:id (metabot.config/resolve-metabot nil))
                               {:collection_id coll-id :use_verified_content false}
        (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                           llm-metabot-provider test-provider]
          (let [requests (atom [])]
            (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                        (scripted-llm requests [[{:type      :tool-input
                                                                  :id        "t1"
                                                                  :function  "list_available_data_sources"
                                                                  :arguments {}}]])]
              (mt/user-http-request :crowberto :post 200 "metabot/document/generate-content"
                                    {:instructions "count of orders"}))
            (second @requests)))))))

(defn- input-match-count
  "The number of matches of `re` in the strings of the input of the LLM `request`."
  [request re]
  (transduce (comp (filter string?) (map #(count (re-seq re %))))
             +
             (tree-seq coll? seq (:input request))))

(deftest generate-content-stats-shaped-size-test
  (testing "with 180 models and 20 metrics in scope, request 2 is under 100 KB and lists 20 metrics and 130 models"
    (let [text-fn (fn [i card-name]
                    (if (zero? (mod i 10))
                      [(sized-text card-name 100) (sized-text "A long description" 2000)]
                      [(sized-text card-name 30) (sized-text "A typical description" 134)]))
          request (listing-request! (fn [coll-id]
                                      (insert-sized-cards! 180 :model coll-id text-fn)
                                      (insert-sized-cards! 20 :metric coll-id text-fn)))
          size    (request-body-bytes request)]
      (is (< size (* 100 1024)) (format "request 2 is %d bytes" size))
      (is (= 20 (input-match-count request #"<metric id=")))
      (is (= 130 (input-match-count request #"<metabase-model id="))))))

(deftest generate-content-long-entries-size-test
  (testing "with 151 long models (100-character names, 2,000-character descriptions), request 2 is under 100 KB"
    (let [request (listing-request! #(insert-sized-cards! 151 :model %
                                                          (fn [_ card-name]
                                                            [(sized-text card-name 100)
                                                             (sized-text "A long description" 2000)])))
          size    (request-body-bytes request)]
      (is (< size (* 100 1024)) (format "request 2 is %d bytes" size))
      (is (= 150 (input-match-count request #"<(metabase-model|metric) id="))))))

(deftest generate-content-model-chart-round-trip-test
  (testing "the model lists the data sources, reads the model's columns, loads the query skills, then charts the model"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card model {:type          :model
                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}]
        (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                           llm-metabot-provider test-provider]
          (let [requests  (atom [])
                responses [[{:type      :tool-input
                             :id        "t0"
                             :function  "list_available_data_sources"
                             :arguments {}}]
                           [{:type      :tool-input
                             :id        "t1"
                             :function  "list_available_fields"
                             :arguments {:table_ids [] :model_ids [(:id model)] :metric_ids []}}]
                           [{:type      :tool-input
                             :id        "t2"
                             :function  "load_skill"
                             :arguments {:ids ["construct-notebook-query-core" "construct-notebook-query-advanced"]}}]
                           [{:type      :tool-input
                             :id        "t3"
                             :function  "document_construct_model_chart"
                             :arguments {:name         "Orders by month"
                                         :description  "Count of orders per month."
                                         :query        {"lib/type" "mbql/query"
                                                        "stages"   [{"lib/type"    "mbql.stage/mbql"
                                                                     "source-card" (:entity_id model)
                                                                     "aggregation" [["count" {}]]
                                                                     "breakout"    [["field" {"temporal-unit" "month"}
                                                                                     "CREATED_AT"]]}]}
                                         :viz_settings {:chart_type "line"}}}]]]
            (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                        (scripted-llm requests responses)]
              (let [response (mt/user-http-request :crowberto
                                                   :post 200 "metabot/document/generate-content"
                                                   {:instructions "Chart orders by month"})
                    [first-request _ third-request fourth-request] @requests]
                (is (some #{"load_skill"} (map :tool-name (:tools first-request))))
                (is (input-includes? third-request "name=\"CREATED_AT\"")
                    "`list_available_fields` gives the model's columns before the model writes the query")
                (is (input-includes? fourth-request "<skill id=\"construct-notebook-query-advanced\">")
                    "the skill body reaches the model before it writes the query")
                (is (=? {:error      nil
                         :draft_card {:name          "Orders by month"
                                      :display       "line"
                                      :database_id   (mt/id)
                                      :dataset_query {:stages [{:source-card (:id model)}]}}}
                        response))))))))))

(deftest generate-content-metric-chart-round-trip-test
  (testing "the model lists the data sources, reads the metric's dimensions, then charts the metric by a dimension"
    (let [mp      (mt/metadata-provider)
          orders  (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          db-name (t2/select-one-fn :name :model/Database :id (mt/id))]
      (mt/with-temp [:model/Card metric {:type          :metric
                                         :dataset_query (lib/aggregate orders (lib/count))}]
        (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                           llm-metabot-provider test-provider]
          (let [requests  (atom [])
                responses [[{:type      :tool-input
                             :id        "t0"
                             :function  "list_available_data_sources"
                             :arguments {}}]
                           [{:type      :tool-input
                             :id        "t1"
                             :function  "read_resource"
                             :arguments {:uris [(str "metabase://metric/" (:id metric) "/dimensions")]}}]
                           [{:type      :tool-input
                             :id        "t2"
                             :function  "document_construct_model_chart"
                             :arguments {:name         "Orders by month"
                                         :description  "Count of orders per month."
                                         :query        {"lib/type" "mbql/query"
                                                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                                                     "source-table" [db-name "PUBLIC" "ORDERS"]
                                                                     "aggregation"  [["metric" {} (:entity_id metric)]]
                                                                     "breakout"     [["field" {"temporal-unit" "month"}
                                                                                      [db-name "PUBLIC" "ORDERS"
                                                                                       "CREATED_AT"]]]}]}
                                         :viz_settings {:chart_type "line"}}}]]]
            (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                        (scripted-llm requests responses)]
              (let [response (mt/user-http-request :crowberto
                                                   :post 200 "metabot/document/generate-content"
                                                   {:instructions "Chart orders by month"})
                    [_ second-request third-request] @requests]
                (is (input-includes? second-request "`metabase://metric/{id}/dimensions`")
                    "the list tells the model where a metric's dimensions come from")
                (is (input-includes? third-request "### Dimensions")
                    "`read_resource` gives the metric's dimensions before the model writes the query")
                (is (input-includes? third-request "CREATED_AT"))
                (is (=? {:error      nil
                         :draft_card {:name          "Orders by month"
                                      :display       "line"
                                      :database_id   (mt/id)
                                      :dataset_query {:stages [{:aggregation [["metric" {} (:id metric)]]
                                                                :breakout    [["field" {:temporal-unit "month"}
                                                                               (mt/id :orders :created_at)]]}]}}}
                        response))))))))))

(deftest generate-content-sql-chart-without-mention-test
  (testing "without an @-mentioned database, the model chooses the database for a SQL chart"
    (let [db-id (mt/id)]
      (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                         llm-metabot-provider test-provider]
        (let [requests  (atom [])
              responses [[{:type      :tool-input
                           :id        "t1"
                           :function  "document_schema_collect"
                           :arguments {:database_id db-id}}]
                         [{:type      :tool-input
                           :id        "t2"
                           :function  "document_construct_sql_chart"
                           :arguments {:database_id  db-id
                                       :name         "Orders count"
                                       :description  "Count of orders"
                                       :analysis     "Simple count"
                                       :approach     "Direct SQL"
                                       :sql          "SELECT COUNT(*) FROM ORDERS"
                                       :viz_settings {:chart_type "scalar"}}}]]]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (scripted-llm requests responses)]
            (is (=? {:error      nil
                     :draft_card {:name        "Orders count"
                                  :database_id db-id}}
                    (mt/user-http-request :crowberto
                                          :post 200 "metabot/document/generate-content"
                                          {:instructions "Chart the number of orders"})))
            (is (= 2 (count @requests)))
            (is (input-includes? (second @requests) "The database has this schema")
                "the schema of the chosen database reaches the model before it writes the SQL")))))))

(deftest generate-content-failed-calls-error-test
  (testing "when a turn of failed calls ends without a chart, the error is not the text written for the model"
    (let [db-id       (mt/id)
          failed-call (fn []
                        [{:type      :tool-input
                          :id        (str (random-uuid))
                          :function  "document_construct_sql_chart"
                          :arguments {:database_id  db-id
                                      :name         "Orders"
                                      :description  "Count of orders"
                                      :analysis     "Simple count"
                                      :approach     "Direct SQL"
                                      :sql          "SELECT COUNT(*) FROM"
                                      :viz_settings {:chart_type "bar"}}}])]
      (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                         llm-metabot-provider test-provider]
        (doseq [[ending later-response error]
                [["by reaching the step limit" failed-call
                  "Metabot reached its step limit before it could finish. Try a more specific request."]
                 ["by returning nothing" (constantly [])
                  "Metabot could not complete this step."]]]
          (testing ending
            (let [calls (atom 0)]
              (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                          (fn [_]
                                            {:validation-result {:valid?        false
                                                                 :dialect       "h2"
                                                                 :error-message "syntax error near FROM"}})
                                          openrouter/openrouter
                                          (fn [_]
                                            (mut/mock-llm-response
                                             (if (= 1 (swap! calls inc))
                                               (failed-call)
                                               (later-response))))]
                (is (= {:draft_card  nil
                        :description nil
                        :error       error}
                       (mt/user-http-request :crowberto
                                             :post 200 "metabot/document/generate-content"
                                             {:instructions "chart it"})))))))))))

(deftest generate-content-step-limit-reply-test
  (let [db-id       (mt/id)
        chart-query {:database db-id
                     :type     "native"
                     :native   {:query "SELECT COUNT(*) FROM ORDERS" :template-tags {}}}
        read-call   [{:type      :tool-input
                      :function  "list_available_fields"
                      :arguments {:table_ids [] :model_ids [] :metric_ids []}}]
        chart-call  [{:type      :tool-input
                      :function  "document_construct_sql_chart"
                      :arguments {:database_id  db-id
                                  :name         "Orders by day"
                                  :description  "Count of orders"
                                  :analysis     "Simple count"
                                  :approach     "Direct SQL"
                                  :sql          "SELECT COUNT(*) FROM ORDERS"
                                  :viz_settings {:chart_type "bar"}}}]
        generate!   (fn [last-step-response after-limit-response]
                      (let [requests (atom [])]
                        (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                                    (fn [request]
                                                      (let [n (count (swap! requests conj request))]
                                                        (mut/mock-llm-response
                                                         (cond
                                                           (< n 20)  (assoc-in read-call [0 :id] (str "t" n))
                                                           (= n 20)  (assoc-in last-step-response [0 :id] "t20")
                                                           :else     after-limit-response))))]
                          {:response (mt/user-http-request :crowberto
                                                           :post 200 "metabot/document/generate-content"
                                                           {:instructions "Chart revenue by customer segment"})
                           :requests @requests})))]
    (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                       llm-metabot-provider test-provider]
      (testing "a turn that reaches the step limit returns the reply of its last call, made with no tool use, as the
               error"
        (let [reply "No table that the orders link to holds a customer segment, so I couldn't chart revenue by it."
              {:keys [response requests]} (generate! read-call [{:type :text :text reply}])]
          (is (= {:draft_card nil :description nil :error reply} response))
          (is (= [21 "none"] [(count requests) (:tool_choice (last requests))]))))
      (testing "a chart made on the last step is the answer, with no call after it"
        (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                    (fn [_]
                                      {:validation-result {:valid? true, :dialect "h2"}
                                       :action-result     {:query-id "q-1" :query chart-query}})
                                    qp/process-query (fn [_] nil)]
          (let [{:keys [response requests]} (generate! chart-call [{:type :text :text "Unexpected"}])]
            (is (=? {:error nil :draft_card {:name "Orders by day"}} response))
            (is (= 20 (count requests)))))))))

(deftest generate-content-internal-failure-error-test
  (testing "a failure inside Metabase while the chart query runs ends the turn with the generic error"
    (let [db-id (mt/id)
          calls (atom 0)]
      (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                         llm-metabot-provider test-provider]
        (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                    (fn [_]
                                      {:validation-result {:valid? true, :dialect "h2"}
                                       :action-result     {:query-id "q-1"
                                                           :query    {:database db-id
                                                                      :type     "native"
                                                                      :native   {:query "SELECT COUNT(*) FROM ORDERS"
                                                                                 :template-tags {}}}}})
                                    qp/process-query mut/reject-app-db-lookup
                                    openrouter/openrouter
                                    (fn [_]
                                      (if (= 1 (swap! calls inc))
                                        (mut/mock-llm-response
                                         [{:type      :tool-input
                                           :id        "t1"
                                           :function  "document_construct_sql_chart"
                                           :arguments {:database_id  db-id
                                                       :name         "Orders"
                                                       :description  "Count of orders"
                                                       :analysis     "Simple count"
                                                       :approach     "Direct SQL"
                                                       :sql          "SELECT COUNT(*) FROM ORDERS"
                                                       :viz_settings {:chart_type "bar"}}}])
                                        (mut/mock-llm-response
                                         [{:type :text :text "Chart created"}])))]
          (is (= {:draft_card  nil
                  :description nil
                  :error       "Something went wrong."}
                 (mt/user-http-request :crowberto
                                       :post 200 "metabot/document/generate-content"
                                       {:instructions "chart it"})))
          (is (= 1 @calls)))))))

(deftest generate-content-snowplow-test
  (mt/with-temporary-setting-values [llm-providers        llm.tu/default-connections
                                     llm-metabot-provider test-provider]
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
