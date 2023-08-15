(ns metabase.lib.metric-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private metric-id 100)

(def ^:private metric-definition
  {:source-table (meta/id :venues)
   :aggregation  [[:sum [:field (meta/id :venues :price) nil]]]
   :filter       [:= [:field (meta/id :venues :price) nil] 4]})

(def ^:private metadata-provider
  (lib.tu/mock-metadata-provider
   {:database meta/metadata
    :tables   [(meta/table-metadata :venues)]
    :fields   [(meta/field-metadata :venues :price)]
    :metrics  [{:id          metric-id
                :name        "Sum of Cans"
                :table-id    (meta/id :venues)
                :definition  metric-definition
                :description "Number of toucans plus number of pelicans"}]}))

(def ^:private metric-clause
  [:metric {:lib/uuid (str (random-uuid))} metric-id])

(def ^:private query-with-metric
  (-> (lib/query metadata-provider (meta/table-metadata :venues))
      (lib/aggregate metric-clause)))

(def ^:private metric-metadata
  (lib.metadata/metric query-with-metric metric-id))

(deftest ^:parallel query-suggested-name-test
  (is (= "Venues, Sum of Cans"
         (lib.metadata.calculation/suggested-name query-with-metric))))

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
               (lib.metadata.calculation/display-name query-with-metric -1 metric style)
               (lib.metadata.calculation/display-name query-with-metric metric)))))))

(deftest ^:parallel unknown-display-name-test
  (let [metric [:metric {} 1]]
    (doseq [style [nil
                   :default
                   :long]]
      (testing (str "style = " (pr-str style))
        (is (= "[Unknown Metric]"
               (if style
                 (lib.metadata.calculation/display-name query-with-metric -1 metric style)
                 (lib.metadata.calculation/display-name query-with-metric metric))))))))

(deftest ^:parallel display-info-test
  (are [metric] (=? {:name              "sum_of_cans"
                     :display-name      "Sum of Cans"
                     :long-display-name "Sum of Cans"
                     :effective-type    :type/Integer
                     :description       "Number of toucans plus number of pelicans"
                     :selected          true}
                    (lib.metadata.calculation/display-info query-with-metric metric))
    metric-clause
    metric-metadata))

(deftest ^:parallel display-info-unselected-metric-test
  (testing "Include `:selected false` in display info for Metrics not in aggregations"
    (are [metric] (not (:selected (lib.metadata.calculation/display-info lib.tu/venues-query metric)))
      metric-clause
      metric-metadata)))

(deftest ^:parallel unknown-display-info-test
  (is (=? {:effective-type    :type/*
           :display-name      "[Unknown Metric]"
           :long-display-name "[Unknown Metric]"}
          (lib.metadata.calculation/display-info query-with-metric [:metric {} 1]))))

(deftest ^:parallel type-of-test
  (are [metric] (= :type/Integer
                   (lib.metadata.calculation/type-of query-with-metric metric))
    metric-clause
    metric-metadata))

(deftest ^:parallel unknown-type-of-test
  (is (= :type/*
         (lib.metadata.calculation/type-of query-with-metric [:metric {} 1]))))

(deftest ^:parallel available-metrics-test
  (testing "Should return Metrics with the same Table ID as query's `:source-table`"
    (is (=? [{:lib/type    :metadata/metric
              :id          metric-id
              :name        "Sum of Cans"
              :table-id    (meta/id :venues)
              :definition  metric-definition
              :description "Number of toucans plus number of pelicans"}]
            (lib/available-metrics (lib/query metadata-provider (meta/table-metadata :venues))))))
  (testing "query with different Table -- don't return Metrics"
    (is (nil? (lib/available-metrics (lib/query metadata-provider (meta/table-metadata :orders)))))))

(deftest ^:parallel aggregate-with-metric-test
  (testing "Should be able to pass a Metric metadata to `aggregate`"
    (let [query   (lib/query metadata-provider (meta/table-metadata :venues))
          metrics (lib/available-metrics query)]
      (is (= 1
             (count metrics)))
      ;; test with both `:metadata/metric` and with a `:metric` ref clause
      (doseq [metric [(first metrics)
                      [:metric {:lib/uuid (str (random-uuid))} 100]]]
        (testing (pr-str (list 'lib/aggregate 'query metric))
          (let [query' (lib/aggregate query metric)]
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
                      :description       "Number of toucans plus number of pelicans"
                      :selected          true}]
                    (map (partial lib/display-info query')
                         (lib/aggregations query'))))))))))

(deftest ^:parallel metric-type-of-test
  (let [query    (-> (lib/query metadata-provider (meta/table-metadata :venues))
                     (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} 100]))]
    (is (= :type/Integer
           (lib.metadata.calculation/type-of query [:metric {:lib/uuid (str (random-uuid))} 100])))))

(deftest ^:parallel ga-metric-metadata-test
  (testing "Make sure we can calculate metadata for FAKE Google Analytics metric clauses"
    (let [query (-> lib.tu/venues-query
                    (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} "ga:totalEvents"]))]
      (is (=? [{:base-type                :type/*
                :display-name             "[Unknown Metric]"
                :effective-type           :type/*
                :name                     "metric"
                :lib/desired-column-alias "metric"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "metric"
                :lib/type                 :metadata/column}]
              (lib.metadata.calculation/returned-columns query -1 query))))))
