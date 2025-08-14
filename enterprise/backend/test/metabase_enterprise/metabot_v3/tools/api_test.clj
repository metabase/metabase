(ns metabase-enterprise.metabot-v3.tools.api-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-metric :as metabot-v3.tools.find-metric]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

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
   (-> user mt/user->id (#'metabot-v3.tools.api/get-ai-service-token metabot-id))))

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
          (is (= [{:dashboard-id 1
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
                                                            :limt        15}
                                          :conversation_id conversation-id})]
      (is (=? {:structured_output {:statistics
                                   {:distinct_count 2499,
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
          (let [filters [{:field_id "q2a/1", :operation "is-not-null"}
                         {:field_id "q2a/2", :operation "equals", :value "3"}
                         {:field_id "q2a/3", :operation "equals", :values ["3" "4"]}
                         {:field_id "q2a/5", :operation "not-equals", :values [3 4]}
                         {:field_id "q2a/6", :operation "month-equals", :values [4 5 9]}
                         {:field_id "c2a/6", :bucket "week-of-year" :operation "not-equals", :values [14 15 19]}
                         {:field_id "q2a/6", :operation "year-equals", :value 2008}]
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

(deftest find-metric-test
  (mt/with-premium-features #{:metabot-v3}
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.find-metric/find-metric
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output output})]
        (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/find-metric"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:message "search text"}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output output
                   :conversation_id conversation-id}
                  response)))))))

(deftest find-outliers-test
  (doseq [data-source [{:query {:database 1}, :query_id "query ID", :result_field_id "q1233/2"}
                       {:query {:database 1}, :result_field_id "q1233/2"}
                       {:metric_id 1}
                       {:report_id 1, :result_field_id "c131/3"}
                       {:table_id "card__1", :result_field_id "t42/7"}]]
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
        (let [filters [{:field_id "c2/7", :operation "number-greater-than", :value 50}
                       {:field_id "c2/3", :operation "equals", :values ["3" "4"]}
                       {:field_id "c2/5", :operation "not-equals", :values [3 4]}
                       {:field_id "c2/6", :operation "month-equals", :values [4 5 9]}
                       {:field_id "c2/6", :bucket "day-of-month" :operation "not-equals", :values [14 15 19]}
                       {:field_id "c2/6", :bucket "day-of-week" :operation "equals", :values [1 7]}
                       {:field_id "c2/6", :operation "year-equals", :value 2008}]
              breakouts [{:field_id "c2/4", :field_granularity "week"}
                         {:field_id "c2/6", :field_granularity "day"}]
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
          mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL source-query)
                       :type :metric}]
      (mt/with-temp [:model/Card {metric-id :id} metric-data]
        (let [fid #(format "c%d/%d" metric-id %)
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
              query-id (-> response :structured_output :query_id)]
          (is (=? {:structured_output
                   {:type "query"
                    :query_id string?
                    :query (mt/mbql-query products
                             {:aggregation [[:metric metric-id]]
                              :breakout [!week.products.created_at !day.products.created_at]
                              :filter [:and
                                       [:> [:field %id {}] 50]
                                       [:= [:field %title {}] "3" "4"]
                                       [:!= [:field %rating {}] 3 4]
                                       [:= [:get-month [:field %created_at {}]] 4 5 9]
                                       [:!= [:get-day [:field %products.created_at {}]] 14 15 19]
                                       [:= [:get-day-of-week [:field %created_at {}] :iso] 1 7]
                                       [:= [:get-year [:field %created_at {}]] 2008]]})
                    :result_columns
                    [{:field_id (str "q" query-id "/0")
                      :name "Created At: Week"
                      :type "datetime"
                      :semantic_type "creation_timestamp"}
                     {:field_id (str "q" query-id "/1")
                      :name "Created At: Day"
                      :type "datetime"
                      :semantic_type "creation_timestamp"}
                     {:field_id (str "q" query-id "/2")
                      :name "Metrica"
                      :type "number"
                      :semantic_type "score"}]}
                   :conversation_id conversation-id}
                  (-> response
                      (update-in [:structured_output :query] mbql.normalize/normalize)))))))))

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
        (let [fields [{:field_id "c2/8", :bucket "year-of-era"}
                      {:field_id "c2/9"}]
              filters [{:field_id "c2/7", :operation "number-greater-than", :value 50}
                       {:field_id "c2/3", :operation "equals", :values ["3" "4"]}
                       {:field_id "c2/5", :operation "not-equals", :values [3 4]}
                       {:field_id "c2/6", :operation "month-equals", :values [4 5 9]}
                       {:field_id "c2/6", :bucket "day-of-month" :operation "not-equals", :values [14 15 19]}
                       {:field_id "c2/6", :bucket "day-of-week" :operation "equals", :values [1 7]}
                       {:field_id "c2/6", :operation "year-equals", :value 2008}]
              aggregations [{:field_id "c2/10", :bucket "week", :function "count-distinct"}
                            {:field_id "c2/11", :function "sum"}]
              breakouts [{:field_id "c2/4", :field_granularity "week"}
                         {:field_id "c2/6", :field_granularity "day"}]
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
              filters [{:field_id "c2/7", :operation "number-greater-than", :value 50}]
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
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          model-source-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
          metric-source-query (-> model-source-query
                                  (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                                  (lib/breakout (lib/with-temporal-bucket
                                                  (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL metric-source-query)
                       :type :metric}
          model-data {:name "Model model"
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
                     :model/Metabot {metabot-id  :id
                                     metabot-eid :entity_id} {:name "Test Metabot"}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model "collection"
                                             :model_id collection-id}]
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
                    [{:name "ID", :type "number", :semantic_type "pk"}
                     {:name "Ean", :type "string"}
                     {:name "Title", :type "string", :semantic_type "title"}
                     {:name "Category", :type "string", :semantic_type "category"}
                     {:name "Vendor", :type "string", :semantic_type "company"}
                     {:name "Price", :type "number"}
                     {:name "Rating", :type "number", :semantic_type "score"}
                     {:name "Created At", :type "datetime", :semantic_type "creation_timestamp"}]]
                (is (=? {:structured_output
                         {:metrics [(-> metric-data
                                        (select-keys [:name :description])
                                        (assoc :id metric-id
                                               :type "metric"
                                               :default_time_dimension_field_id (format "c%d/%d" metric-id 7)
                                               :queryable_dimensions
                                               (map-indexed #(assoc %2 :field_id (format "c%d/%d" metric-id %1))
                                                            expected-fields)))
                                    (-> model-metric-data
                                        (select-keys [:name :description])
                                        (assoc :id model-metric-id
                                               :type "metric"
                                               :default_time_dimension_field_id (format "c%d/%d" model-metric-id 7)
                                               :queryable_dimensions
                                               (map-indexed #(assoc %2 :field_id (format "c%d/%d" model-metric-id %1))
                                                            expected-fields)))]
                          :models [(-> model-data
                                       (select-keys [:name :description])
                                       (assoc :id model-id
                                              :type "model"
                                              :fields (map-indexed #(assoc %2 :field_id (format "c%d/%d" model-id %1))
                                                                   expected-fields)
                                              :metrics
                                              [{:id model-metric-id
                                                :name "Model metric"
                                                :description "Model metric desc"
                                                :default_time_dimension_field_id (format "c%d/%d" model-metric-id 7)}]))]}
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
                                               :default_time_dimension_field_id nil
                                               :queryable_dimensions missing-value))
                                    (-> model-metric-data
                                        (select-keys [:name :description])
                                        (assoc :id model-metric-id
                                               :type "metric"
                                               :default_time_dimension_field_id nil
                                               :queryable_dimensions missing-value))]
                          :models [(-> model-data
                                       (select-keys [:name :description])
                                       (assoc :id model-id
                                              :type "model"
                                              :fields []
                                              :metrics (symbol "nil #_\"key is not present.\"")))]}
                         :conversation_id conversation-id}
                        response))))))))))

