(ns metabase.lib.metric-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metric :as lib.metric]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private metric-id 100)

(def ^:private metric-definition
  (-> lib.tu/venues-query
      (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
      (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
      lib.convert/->legacy-MBQL))

(def ^:private metrics-db
  {:cards [{:id            metric-id
            :name          "Sum of Cans"
            :type          :metric
            :database-id   (meta/id)
            :table-id      (meta/id :venues)
            :dataset-query metric-definition
            :description   "Number of toucans plus number of pelicans"}]})

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
  (lib.metadata/metric query-with-metric metric-id))

(deftest ^:parallel display-info-unselected-metric-test
  (testing "Include `:selected false` in display info for Metrics not in aggregations"
    (are [metric] (not (:selected (lib/display-info lib.tu/venues-query metric)))
      metric-clause
      metric-metadata)))

(deftest ^:parallel available-metrics-test
  (let [expected-metric-metadata {:lib/type      :metadata/metric
                                  :id            metric-id
                                  :name          "Sum of Cans"
                                  :table-id      (meta/id :venues)
                                  :dataset-query metric-definition
                                  :description   "Number of toucans plus number of pelicans"}]
    (testing "Should return Metrics with the same Table ID as query's `:source-table`"
      (is (=? [expected-metric-metadata]
              (lib.metric/available-metrics (lib/query metadata-provider (meta/table-metadata :venues))))))
    (testing "Should return the position in the list of aggregations"
      (let [metrics (lib.metric/available-metrics query-with-metric)]
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
    (is (nil? (lib.metric/available-metrics (lib/query metadata-provider (meta/table-metadata :orders))))))
  (testing "for subsequent stages -- don't return Metrics (#37173)"
    (let [query (lib/append-stage (lib/query metadata-provider (meta/table-metadata :venues)))]
      (is (nil? (lib.metric/available-metrics query)))
      (are [stage-number] (nil? (lib.metric/available-metrics query stage-number))
        1 -1)))
  (testing "query with different source table joining the metrics table -- don't return Metrics"
    (let [query (-> (lib/query metadata-provider (meta/table-metadata :categories))
                    (lib/join (-> (lib/join-clause (lib/query metadata-provider (meta/table-metadata :venues))
                                                   [(lib/= (meta/field-metadata :venues :price) 4)])
                                  (lib/with-join-fields :all))))]
      (is (nil? (lib.metric/available-metrics query)))))
  (testing "query based on a card -- don't return Metrics"
    (doseq [card-key [:venues :venues/native]]
      (let [query (lib/query metadata-provider-with-cards (card-key lib.tu/mock-cards))]
        (is (not (lib/uses-metric? query metric-id)))
        (is (nil? (lib.metric/available-metrics (lib/append-stage query))))))))
