(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor-test :as qp.test]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- mbql-query [inner-query]
  {:database 1, :type :query, :query (merge {:source-table 1}
                                            inner-query)})

(defn- expand-metrics-and-segments [query]
  (qp.store/with-metadata-provider (mt/id)
    (expand-metrics-and-segments query)))

(deftest ^:parallel basic-expansion-test
  (testing "no Segment or Metric should yield exact same query"
    (is (= (mbql-query
            {:filter   [:> [:field 4 nil] 1]
             :breakout [[:field 17 nil]]})
           (expand-metrics-and-segments
            (mbql-query
             {:filter   [:> [:field 4 nil] 1]
              :breakout [[:field 17 nil]]}))))))

(deftest segments-test
  (t2.with-temp/with-temp [:model/Segment  {segment-1-id :id} {:table_id   (mt/id :venues)
                                                               :definition {:filter [:and [:= [:field 5 nil] "abc"]]}}
                           :model/Segment  {segment-2-id :id} {:table_id   (mt/id :venues)
                                                               :definition {:filter [:and [:is-null [:field 7 nil]]]}}]
    (is (= (mbql-query
            {:filter   [:and
                        [:= [:field 5 nil] "abc"]
                        [:or
                         [:is-null [:field 7 nil]]
                         [:> [:field 4 nil] 1]]]
             :breakout [[:field 17 nil]]})
           (expand-metrics-and-segments
            (mbql-query
             {:filter   [:and
                         [:segment segment-1-id]
                         [:or
                          [:segment segment-2-id]
                          [:> [:field 4 nil] 1]]]
              :breakout [[:field 17 nil]]}))))))

(deftest nested-segments-test
  (t2.with-temp/with-temp
    [:model/Segment {s1-id :id} {:table_id   (mt/id :venues)
                                 :definition {:filter [:< (mt/id :venues :price) 3]}}
     :model/Segment {s2-id :id} {:table_id   (mt/id :venues)
                                 :definition {:filter [:and [:segment s1-id] [:> (mt/id :venues :price) 1]]}}]
    (testing "Nested segments are correctly expanded (#30866)"
      (is (= (mt/mbql-query venues {:filter [:and [:< $price 3] [:> $price 1]]})
             (expand-metrics-and-segments
              (mt/mbql-query venues {:filter [:segment s2-id]})))))
    ;; Next line makes temporary segment definitions mutually recursive.
    (t2/update! :model/Segment :id s1-id {:definition {:filter [:and [:< (mt/id :venues :price) 3] [:segment s2-id]]}})
    (testing "Expansion of mutually recursive segments causes an exception"
      (is (thrown? Exception (expand-metrics-and-segments
                              (mt/mbql-query venues {:filter [:segment s2-id]})))))))

(deftest metric-test
  (testing "just a metric (w/out nested segments)"
    (t2.with-temp/with-temp [:model/Metric {metric-1-id :id} {:name       "Toucans in the rainforest"
                                                              :table_id   (mt/id :venues)
                                                              :definition {:aggregation [[:count]]
                                                                           :filter [:and [:= [:field 5 nil] "abc"]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "Toucans in the rainforest"}]]
               :filter      [:and
                             [:> [:field 4 nil] 1]
                             [:= [:field 5 nil] "abc"]]
               :breakout    [[:field 17 nil]]
               :order-by    [[:asc [:field 1 nil]]]})
             (expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:metric metric-1-id]]
                :filter      [:> [:field 4 nil] 1]
                :breakout    [[:field 17 nil]]
                :order-by    [[:asc [:field 1 nil]]]})))))))

(deftest use-metric-filter-definition-test
  (testing "check that when the original filter is empty we simply use our metric filter definition instead"
    (t2.with-temp/with-temp [:model/Metric {metric-1-id :id} {:name       "ABC Fields"
                                                              :table_id   (mt/id :venues)
                                                              :definition {:aggregation [[:count]]
                                                                           :filter [:and [:= [:field 5 nil] "abc"]]}}]
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:count] {:display-name "ABC Fields"}]]
               :filter       [:= [:field 5 nil] "abc"]
               :breakout     [[:field 17 nil]]
               :order-by     [[:asc [:field 1 nil]]]})
             (expand-metrics-and-segments
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric metric-1-id]]
                :breakout     [[:field 17 nil]]
                :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest metric-with-no-filter-test
  (testing "metric w/ no filter definition"
    (t2.with-temp/with-temp [:model/Metric {metric-1-id :id} {:name       "My Metric"
                                                              :table_id   (mt/id :venues)
                                                              :definition {:aggregation [[:count]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "My Metric"}]]
               :filter      [:= [:field 5 nil] "abc"]
               :breakout    [[:field 17 nil]]
               :order-by    [[:asc [:field 1 nil]]]})
             (expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:metric metric-1-id]]
                :filter      [:= [:field 5 nil] "abc"]
                :breakout    [[:field 17 nil]]
                :order-by    [[:asc [:field 1 nil]]]})))))))