(deftest ^:parallel get-current-user-test
  (mt/with-premium-features #{:metabot-v3}
    (let [conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-current-user"
                                         {:request-options {:headers {"x-metabase-session" ai-token}}}
                                         {:conversation_id conversation-id})]
      (is (=? {:structured_output {:id (mt/user->id :rasta)
                                   :type "user"
                                   :name "Rasta Toucan"
                                   :email_address "rasta@metabase.com"}
               :conversation_id conversation-id}
              response)))))

(deftest ^:parallel get-dashboard-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [dash-data {:name "dashing dash", :description "dash description"}]
      (mt/with-temp [:model/Dashboard {dash-id :id} dash-data]
        (let [conversation-id (str (random-uuid))
              ai-token (ai-session-token)
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-dashboard-details"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments {:dashboard_id dash-id}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output (assoc dash-data :id dash-id, :type "dashboard")
                   :conversation_id conversation-id}
                  response)))))))

(deftest get-metric-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :orders :subtotal))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :orders :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL source-query)
                       :type :metric}
          expected-fields
          [{:name "ID", :type "number", :semantic_type "pk"}
           {:name "User ID", :type "number", :semantic_type "fk"}
           {:name "Product ID", :type "number", :semantic_type "fk"}
           {:name "Subtotal", :type "number"}
           {:name "Tax", :type "number"}
           {:name "Total", :type "number"}
           {:name "Discount", :type "number", :semantic_type "discount"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp"}
           {:name "Quantity", :type "number", :semantic_type "quantity", :field_values int-sequence?}
           {:name "ID", :type "number", :semantic_type "pk", :table_reference "User"}
           {:name "Address", :type "string", :table_reference "User"}
           {:name "Email", :type "string", :semantic_type "email", :table_reference "User"}
           {:name "Password", :type "string", :table_reference "User"}
           {:name "Name", :type "string", :semantic_type "name", :table_reference "User"}
           {:name "City", :type "string", :semantic_type "city", :table_reference "User"}
           {:name "Longitude", :type "number", :semantic_type "longitude", :table_reference "User"}
           {:name "State", :type "string", :semantic_type "state", :table_reference "User"}
           {:name "Source", :type "string", :semantic_type "source", :table_reference "User"}
           {:name "Birth Date", :type "date", :table_reference "User"}
           {:name "Zip", :type "string", :table_reference "User"}
           {:name "Latitude", :type "number", :semantic_type "latitude", :table_reference "User"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp", :table_reference "User"}
           {:name "ID", :type "number", :semantic_type "pk", :table_reference "Product"}
           {:name "Ean", :type "string", :field_values string-sequence?, :table_reference "Product"}
           {:name "Title", :type "string"
            :semantic_type "title"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Category"
            :type "string"
            :semantic_type "category"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Vendor", :type "string"
            :semantic_type "company"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Price", :type "number", :table_reference "Product"}
           {:name "Rating", :type "number", :semantic_type "score", :table_reference "Product"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp", :table_reference "Product"}]
          ai-token (ai-session-token)
          conversation-id (str (random-uuid))
          request (fn [arguments]
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-metric-details"
                                          {:request-options {:headers {"x-metabase-session" ai-token}}}
                                          {:arguments arguments
                                           :conversation_id conversation-id}))]
      (mt/with-temp [:model/Card {metric-id :id} metric-data]
        (testing "Normal call"
          (is (=? {:structured_output (-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :default_time_dimension_field_id (format "c%d/%d" metric-id 7)
                                                 :queryable_dimensions
                                                 (map-indexed #(assoc %2 :field_id (format "c%d/%d" metric-id %1))
                                                              expected-fields)))
                   :conversation_id conversation-id}
                  (request {:metric_id metric-id}))))
        (testing "Without field values"
          (is (=? {:structured_output (-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :default_time_dimension_field_id (format "c%d/%d" metric-id 7)
                                                 :queryable_dimensions
                                                 (map-indexed #(assoc %2
                                                                      :field_id (format "c%d/%d" metric-id %1)
                                                                      :field_values missing-value)
                                                              expected-fields)))
                   :conversation_id conversation-id}
                  (request {:metric_id         metric-id
                            :with_field_values false}))))
        (testing "Default time dimension only"
          (is (=? {:structured_output (-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :default_time_dimension_field_id (format "c%d/%d" metric-id 7)
                                                 :queryable_dimensions missing-value))
                   :conversation_id conversation-id}
                  (request {:metric_id                 metric-id
                            :with_queryable_dimensions false}))))
        (testing "Minimal call"
          (is (=? {:structured_output (-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :default_time_dimension_field_id nil
                                                 :queryable_dimensions missing-value))
                   :conversation_id conversation-id}
                  (request {:metric_id                      metric-id
                            :with_default_temporal_breakout false
                            :with_queryable_dimensions      false}))))))))

