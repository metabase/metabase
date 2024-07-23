(ns metabase.lib.legacy-metric-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private metric-id 100)

(def ^:private metric-definition
  {:source-table (meta/id :venues)
   :aggregation  [[:sum [:field (meta/id :venues :price) nil]]]
   :filter       [:= [:field (meta/id :venues :price) nil] 4]})

(def ^:private metrics-db
  {:metrics [{:id          metric-id
              :name        "Sum of Cans"
              :table-id    (meta/id :venues)
              :definition  metric-definition
              :description "Number of toucans plus number of pelicans"}]})

(def ^:private metadata-provider
  (lib.tu/mock-metadata-provider meta/metadata-provider metrics-db))

(def ^:private metadata-provider-with-cards
  (lib.tu/mock-metadata-provider lib.tu/metadata-provider-with-mock-cards metrics-db))

(def ^:private metric-clause
  [:metric {:lib/uuid (str (random-uuid))} metric-id])

(def ^:private query-with-metric
  (-> (lib/query metadata-provider (meta/table-metadata :venues))
      (lib/aggregate metric-clause)))

(def ^:private metric-metadata
  (lib.metadata/legacy-metric query-with-metric metric-id))

(deftest ^:parallel uses-legacy-metric?-test
  (is (lib/uses-legacy-metric? query-with-metric metric-id))
  (is (not (lib/uses-legacy-metric? lib.tu/venues-query metric-id))))

(deftest ^:parallel query-suggested-name-test
  (is (= "Venues, Sum of Cans"
         (lib/suggested-name query-with-metric))))

(deftest ^:parallel display-name-test
  (doseq [metric [metric-clause
                  metric-metadata]
          style [nil
                 :default
                 :long]]
    (testing (str "metric = " (pr-str metric) "\n"
                  "style = " (pr-str style))
      (is (= "Sum of Cans"
             (if style
               (lib/display-name query-with-metric -1 metric style)
               (lib/display-name query-with-metric metric)))))))

(deftest ^:parallel unknown-display-name-test
  (let [metric [:metric {} 1]]
    (doseq [style [nil
                   :default
                   :long]]
      (testing (str "style = " (pr-str style))
        (is (= "[Unknown Metric]"
               (if style
                 (lib/display-name query-with-metric -1 metric style)
                 (lib/display-name query-with-metric metric))))))))

(deftest ^:parallel display-info-test
  (are [metric] (=? {:name              "sum_of_cans"
                     :display-name      "Sum of Cans"
                     :long-display-name "Sum of Cans"
                     :effective-type    :type/Integer
                     :description       "Number of toucans plus number of pelicans"}
                    (lib/display-info query-with-metric metric))
    metric-clause
    metric-metadata))

(deftest ^:parallel display-info-unselected-metric-test
  (testing "Include `:selected false` in display info for Metrics not in aggregations"
    (are [metric] (not (:selected (lib/display-info lib.tu/venues-query metric)))
      metric-clause
      metric-metadata)))

(deftest ^:parallel metric-expression-display-info-test
  (are [metric] (=? {:display-name      "CC"
                     :long-display-name "CC"
                     :effective-type    :type/Integer
                     :description       "Number of toucans plus number of pelicans"}
                    (lib/display-info query-with-metric metric))
    (update metric-clause 1 assoc :display-name "CC")
    (assoc metric-metadata :display-name "CC")))