(deftest metric-with-nested-segments-test
  (testing "metric w/ nested segments"
    (t2.with-temp/with-temp [:model/Segment {segment-1-id :id} {:table_id   (mt/id :venues)
                                                                :definition
                                                                {:filter [:and [:between [:field 9 nil] 0 25]]}}
                             :model/Segment {segment-2-id :id} {:table_id   (mt/id :venues)
                                                                :definition {:filter [:and [:is-null [:field 7 nil]]]}}
                             :model/Metric {metric-1-id :id} {:name       "My Metric"
                                                              :table_id   (mt/id :venues)
                                                              :definition {:aggregation [[:sum [:field 18 nil]]]
                                                                           :filter      [:and
                                                                                         [:= [:field 5 nil] "abc"]
                                                                                         [:segment segment-1-id]]}}]
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:sum [:field 18 nil]] {:display-name "My Metric"}]]
               :filter       [:and
                              [:> [:field 4 nil] 1]
                              [:is-null [:field 7 nil]]
                              [:= [:field 5 nil] "abc"]
                              [:between [:field 9 nil] 0 25]]
               :breakout     [[:field 17 nil]]
               :order-by     [[:asc [:field 1 nil]]]})
             (expand-metrics-and-segments
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric metric-1-id]]
                :filter       [:and
                               [:> [:field 4 nil] 1]
                               [:segment segment-2-id]]
                :breakout     [[:field 17 nil]]
                :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest metric-with-multiple-aggregation-syntax-test
  (testing "Check that a metric w/ multiple aggregation syntax (nested vector) still works correctly"
    ;; so-called "multiple aggregation syntax" is the norm now -- query normalization will do this automatically
    (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
      (t2.with-temp/with-temp [:model/Metric metric (mt/$ids venues {:table_id $$venues
                                                                     :definition {:aggregation [[:sum $price]]
                                                                                  :filter      [:> $price 1]}})]
        (is (= [[2 118]
                [3  39]
                [4  24]]
               (qp.test/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:metric (u/the-id metric)]]
                    :breakout    [$price]}))))))))

(deftest ^:parallel dont-expand-ga-metrics-test
  (testing "make sure that we don't try to expand GA \"metrics\" (#6104)"
    (doseq [metric ["ga:users" "gaid:users"]]
      (is (= (mbql-query {:aggregation [[:metric metric]]})
             (expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric metric]]}))))))

  (testing "make sure expansion works with multiple GA \"metrics\" (#7399)"
    (is (= (mbql-query {:aggregation [[:metric "ga:users"]
                                      [:metric "ga:1dayUsers"]]})
           (expand-metrics-and-segments
            (mbql-query {:aggregation [[:metric "ga:users"]
                                       [:metric "ga:1dayUsers"]]}))))))

(deftest dont-expand-ga-segments-test
  (testing "make sure we don't try to expand GA 'segments'"
    (is (= (mbql-query {:filter [:segment "gaid:-11"]})
           (expand-metrics-and-segments
            (mbql-query {:filter [:segment "gaid:-11"]}))))))

