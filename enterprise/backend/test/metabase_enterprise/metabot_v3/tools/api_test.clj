(ns metabase-enterprise.metabot-v3.tools.api-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.dependencies-test :as metabot-v3.tools.dependencies-test]
   [metabase-enterprise.metabot-v3.tools.entity-details :as metabot-v3.tools.entity-details]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase-enterprise.metabot-v3.tools.test-util :as tools.tu]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- db-engine-name []
  (-> (mt/db) :engine name))

(def missing-value (symbol "nil #_\"key is not present.\""))

(deftest column-decode-test
  (let [base-col {:field_id "fid", :name "fname"}]
    (doseq [{:keys [test-case type-value]} [{:test-case "known type",   :type-value :boolean}
                                            {:test-case "unknown type", :type-value nil}]]
      (testing test-case
        (let [col (assoc base-col :type type-value)
              decoded (mc/decode ::metabot-v3.tools.api/column col (mtx/transformer {:name :tool-api-response}))]
          (is (mr/validate ::metabot-v3.tools.api/column decoded)))))))

(defn- ai-session-token
  ([] (ai-session-token :rasta (str (random-uuid))))
  ([metabot-id] (ai-session-token :rasta metabot-id))
  ([user metabot-id]
   (-> user mt/user->id (#'metabot-v3.client/get-ai-service-token metabot-id))))

(deftest create-dashboard-subscription-test
  (mt/with-premium-features #{:metabot-v3}
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:output output})]
        (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/create-dashboard-subscription"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:dashboard_id 1
                                                                :email        "user@example.com"
                                                                :schedule     {:frequency "monthly"
                                                                               :hour 15
                                                                               :day_of_month "middle-of-month"}}
                                              :conversation_id conversation-id})]
          (is (=? [{:dashboard-id 1
                    :email        "user@example.com"
                    :schedule     {:frequency :monthly
                                   :hour 15
                                   :day-of-month :middle-of-month}}]
                  @tool-requests))
          (is (=? {:output output
                   :conversation_id conversation-id}
                  response)))))))

(deftest field-values-test
  (mt/with-premium-features #{:metabot-v3}
    (let [conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          table-id (mt/id :people)
          response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/field-values"
                                         {:request-options {:headers {"x-metabase-session" ai-token}}}
                                         {:arguments       {:entity_type "table"
                                                            :entity_id   table-id
                                                            :field_id    (-> table-id
                                                                             metabot-v3.tools.u/table-field-id-prefix
                                                                             (str 4)) ; name
                                                            :limit       15}
                                          :conversation_id conversation-id})]
      (is (=? {:structured_output {:statistics
                                   {:distinct_count 2474,
                                    :percent_null 0.0,
                                    :percent_json 0.0,
                                    :percent_url 0.0,
                                    :percent_email 0.0,
                                    :percent_state 0.0,
                                    :average_length 13.532}}
               :conversation_id conversation-id}
              response)))))

(deftest filter-records-test
  (mt/with-premium-features #{:metabot-v3}
    (doseq [data-source [{:query {:database 1}, :query_id "query ID"}
                         {:query {:database 1}}
                         {:report_id 1}
                         {:table_id "1"}]]
      (let [tool-requests (atom [])
            conversation-id (str (random-uuid))
            query-id (str (random-uuid))
            ai-token (ai-session-token)]
        (with-redefs [metabot-v3.tools.filters/filter-records
                      (fn [arguments]
                        (swap! tool-requests conj arguments)
                        {:structured-output {:type :query
                                             :query-id query-id
                                             :query {}
                                             :result-columns []}})]
          (let [filters [{:field_id "q2a-1", :operation "is-not-null"}
                         {:field_id "q2a-2", :operation "equals", :value "3"}
                         {:field_id "q2a-3", :operation "equals", :values ["3" "4"]}
                         {:field_id "q2a-5", :operation "not-equals", :values [3 4]}
                         {:field_id "q2a-6", :operation "month-equals", :values [4 5 9]}
                         {:field_id "c2a-6", :bucket "week-of-year" :operation "not-equals", :values [14 15 19]}
                         {:field_id "q2a-6", :operation "year-equals", :value 2008}]
                response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/filter-records"
                                               {:request-options {:headers {"x-metabase-session" ai-token}}}
                                               {:arguments       {:data_source data-source
                                                                  :filters     filters}
                                                :conversation_id conversation-id})]
            (is (=? [{:data-source (metabot-v3.u/recursive-update-keys data-source u/->kebab-case-en)}]
                    @tool-requests))
            (is (=? {:structured_output {:type "query"
                                         :query_id query-id
                                         :query {}
                                         :result_columns []}
                     :conversation_id conversation-id}
                    response))))))))

(deftest find-outliers-test
  (doseq [data-source [{:query {:database 1}, :query_id "query ID", :result_field_id "q1233-2"}
                       {:query {:database 1}, :result_field_id "q1233-2"}
                       {:metric_id 1}
                       {:report_id 1, :result_field_id "c131-3"}
                       {:table_id "card__1", :result_field_id "t42-7"}]]
    (mt/with-premium-features #{:metabot-v3}
      (let [tool-requests (atom [])
            conversation-id (str (random-uuid))
            ai-token (ai-session-token)
            output [{:dimension "2024-11-13", :value 42}]]
        (with-redefs [metabot-v3.tools.find-outliers/find-outliers
                      (fn [arguments]
                        (swap! tool-requests conj arguments)
                        {:structured-output output})]
          (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/find-outliers"
                                               {:request-options {:headers {"x-metabase-session" ai-token}}}
                                               {:arguments       {:data_source data-source}
                                                :conversation_id conversation-id})]
            (is (=? {:structured_output output
                     :conversation_id conversation-id}
                    response))))))))

(deftest generate-insights-test
  (doseq [data-source [{:query {:database 1}}
                       {:metric_id 1}
                       {:report_id 1}
                       {:table_id "card__1"}]]
    (mt/with-premium-features #{:metabot-v3}
      (let [tool-requests (atom [])
            conversation-id (str (random-uuid))
            output (str (random-uuid))
            redirect-url "https://example.com/redirect-target"
            ai-token (ai-session-token)]
        (with-redefs [metabot-v3.tools.generate-insights/generate-insights
                      (fn [arguments]
                        (swap! tool-requests conj arguments)
                        {:output output
                         :reactions [{:type :metabot.reaction/redirect
                                      :url  redirect-url}]})]
          (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/generate-insights"
                                               {:request-options {:headers {"x-metabase-session" ai-token}}}
                                               {:arguments       {:for data-source}
                                                :conversation_id conversation-id})]
            (is (=? {:output output
                     :reactions [{:type "metabot.reaction/redirect"
                                  :url  redirect-url}]
                     :conversation_id conversation-id}
                    response))))))))