(deftest ^:parallel unknown-display-info-test
  (is (=? {:effective-type    :type/*
           :display-name      "[Unknown Metric]"
           :long-display-name "[Unknown Metric]"}
          (lib/display-info query-with-metric [:metric {} 1]))))

(deftest ^:parallel type-of-test
  (are [metric] (= :type/Integer
                   (lib/type-of query-with-metric metric))
    metric-clause
    metric-metadata))

(deftest ^:parallel unknown-type-of-test
  (is (= :type/*
         (lib/type-of query-with-metric [:metric {} 1]))))

(deftest ^:parallel available-legacy-metrics-test
  (let [expected-metric-metadata {:lib/type    :metadata/legacy-metric
                                  :id          metric-id
                                  :name        "Sum of Cans"
                                  :table-id    (meta/id :venues)
                                  :definition  metric-definition
                                  :description "Number of toucans plus number of pelicans"}]
    (testing "Should return Metrics with the same Table ID as query's `:source-table`"
      (is (=? [expected-metric-metadata]
              (lib/available-legacy-metrics (lib/query metadata-provider (meta/table-metadata :venues))))))
    (testing "Should return the position in the list of aggregations"
      (let [metrics (lib/available-legacy-metrics query-with-metric)]
        (is (=? [(assoc expected-metric-metadata :aggregation-position 0)]
                metrics))
        (testing "Display info should contains aggregation-position"
          (is (=? [{:name                 "sum_of_cans",
                    :display-name         "Sum of Cans",
                    :long-display-name    "Sum of Cans",
                    :effective-type       :type/Integer,
                    :description          "Number of toucans plus number of pelicans",
                    :aggregation-position 0}]
                  (map #(lib/display-info query-with-metric %)
                       metrics)))))))
  (testing "query with different Table -- don't return Metrics"
    (is (nil? (lib/available-legacy-metrics (lib/query metadata-provider (meta/table-metadata :orders))))))
  (testing "for subsequent stages -- don't return Metrics (#37173)"
    (let [query (lib/append-stage (lib/query metadata-provider (meta/table-metadata :venues)))]
      (is (nil? (lib/available-legacy-metrics query)))
      (are [stage-number] (nil? (lib/available-legacy-metrics query stage-number))
        1 -1)))
  (testing "query with different source table joining the metrics table -- don't return Metrics"
    (let [query (-> (lib/query metadata-provider (meta/table-metadata :categories))
                    (lib/join (-> (lib/join-clause (lib/query metadata-provider (meta/table-metadata :venues))
                                                   [(lib/= (meta/field-metadata :venues :price) 4)])
                                  (lib/with-join-fields :all))))]
      (is (nil? (lib/available-legacy-metrics query)))))
  (testing "query based on a card -- don't return Metrics"
    (doseq [card-key [:venues :venues/native]]
      (let [query (lib/query metadata-provider-with-cards (card-key lib.tu/mock-cards))]
        (is (not (lib/uses-legacy-metric? query metric-id)))
        (is (nil? (lib/available-legacy-metrics (lib/append-stage query))))))))

(deftest ^:parallel aggregate-with-metric-test
  (testing "Should be able to pass a Metric metadata to `aggregate`"
    (let [query   (lib/query metadata-provider (meta/table-metadata :venues))
          metrics (lib/available-legacy-metrics query)]
      (is (= 1
             (count metrics)))
      ;; test with both `:metadata/legacy-metric` and with a `:metric` ref clause
      (doseq [metric [(first metrics)
                      [:metric {:lib/uuid (str (random-uuid))} 100]]]
        (testing (pr-str (list 'lib/aggregate 'query metric))
          (let [query' (lib/aggregate query metric)]
            (is (lib/uses-legacy-metric? query' metric-id))
            (is (=? {:lib/type :mbql/query
                     :stages   [{:lib/type     :mbql.stage/mbql
                                 :source-table (meta/id :venues)
                                 :aggregation  [[:metric {:lib/uuid string?} 100]]}]}
                    query'))
            (is (=? [[:metric {:lib/uuid string?} 100]]
                    (lib/aggregations query')))
            (is (=? [{:name              "sum_of_cans"
                      :display-name      "Sum of Cans"
                      :long-display-name "Sum of Cans"
                      :effective-type    :type/Integer
                      :description       "Number of toucans plus number of pelicans"}]
                    (map (partial lib/display-info query')
                         (lib/aggregations query'))))))))))

(deftest ^:parallel metric-type-of-test
  (let [query    (-> (lib/query metadata-provider (meta/table-metadata :venues))
                     (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} 100]))]
    (is (lib/uses-legacy-metric? query metric-id))
    (is (= :type/Integer
           (lib/type-of query [:metric {:lib/uuid (str (random-uuid))} 100])))))

(deftest ^:parallel ga-metric-metadata-test
  (testing "Make sure we can calculate metadata for FAKE Google Analytics metric clauses"
    (let [metric-name "ga:totalEvents"
          query (-> lib.tu/venues-query
                    (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} metric-name]))]
      (is (lib/uses-legacy-metric? query metric-name))
      (is (=? [{:base-type                :type/*
                :display-name             "[Unknown Metric]"
                :effective-type           :type/*
                :name                     "metric"
                :lib/desired-column-alias "metric"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "metric"
                :lib/type                 :metadata/column}]
              (lib/returned-columns query -1 query))))))
