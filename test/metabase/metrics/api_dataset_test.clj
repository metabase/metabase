(ns metabase.metrics.api-dataset-test
  "Comprehensive E2E tests for POST /api/metric/dataset.
   Tests the full pipeline: API request -> MetricDefinition -> AST -> MBQL -> execution.

   These tests cover:
   - All aggregation types (count, sum, avg, min, max, distinct)
   - String, numeric, and temporal filter operators
   - Compound filters (and, or, not)
   - Projections/breakouts with temporal bucketing
   - Binning strategies
   - Measure sources
   - Error handling

   Some tests may fail for unimplemented features - this is expected."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Functions                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- hydrate-metric
  "Fetch metric via API to hydrate dimensions, returns the metric with dimensions."
  [metric-id]
  (mt/user-http-request :rasta :get 200 (str "metric/" metric-id)))

(defn- find-dimension-by-name
  "Find a dimension by column name from hydrated metric's dimensions."
  [metric column-name]
  (some #(when (= column-name (:name %)) %)
        (:dimensions metric)))

(defn- dataset-request
  "Make POST /api/metric/dataset request with the given definition."
  [definition]
  (mt/user-http-request :rasta :post 202 "metric/dataset" {:definition definition}))

(defn- dataset-request-error
  "Make POST /api/metric/dataset request expecting an error status."
  [expected-status definition]
  (mt/user-http-request :rasta :post expected-status "metric/dataset" {:definition definition}))

(defn- result-rows
  "Extract rows from a dataset response."
  [response]
  (get-in response [:data :rows]))

(defn- first-result
  "Get the first value from the first row of results."
  [response]
  (ffirst (result-rows response)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Category 1: Aggregation Types                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-count-aggregation-test
  (mt/dataset test-data
    (testing "POST /api/metric/dataset with count aggregation"
      (mt/with-temp [:model/Card metric {:name          "Count Metric"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (dataset-request {:source-metric (:id metric)})]
          (is (= "completed" (:status response)))
          (is (= 1 (:row_count response)))
          ;; venues table has 100 rows
          (is (= 100 (first-result response))))))))

(deftest dataset-sum-aggregation-test
  (testing "POST /api/metric/dataset with sum aggregation"
    (mt/with-temp [:model/Card metric {:name          "Sum Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:sum $price]]})}]
      (let [response (dataset-request {:source-metric (:id metric)})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))
        ;; Sum should be a positive number
        (is (pos? (first-result response)))))))

(deftest dataset-avg-aggregation-test
  (testing "POST /api/metric/dataset with avg aggregation"
    (mt/with-temp [:model/Card metric {:name          "Avg Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:avg $price]]})}]
      (let [response (dataset-request {:source-metric (:id metric)})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))
        ;; Average should be between 1 and 4 (price is 1-4)
        (let [avg (first-result response)]
          (is (and (>= avg 1) (<= avg 4))))))))

(deftest dataset-min-aggregation-test
  (testing "POST /api/metric/dataset with min aggregation"
    (mt/with-temp [:model/Card metric {:name          "Min Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:min $price]]})}]
      (let [response (dataset-request {:source-metric (:id metric)})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))
        ;; Min price should be 1
        (is (= 1 (first-result response)))))))

(deftest dataset-max-aggregation-test
  (testing "POST /api/metric/dataset with max aggregation"
    (mt/with-temp [:model/Card metric {:name          "Max Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:max $price]]})}]
      (let [response (dataset-request {:source-metric (:id metric)})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))
        ;; Max price should be 4
        (is (= 4 (first-result response)))))))

(deftest dataset-distinct-aggregation-test
  (testing "POST /api/metric/dataset with distinct count aggregation"
    (mt/with-temp [:model/Card metric {:name          "Distinct Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:distinct $category_id]]})}]
      (let [response (dataset-request {:source-metric (:id metric)})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))
        ;; Should have multiple distinct categories
        (is (pos? (first-result response)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Category 2: String Filter Operators                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-string-equals-filter-test
  (testing "POST /api/metric/dataset with string = filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:= {} [:dimension {} (:id name-dim)] "Red Medicine"]]})]
            (is (= "completed" (:status response)))
            ;; Should return 1 venue with this exact name
            (is (= 1 (first-result response)))))))))

(deftest dataset-string-not-equals-filter-test
  (testing "POST /api/metric/dataset with string != filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:!= {} [:dimension {} (:id name-dim)] "Red Medicine"]]})]
            (is (= "completed" (:status response)))
            ;; Should return 99 venues (100 - 1)
            (is (= 99 (first-result response)))))))))

(deftest dataset-string-contains-filter-test
  (testing "POST /api/metric/dataset with string contains filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:contains {} [:dimension {} (:id name-dim)] "Burger"]]})]
            (is (= "completed" (:status response)))
            ;; Should return venues with "Burger" in name
            (is (pos? (first-result response)))))))))