(deftest query-metric-test
  (mt/with-premium-features #{:metabot-v3}
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.filters/query-metric
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output {:type :query
                                           :query-id output
                                           :query {}
                                           :result-columns []}})]
        (let [filters [{:field_id "c2-7", :operation "number-greater-than", :value 50}
                       {:field_id "c2-3", :operation "equals", :values ["3" "4"]}
                       {:field_id "c2-5", :operation "not-equals", :values [3 4]}
                       {:field_id "c2-6", :operation "month-equals", :values [4 5 9]}
                       {:field_id "c2-6", :bucket "day-of-month" :operation "not-equals", :values [14 15 19]}
                       {:field_id "c2-6", :bucket "day-of-week" :operation "equals", :values [1 7]}
                       {:field_id "c2-6", :operation "year-equals", :value 2008}]
              breakouts [{:field_id "c2-4", :field_granularity "week"}
                         {:field_id "c2-6", :field_granularity "day"}]
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/query-metric"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:metric_id 1
                                                                :filters   filters
                                                                :group_by  breakouts}
                                              :conversation_id conversation-id})]
          (is (= {:structured_output {:type "query"
                                      :query_id output
                                      :query {}
                                      :result_columns []}
                  :conversation_id conversation-id}
                 response)))))))

(deftest query-metric-e2e-test
  (mt/with-premium-features #{:metabot-v3}
    (let [conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          mp (mt/metadata-provider)
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL source-query)
                       :type :metric}]
      (mt/with-temp [:model/Card {metric-id :id} metric-data]
        (let [fid #(format "c%d-%d" metric-id %)
              filters [{:field_id (fid 0), :operation "number-greater-than", :value 50} ; ID
                       {:field_id (fid 2), :operation "equals", :values ["3" "4"]}      ; Title
                       {:field_id (fid 6), :operation "not-equals", :values [3 4]}      ; Rating
                       {:field_id (fid 7), :operation "month-equals", :values [4 5 9]}  ; Created At
                       {:field_id (fid 7), :bucket "day-of-month" :operation "not-equals", :values [14 15 19]}
                       {:field_id (fid 7), :bucket "day-of-week" :operation "equals", :values [1 7]}
                       {:field_id (fid 7), :operation "year-equals", :value 2008}]
              breakouts [{:field_id (fid 7), :field_granularity "week"}
                         {:field_id (fid 7), :field_granularity "day"}]
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/query-metric"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:metric_id metric-id
                                                                :filters   filters
                                                                :group_by  breakouts}
                                              :conversation_id conversation-id})
              query-id (-> response :structured_output :query_id)
              actual-query (-> response :structured_output :query lib-be/normalize-query)
              id-col (lib.metadata/field mp (mt/id :products :id))
              title-col (lib.metadata/field mp (mt/id :products :title))
              rating-col (lib.metadata/field mp (mt/id :products :rating))
              created-at-col (lib.metadata/field mp (mt/id :products :created_at))
              expected-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib.options/ensure-uuid [:metric {} metric-id]))
                                 (lib/breakout (lib/with-temporal-bucket created-at-col :week))
                                 (lib/breakout (lib/with-temporal-bucket created-at-col :day))
                                 (lib/filter (lib/> id-col 50))
                                 (lib/filter (lib/= title-col "3" "4"))
                                 (lib/filter (lib/!= rating-col 3 4))
                                 (lib/filter (lib/= (lib/get-month created-at-col) 4 5 9))
                                 (lib/filter (lib/!= (lib/get-day created-at-col) 14 15 19))
                                 (lib/filter (lib/= (lib/get-day-of-week created-at-col :iso) 1 7))
                                 (lib/filter (lib/= (lib/get-year created-at-col) 2008)))]
          (is (=? {:structured_output
                   {:type "query"
                    :query_id string?
                    :result_columns
                    [{:field_id (str "q" query-id "-0")
                      :name "CREATED_AT"
                      :display_name "Created At: Week"
                      :type "datetime"
                      :database_type string?
                      :semantic_type "creation_timestamp"}
                     {:field_id (str "q" query-id "-1")
                      :name "CREATED_AT_2"
                      :display_name "Created At: Day"
                      :type "datetime"
                      :database_type string?
                      :semantic_type "creation_timestamp"}
                     {:field_id (str "q" query-id "-2")
                      :name "avg"
                      :display_name "Metrica"
                      :type "number"
                      :database_type missing-value
                      :semantic_type "score"}]}
                   :conversation_id conversation-id}
                  response))
          (is (tools.tu/query= expected-query actual-query)))))))

(deftest query-model-test
  (mt/with-premium-features #{:metabot-v3}
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.filters/query-model
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output {:type :query
                                           :query-id output
                                           :query {}
                                           :result-columns []}})]
        (let [fields [{:field_id "c2-8", :bucket "year-of-era"}
                      {:field_id "c2-9"}]
              filters [{:field_id "c2-7", :operation "number-greater-than", :value 50}
                       {:field_id "c2-3", :operation "equals", :values ["3" "4"]}
                       {:field_id "c2-5", :operation "not-equals", :values [3 4]}
                       {:field_id "c2-6", :operation "month-equals", :values [4 5 9]}
                       {:field_id "c2-6", :bucket "day-of-month" :operation "not-equals", :values [14 15 19]}
                       {:field_id "c2-6", :bucket "day-of-week" :operation "equals", :values [1 7]}
                       {:field_id "c2-6", :operation "year-equals", :value 2008}]
              aggregations [{:field_id "c2-10", :bucket "week", :function "count-distinct"}
                            {:field_id "c2-11", :function "sum"}]
              breakouts [{:field_id "c2-4", :field_granularity "week"}
                         {:field_id "c2-6", :field_granularity "day"}]
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/query-model"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:model_id     1
                                                                :fields       fields
                                                                :filters      filters
                                                                :aggregations aggregations
                                                                :group_by     breakouts}
                                              :conversation_id conversation-id})]
          (is (= {:structured_output {:type "query"
                                      :query_id output
                                      :query {}
                                      :result_columns []}
                  :conversation_id conversation-id}
                 response)))))))

(deftest query-model-empty-fields-and-no-summary-test
  (mt/with-premium-features #{:metabot-v3}
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output {:type :query
                  :query-id "query-id"
                  :query {:database 1
                          :type :query
                          :query {:source-table 1}}
                  :result-columns []}
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.filters/query-model
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output output})]
        (let [fields []
              filters [{:field_id "c2-7", :operation "number-greater-than", :value 50}]
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/query-model"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:model_id     1
                                                                :fields       fields
                                                                :filters      filters}
                                              :conversation_id conversation-id})]
          (is (= {:structured_output {:type "query"
                                      :query_id "query-id"
                                      :query {:database 1
                                              :type "query"
                                              :query {:source-table 1}}
                                      :result_columns []}
                  :conversation_id conversation-id}
                 response)))))))

(defn- int-sequence?
  [coll]
  (boolean (and (seqable? coll) (seq coll) (every? int? coll))))

(defn- string-sequence?
  [coll]
  (boolean (and (seqable? coll) (seq coll) (every? string? coll))))

