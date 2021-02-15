(ns metabase.query-processor.middleware.expand-macros-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.expand-macros :as expand-macros]
            [metabase.test :as mt]
            [metabase.util :as u]))

(defn- mbql-query [inner-query]
  {:database 1, :type :query, :query (merge {:source-table 1}
                                            inner-query)})

(deftest basic-expansion-test
  (testing "no Segment or Metric should yield exact same query"
    (is (= (mbql-query
            {:filter   [:> [:field-id 4] 1]
             :breakout [[:field-id 17]]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query
             {:filter   [:> [:field-id 4] 1]
              :breakout [[:field-id 17]]}))))))

(deftest segments-test
 (mt/with-temp* [Database [{database-id :id}]
                 Table    [{table-id :id}     {:db_id database-id}]
                 Segment  [{segment-1-id :id} {:table_id   table-id
                                               :definition {:filter [:and [:= [:field-id 5] "abc"]]}}]
                 Segment  [{segment-2-id :id} {:table_id   table-id
                                               :definition {:filter [:and [:is-null [:field-id 7]]]}}]]
   (is (= (mbql-query
           {:filter   [:and
                       [:= [:field-id 5] "abc"]
                       [:or
                        [:is-null [:field-id 7]]
                        [:> [:field-id 4] 1]]]
            :breakout [[:field-id 17]]})
          (#'expand-macros/expand-metrics-and-segments
           (mbql-query
            {:filter   [:and
                        [:segment segment-1-id]
                        [:or
                         [:segment segment-2-id]
                         [:> [:field-id 4] 1]]]
             :breakout [[:field-id 17]]}))))))

(deftest metric-test
  (testing "just a metric (w/out nested segments)"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]
                    Metric   [{metric-1-id :id} {:name       "Toucans in the rainforest"
                                                 :table_id   table-id
                                                 :definition {:aggregation [[:count]]
                                                              :filter      [:and [:= [:field-id 5] "abc"]]}}]]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "Toucans in the rainforest"}]]
               :filter      [:and
                             [:> [:field-id 4] 1]
                             [:= [:field-id 5] "abc"]]
               :breakout    [[:field-id 17]]
               :order-by    [[:asc [:field-id 1]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:metric metric-1-id]]
                :filter      [:> [:field-id 4] 1]
                :breakout    [[:field-id 17]]
                :order-by    [[:asc [:field-id 1]]]})))))))

(deftest use-metric-filter-definition-test
  (testing "check that when the original filter is empty we simply use our metric filter definition instead"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]
                    Metric   [{metric-1-id :id} {:name       "ABC Fields"
                                                 :table_id   table-id
                                                 :definition {:aggregation [[:count]]
                                                              :filter      [:and [:= [:field-id 5] "abc"]]}}]]
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:count] {:display-name "ABC Fields"}]]
               :filter       [:= [:field-id 5] "abc"]
               :breakout     [[:field-id 17]]
               :order-by     [[:asc [:field-id 1]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric metric-1-id]]
                :breakout     [[:field-id 17]]
                :order-by     [[:asc [:field-id 1]]]})))))))

(deftest metric-with-no-filter-test
  (testing "metric w/ no filter definition"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]
                    Metric   [{metric-1-id :id} {:name       "My Metric"
                                                 :table_id   table-id
                                                 :definition {:aggregation [[:count]]}}]]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "My Metric"}]]
               :filter      [:= [:field-id 5] "abc"]
               :breakout    [[:field-id 17]]
               :order-by    [[:asc [:field-id 1]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:metric metric-1-id]]
                :filter      [:= [:field-id 5] "abc"]
                :breakout    [[:field-id 17]]
                :order-by    [[:asc [:field-id 1]]]})))))))

(deftest metric-with-nested-segments-test
  (testing "metric w/ nested segments"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}     {:db_id database-id}]
                    Segment  [{segment-1-id :id} {:table_id   table-id
                                                  :definition {:filter [:and [:between [:field-id 9] 0 25]]}}]
                    Segment  [{segment-2-id :id} {:table_id   table-id
                                                  :definition {:filter [:and [:is-null [:field-id 7]]]}}]
                    Metric   [{metric-1-id :id}  {:name       "My Metric"
                                                  :table_id   table-id
                                                  :definition {:aggregation [[:sum [:field-id 18]]]
                                                               :filter      [:and
                                                                             [:= [:field-id 5] "abc"]
                                                                             [:segment segment-1-id]]}}]]
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:sum [:field-id 18]] {:display-name "My Metric"}]]
               :filter       [:and
                              [:> [:field-id 4] 1]
                              [:is-null [:field-id 7]]
                              [:= [:field-id 5] "abc"]
                              [:between [:field-id 9] 0 25]]
               :breakout     [[:field-id 17]]
               :order-by     [[:asc [:field-id 1]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric metric-1-id]]
                :filter       [:and
                               [:> [:field-id 4] 1]
                               [:segment segment-2-id]]
                :breakout     [[:field-id 17]]
                :order-by     [[:asc [:field-id 1]]]})))))))