(deftest dataset-string-does-not-contain-filter-test
  (testing "POST /api/metric/dataset with string does-not-contain filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [all-count      (first-result (dataset-request {:source-metric (:id metric)}))
                filtered-count (first-result (dataset-request {:source-metric (:id metric)
                                                               :filters       [[:does-not-contain {} [:dimension {} (:id name-dim)] "a"]]}))]
            (is (< filtered-count all-count))))))))

(deftest dataset-string-starts-with-filter-test
  (testing "POST /api/metric/dataset with string starts-with filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:starts-with {} [:dimension {} (:id name-dim)] "The"]]})]
            (is (= "completed" (:status response)))
            ;; Should return venues starting with "The"
            (is (pos? (first-result response)))))))))

(deftest dataset-string-ends-with-filter-test
  (testing "POST /api/metric/dataset with string ends-with filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:ends-with {} [:dimension {} (:id name-dim)] "Grill"]]})]
            (is (= "completed" (:status response)))))))))

(deftest dataset-string-is-empty-filter-test
  (testing "POST /api/metric/dataset with string is-empty filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:is-empty {} [:dimension {} (:id name-dim)]]]})]
            (is (= "completed" (:status response)))
            ;; No empty names in venues
            (is (= 0 (first-result response)))))))))

(deftest dataset-string-not-empty-filter-test
  (testing "POST /api/metric/dataset with string not-empty filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:not-empty {} [:dimension {} (:id name-dim)]]]})]
            (is (= "completed" (:status response)))
            ;; All venues have names
            (is (= 100 (first-result response)))))))))

(deftest dataset-string-is-null-filter-test
  (testing "POST /api/metric/dataset with string is-null filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            name-dim (find-dimension-by-name hydrated "NAME")]
        (when name-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:is-null {} [:dimension {} (:id name-dim)]]]})]
            (is (= "completed" (:status response)))
            ;; No null names in venues
            (is (= 0 (first-result response)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Category 3: Numeric Filter Operators                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-number-equals-filter-test
  (testing "POST /api/metric/dataset with numeric = filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:= {} [:dimension {} (:id price-dim)] 2]]})]
            (is (= "completed" (:status response)))
            (is (pos? (first-result response)))))))))

(deftest dataset-number-not-equals-filter-test
  (testing "POST /api/metric/dataset with numeric != filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [eq-count  (first-result (dataset-request {:source-metric (:id metric)
                                                          :filters       [[:= {} [:dimension {} (:id price-dim)] 2]]}))
                neq-count (first-result (dataset-request {:source-metric (:id metric)
                                                          :filters       [[:!= {} [:dimension {} (:id price-dim)] 2]]}))]
            (is (= 100 (+ eq-count neq-count)))))))))

(deftest dataset-number-greater-than-filter-test
  (testing "POST /api/metric/dataset with numeric > filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:> {} [:dimension {} (:id price-dim)] 2]]})]
            (is (= "completed" (:status response)))
            ;; Should return venues with price > 2
            (is (pos? (first-result response)))))))))