(deftest answer-sources-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (mt/metadata-provider)
          model-source-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
          metric-source-query (-> model-source-query
                                  (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                                  (lib/breakout (lib/with-temporal-bucket
                                                  (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL metric-source-query)
                       :type :metric}
          model-data {:name "Model Model"
                      :description "Model desc"
                      :dataset_query (lib/->legacy-MBQL model-source-query)
                      :type :model}]
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Metabot Collection"}
                     :model/Card {metric-id :id} (assoc metric-data :collection_id collection-id)
                     :model/Card _ignored        (assoc metric-data :collection_id collection-id :archived true)
                     :model/Card _ignored        (assoc model-data :collection_id collection-id :archived true)
                     :model/Card _ignored        metric-data
                     :model/Card _ignored        model-data
                     :model/Card {model-id :id}  (assoc model-data  :collection_id collection-id)
                     :model/Metabot {metabot-eid :entity_id} {:name "Test Metabot"
                                                              :collection_id collection-id}]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [model-metric-base-query (lib/query mp (lib.metadata/card mp model-id))
                rating-column (m/find-first (comp #{"RATING"} :name) (lib/visible-columns model-metric-base-query))
                created-at-column (m/find-first (comp #{"CREATED_AT"} :name) (lib/breakoutable-columns model-metric-base-query))
                model-metric-source-query (-> model-metric-base-query
                                              (lib/aggregate (lib/avg rating-column))
                                              (lib/breakout (lib/with-temporal-bucket created-at-column :week)))
                model-metric-data {:name "Model metric"
                                   :description "Model metric desc"
                                   :dataset_query (lib/->legacy-MBQL model-metric-source-query)
                                   :type :metric}]
            (mt/with-temp [:model/Card {model-metric-id :id} (assoc model-metric-data :collection_id collection-id)]
              (testing "Calling with wrong metabot-id"
                (let [conversation-id (str (random-uuid))
                      ai-token (ai-session-token (str metabot-eid "-"))]
                  (mt/user-http-request :rasta :post 400 "ee/metabot-tools/answer-sources"
                                        {:request-options {:headers {"x-metabase-session" ai-token}}}
                                        {:conversation_id conversation-id})))
              (testing "Normal call"
                (let [conversation-id (str (random-uuid))
                      ai-token (ai-session-token metabot-eid)
                      response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/answer-sources"
                                                     {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                     {:metabot_id metabot-eid
                                                      :conversation_id conversation-id})
                      expected-fields
                      [{:name "ID", :display_name "ID", :type "number", :semantic_type "pk"}
                       {:name "EAN", :display_name "Ean", :type "string"}
                       {:name "TITLE", :display_name "Title", :type "string", :semantic_type "title"}
                       {:name "CATEGORY", :display_name "Category", :type "string", :semantic_type "category"}
                       {:name "VENDOR", :display_name "Vendor", :type "string", :semantic_type "company"}
                       {:name "PRICE", :display_name "Price", :type "number"}
                       {:name "RATING", :display_name "Rating", :type "number", :semantic_type "score"}
                       {:name "CREATED_AT", :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp"}]]
                  (is (=? {:structured_output
                           {:metrics [(-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :verified true
                                                 :default_time_dimension_field_id (format "c%d-%d" metric-id 7)
                                                 :queryable_dimensions
                                                 (map-indexed #(assoc %2 :field_id (format "c%d-%d" metric-id %1))
                                                              expected-fields)))
                                      (-> model-metric-data
                                          (select-keys [:name :description])
                                          (assoc :id model-metric-id
                                                 :type "metric"
                                                 :default_time_dimension_field_id (format "c%d-%d" model-metric-id 7)
                                                 :queryable_dimensions
                                                 (map-indexed #(assoc %2 :field_id (format "c%d-%d" model-metric-id %1))
                                                              expected-fields)))]
                            :models [(-> model-data
                                         (select-keys [:name :description :database_id])
                                         (assoc :id model-id
                                                :type "model"
                                                :verified true
                                                :database_engine (db-engine-name)
                                                :display_name "Model Model"
                                                :fields (map-indexed #(assoc %2 :field_id (format "c%d-%d" model-id %1))
                                                                     expected-fields)
                                                :metrics
                                                [{:id model-metric-id
                                                  :name "Model metric"
                                                  :description "Model metric desc"
                                                  :default_time_dimension_field_id (format "c%d-%d" model-metric-id 7)}]))]}
                           :conversation_id conversation-id}
                          response))))
              (testing "Minimal call"
                (let [conversation-id (str (random-uuid))
                      ai-token (ai-session-token metabot-eid)
                      response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/answer-sources"
                                                     {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                     {:metabot_id metabot-eid
                                                      :arguments {:with_model_fields                     false
                                                                  :with_model_metrics                    false
                                                                  :with_metric_default_temporal_breakout false
                                                                  :with_metric_queryable_dimensions      false}
                                                      :conversation_id conversation-id})]
                  (is (=? {:structured_output
                           {:metrics [(-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :verified true
                                                 :default_time_dimension_field_id nil
                                                 :queryable_dimensions missing-value))
                                      (-> model-metric-data
                                          (select-keys [:name :description])
                                          (assoc :id model-metric-id
                                                 :type "metric"
                                                 :verified true
                                                 :default_time_dimension_field_id nil
                                                 :queryable_dimensions missing-value))]
                            :models [(-> model-data
                                         (select-keys [:name :description :database_id])
                                         (assoc :id model-id
                                                :database_engine (db-engine-name)
                                                :display_name "Model Model"
                                                :verified true
                                                :type "model"
                                                :fields []
                                                :metrics (symbol "nil #_\"key is not present.\"")))]}
                           :conversation_id conversation-id}
                          response)))))))))))

(deftest ^:parallel get-current-user-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/with-temp [:model/Glossary _ {:term "asdf" :definition "Sales Team Performance"}]
      (let [conversation-id (str (random-uuid))
            ai-token (ai-session-token)
            response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-current-user"
                                           {:request-options {:headers {"x-metabase-session" ai-token}}}
                                           {:conversation_id conversation-id})]
        (is (=? {:structured_output {:id (mt/user->id :rasta)
                                     :type "user"
                                     :name "Rasta Toucan"
                                     :email_address "rasta@metabase.com"
                                     :glossary {(keyword "asdf") "Sales Team Performance"}}
                 :conversation_id conversation-id}
                response))))))

(deftest get-dashboard-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [dash-data {:name "dashing dash", :description "dash description"}]
      (mt/with-temp [:model/Dashboard {dash-id :id} dash-data]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [conversation-id (str (random-uuid))
                ai-token (ai-session-token)
                response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-dashboard-details"
                                               {:request-options {:headers {"x-metabase-session" ai-token}}}
                                               {:arguments {:dashboard_id dash-id}
                                                :conversation_id conversation-id})]
            (is (=? {:structured_output (assoc dash-data :id dash-id, :type "dashboard" :verified true)
                     :conversation_id conversation-id}
                    response))))))))

