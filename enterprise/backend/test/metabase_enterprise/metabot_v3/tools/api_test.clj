(ns metabase-enterprise.metabot-v3.tools.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-metric :as metabot-v3.tools.find-metric]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test :as mt]))

(defn- ai-session-token
  ([] (ai-session-token :rasta))
  ([user]
   (-> user mt/user->id (#'metabot-v3.tools.api/get-ai-service-token))))

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
                                                                :schedule     {:frequency "hourly"}}
                                              :conversation_id conversation-id})]
          (is (=? {:output output
                   :conversation_id conversation-id}
                  response)))))))

(deftest filter-records-test
  (doseq [data-source [{:query {:database 1}, :query_id "query ID"}
                       {:query {:database 1}}
                       {:report_id 1}
                       {:table_id "1"}]]
    (mt/with-premium-features #{:metabot-v3}
      (let [tool-requests (atom [])
            conversation-id (str (random-uuid))
            output (str (random-uuid))
            ai-token (ai-session-token)]
        (with-redefs [metabot-v3.tools.filters/filter-records
                      (fn [arguments]
                        (swap! tool-requests conj arguments)
                        {:structured-output output})]
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
            (is (=? {:structured_output output
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
            output (str (random-uuid))
            ai-token (ai-session-token)]
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
                      {:structured-output output})]
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
          (is (= {:structured_output output
                  :conversation_id conversation-id}
                 response)))))))

(deftest query-model-test
  (mt/with-premium-features #{:metabot-v3}
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.filters/query-model
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output output})]
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
          (is (= {:structured_output output
                  :conversation_id conversation-id}
                 response)))))))

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
      (mt/with-temp [:model/Collection {collection-id :id} {:name metabot-v3.tools.api/metabot-collection-name}
                     :model/Card {metric-id :id} (assoc metric-data :collection_id collection-id)
                     :model/Card _ignored        metric-data
                     :model/Card _ignored        model-data
                     :model/Card {model-id :id}  (assoc model-data  :collection_id collection-id)]
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
            (let [conversation-id (str (random-uuid))
                  ai-token (ai-session-token)
                  response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/answer-sources"
                                                 {:request-options {:headers {"x-metabase-session" ai-token}}}
                                                 {:conversation_id conversation-id})]
              (is (=? {:structured_output
                       {:metrics [(-> metric-data
                                      (select-keys [:name :description])
                                      (assoc :id metric-id
                                             :type "metric"
                                             :default_time_dimension_field_id (format "c%d/%d" metric-id 7)
                                             :queryable_dimensions
                                             (map-indexed #(assoc %2 :field_id (format "c%d/%d" metric-id %1))
                                                          [{:name "ID", :type "number"}
                                                           {:name "Ean", :type "string"}
                                                           {:name "Title", :type "string"}
                                                           {:name "Category", :type "string"}
                                                           {:name "Vendor", :type "string"}
                                                           {:name "Price", :type "number"}
                                                           {:name "Rating", :type "number"}
                                                           {:name "Created At", :type "datetime"}])))
                                  (-> model-metric-data
                                      (select-keys [:name :description])
                                      (assoc :id model-metric-id
                                             :type "metric"
                                             :default_time_dimension_field_id (format "c%d/%d" model-metric-id 7)
                                             :queryable_dimensions
                                             (map-indexed #(assoc %2 :field_id (format "c%d/%d" model-metric-id %1))
                                                          [{:name "ID", :type "number"}
                                                           {:name "Ean", :type "string"}
                                                           {:name "Title", :type "string"}
                                                           {:name "Category", :type "string"}
                                                           {:name "Vendor", :type "string"}
                                                           {:name "Price", :type "number"}
                                                           {:name "Rating", :type "number"}
                                                           {:name "Created At", :type "datetime"}])))]
                        :models [(-> model-data
                                     (select-keys [:name :description])
                                     (assoc :id model-id
                                            :type "model"
                                            :fields
                                            (map-indexed #(assoc %2 :field_id (format "c%d/%d" model-id %1))
                                                         [{:name "ID", :type "number", :semantic_type "pk"}
                                                          {:name "Ean", :type "string"}
                                                          {:name "Title", :type "string", :semantic_type "title"}
                                                          {:name "Category", :type "string", :semantic_type "category"}
                                                          {:name "Vendor", :type "string", :semantic_type "company"}
                                                          {:name "Price", :type "number"}
                                                          {:name "Rating", :type "number", :semantic_type "score"}
                                                          {:name "Created At", :type "datetime", :semantic_type "creation_timestamp"}])
                                            :metrics
                                            [{:id model-metric-id
                                              :name "Model metric"
                                              :description "Model metric desc"
                                              :default_time_dimension_field_id (format "c%d/%d" model-metric-id 7)}]))]}
                       :conversation_id conversation-id}
                      response)))))))))

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