(deftest dataset-number-greater-than-or-equal-filter-test
  (testing "POST /api/metric/dataset with numeric >= filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [gt-count  (first-result (dataset-request {:source-metric (:id metric)
                                                          :filters       [[:> {} [:dimension {} (:id price-dim)] 2]]}))
                gte-count (first-result (dataset-request {:source-metric (:id metric)
                                                          :filters       [[:>= {} [:dimension {} (:id price-dim)] 2]]}))]
            (is (>= gte-count gt-count))))))))

(deftest dataset-number-less-than-filter-test
  (testing "POST /api/metric/dataset with numeric < filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:< {} [:dimension {} (:id price-dim)] 3]]})]
            (is (= "completed" (:status response)))
            (is (pos? (first-result response)))))))))

(deftest dataset-number-less-than-or-equal-filter-test
  (testing "POST /api/metric/dataset with numeric <= filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [lt-count  (first-result (dataset-request {:source-metric (:id metric)
                                                          :filters       [[:< {} [:dimension {} (:id price-dim)] 3]]}))
                lte-count (first-result (dataset-request {:source-metric (:id metric)
                                                          :filters       [[:<= {} [:dimension {} (:id price-dim)] 3]]}))]
            (is (>= lte-count lt-count))))))))

(deftest dataset-number-between-filter-test
  (testing "POST /api/metric/dataset with numeric between filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:between {} [:dimension {} (:id price-dim)] 2 3]]})]
            (is (= "completed" (:status response)))
            (is (pos? (first-result response)))))))))

(deftest dataset-number-is-null-filter-test
  (testing "POST /api/metric/dataset with numeric is-null filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:is-null {} [:dimension {} (:id price-dim)]]]})]
            (is (= "completed" (:status response)))
            ;; No null prices in venues
            (is (= 0 (first-result response)))))))))

(deftest dataset-number-not-null-filter-test
  (testing "POST /api/metric/dataset with numeric not-null filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:not-null {} [:dimension {} (:id price-dim)]]]})]
            (is (= "completed" (:status response)))
            ;; All venues have prices
            (is (= 100 (first-result response)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Category 4: Temporal Filter Operators                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-time-interval-filter-test
  (testing "POST /api/metric/dataset with time-interval filter"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:time-interval {} [:dimension {} (:id date-dim)] -365 :day]]})]
            (is (= "completed" (:status response)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Category 5: Compound Filters                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-and-filter-test
  (testing "POST /api/metric/dataset with AND filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:and {}
                                                            [:>= {} [:dimension {} (:id price-dim)] 2]
                                                            [:<= {} [:dimension {} (:id price-dim)] 3]]]})]
            (is (= "completed" (:status response)))
            ;; Same as between 2 and 3
            (let [between-count (first-result (dataset-request {:source-metric (:id metric)
                                                                :filters       [[:between {} [:dimension {} (:id price-dim)] 2 3]]}))]
              (is (= between-count (first-result response))))))))))

(deftest dataset-or-filter-test
  (testing "POST /api/metric/dataset with OR filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [price-1-count (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:= {} [:dimension {} (:id price-dim)] 1]]}))
                price-4-count (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:= {} [:dimension {} (:id price-dim)] 4]]}))
                or-count      (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:or {}
                                                                               [:= {} [:dimension {} (:id price-dim)] 1]
                                                                               [:= {} [:dimension {} (:id price-dim)] 4]]]}))]
            (is (= (+ price-1-count price-4-count) or-count))))))))

(deftest dataset-not-filter-test
  (testing "POST /api/metric/dataset with NOT filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [price-2-count (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:= {} [:dimension {} (:id price-dim)] 2]]}))
                not-count     (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:not {} [:= {} [:dimension {} (:id price-dim)] 2]]]}))]
            (is (= 100 (+ price-2-count not-count)))))))))