(deftest get-metric-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (mt/metadata-provider)
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :orders :subtotal))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :orders :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL source-query)
                       :type :metric}
          expected-fields
          [{:name "ID" :display_name "ID", :type "number", :semantic_type "pk"}
           {:name "USER_ID" :display_name "User ID", :type "number", :semantic_type "fk"}
           {:name "PRODUCT_ID" :display_name "Product ID", :type "number", :semantic_type "fk"}
           {:name "SUBTOTAL" :display_name "Subtotal", :type "number"}
           {:name "TAX" :display_name "Tax", :type "number"}
           {:name "TOTAL" :display_name "Total", :type "number"}
           {:name "DISCOUNT" :display_name "Discount", :type "number", :semantic_type "discount"}
           {:name "CREATED_AT" :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp"}
           {:name "QUANTITY" :display_name "Quantity", :type "number", :semantic_type "quantity", :field_values int-sequence?}
           {:name "ID" :display_name "ID", :type "number", :semantic_type "pk", :table_reference "User"}
           {:name "ADDRESS" :display_name "Address", :type "string", :table_reference "User"}
           {:name "EMAIL" :display_name "Email", :type "string", :semantic_type "email", :table_reference "User"}
           {:name "PASSWORD" :display_name "Password", :type "string", :table_reference "User"}
           {:name "NAME" :display_name "Name", :type "string", :semantic_type "name", :table_reference "User"}
           {:name "CITY" :display_name "City", :type "string", :semantic_type "city", :table_reference "User"}
           {:name "LONGITUDE" :display_name "Longitude", :type "number", :semantic_type "longitude", :table_reference "User"}
           {:name "STATE" :display_name "State", :type "string", :semantic_type "state", :table_reference "User"}
           {:name "SOURCE" :display_name "Source", :type "string", :semantic_type "source", :table_reference "User"}
           {:name "BIRTH_DATE" :display_name "Birth Date", :type "date", :table_reference "User"}
           {:name "ZIP" :display_name "Zip", :type "string", :table_reference "User"}
           {:name "LATITUDE" :display_name "Latitude", :type "number", :semantic_type "latitude", :table_reference "User"}
           {:name "CREATED_AT" :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp", :table_reference "User"}
           {:name "ID" :display_name "ID", :type "number", :semantic_type "pk", :table_reference "Product"}
           {:name "EAN" :display_name "Ean", :type "string", :field_values string-sequence?, :table_reference "Product"}
           {:name "TITLE" :display_name "Title", :type "string"
            :semantic_type "title"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "CATEGORY" :display_name "Category"
            :type "string"
            :semantic_type "category"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "VENDOR" :display_name "Vendor" :type "string"
            :semantic_type "company"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "PRICE" :display_name "Price" :type "number" :table_reference "Product"}
           {:name "RATING" :display_name "Rating" :type "number" :semantic_type "score" :table_reference "Product"}
           {:name "CREATED_AT" :display_name "Created At" :type "datetime" :semantic_type "creation_timestamp" :table_reference "Product"}]
          ai-token (ai-session-token)
          conversation-id (str (random-uuid))
          request (fn [arguments]
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-metric-details"
                                          {:request-options {:headers {"x-metabase-session" ai-token}}}
                                          {:arguments arguments
                                           :conversation_id conversation-id}))]
      (mt/with-temp [:model/Card {metric-id :id} metric-data]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (testing "Normal call"
            (is (=? {:structured_output (-> metric-data
                                            (select-keys [:name :display_name :description])
                                            (assoc :id metric-id
                                                   :type "metric"
                                                   :verified true
                                                   :default_time_dimension_field_id (format "c%d-%d" metric-id 7)
                                                   :queryable_dimensions
                                                   (map-indexed #(assoc %2 :field_id (format "c%d-%d" metric-id %1))
                                                                expected-fields)))
                     :conversation_id conversation-id}
                    (request {:metric_id metric-id}))))
          (testing "Without field values"
            (is (=? {:structured_output (-> metric-data
                                            (select-keys [:name :display_name :description])
                                            (assoc :id metric-id
                                                   :type "metric"
                                                   :verified true
                                                   :default_time_dimension_field_id (format "c%d-%d" metric-id 7)
                                                   :queryable_dimensions
                                                   (map-indexed #(assoc %2
                                                                        :field_id (format "c%d-%d" metric-id %1)
                                                                        :field_values missing-value)
                                                                expected-fields)))
                     :conversation_id conversation-id}
                    (request {:metric_id         metric-id
                              :with_field_values false}))))
          (testing "Default time dimension only"
            (is (=? {:structured_output (-> metric-data
                                            (select-keys [:name :display_name :description])
                                            (assoc :id metric-id
                                                   :type "metric"
                                                   :verified true
                                                   :default_time_dimension_field_id (format "c%d-%d" metric-id 7)
                                                   :queryable_dimensions missing-value))
                     :conversation_id conversation-id}
                    (request {:metric_id                 metric-id
                              :with_queryable_dimensions false}))))
          (testing "Minimal call"
            (is (=? {:structured_output (-> metric-data
                                            (select-keys [:name :display_name :description])
                                            (assoc :id metric-id
                                                   :type "metric"
                                                   :verified true
                                                   :default_time_dimension_field_id nil
                                                   :queryable_dimensions missing-value))
                     :conversation_id conversation-id}
                    (request {:metric_id                      metric-id
                              :with_default_temporal_breakout false
                              :with_queryable_dimensions      false})))))))))

(deftest ^:parallel get-query-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (mt/metadata-provider)
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          query (lib/->legacy-MBQL source-query)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-query-details"
                                         {:request-options {:headers {"x-metabase-session" ai-token}}}
                                         {:arguments {:query query}
                                          :conversation_id conversation-id})
          generated-id (-> response :structured_output :query_id)]
      (is (=? {:structured_output {:type "query"
                                   :query_id string?
                                   :query map?
                                   :result_columns
                                   [{:field_id (str "q" generated-id "-0"),
                                     :name "CREATED_AT",
                                     :display_name "Created At: Week",
                                     :type "datetime"
                                     :database_type string?}
                                    {:field_id (str "q" generated-id "-1"),
                                     :name "avg",
                                     :display_name "Average of Rating",
                                     :type "number"
                                     :database_type missing-value}]}
               :conversation_id conversation-id}
              response))
      ;; Verify the query is normalized (supports both MBQL v4 and v5)
      (is (= (mt/id) (get-in response [:structured_output :query :database]))))))

(deftest get-report-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (mt/metadata-provider)
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib.metadata/field mp (mt/id :products :vendor)))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          question-data {:name "Question?"
                         :description "Descriptive?"
                         :dataset_query (lib/->legacy-MBQL source-query)
                         :type :question}]
      (mt/with-temp [:model/Card {question-id :id} question-data]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [conversation-id (str (random-uuid))
                ai-token (ai-session-token)
                arguments {:report_id question-id}
                request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-report-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))
                expected-fields [{:name "VENDOR"
                                  :display_name "Vendor"
                                  :type "string"
                                  :semantic_type "company"
                                  :database_type string?
                                  :field_values string-sequence?}
                                 {:name "CREATED_AT"
                                  :display_name "Created At: Week"
                                  :type "datetime"
                                  :semantic_type "creation_timestamp"
                                  :database_type string?}
                                 {:name "avg"
                                  :display_name "Average of Rating"
                                  :type "number"
                                  :semantic_type "score"
                                  :database_type missing-value}]]
            (testing "Normal call"
              (is (=? {:structured_output (-> question-data
                                              (select-keys [:name :description :database_id])
                                              (assoc :id question-id
                                                     :type "question"
                                                     :verified true
                                                     :result_columns
                                                     (map-indexed #(assoc %2 :field_id (format "c%d-%d" question-id %1))
                                                                  expected-fields)))
                       :conversation_id conversation-id}
                      (request arguments))))
            (testing "Without field values"
              (is (=? {:structured_output (-> question-data
                                              (select-keys [:name :description])
                                              (assoc :id question-id
                                                     :type "question"
                                                     :result_columns
                                                     (map-indexed #(assoc %2
                                                                          :field_id (format "c%d-%d" question-id %1)
                                                                          :field_values missing-value)
                                                                  expected-fields)))
                       :conversation_id conversation-id}
                      (request (assoc arguments :with_field_values false)))))
            (testing "Without fields"
              (is (=? {:structured_output (-> question-data
                                              (select-keys [:name :description])
                                              (assoc :id question-id
                                                     :type "question"
                                                     :verified true
                                                     :result_columns []))
                       :conversation_id conversation-id}
                      (request (assoc arguments :with_fields false)))))))))))