(deftest ^:parallel get-metric-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          metric-data {:name "Metrica"
                       :description "Metric description"
                       :dataset_query (lib/->legacy-MBQL source-query)
                       :type :metric}]
      (mt/with-temp [:model/Card {metric-id :id} metric-data]
        (let [conversation-id (str (random-uuid))
              ai-token (ai-session-token)
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-metric-details"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments {:metric_id metric-id}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output (-> metric-data
                                          (select-keys [:name :description])
                                          (assoc :id metric-id
                                                 :type "metric"
                                                 :default_time_dimension_field_id (format "c%d/%d" metric-id 7)
                                                 :queryable_dimensions
                                                 (map-indexed #(assoc %2 :field_id (format "c%d/%d" metric-id %1))
                                                              [{:name "ID", :type "number"}
                                                               {:name "Ean", :type "string"}
                                                               {:name "Title", :type "string"}
                                                               {:name "Category", :type "string"}
                                                               {:name "Vendor", :type "string"}
                                                               {:name "Price", :type "number"}
                                                               {:name "Rating", :type "number"}
                                                               {:name "Created At", :type "datetime"}])))
                   :conversation_id conversation-id}
                  response)))))))

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

(deftest ^:parallel get-report-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          question-data {:name "Question?"
                         :description "Descriptive?"
                         :dataset_query (lib/->legacy-MBQL source-query)
                         :type :question}]
      (mt/with-temp [:model/Card {question-id :id} question-data]
        (let [conversation-id (str (random-uuid))
              ai-token (ai-session-token)
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-report-details"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments {:report_id question-id}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output (-> question-data
                                          (select-keys [:name :description])
                                          (assoc :id question-id
                                                 :type "question"
                                                 :result_columns
                                                 (map-indexed #(assoc %2 :field_id (format "c%d/%d" question-id %1))
                                                              [{:name "Created At: Week", :type "datetime"}
                                                               {:name "Average of Rating", :type "number"}])))
                   :conversation_id conversation-id}
                  response)))))))

(deftest ^:parallel get-model-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          model-data {:name "Model model"
                      :description "Model desc"
                      :dataset_query (lib/->legacy-MBQL source-query)
                      :type :model}]
      (mt/with-temp [:model/Card {model-id :id} model-data]
        (doseq [arguments [{:model_id model-id}
                           {:table_id (str "card__" model-id)}]]
          (let [conversation-id (str (random-uuid))
                ai-token (ai-session-token)
                response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                               {:request-options {:headers {"x-metabase-session" ai-token}}}
                                               {:arguments arguments
                                                :conversation_id conversation-id})]
            (is (=? {:structured_output (-> model-data
                                            (select-keys [:name :description])
                                            (assoc :id model-id
                                                   :type "model"
                                                   :fields
                                                   (map-indexed #(assoc %2 :field_id (format "c%d/%d" model-id %1))
                                                                [{:name "Created At: Week", :type "datetime"}
                                                                 {:name "Average of Rating", :type "number"}])))
                     :conversation_id conversation-id}
                    response))))))))

(deftest ^:parallel get-table-details-test
  (mt/with-premium-features #{:metabot-v3}
    (let [table-id (mt/id :products)]
      (doseq [arg-id [table-id (str table-id)]]
        (let [conversation-id (str (random-uuid))
              ai-token (ai-session-token)
              response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-table-details"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments {:table_id arg-id}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output {:name "Products"
                                       :id table-id
                                       :type "table"
                                       :fields (map-indexed #(assoc %2 :field_id (format "t%d/%d" table-id %1))
                                                            [{:name "ID", :type "number", :semantic_type "pk"}
                                                             {:name "Ean", :type "string"}
                                                             {:name "Title", :type "string", :semantic_type "title"}
                                                             {:name "Category", :type "string", :semantic_type "category"}
                                                             {:name "Vendor", :type "string", :semantic_type "company"}
                                                             {:name "Price", :type "number"}
                                                             {:name "Rating", :type "number", :semantic_type "score"}
                                                             {:name "Created At", :type "datetime", :semantic_type "creation_timestamp"}])}
                   :conversation_id conversation-id}
                  response)))))))