(deftest metric-with-multiple-aggregation-syntax-test
  (testing "Check that a metric w/ multiple aggregation syntax (nested vector) still works correctly"
    ;; so-called "multiple aggregation syntax" is the norm now -- query normalization will do this automatically
    (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
      (mt/with-temp Metric [metric {:table_id   (mt/id :venues)
                                    :definition {:aggregation [[:sum [:field-id (mt/id :venues :price)]]]
                                                 :filter      [:> [:field-id (mt/id :venues :price)] 1]}}]
        (is (= [[2 118]
                [3  39]
                [4  24]]
               (qp.test/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:metric (u/the-id metric)]]
                    :breakout    [$price]}))))))))

(deftest dont-expand-ga-metrics-test
  (testing "make sure that we don't try to expand GA \"metrics\" (#6104)"
    (doseq [metric ["ga:users" "gaid:users"]]
      (is (= (mbql-query {:aggregation [[:metric metric]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric metric]]}))))))

  (testing "make sure expansion works with multiple GA \"metrics\" (#7399)"
    (is (= (mbql-query {:aggregation [[:metric "ga:users"]
                                      [:metric "ga:1dayUsers"]]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query {:aggregation [[:metric "ga:users"]
                                       [:metric "ga:1dayUsers"]]}))))))

(deftest dont-expand-ga-segments-test
  (testing "make sure we don't try to expand GA 'segments'"
    (is (= (mbql-query {:filter [:segment "gaid:-11"]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query {:filter [:segment "gaid:-11"]}))))))

(deftest named-metrics-test
  (testing "make sure we can name a :metric"
    (mt/with-temp Metric [metric {:definition {:aggregation [[:sum [:field-id 20]]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field-id 20]] {:display-name "Named Metric"}]]
               :breakout    [[:field-id 10]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options [:metric (u/the-id metric)] {:display-name "Named Metric"}]]
                           :breakout    [[:field-id 10]]})))))))

(deftest include-display-name-test
  (testing (str "if the `:metric` is wrapped in aggregation options that do *not* give it a display name, "
                "`:display-name` should be added to the options")
    (mt/with-temp Metric [metric {:definition {:aggregation [[:sum [:field-id 20]]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field-id 20]]
                              {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
               :breakout    [[:field-id 10]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options [:metric (u/the-id metric)] {:name "auto_generated_name"}]]
                           :breakout    [[:field-id 10]]}))))))

  (testing "a Metric whose :aggregation is already named should not get wrapped in an `:aggregation-options` clause"
    (mt/with-temp Metric [metric {:definition {:aggregation [[:aggregation-options
                                                              [:sum [:field-id 20]]
                                                              {:display-name "My Cool Aggregation"}]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field-id 20]] {:display-name "My Cool Aggregation"}]]
               :breakout    [[:field-id 10]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric (u/the-id metric)]]
                           :breakout    [[:field-id 10]]}))))))

  (testing "...but if it's wrapped in `:aggregation-options`, but w/o given a display name, we should merge the options"
    (mt/with-temp Metric [metric {:definition {:aggregation [[:aggregation-options
                                                              [:sum [:field-id 20]]
                                                              {:name "auto_generated_name"}]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field-id 20]]
                              {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
               :breakout    [[:field-id 10]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric (u/the-id metric)]]
                           :breakout    [[:field-id 10]]})))))))

(deftest segments-in-share-clauses-test
  (testing "segments in :share clauses"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}     {:db_id database-id}]
                    Segment  [{segment-1-id :id} {:table_id   table-id
                                                  :definition {:filter [:and [:= [:field-id 5] "abc"]]}}]
                    Segment  [{segment-2-id :id} {:table_id   table-id
                                                  :definition {:filter [:and [:is-null [:field-id 7]]]}}]]
      (is (= (mbql-query
              {:aggregation [[:share [:and
                                      [:= [:field-id 5] "abc"]
                                      [:or
                                       [:is-null [:field-id 7]]
                                       [:> [:field-id 4] 1]]]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:share [:and
                                       [:segment segment-1-id]
                                       [:or
                                        [:segment segment-2-id]
                                        [:> [:field-id 4] 1]]]]]})))))))