;; Helper function to set up model test fixtures
(defn- model-test-fixtures []
  (let [mp (lib-be/application-database-metadata-provider (mt/id))
        source-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        model-data {:name "Model Model"
                    :description "Model desc"
                    :dataset_query (lib/->legacy-MBQL source-query)
                    :type :model
                    :database_id (mt/id)}
        metric-data {:name "Metric"
                     :description "Model based metric"
                     :type :metric}
        ;; Core fields returned by the model (lib/returned-columns)
        expected-core-fields
        [{:name "ID", :display_name "ID", :type "number", :semantic_type "pk"}
         {:name "USER_ID", :display_name "User ID", :type "number", :semantic_type "fk"}
         {:name "PRODUCT_ID", :display_name "Product ID", :type "number", :semantic_type "fk"}
         {:name "SUBTOTAL", :display_name "Subtotal", :type "number"}
         {:name "TAX", :display_name "Tax", :type "number"}
         {:name "TOTAL", :display_name "Total", :type "number"}
         {:name "DISCOUNT", :display_name "Discount", :type "number", :semantic_type "discount"}
         {:name "CREATED_AT", :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp"}
         {:name "QUANTITY", :display_name "Quantity", :type "number", :semantic_type "quantity", :field_values int-sequence?}]
        ;; Related tables via FK (order matches what related-tables function returns)
        expected-related-tables
        [{:type "table"
          :id (mt/id :people)
          :name "PEOPLE"
          :display_name "People"
          :database_id (mt/id)
          :database_schema "PUBLIC"
          :related_by "USER_ID"
          :fields
          [{:name "ID", :display_name "ID", :type "number", :semantic_type "pk"}
           {:name "ADDRESS", :display_name "Address", :type "string"}
           {:name "EMAIL", :display_name "Email", :type "string", :semantic_type "email"}
           {:name "PASSWORD", :display_name "Password", :type "string"}
           {:name "NAME", :display_name "Name", :type "string", :semantic_type "name"}
           {:name "CITY", :display_name "City", :type "string", :semantic_type "city"}
           {:name "LONGITUDE", :display_name "Longitude", :type "number", :semantic_type "longitude"}
           {:name "STATE", :display_name "State", :type "string", :semantic_type "state"}
           {:name "SOURCE", :display_name "Source", :type "string", :semantic_type "source"}
           {:name "BIRTH_DATE", :display_name "Birth Date", :type "date"}
           {:name "ZIP", :display_name "Zip", :type "string"}
           {:name "LATITUDE", :display_name "Latitude", :type "number", :semantic_type "latitude"}
           {:name "CREATED_AT", :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp"}]}
         {:type "table"
          :id (mt/id :products)
          :name "PRODUCTS"
          :display_name "Products"
          :database_id (mt/id)
          :database_schema "PUBLIC"
          :related_by "PRODUCT_ID"
          :fields
          [{:name "ID", :display_name "ID", :type "number", :semantic_type "pk"}
           {:name "EAN", :display_name "Ean", :type "string", :field_values string-sequence?}
           {:name "TITLE", :display_name "Title", :type "string", :semantic_type "title", :field_values string-sequence?}
           {:name "CATEGORY", :display_name "Category", :type "string", :semantic_type "category", :field_values string-sequence?}
           {:name "VENDOR", :display_name "Vendor", :type "string", :semantic_type "company", :field_values string-sequence?}
           {:name "PRICE", :display_name "Price", :type "number"}
           {:name "RATING", :display_name "Rating", :type "number", :semantic_type "score"}
           {:name "CREATED_AT", :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp"}]}]]
    {:model-data model-data
     :metric-data metric-data
     :expected-core-fields expected-core-fields
     :expected-related-tables expected-related-tables}))

(defn- add-field-ids
  "Add field_id to fields using map-indexed. Optionally apply transform-fn to each field."
  ([prefix-template fields]
   (add-field-ids prefix-template fields identity))
  ([prefix-template fields transform-fn]
   (map-indexed #(transform-fn (assoc %2 :field_id (format prefix-template %1))) fields)))

(deftest get-model-details-basic-test
  (mt/with-premium-features #{:metabot-v3}
    (let [{:keys [model-data metric-data expected-core-fields expected-related-tables]} (model-test-fixtures)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {metric-id :id} (assoc metric-data :dataset_query
                                                        (mt/mbql-query orders
                                                          {:source-table (str "card__" model-id)
                                                           :aggregation [[:count]]
                                                           :breakout [!month.*created_at *quantity]}))]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))]
            (doseq [arguments [{:model_id model-id}
                               {:table_id (str "card__" model-id)}]]
              (testing "Normal request"
                (is (=? {:structured_output (-> model-data
                                                (select-keys [:name :description :database_id])
                                                (assoc :id model-id
                                                       :type "model"
                                                       :database_engine (db-engine-name)
                                                       :display_name "Model Model"
                                                       :verified true
                                                       :fields (add-field-ids (format "c%d-%%d" model-id) expected-core-fields)
                                                       :related_tables
                                                       [(-> (first expected-related-tables)
                                                            (update :fields (fn [fields]
                                                                              (map-indexed #(assoc %2 :field_id (format "c%d-%d" model-id (+ 9 %1)))
                                                                                           fields))))
                                                        (-> (second expected-related-tables)
                                                            (update :fields (fn [fields]
                                                                              (map-indexed #(assoc %2 :field_id (format "c%d-%d" model-id (+ 22 %1)))
                                                                                           fields))))]
                                                       :metrics [(assoc metric-data
                                                                        :id metric-id
                                                                        :type "metric"
                                                                        :default_time_dimension_field_id (format "c%d-7" metric-id))]))
                         :conversation_id conversation-id}
                        (request arguments)))))))))))

(deftest get-model-details-without-field-values-test
  (mt/with-premium-features #{:metabot-v3}
    (let [{:keys [model-data metric-data expected-core-fields expected-related-tables]} (model-test-fixtures)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {metric-id :id} (assoc metric-data :dataset_query
                                                        (mt/mbql-query orders
                                                          {:source-table (str "card__" model-id)
                                                           :aggregation [[:count]]
                                                           :breakout [!month.*created_at *quantity]}))]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))
                arguments {:model_id model-id}]
            (testing "Without field values"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description :database_id])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :database_engine (db-engine-name)
                                                     :display_name "Model Model"
                                                     :verified true
                                                     :fields
                                                     (add-field-ids (format "c%d-%%d" model-id) expected-core-fields
                                                                    #(assoc % :field_values missing-value))
                                                     :related_tables
                                                     [(-> (first expected-related-tables)
                                                          (update :fields (fn [fields]
                                                                            (map-indexed #(assoc %2
                                                                                                 :field_id (format "c%d-%d" model-id (+ 9 %1))
                                                                                                 :field_values missing-value)
                                                                                         fields))))
                                                      (-> (second expected-related-tables)
                                                          (update :fields (fn [fields]
                                                                            (map-indexed #(assoc %2
                                                                                                 :field_id (format "c%d-%d" model-id (+ 22 %1))
                                                                                                 :field_values missing-value)
                                                                                         fields))))]
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id (format "c%d-7" metric-id))]))
                       :conversation_id conversation-id}
                      (request (assoc arguments :with_field_values false)))))))))))