(deftest named-metrics-test
  (testing "make sure we can name a :metric"
    (t2.with-temp/with-temp [:model/Metric metric {:definition {:aggregation [[:sum [:field 20 nil]]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "Named Metric"}]]
               :breakout    [[:field 10 nil]]})
             (expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric (u/the-id metric)] {:display-name "Named Metric"}]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest include-display-name-test
  (testing (str "if the `:metric` is wrapped in aggregation options that do *not* give it a display name, "
                "`:display-name` should be added to the options")
    (t2.with-temp/with-temp [:model/Metric metric {:definition {:aggregation [[:sum [:field 20 nil]]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
               :breakout    [[:field 10 nil]]})
             (expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric (u/the-id metric)] {:name "auto_generated_name"}]]
                           :breakout    [[:field 10 nil]]}))))))

  (testing "a Metric whose :aggregation is already named should not get wrapped in an `:aggregation-options` clause"
    (t2.with-temp/with-temp [:model/Metric metric {:definition
                                                   {:aggregation [[:aggregation-options
                                                                   [:sum [:field 20 nil]]
                                                                   {:display-name "My Cool Aggregation"}]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "My Cool Aggregation"}]]
               :breakout    [[:field 10 nil]]})
             (expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric (u/the-id metric)]]
                           :breakout    [[:field 10 nil]]}))))))

  (testing "...but if it's wrapped in `:aggregation-options`, but w/o given a display name, we should merge the options"
    (t2.with-temp/with-temp [:model/Metric metric {:definition {:aggregation [[:aggregation-options
                                                                               [:sum [:field 20 nil]]
                                                                               {:name "auto_generated_name"}]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
               :breakout    [[:field 10 nil]]})
             (expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric (u/the-id metric)]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest segments-in-share-clauses-test
  (testing "segments in :share clauses"
    (t2.with-temp/with-temp [:model/Segment {segment-1-id :id} {:table_id   (mt/id :venues)
                                                                :definition {:filter [:and [:= [:field 5 nil] "abc"]]}}
                             :model/Segment {segment-2-id :id} {:table_id   (mt/id :venues)
                                                                :definition {:filter [:and [:is-null [:field 7 nil]]]}}]
      (is (= (mbql-query
              {:aggregation [[:share [:and
                                      [:= [:field 5 nil] "abc"]
                                      [:or
                                       [:is-null [:field 7 nil]]
                                       [:> [:field 4 nil] 1]]]]]})
             (expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:share [:and
                                       [:segment segment-1-id]
                                       [:or
                                        [:segment segment-2-id]
                                        [:> [:field 4 nil] 1]]]]]})))))))

(defn- expand-macros [query]
  (qp.store/with-metadata-provider (mt/id)
    (expand-macros/expand-macros query)))

(deftest expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (t2.with-temp/with-temp [:model/Metric metric (mt/$ids checkins
                                                           {:table_id   $$checkins
                                                            :definition {:source-table $$checkins
                                                                         :aggregation  [[:count]]
                                                                         :filter       [:not-null $id]}})
                             :model/Segment segment (mt/$ids checkins
                                                             {:table_id   $$checkins
                                                              :definition {:filter [:not-null $id]}})]
      (doseq [[macro-type {:keys [before after]}]
              (mt/$ids checkins
                {"Metrics"
                 {:before {:source-table $$checkins
                           :aggregation  [[:metric (u/the-id metric)]]}
                  :after  {:source-table $$checkins
                           :aggregation  [[:aggregation-options [:count] {:display-name "Toucans in the rainforest"}]]
                           :filter       [:not-null $id]}}

                 "Segments"
                 {:before {:source-table $$checkins
                           :filter       [:segment (u/the-id segment)]}
                  :after  {:source-table $$checkins
                           :filter       [:not-null $id]}}})]
        (testing macro-type
          (testing "nested 1 level"
            (is (= (mt/mbql-query nil {:source-query after})
                   (expand-macros
                    (mt/mbql-query nil {:source-query before})))))
          (testing "nested 2 levels"
            (is (= (mt/mbql-query nil {:source-query {:source-query after}})
                   (expand-macros
                    (mt/mbql-query nil {:source-query {:source-query before}})))))
          (testing "nested 3 levels"
            (is (= (mt/mbql-query nil {:source-query {:source-query {:source-query after}}})
                   (expand-macros
                    (mt/mbql-query nil {:source-query {:source-query {:source-query before}}})))))
          (testing "nested at different levels"
            (is (= (mt/mbql-query nil {:source-query (-> after
                                                         (dissoc :source-table)
                                                         (assoc :source-query after))})
                   (expand-macros
                    (mt/mbql-query nil {:source-query (-> before
                                                          (dissoc :source-table)
                                                          (assoc :source-query before))})))))
          (testing "inside :source-query inside :joins"
            (is (= (mt/mbql-query checkins {:joins [{:condition    [:= 1 2]
                                                     :source-query after}]})
                   (expand-macros
                    (mt/mbql-query checkins {:joins [{:condition    [:= 1 2]
                                                      :source-query before}]})))))
          (when (= macro-type "Segments")
            (testing "inside join condition"
              (is (= (mt/mbql-query checkins {:joins [{:source-table $$checkins
                                                       :condition    (:filter after)}]})
                     (expand-macros
                      (mt/mbql-query checkins {:joins [{:source-table $$checkins
                                                        :condition    (:filter before)}]}))))))
          (testing "inside :joins inside :source-query"
            (is (= (mt/mbql-query nil {:source-query {:source-table $$checkins
                                                      :joins        [{:condition    [:= 1 2]
                                                                      :source-query after}]}})
                   (expand-macros (mt/mbql-query nil {:source-query {:source-table $$checkins
                                                                     :joins        [{:condition    [:= 1 2]
                                                                                     :source-query before}]}}))))))))))