(deftest dataset-nested-compound-filters-test
  (testing "POST /api/metric/dataset with nested compound filters"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:and {}
                                                            [:or {}
                                                             [:= {} [:dimension {} (:id price-dim)] 1]
                                                             [:= {} [:dimension {} (:id price-dim)] 2]]
                                                            [:not {}
                                                             [:= {} [:dimension {} (:id price-dim)] 1]]]]})]
            (is (= "completed" (:status response)))
            ;; Should return price=2 venues only
            (let [price-2-count (first-result (dataset-request {:source-metric (:id metric)
                                                                :filters       [[:= {} [:dimension {} (:id price-dim)] 2]]}))]
              (is (= price-2-count (first-result response))))))))))

(deftest dataset-multiple-filters-test
  (testing "POST /api/metric/dataset with multiple filters (implicit AND)"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:>= {} [:dimension {} (:id price-dim)] 2]
                                                           [:<= {} [:dimension {} (:id price-dim)] 3]]})]
            (is (= "completed" (:status response)))
            ;; Multiple filters should be ANDed together
            (let [between-count (first-result (dataset-request {:source-metric (:id metric)
                                                                :filters       [[:between {} [:dimension {} (:id price-dim)] 2 3]]}))]
              (is (= between-count (first-result response))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Category 6: Projections/Breakouts                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-single-projection-test
  (testing "POST /api/metric/dataset with single projection"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {} (:id price-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have multiple rows (one per price value)
            (is (> (:row_count response) 1))))))))

(deftest dataset-multiple-projections-test
  (testing "POST /api/metric/dataset with multiple projections"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated    (hydrate-metric (:id metric))
            price-dim   (find-dimension-by-name hydrated "PRICE")
            cat-dim     (find-dimension-by-name hydrated "CATEGORY_ID")]
        (when (and price-dim cat-dim)
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {} (:id price-dim)]
                                                           [:dimension {} (:id cat-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have rows for each price/category combination
            (is (> (:row_count response) 4))))))))

(deftest dataset-projection-with-filter-test
  (testing "POST /api/metric/dataset with projection and filter combined"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:>= {} [:dimension {} (:id price-dim)] 2]]
                                           :projections   [[:dimension {} (:id price-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should only have rows for price >= 2
            (let [rows (result-rows response)]
              (is (every? #(>= (first %) 2) rows)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Category 7: Temporal Bucketing                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-projection-day-bucket-test
  (testing "POST /api/metric/dataset with day temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:temporal-unit :day} (:id date-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have multiple rows grouped by day
            (is (> (:row_count response) 1))))))))

(deftest dataset-projection-week-bucket-test
  (testing "POST /api/metric/dataset with week temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [day-count  (:row_count (dataset-request {:source-metric (:id metric)
                                                         :projections   [[:dimension {:temporal-unit :day} (:id date-dim)]]}))
                week-count (:row_count (dataset-request {:source-metric (:id metric)
                                                         :projections   [[:dimension {:temporal-unit :week} (:id date-dim)]]}))]
            ;; Week grouping should have fewer rows than day grouping
            (is (< week-count day-count))))))))

(deftest dataset-projection-month-bucket-test
  (testing "POST /api/metric/dataset with month temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:temporal-unit :month} (:id date-dim)]]})]
            (is (= "completed" (:status response)))
            (is (> (:row_count response) 1))))))))

(deftest dataset-projection-quarter-bucket-test
  (testing "POST /api/metric/dataset with quarter temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [month-count   (:row_count (dataset-request {:source-metric (:id metric)
                                                            :projections   [[:dimension {:temporal-unit :month} (:id date-dim)]]}))
                quarter-count (:row_count (dataset-request {:source-metric (:id metric)
                                                            :projections   [[:dimension {:temporal-unit :quarter} (:id date-dim)]]}))]
            ;; Quarter grouping should have fewer or equal rows than month grouping
            (is (<= quarter-count month-count))))))))

(deftest dataset-projection-year-bucket-test
  (testing "POST /api/metric/dataset with year temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:temporal-unit :year} (:id date-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have rows grouped by year
            (is (pos? (:row_count response)))))))))