(deftest ^:parallel get-query-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
                                   :query query
                                   :result_columns
                                   [{:field_id (str "q" generated-id "/0"), :name "Created At: Week", :type "datetime"}
                                    {:field_id (str "q" generated-id "/1"), :name "Average of Rating", :type "number"}]}
               :conversation_id conversation-id}
              ;; normalize query to convert strings like "field" to keywords
              (update-in response [:structured_output :query] mbql.normalize/normalize))))))

(deftest get-report-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
        (let [conversation-id (str (random-uuid))
              ai-token (ai-session-token)
              arguments {:report_id question-id}
              request (fn [arguments]
                        (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-report-details"
                                              {:request-options {:headers {"x-metabase-session" ai-token}}}
                                              {:arguments arguments
                                               :conversation_id conversation-id}))
              expected-fields [{:name "Vendor", :type "string", :semantic_type "company"
                                :field_values string-sequence?}
                               {:name "Created At: Week", :type "datetime", :semantic_type "creation_timestamp"}
                               {:name "Average of Rating", :type "number", :semantic_type "score"}]]
          (testing "Normal call"
            (is (=? {:structured_output (-> question-data
                                            (select-keys [:name :description])
                                            (assoc :id question-id
                                                   :type "question"
                                                   :result_columns
                                                   (map-indexed #(assoc %2 :field_id (format "c%d/%d" question-id %1))
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
                                                                        :field_id (format "c%d/%d" question-id %1)
                                                                        :field_values missing-value)
                                                                expected-fields)))
                     :conversation_id conversation-id}
                    (request (assoc arguments :with_field_values false)))))
          (testing "Without fields"
            (is (=? {:structured_output (-> question-data
                                            (select-keys [:name :description])
                                            (assoc :id question-id
                                                   :type "question"
                                                   :result_columns []))
                     :conversation_id conversation-id}
                    (request (assoc arguments :with_fields false))))))))))

