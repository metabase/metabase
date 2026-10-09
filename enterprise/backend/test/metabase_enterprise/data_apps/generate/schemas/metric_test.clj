(ns metabase-enterprise.data-apps.generate.schemas.metric-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.schemas.metric :as schemas.metric]
   [metabase-enterprise.data-apps.generate.schemas.table :as schemas.table]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel metric-dimension-schema-uses-dimension-id-test
  (is (= {:type        "column"
          :name        "category"
          :displayName "Category"
          :baseType    "type/Text"
          :jsType      "string"
          :key         "category"
          :id          "550e8400-e29b-41d4-a716-446655440001"
          :fieldId     3815
          :tableId     12
          :metricId    247}
         (#'schemas.metric/dimension-schema
          {:id             "550e8400-e29b-41d4-a716-446655440001"
           :name           "category"
           :display-name   "Category"
           :effective-type :type/Text
           :table-id       12
           :sources        [{:type :field, :field-id 3815}]}
          247))))

(deftest ^:parallel metric-dimension-schema-preserves-source-field-id-test
  (is (= 102
         (:sourceFieldId
          (#'schemas.metric/dimension-schema
           {:id              "category-dimension"
            :name            "category"
            :source-field-id 102}
           247)))))

(deftest ^:parallel metric-source-id-test
  (testing "integer source-table emits sourceTableId but not sourceCardId"
    (let [card {:dataset_query {:query {:source-table 10}}}]
      (is (= 10 (#'schemas.metric/source-table-id card)))
      (is (nil? (#'schemas.metric/source-card-id card)))))
  (testing "card source-table emits sourceCardId but not sourceTableId"
    (let [card {:dataset_query {:query {:source-table "card__42"}}}]
      (is (nil? (#'schemas.metric/source-table-id card)))
      (is (= 42 (#'schemas.metric/source-card-id card)))))
  (testing "stage source-card emits sourceCardId"
    (is (= 42 (#'schemas.metric/source-card-id
               {:dataset_query {:stages [{:source-card 42}]}})))))

(defn- orders-metric-query
  [filters]
  (lib/test-query
   (mt/metadata-provider)
   {:stages [{:source       {:type :table :id (mt/id :orders)}
              :filters      filters
              :aggregations [{:type :operator :operator :sum
                              :args [{:type :column :name "TOTAL" :table-id (mt/id :orders)}]}]}]}))

(deftest metric-filters-test
  (testing "a metric's filters are described the way the query builder names them"
    (mt/with-temp [:model/Card card {:type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-metric-query
                                                     [{:type :operator :operator :>=
                                                       :args [{:type :column :name "CREATED_AT" :table-id (mt/id :orders)}
                                                              {:type :literal :value "2025-01-01"}]}
                                                      {:type :operator :operator :=
                                                       :args [{:type :column :name "CATEGORY"
                                                               :source-field-id (mt/id :orders :product_id)}
                                                              {:type :literal :value "Widget"}]}])}]
      (is (= ["Created At is greater than or equal to \"2025-01-01\"" "Category is Widget"]
             (#'schemas.metric/metric-filters card)))))
  (testing "a metric without filters has none"
    (mt/with-temp [:model/Card card {:type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-metric-query [])}]
      (is (nil? (#'schemas.metric/metric-filters card)))))
  (testing "a card without a query has none"
    (is (nil? (#'schemas.metric/metric-filters {:id 247 :dataset_query {}})))))

(deftest metric-details-skips-default-temporal-breakout-test
  (let [requested (atom nil)]
    (mt/with-dynamic-fn-redefs [metabot/get-metric-details
                                (fn [options]
                                  (reset! requested options)
                                  {:structured-output {:id 247}})]
      (is (= {:id 247}
             (#'schemas.metric/metric-details {:id 247})))
      (is (=? {:with-default-temporal-breakout? false}
              @requested)))))

(deftest metric-details-surfaces-error-responses-test
  (mt/with-dynamic-fn-redefs [metabot/get-metric-details
                              (constantly {:output "Not found."
                                           :status-code 404})]
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (#'schemas.metric/metric-details {:id 247
                                                                   :name "Customer Lifetime Value"
                                                                   :type :metric})))]
      (is (=? {:card-id       247
               :card-name     "Customer Lifetime Value"
               :card-type     :metric
               :status-code   404
               :error-message "Not found."}
              (ex-data exception))))))

(deftest metric-schemas-excludes-card-sourced-metrics-test
  (mt/with-dynamic-fn-redefs [data-apps.db/metric-cards-in-collections
                              (constantly [{:id 247
                                            :dataset_query {:lib/type :mbql/query
                                                            :database 1
                                                            :stages [{:lib/type :mbql.stage/mbql
                                                                      :source-table 10}]}}
                                           {:id 258
                                            :dataset_query {:query {:source-table "card__42"}}}
                                           {:id 259
                                            :dataset_query {:stages [{:source-card 42}]}}])
                              schemas.metric/metric-details identity
                              schemas.metric/metric-schema (fn [details _card] (:id details))]
    (is (= [247]
           (vec (schemas.metric/metric-schemas #{1}))))))

(deftest metric-schemas-excludes-metrics-that-reference-other-metrics-test
  (mt/with-dynamic-fn-redefs [data-apps.db/metric-cards-in-collections
                              (constantly [{:id 247
                                            :dataset_query {:lib/type :mbql/query
                                                            :database 1
                                                            :stages [{:lib/type :mbql.stage/mbql
                                                                      :source-table 10}]}}
                                           {:id 258
                                            :dataset_query {:lib/type :mbql/query
                                                            :database 1
                                                            :stages [{:lib/type :mbql.stage/mbql
                                                                      :source-table 10
                                                                      :aggregation [[:metric
                                                                                     {:lib/uuid
                                                                                      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
                                                                                     247]]}]}}])
                              schemas.metric/metric-details identity
                              schemas.metric/metric-schema (fn [details _card] (:id details))]
    (is (= [247]
           (vec (schemas.metric/metric-schemas #{1}))))))

(deftest metric-schemas-excludes-metrics-that-join-a-saved-question-test
  ;; Metric 258 is table-sourced and joins a saved question, so `source-card-id` — which only reads
  ;; stage 0's source — passes it. A data app's copy of it would reference a saved question outside
  ;; the app's resources, which the pull refuses, so codegen has to drop it here as well.
  (mt/with-dynamic-fn-redefs [data-apps.db/metric-cards-in-collections
                              (constantly [{:id 247
                                            :dataset_query {:lib/type :mbql/query
                                                            :database 1
                                                            :stages [{:lib/type :mbql.stage/mbql
                                                                      :source-table 10}]}}
                                           {:id 258
                                            :dataset_query {:lib/type :mbql/query
                                                            :database 1
                                                            :stages [{:lib/type :mbql.stage/mbql
                                                                      :source-table 10
                                                                      :joins [{:lib/type :mbql/join
                                                                               :alias "Question"
                                                                               :stages [{:lib/type :mbql.stage/mbql
                                                                                         :source-card 42}]
                                                                               :conditions
                                                                               [[:=
                                                                                 {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
                                                                                 [:field {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 11]
                                                                                 [:field {:lib/uuid "cccccccc-cccc-cccc-cccc-cccccccccccc"} 12]]]}]}]}}])
                              schemas.metric/metric-details identity
                              schemas.metric/metric-schema (fn [details _card] (:id details))]
    (is (= [247]
           (vec (schemas.metric/metric-schemas #{1}))))))

(deftest metric-schema-keys-dimensions-test
  (mt/with-dynamic-fn-redefs [schemas.metric/metric-result-column (constantly nil)
                              schemas.metric/table-source-rows
                              (constantly [{:id 10 :name "orders" :display_name "Orders"}])
                              schemas.metric/sync-and-fetch-metric-dimensions!
                              (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                                            :name           "orders"
                                            :display-name   "Orders"
                                            :effective-type :type/Integer
                                            :table-id       10
                                            :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:type           "metric"
            :key            "customerLifetimeValue"
            :id             247
            :name           "Customer Lifetime Value"
            :columns        [{:type        "column"
                              :name        "Customer Lifetime Value"
                              :displayName "Customer Lifetime Value"
                              :jsType      "unknown"}]
            :mappedTableIds [10]
            :dimensions     {"orders" {:type        "column"
                                       :name        "orders"
                                       :sourceName  "orders"
                                       :displayName "Orders"
                                       :baseType    "type/Integer"
                                       :jsType      "number"
                                       :key         "orders"
                                       :id          "550e8400-e29b-41d4-a716-446655440001"
                                       :fieldId     42
                                       :tableId     10
                                       :metricId    247}}}
           (#'schemas.metric/metric-schema
            {:id   247
             :name "Customer Lifetime Value"}
            {:id 247})))))

(deftest metric-schema-reuses-table-source-rows-test
  (let [table-select-count (atom 0)]
    (mt/with-dynamic-fn-redefs [schemas.metric/metric-result-column (constantly nil)
                                schemas.metric/sync-and-fetch-metric-dimensions!
                                (constantly [{:id       "orders-dimension"
                                              :name     "orders"
                                              :table-id 10}])
                                data-apps.db/table-names
                                (fn [_table-ids]
                                  (swap! table-select-count inc)
                                  [{:id 10 :name "orders" :display_name "Orders"}])]
      (#'schemas.metric/metric-schema
       {:id   247
        :name "Customer Lifetime Value"}
       {:id 247})
      (is (= 1 @table-select-count)))))

(deftest metric-dimensions-bulk-load-table-ids-test
  (let [field-select-count   (atom 0)
        field-lookup-attempts (atom [])
        dimensions           [{:id "orders-dimension"
                               :sources [{:type :field, :field-id 42}]}
                              {:id "people-dimension"
                               :sources [{:type :field, :field-id 84}]}]]
    (mt/with-dynamic-fn-redefs [schemas.metric/sync-and-fetch-metric-dimensions! (constantly dimensions)
                                schemas.table/table-by-field-id (fn [field-id]
                                                                  (swap! field-lookup-attempts conj field-id)
                                                                  ({42 10, 84 20} field-id))
                                data-apps.db/field-ids-and-table-ids
                                (fn [_field-ids]
                                  (swap! field-select-count inc)
                                  [{:id 42 :table_id 10}
                                   {:id 84 :table_id 20}])]
      (is (= (mapv vector dimensions [10 20])
             (#'schemas.metric/metric-dimensions-with-table-ids {:id 247} nil)))
      (is (= 1 @field-select-count))
      (is (empty? @field-lookup-attempts)))))

(deftest source-card-metric-schema-omits-mapped-table-dimensions-test
  (mt/with-dynamic-fn-redefs [schemas.metric/metric-result-column (constantly nil)
                              schemas.metric/sync-and-fetch-metric-dimensions!
                              (constantly [{:id   "count-dimension-uuid"
                                            :name "count"}
                                           {:id             "store-name-dimension-uuid"
                                            :name           "store_name"
                                            :table-id       10}])]
    (is (= {:type         "metric"
            :key          "storesWithOver5Employees"
            :id           259
            :name         "Stores with Over 5 Employees"
            :columns      [{:type        "column"
                            :name        "Stores with Over 5 Employees"
                            :displayName "Stores with Over 5 Employees"
                            :jsType      "unknown"}]
            :sourceCardId 258
            :dimensions   {"count" {:type        "column"
                                    :name        "count"
                                    :displayName "count"
                                    :jsType      "unknown"
                                    :key         "count"
                                    :id          "count-dimension-uuid"
                                    :metricId    259}}}
           (#'schemas.metric/metric-schema
            {:id   259
             :name "Stores with Over 5 Employees"}
            {:id            259
             :dataset_query {:stages [{:source-card 258}]}})))))