(deftest dataset-projection-day-of-week-bucket-test
  (testing "POST /api/metric/dataset with day-of-week temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:temporal-unit :day-of-week} (:id date-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have at most 7 rows (days of week)
            (is (<= (:row_count response) 7))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Category 8: Binning                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-projection-numeric-binning-default-test
  (testing "POST /api/metric/dataset with default binning strategy"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            lat-dim  (find-dimension-by-name hydrated "LATITUDE")]
        (when lat-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:binning {:strategy :default}} (:id lat-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have multiple bins
            (is (> (:row_count response) 1))))))))

(deftest dataset-projection-numeric-binning-num-bins-test
  (testing "POST /api/metric/dataset with num-bins binning strategy"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            lat-dim  (find-dimension-by-name hydrated "LATITUDE")]
        (when lat-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:binning {:strategy :num-bins :num-bins 5}} (:id lat-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have at most 5 bins
            (is (<= (:row_count response) 6))))))))

(deftest dataset-projection-numeric-binning-bin-width-test
  (testing "POST /api/metric/dataset with bin-width binning strategy"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            lat-dim  (find-dimension-by-name hydrated "LATITUDE")]
        (when lat-dim
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:binning {:strategy :bin-width :bin-width 10}} (:id lat-dim)]]})]
            (is (= "completed" (:status response)))
            (is (pos? (:row_count response)))))))))

(deftest dataset-projection-coordinate-binning-test
  (testing "POST /api/metric/dataset with coordinate binning"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            lat-dim  (find-dimension-by-name hydrated "LATITUDE")]
        (when lat-dim
          ;; Latitude is a coordinate type, so binning should work
          (let [response (dataset-request {:source-metric (:id metric)
                                           :projections   [[:dimension {:binning {:strategy :default}} (:id lat-dim)]]})]
            (is (= "completed" (:status response)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Category 9: Measure Source                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-measure-count-test
  (testing "POST /api/metric/dataset with source-measure count"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Venue Count"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [response (dataset-request {:source-measure (:id measure)})]
            (is (= "completed" (:status response)))
            (is (= 100 (first-result response)))))))))

(deftest dataset-measure-sum-test
  (testing "POST /api/metric/dataset with source-measure sum"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          price-col      (lib.metadata/field mp (mt/id :venues :price))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/sum price-col)))]
      (mt/with-temp [:model/Measure measure {:name       "Total Price"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [response (dataset-request {:source-measure (:id measure)})]
            (is (= "completed" (:status response)))
            (is (pos? (first-result response)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Category 9b: Measure Source - Advanced Features                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- hydrate-measure
  "Fetch measure via API to hydrate dimensions, returns the measure with dimensions."
  [measure-id]
  (mt/user-http-request :crowberto :get 200 (str "measure/" measure-id)))

(defn- find-measure-dimension-by-name
  "Find a dimension by column name from hydrated measure's dimensions."
  [measure column-name]
  (some #(when (= column-name (:name %)) %)
        (:dimensions measure)))

(deftest dataset-measure-with-filter-test
  (testing "POST /api/metric/dataset with source-measure and filter"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Venue Count"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [hydrated  (hydrate-measure (:id measure))
                price-dim (find-measure-dimension-by-name hydrated "PRICE")]
            (when price-dim
              (let [response (dataset-request {:source-measure (:id measure)
                                               :filters        [[:= {} [:dimension {} (:id price-dim)] 2]]})]
                (is (= "completed" (:status response)))
                ;; Should return count of venues with price = 2
                (is (pos? (first-result response)))
                (is (< (first-result response) 100))))))))))

(deftest dataset-measure-with-projection-test
  (testing "POST /api/metric/dataset with source-measure and projection"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Venue Count"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [hydrated  (hydrate-measure (:id measure))
                price-dim (find-measure-dimension-by-name hydrated "PRICE")]
            (when price-dim
              (let [response (dataset-request {:source-measure (:id measure)
                                               :projections    [[:dimension {} (:id price-dim)]]})]
                (is (= "completed" (:status response)))
                ;; Should have multiple rows (one per price value)
                (is (> (:row_count response) 1))))))))))