(deftest get-model-details-without-fields-test
  (mt/with-premium-features #{:metabot-v3}
    (let [{:keys [model-data metric-data expected-related-tables]} (model-test-fixtures)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {metric-id :id} (assoc metric-data :dataset_query
                                                        (mt/mbql-query orders
                                                          {:source-table (str "card__" model-id)
                                                           :aggregation [[:count]]
                                                           :breakout [!month.*created_at *quantity]}))]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))
                arguments {:model_id model-id}]
            (testing "Without fields"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description :database_id])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :database_engine (db-engine-name)
                                                     :display_name "Model Model"
                                                     :verified true
                                                     :fields []
                                                     :related_tables
                                                     (map #(assoc % :fields []) expected-related-tables)
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id (format "c%d-7" metric-id))]))
                       :conversation_id conversation-id}
                      (request (assoc arguments :with_fields false)))))))))))

(deftest get-model-details-without-metric-temporal-breakout-test
  (mt/with-premium-features #{:metabot-v3}
    (let [{:keys [model-data metric-data expected-related-tables]} (model-test-fixtures)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {metric-id :id} (assoc metric-data :dataset_query
                                                        (mt/mbql-query orders
                                                          {:source-table (str "card__" model-id)
                                                           :aggregation [[:count]]
                                                           :breakout [!month.*created_at *quantity]}))]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))
                arguments {:model_id model-id}]
            (testing "Without fields and metric default time dimension"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description :database_id])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :database_engine (db-engine-name)
                                                     :display_name "Model Model"
                                                     :verified true
                                                     :fields []
                                                     :related_tables
                                                     (map #(assoc % :fields []) expected-related-tables)
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id nil)]))
                       :conversation_id conversation-id}
                      (request (assoc arguments
                                      :with_fields false
                                      :with_metric_default_temporal_breakout false)))))))))))

(deftest get-model-details-without-metrics-test
  (mt/with-premium-features #{:metabot-v3}
    (let [{:keys [model-data expected-related-tables]} (model-test-fixtures)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {_metric-id :id} (assoc (:metric-data (model-test-fixtures)) :dataset_query
                                                         (mt/mbql-query orders
                                                           {:source-table (str "card__" model-id)
                                                            :aggregation [[:count]]
                                                            :breakout [!month.*created_at *quantity]}))]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))
                arguments {:model_id model-id}]
            (testing "Without fields and metrics"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description :database_id])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :database_engine (db-engine-name)
                                                     :display_name "Model Model"
                                                     :verified true
                                                     :fields []
                                                     :related_tables
                                                     (map #(assoc % :fields []) expected-related-tables)
                                                     :metrics missing-value))
                       :conversation_id conversation-id}
                      (request (assoc arguments
                                      :with_fields false
                                      :with_metrics false)))))))))))

(deftest get-model-details-without-related-tables-test
  (mt/with-premium-features #{:metabot-v3}
    (let [{:keys [model-data]} (model-test-fixtures)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {_metric-id :id} (assoc (:metric-data (model-test-fixtures)) :dataset_query
                                                         (mt/mbql-query orders
                                                           {:source-table (str "card__" model-id)
                                                            :aggregation [[:count]]
                                                            :breakout [!month.*created_at *quantity]}))]
        (with-redefs [metabot-v3.tools.entity-details/verified-review? (constantly true)]
          (let [request (fn [arguments]
                          (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                                {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                {:arguments arguments
                                                 :conversation_id conversation-id}))]
            (testing "Without related tables"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description :database_id])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :database_engine (db-engine-name)
                                                     :display_name "Model Model"
                                                     :verified true
                                                     :fields []
                                                     :related_tables missing-value
                                                     :metrics missing-value))
                       :conversation_id conversation-id}
                      (request {:model_id model-id
                                :with_fields false
                                :with_related_tables false
                                :with_metrics false}))))))))))

(deftest field-values-auto-populate-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/delete! :model/FieldValues :field_id [:in (t2/select-fn-vec :id :model/Field :table_id (mt/id :orders))])
    (let [table-id (mt/id :orders)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/field-values"
                                         {:request-options {:headers {"x-metabase-session" ai-token}}}
                                         {:arguments
                                          {:entity_type "table"
                                           :entity_id   table-id
                                           :field_id    (-> table-id
                                                            metabot-v3.tools.u/table-field-id-prefix
                                                            (str 8)) ; quantity
                                           :limit       15}
                                          :conversation_id conversation-id})]
      (is (=? {:structured_output {:values int-sequence?}
               :conversation_id conversation-id}
              response)))))

(deftest get-table-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [table-id (mt/id :orders)
          metric-data {:name "Metric"
                       :description "Model based metric"
                       :type :metric}
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          expected-fields
          [{:name "ID", :display_name "ID", :type "number", :semantic_type "pk"}
           {:name "USER_ID", :display_name "User ID", :type "number", :semantic_type "fk"}
           {:name "PRODUCT_ID", :display_name "Product ID", :type "number", :semantic_type "fk"}
           {:name "SUBTOTAL", :display_name "Subtotal", :type "number"}
           {:name "TAX", :display_name "Tax", :type "number"}
           {:name "TOTAL", :display_name "Total", :type "number"}
           {:name "DISCOUNT", :display_name "Discount", :type "number", :semantic_type "discount"}
           {:name "CREATED_AT", :display_name "Created At", :type "datetime", :semantic_type "creation_timestamp"}
           {:name "QUANTITY", :display_name "Quantity", :type "number", :semantic_type "quantity", :field_values int-sequence?}]
          request (fn [arguments]
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                          {:request-options {:headers {"x-metabase-session" ai-token}}}
                                          {:arguments arguments
                                           :conversation_id conversation-id}))]
      (mt/with-temp [:model/Card {metric-id :id} (assoc metric-data :dataset_query
                                                        (mt/mbql-query orders
                                                          {:source-table table-id
                                                           :aggregation [[:count]]
                                                           :breakout [!month.created_at $quantity]}))]
        (testing "Normal call"
          (doseq [arg-id [table-id (str table-id)]]
            (is (=? {:structured_output {:name "ORDERS"
                                         :display_name "Orders"
                                         :database_id (mt/id)
                                         :database_engine (db-engine-name)
                                         :database_schema "PUBLIC"
                                         :id table-id
                                         :type "table"
                                         :fields (map-indexed #(assoc %2 :field_id (format "t%d-%d" table-id %1))
                                                              expected-fields)
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id (format "c%d-7" metric-id))]}
                     :conversation_id conversation-id}
                    (request {:table_id arg-id})))))
        (let [arguments {:table_id table-id}]
          (testing "Without field values"
            (is (=? {:structured_output {:name "ORDERS"
                                         :display_name "Orders"
                                         :database_id (mt/id)
                                         :database_engine (db-engine-name)
                                         :database_schema "PUBLIC"
                                         :id table-id
                                         :type "table"
                                         :fields (map-indexed #(assoc %2
                                                                      :field_id (format "t%d-%d" table-id %1)
                                                                      :field_values missing-value)
                                                              expected-fields)
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id (format "c%d-7" metric-id))]}
                     :conversation_id conversation-id}
                    (request (assoc arguments :with_field_values false)))))
          (testing "Without fields"
            (is (=? {:structured_output {:name "ORDERS"
                                         :display_name "Orders"
                                         :database_id (mt/id)
                                         :database_engine (db-engine-name)
                                         :database_schema "PUBLIC"
                                         :id table-id
                                         :type "table"
                                         :fields []
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id (format "c%d-7" metric-id))]}
                     :conversation_id conversation-id}
                    (request (assoc arguments :with_fields false)))))
          (testing "Without fields and metric default time dimension"
            (is (=? {:structured_output {:name "ORDERS"
                                         :display_name "Orders"
                                         :database_id (mt/id)
                                         :database_engine (db-engine-name)
                                         :database_schema "PUBLIC"
                                         :id table-id
                                         :type "table"
                                         :fields []
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id nil)]}
                     :conversation_id conversation-id}
                    (request (assoc arguments
                                    :with_fields false
                                    :with_metric_default_temporal_breakout false)))))
          (testing "Without fields and metrics"
            (is (=? {:structured_output {:name "ORDERS"
                                         :display_name "Orders"
                                         :database_id (mt/id)
                                         :database_engine (db-engine-name)
                                         :database_schema "PUBLIC"
                                         :id table-id
                                         :type "table"
                                         :fields []
                                         :metrics missing-value}
                     :conversation_id conversation-id}
                    (request (assoc arguments
                                    :with_fields false
                                    :with_metrics false))))))))))