(deftest get-model-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          source-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          model-data {:name "Model model"
                      :description "Model desc"
                      :dataset_query (lib/->legacy-MBQL source-query)
                      :type :model}
          metric-data {:name "Metric"
                       :description "Model based metric"
                       :type :metric}
          conversation-id (str (random-uuid))
          ai-token (ai-session-token)
          expected-fields
          [{:name "ID", :type "number", :semantic_type "pk"}
           {:name "User ID", :type "number", :semantic_type "fk"}
           {:name "Product ID", :type "number", :semantic_type "fk"}
           {:name "Subtotal", :type "number"}
           {:name "Tax", :type "number"}
           {:name "Total", :type "number"}
           {:name "Discount", :type "number", :semantic_type "discount"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp"}
           {:name "Quantity", :type "number", :semantic_type "quantity", :field_values int-sequence?}
           {:name "ID", :type "number", :semantic_type "pk", :table_reference "User"}
           {:name "Address", :type "string", :table_reference "User"}
           {:name "Email", :type "string", :semantic_type "email", :table_reference "User"}
           {:name "Password", :type "string", :table_reference "User"}
           {:name "Name", :type "string", :semantic_type "name", :table_reference "User"}
           {:name "City", :type "string", :semantic_type "city", :table_reference "User"}
           {:name "Longitude", :type "number", :semantic_type "longitude", :table_reference "User"}
           {:name "State", :type "string", :semantic_type "state", :table_reference "User"}
           {:name "Source", :type "string", :semantic_type "source", :table_reference "User"}
           {:name "Birth Date", :type "date", :table_reference "User"}
           {:name "Zip", :type "string", :table_reference "User"}
           {:name "Latitude", :type "number", :semantic_type "latitude", :table_reference "User"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp", :table_reference "User"}
           {:name "ID", :type "number", :semantic_type "pk", :table_reference "Product"}
           {:name "Ean" :type "string", :field_values string-sequence?, :table_reference "Product"}
           {:name "Title"
            :type "string"
            :semantic_type "title"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Category"
            :type "string"
            :semantic_type "category"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Vendor"
            :type "string"
            :semantic_type "company"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Price", :type "number", :table_reference "Product"}
           {:name "Rating", :type "number", :semantic_type "score", :table_reference "Product"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp", :table_reference "Product"}]]
      (mt/with-temp [:model/Card {model-id :id}  model-data
                     :model/Card {metric-id :id} (assoc metric-data :dataset_query
                                                        (mt/mbql-query orders
                                                          {:source-table (str "card__" model-id)
                                                           :aggregation [[:count]]
                                                           :breakout [!month.*created_at *quantity]}))]
        (let [request (fn [arguments]
                        (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                              {:request-options {:headers {"x-metabase-session" ai-token}}}
                                              {:arguments arguments
                                               :conversation_id conversation-id}))]
          (doseq [arguments [{:model_id model-id}
                             {:table_id (str "card__" model-id)}]]
            (testing "Normal request"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :queryable_foreign_key_tables []
                                                     :fields
                                                     (map-indexed #(assoc %2 :field_id (format "c%d/%d" model-id %1))
                                                                  expected-fields)
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id (format "c%d/7" metric-id))]))
                       :conversation_id conversation-id}
                      (request arguments)))))
          (let [arguments {:model_id model-id}]
            (testing "Without field values"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :queryable_foreign_key_tables []
                                                     :fields
                                                     (map-indexed #(assoc %2
                                                                          :field_id (format "c%d/%d" model-id %1)
                                                                          :field_values missing-value)
                                                                  expected-fields)
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id (format "c%d/7" metric-id))]))
                       :conversation_id conversation-id}
                      (request (assoc arguments :with_field_values false)))))
            (testing "Without fields"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :queryable_foreign_key_tables []
                                                     :fields []
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id (format "c%d/7" metric-id))]))
                       :conversation_id conversation-id}
                      (request (assoc arguments :with_fields false)))))
            (testing "Without fields and metric default time dimension"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :queryable_foreign_key_tables []
                                                     :fields []
                                                     :metrics [(assoc metric-data
                                                                      :id metric-id
                                                                      :type "metric"
                                                                      :default_time_dimension_field_id nil)]))
                       :conversation_id conversation-id}
                      (request (assoc arguments
                                      :with_fields false
                                      :with_metric_default_temporal_breakout false)))))
            (testing "Without fields and metrics"
              (is (=? {:structured_output (-> model-data
                                              (select-keys [:name :description])
                                              (assoc :id model-id
                                                     :type "model"
                                                     :queryable_foreign_key_tables []
                                                     :fields []
                                                     :metrics missing-value))
                       :conversation_id conversation-id}
                      (request (assoc arguments
                                      :with_fields false
                                      :with_metrics false)))))))))))

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
                                           :limt        15}
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
          [{:name "ID", :type "number", :semantic_type "pk"}
           {:name "User ID", :type "number", :semantic_type "fk"}
           {:name "Product ID", :type "number", :semantic_type "fk"}
           {:name "Subtotal", :type "number"}
           {:name "Tax", :type "number"}
           {:name "Total", :type "number"}
           {:name "Discount", :type "number", :semantic_type "discount"}
           {:name "Created At", :type "datetime", :semantic_type "creation_timestamp"}
           {:name "Quantity" :type "number" :semantic_type "quantity" :field_values int-sequence?}
           {:name "ID", :type "number", :semantic_type "pk", :table_reference "User"}
           {:name "Address", :type "string", :table_reference "User"}
           {:name "Email", :type "string", :semantic_type "email", :table_reference "User"}
           {:name "Password", :type "string", :table_reference "User"}
           {:name "Name", :type "string", :semantic_type "name", :table_reference "User"}
           {:name "City", :type "string", :semantic_type "city", :table_reference "User"}
           {:name "Longitude", :type "number", :semantic_type "longitude", :table_reference "User"}
           {:name "State", :type "string", :semantic_type "state", :table_reference "User"}
           {:name "Source", :type "string", :semantic_type "source", :table_reference "User"}
           {:name "Birth Date", :type "date", :table_reference "User"}
           {:name "Zip", :type "string", :table_reference "User"}
           {:name "Latitude", :type "number", :semantic_type "latitude", :table_reference "User"}
           {:name "Created At" :type "datetime" :semantic_type "creation_timestamp" :table_reference "User"}
           {:name "ID", :type "number", :semantic_type "pk", :table_reference "Product"}
           {:name "Ean" :type "string" :field_values string-sequence? :table_reference "Product"}
           {:name "Title"
            :type "string"
            :semantic_type "title"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Category"
            :type "string"
            :semantic_type "category"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Vendor"
            :type "string"
            :semantic_type "company"
            :field_values string-sequence?
            :table_reference "Product"}
           {:name "Price", :type "number", :table_reference "Product"}
           {:name "Rating", :type "number", :semantic_type "score", :table_reference "Product"}
           {:name "Created At" :type "datetime" :semantic_type "creation_timestamp" :table_reference "Product"}]
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
            (is (=? {:structured_output {:name "Orders"
                                         :id table-id
                                         :type "table"
                                         :fields (map-indexed #(assoc %2 :field_id (format "t%d/%d" table-id %1))
                                                              expected-fields)
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id (format "c%d/7" metric-id))]}
                     :conversation_id conversation-id}
                    (request {:table_id arg-id})))))
        (let [arguments {:table_id table-id}]
          (testing "Without field values"
            (is (=? {:structured_output {:name "Orders"
                                         :id table-id
                                         :type "table"
                                         :fields (map-indexed #(assoc %2
                                                                      :field_id (format "t%d/%d" table-id %1)
                                                                      :field_values missing-value)
                                                              expected-fields)
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id (format "c%d/7" metric-id))]}
                     :conversation_id conversation-id}
                    (request (assoc arguments :with_field_values false)))))
          (testing "Without fields"
            (is (=? {:structured_output {:name "Orders"
                                         :id table-id
                                         :type "table"
                                         :fields []
                                         :metrics [(assoc metric-data
                                                          :id metric-id
                                                          :type "metric"
                                                          :default_time_dimension_field_id (format "c%d/7" metric-id))]}
                     :conversation_id conversation-id}
                    (request (assoc arguments :with_fields false)))))
          (testing "Without fields and metric default time dimension"
            (is (=? {:structured_output {:name "Orders"
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
            (is (=? {:structured_output {:name "Orders"
                                         :id table-id
                                         :type "table"
                                         :fields []
                                         :metrics missing-value}
                     :conversation_id conversation-id}
                    (request (assoc arguments
                                    :with_fields false
                                    :with_metrics false))))))))))