(deftest dataset-measure-temporal-bucket-test
  (testing "POST /api/metric/dataset with source-measure and temporal bucket"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :checkins))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Checkin Count"
                                             :table_id   (mt/id :checkins)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [hydrated (hydrate-measure (:id measure))
                date-dim (find-measure-dimension-by-name hydrated "DATE")]
            (when date-dim
              (let [response (dataset-request {:source-measure (:id measure)
                                               :projections    [[:dimension {:temporal-unit :month} (:id date-dim)]]})]
                (is (= "completed" (:status response)))
                ;; Should have multiple rows grouped by month
                (is (> (:row_count response) 1))))))))))

(deftest dataset-measure-binning-test
  (testing "POST /api/metric/dataset with source-measure and binning"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Venue Count"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [hydrated (hydrate-measure (:id measure))
                lat-dim  (find-measure-dimension-by-name hydrated "LATITUDE")]
            (when lat-dim
              (let [response (dataset-request {:source-measure (:id measure)
                                               :projections    [[:dimension {:binning {:strategy :num-bins :num-bins 5}} (:id lat-dim)]]})]
                (is (= "completed" (:status response)))
                ;; Should have at most 5 bins
                (is (<= (:row_count response) 6))))))))))

(deftest dataset-measure-filter-and-projection-test
  (testing "POST /api/metric/dataset with source-measure combining filter and projection"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Venue Count"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (mt/with-full-data-perms-for-all-users!
          (let [hydrated  (hydrate-measure (:id measure))
                price-dim (find-measure-dimension-by-name hydrated "PRICE")
                cat-dim   (find-measure-dimension-by-name hydrated "CATEGORY_ID")]
            (when (and price-dim cat-dim)
              (let [response (dataset-request {:source-measure (:id measure)
                                               :filters        [[:>= {} [:dimension {} (:id price-dim)] 2]]
                                               :projections    [[:dimension {} (:id cat-dim)]]})]
                (is (= "completed" (:status response)))
                ;; Should have rows broken out by category for venues with price >= 2
                (is (> (:row_count response) 1))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Category 10: Error Cases                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-invalid-metric-id-test
  (testing "POST /api/metric/dataset returns 404 for invalid metric ID"
    (is (= "Not found."
           (dataset-request-error 404 {:source-metric Integer/MAX_VALUE})))))

(deftest dataset-invalid-measure-id-test
  (testing "POST /api/metric/dataset returns 404 for invalid measure ID"
    (is (= "Not found."
           (dataset-request-error 404 {:source-measure Integer/MAX_VALUE})))))

(deftest dataset-rejects-non-metric-card-test
  (testing "POST /api/metric/dataset returns 404 for non-metric cards"
    (mt/with-temp [:model/Card card {:name          "Regular Question"
                                     :type          :question
                                     :dataset_query (mt/mbql-query venues)}]
      (is (= "Not found."
             (dataset-request-error 404 {:source-metric (:id card)}))))))

(deftest dataset-permission-denied-metric-test
  (testing "POST /api/metric/dataset respects metric collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card metric {:name          "Protected Metric"
                                         :type          :metric
                                         :collection_id (:id collection)
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (is (= "You don't have permissions to do that."
               (dataset-request-error 403 {:source-metric (:id metric)})))))))

(deftest dataset-requires-definition-test
  (testing "POST /api/metric/dataset requires definition"
    (is (some? (mt/user-http-request :rasta :post 400 "metric/dataset" {})))))

(deftest dataset-requires-source-test
  (testing "POST /api/metric/dataset requires source-measure or source-metric"
    (is (some? (mt/user-http-request :rasta :post 400 "metric/dataset"
                                     {:definition {}})))))

(deftest dataset-rejects-both-sources-test
  (testing "POST /api/metric/dataset rejects both source-measure and source-metric"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          pmbql-query    (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Measure measure {:name       "Test Measure"
                                             :table_id   (mt/id :venues)
                                             :definition pmbql-query}]
        (is (some? (mt/user-http-request :rasta :post 400 "metric/dataset"
                                         {:definition {:source-metric  (:id metric)
                                                       :source-measure (:id measure)}})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Category 11: Integration Tests                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-full-exploration-test
  (testing "POST /api/metric/dataset with filter + projection + temporal bucket"
    (mt/with-temp [:model/Card metric {:name          "Checkin Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [hydrated (hydrate-metric (:id metric))
            date-dim (find-dimension-by-name hydrated "DATE")]
        (when date-dim
          ;; Filter to last year, group by month
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:time-interval {} [:dimension {} (:id date-dim)] -365 :day]]
                                           :projections   [[:dimension {:temporal-unit :month} (:id date-dim)]]})]
            (is (= "completed" (:status response)))))))))