(deftest get-table-details-database-type-test
  ;; get-table-details-test validates other metadata, this test focuses on :database_type.
  (mt/with-premium-features #{:metabot-v3}
    (let [table-id (mt/id :orders)
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          expected-fields-with-h2-db-types
          [{:name "ID",         :type "number",   :database_type "bigint"}
           {:name "USER_ID",    :type "number",   :database_type "integer"}
           {:name "PRODUCT_ID", :type "number",   :database_type "integer"}
           {:name "SUBTOTAL",   :type "number",   :database_type "double_precision"}
           {:name "TAX",        :type "number",   :database_type "double_precision"}
           {:name "TOTAL",      :type "number",   :database_type "double_precision"}
           {:name "DISCOUNT",   :type "number",   :database_type "double_precision"}
           {:name "CREATED_AT", :type "datetime", :database_type "timestamp_with_time_zone"}
           {:name "QUANTITY",   :type "number",   :database_type "integer"}]
          request (fn [arguments]
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                          {:request-options {:headers {"x-metabase-session" ai-token}}}
                                          {:arguments arguments
                                           :conversation_id conversation-id}))
          expected-fields (cond->> expected-fields-with-h2-db-types
                            ;; For non-h2 dbs, just verify we get some string?. We're sanity checking the result, not
                            ;; exhaustively testing :database_type column metadata.
                            (not= "h2" (db-engine-name)) (mapv #(assoc % :database_type string?)))]
      (is (=? {:structured_output {:name "ORDERS"
                                   :display_name "Orders"
                                   :database_id (mt/id)
                                   :database_engine (db-engine-name)
                                   :database_schema "PUBLIC"
                                   :id table-id
                                   :type "table"
                                   :fields (map-indexed #(assoc %2 :field_id (format "t%d-%d" table-id %1))
                                                        expected-fields)}
               :conversation_id conversation-id}
              (request {:table_id table-id}))))))

(deftest get-table-details-related-tables-test
  (mt/with-premium-features #{:metabot-v3}
    (let [conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          request (fn [arguments]
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                          {:request-options {:headers {"x-metabase-session" ai-token}}}
                                          {:arguments arguments
                                           :conversation_id conversation-id}))]
      (testing "Normal call includes related_tables by default"
        (let [response (request {:table_id (mt/id :orders)})
              related-tables (get-in response [:structured_output :related_tables])]
          (is (= (sort [(mt/id :products) (mt/id :people)])
                 (sort (map :id related-tables)))
              "Should include tables related to Orders by foreign keys")
          (is (every? #(not (contains? % :related_tables)) related-tables)
              "Related tables should not have nested related_tables")))
      (testing "Without related tables"
        (is (nil? (-> (request {:table_id (mt/id :orders)
                                :with_related_tables false})
                      (get-in [:structured_output :related_tables]))))))))

(deftest get-table-details-related-by-test
  (mt/with-premium-features #{:metabot-v3}
    (testing "Related tables include related_by field indicating the FK field name"
      (let [conversation-id (str (random-uuid))
            ai-token (ai-session-token)
            response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                           {:request-options {:headers {"x-metabase-session" ai-token}}}
                                           {:arguments {:table_id (mt/id :orders)}
                                            :conversation_id conversation-id})
            related-tables (get-in response [:structured_output :related_tables])
            people-table (first (filter #(= (:id %) (mt/id :people)) related-tables))
            products-table (first (filter #(= (:id %) (mt/id :products)) related-tables))]
        (testing "People table is related by USER_ID FK"
          (is (= "USER_ID" (:related_by people-table))))
        (testing "Products table is related by PRODUCT_ID FK"
          (is (= "PRODUCT_ID" (:related_by products-table))))))))

(deftest get-transforms-test
  (mt/with-premium-features #{:metabot-v3 :transforms}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))]
      (mt/with-temp [:model/Transform t1 {:name "People Transform"
                                          :description "Simple select on People table"
                                          :source {:type "query"
                                                   :query (lib/native-query (mt/metadata-provider) "SELECT * FROM PEOPLE")}
                                          :target {:type "table"
                                                   :name "t1_table"}}
                     :model/Transform t2 {:name "MBQL Transform"
                                          :description "Simple MQBL query on Products table"
                                          :source {:type "query"
                                                   :query (mt/mbql-query products)}
                                          :target {:type "table"
                                                   :name "t2_table"}}
                     :model/Transform t3 {:name "Python Transform"
                                          :description "Simple python transform"
                                          :source {:type "python"
                                                   :body "print('hello world')"
                                                   :source-tables {}}
                                          :target {:type "table"
                                                   :name "t2_table"}}]
        (testing "With insufficient permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-transforms"
                                       {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                       {:conversation_id conversation-id}))))
        (testing "With superuser permissions"
          (is (=? {:structured_output [(mt/obj->json->obj (select-keys t1 [:id :entity_id :name :description :source]))
                                         ;; note: t2 not included because it's a (non-native) MBQL query
                                       (mt/obj->json->obj (select-keys t3 [:id :entity_id :name :description :source]))]
                   :conversation_id conversation-id}
                  (-> (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-transforms"
                                            {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                            {:conversation_id conversation-id})
                      (update :structured_output (fn [output]
                                                   (->> output
                                                        (filter #(#{(:id t1) (:id t2) (:id t3)} (:id %)))
                                                        (sort-by :id))))))))))))

(deftest get-transform-test
  (mt/with-premium-features #{:metabot-v3 :transforms}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))]
      (mt/with-temp [:model/Transform t1 {:name "People Transform"
                                          :description "Simple select on People table"
                                          :source {:type "query"
                                                   :query (mt/native-query {:query "SELECT * FROM PEOPLE"})}
                                          :target {:type "table"
                                                   :name "t1_table"}}
                     :model/Transform t2 {:name "Python Transform"
                                          :description "Simple Python transform"
                                          :source {:type "python"
                                                   :body "print('hello world')"
                                                   :source-tables {}}
                                          :target {:type "table"
                                                   :name "t2_table"
                                                   :database (mt/id)}}]
        (testing "With insufficient permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-transform-details"
                                       {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                       {:arguments {:transform_id (:id t1)}
                                        :conversation_id conversation-id}))))
        (testing "With non-existent transform"
          (is (= "Not found."
                 (mt/user-http-request :rasta :post 404 "ee/metabot-tools/get-transform-details"
                                       {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                       {:arguments {:transform_id (+ 10000 (:id t2))}
                                        :conversation_id conversation-id}))))
        (testing "With superuser permissions"
          (doseq [transform [t1 t2]]
            (testing (:name transform)
              (is (=? {:structured_output (mt/obj->json->obj (select-keys transform [:id :entity_id :name :description :source :target]))
                       :conversation_id conversation-id}
                      (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-transform-details"
                                            {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                            {:arguments {:transform_id (:id transform)}
                                             :conversation_id conversation-id}))))))))))

(deftest get-transform-python-library-details-test
  (mt/with-premium-features #{:metabot-v3 :python-transforms}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))
          saved-python-library (t2/select-one :model/PythonLibrary :path "common.py")]
      (when (seq saved-python-library)
        (t2/delete! :model/PythonLibrary))
      (try
        (testing "With no Python library present"
          (is (= "Not found."
                 (mt/user-http-request :rasta :post 404 "ee/metabot-tools/get-transform-python-library-details"
                                       {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                       {:arguments {:path "common.py"}
                                        :conversation_id conversation-id}))))
        (mt/with-temp [:model/PythonLibrary lib1 {:path "common.py"
                                                  :source "def hello():\n    return 'world'"}]
          (testing "With insufficient permissions"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-transform-python-library-details"
                                         {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                         {:arguments {:path (:path lib1)}
                                          :conversation_id conversation-id}))))
          (testing "With non-existent library path"
            (is (=? {:allowed-paths ["common.py"]
                     :message "Invalid library path. Only 'common' is currently supported."
                     :path "nonexistent.py"}
                    (mt/user-http-request :rasta :post 400 "ee/metabot-tools/get-transform-python-library-details"
                                          {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                          {:arguments {:path "nonexistent.py"}
                                           :conversation_id conversation-id}))))
          (testing "With superuser permissions"
            (is (=? {:structured_output (select-keys lib1 [:source :path :created_at :updated_at])
                     :conversation_id conversation-id}
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-transform-python-library-details"
                                          {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                          {:arguments {:path (:path lib1)}
                                           :conversation_id conversation-id})))))
        (finally
          (when (seq saved-python-library)
            (t2/insert! :model/PythonLibrary saved-python-library)))))))

(deftest get-snippets-test
  (mt/with-premium-features #{:metabot-v3}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)]
      (mt/with-temp [:model/NativeQuerySnippet snippet-1 {:content     "1"
                                                          :name        "snippet_1"
                                                          :description "great snippet 1"}
                     :model/NativeQuerySnippet snippet-2 {:content     "2"
                                                          :name        "snippet_2"}]
        (testing "No snippets visible without data perms"
          (is (=? {:structured_output []
                   :conversation_id conversation-id}
                  (-> (mt/with-no-data-perms-for-all-users!
                        (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-snippets"
                                              {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                              {:conversation_id conversation-id}))
                      (update :structured_output (fn [output]
                                                   (filter #(#{(:id snippet-1) (:id snippet-2)} (:id %))
                                                           output)))))))
        (testing "All snippets visible with full data perms"
          (is (=? {:structured_output [(select-keys snippet-1 [:id :name :description])
                                       (select-keys snippet-2 [:id :name :description])]
                   :conversation_id conversation-id}
                  (-> (mt/with-full-data-perms-for-all-users!
                        (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-snippets"
                                              {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                              {:conversation_id conversation-id}))
                      (update :structured_output (fn [output]
                                                   (filter #(#{(:id snippet-1) (:id snippet-2)} (:id %))
                                                           output)))))))))))

(deftest get-snippet-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)]
      (mt/with-temp [:model/NativeQuerySnippet snippet-1 {:content     "1"
                                                          :name        "snippet_1"
                                                          :description "great snippet 1"}
                     :model/NativeQuerySnippet _         {:content     "2"
                                                          :name        "snippet_2"}]
        (testing "400 for invalid args"
          (is (=? {:errors
                   {:arguments {:snippet_id string?}},
                   :specific-errors {:arguments {:snippet_id ["should be an integer, received: nil"]}}}
                  (mt/user-http-request :rasta :post 400 "ee/metabot-tools/get-snippet-details"
                                        {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                        {:arguments {:snippet_id nil}
                                         :conversation_id conversation-id}))))
        (testing "404 returned for non-existent snippet"
          (is (= "Not found."
                 (let [max-snippet-id (t2/select-one-fn :max-id [:model/NativeQuerySnippet [:%max.id :max-id]])]
                   (mt/user-http-request :rasta :post 404 "ee/metabot-tools/get-snippet-details"
                                         {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                         {:arguments {:snippet_id (inc max-snippet-id)}
                                          :conversation_id conversation-id})))))
        (testing "403 returned for missing data perms"
          (is (= "You don't have permissions to do that."
                 (mt/with-no-data-perms-for-all-users!
                   (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-snippet-details"
                                         {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                         {:arguments {:snippet_id (:id snippet-1)}
                                          :conversation_id conversation-id})))))
        (testing "Snippet details returned with sufficient data perms"
          (is (=? {:structured_output (select-keys snippet-1 [:id :name :description :content])
                   :conversation_id conversation-id}
                  (mt/with-full-data-perms-for-all-users!
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-snippet-details"
                                          {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                          {:arguments {:snippet_id (:id snippet-1)}
                                           :conversation_id conversation-id})))))))))

(deftest check-transform-dependencies-test
  ;; This is just a quick sanity check for the API endpoint. The function powering this endpoint is tested more
  ;; thoroughly in metabase-enterprise.metabot-v3.tools.dependencies-test.
  (mt/with-premium-features #{:metabot-v3 :transforms :dependencies}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))
          people-query (lib/native-query (mt/metadata-provider) "SELECT * FROM people")
          modified-source {:type "query" :query people-query}]
      (metabot-v3.tools.dependencies-test/with-dependent-transforms! [transform1-id _]
        (testing "400 for invalid args"
          (is (=? {:errors
                   {:arguments {:source string?}},
                   :specific-errors {:arguments {:source ["missing required key, received: nil"]}}}
                  (mt/user-http-request :rasta :post 400 "ee/metabot-tools/check-transform-dependencies"
                                        {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                        {:arguments {:transform_id 1}
                                         :conversation_id conversation-id}))))
        (testing "403 for insufficient permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/metabot-tools/check-transform-dependencies"
                                       {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                       {:arguments {:transform_id transform1-id
                                                    :source modified-source}
                                        :conversation_id conversation-id}))))
        (testing "404 returned for non-existent snippet"
          (is (= "Not found."
                 (let [max-transform-id (t2/select-one-fn :max-id [:model/Transform [:%max.id :max-id]])]
                   (mt/user-http-request :rasta :post 404 "ee/metabot-tools/check-transform-dependencies"
                                         {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                         {:arguments {:transform_id (inc max-transform-id)
                                                      :source modified-source}
                                          :conversation_id conversation-id})))))
        (testing "Edits with broken dependencies"
          (is (=? {:structured_output {:success false
                                       :bad_question_count 0
                                       :bad_questions nil
                                       :bad_transform_count 1
                                       :bad_transforms seq?}
                   :conversation_id conversation-id}
                  (mt/user-http-request :rasta :post 200 "ee/metabot-tools/check-transform-dependencies"
                                        {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                        {:arguments {:transform_id transform1-id
                                                     :source modified-source}
                                         :conversation_id conversation-id}))))))))