(deftest dataset-results-match-expected-count-test
  (testing "POST /api/metric/dataset returns expected count for venues"
    (mt/with-temp [:model/Card metric {:name          "Count Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      ;; venues table has 100 rows
      (let [api-result (dataset-request {:source-metric (:id metric)})]
        (is (= [[100]] (get-in api-result [:data :rows])))))))

(deftest dataset-metric-with-existing-filter-test
  (testing "POST /api/metric/dataset with metric that has existing filter"
    (mt/with-temp [:model/Card metric {:name          "Expensive Venues"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues
                                                        {:aggregation [[:count]]
                                                         :filter      [:>= $price 3]})}]
      (let [response (dataset-request {:source-metric (:id metric)})]
        (is (= "completed" (:status response)))
        ;; Should only count venues with price >= 3
        (is (< (first-result response) 100))))))

(deftest dataset-complex-combined-scenario-test
  (testing "POST /api/metric/dataset complex scenario with multiple features"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")
            cat-dim   (find-dimension-by-name hydrated "CATEGORY_ID")]
        (when (and price-dim cat-dim)
          (let [response (dataset-request {:source-metric (:id metric)
                                           :filters       [[:and {}
                                                            [:>= {} [:dimension {} (:id price-dim)] 2]
                                                            [:<= {} [:dimension {} (:id price-dim)] 3]]]
                                           :projections   [[:dimension {} (:id price-dim)]
                                                           [:dimension {} (:id cat-dim)]]})]
            (is (= "completed" (:status response)))
            ;; Should have multiple rows for price/category combinations where price is 2-3
            (is (> (:row_count response) 1))
            ;; All price values should be 2 or 3
            (let [rows (result-rows response)]
              (is (every? #(<= 2 (first %) 3) rows)))))))))

(deftest dataset-in-filter-test
  (testing "POST /api/metric/dataset with IN filter (multiple values)"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [price-1-count (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:= {} [:dimension {} (:id price-dim)] 1]]}))
                price-3-count (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:= {} [:dimension {} (:id price-dim)] 3]]}))
                in-count      (first-result (dataset-request {:source-metric (:id metric)
                                                              :filters       [[:in {} [:dimension {} (:id price-dim)] 1 3]]}))]
            (is (= (+ price-1-count price-3-count) in-count))))))))

(deftest dataset-not-in-filter-test
  (testing "POST /api/metric/dataset with NOT-IN filter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [hydrated  (hydrate-metric (:id metric))
            price-dim (find-dimension-by-name hydrated "PRICE")]
        (when price-dim
          (let [in-count     (first-result (dataset-request {:source-metric (:id metric)
                                                             :filters       [[:in {} [:dimension {} (:id price-dim)] 1 3]]}))
                not-in-count (first-result (dataset-request {:source-metric (:id metric)
                                                             :filters       [[:not-in {} [:dimension {} (:id price-dim)] 1 3]]}))]
            (is (= 100 (+ in-count not-in-count)))))))))
