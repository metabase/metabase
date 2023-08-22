(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- mbql-query [inner-query]
  {:database 1, :type :query, :query (merge {:source-table 1}
                                            inner-query)})

(deftest ^:parallel basic-expansion-test
  (testing "no Segment or Metric should yield exact same query"
    (is (= (mbql-query
            {:filter   [:> [:field 4 nil] 1]
             :breakout [[:field 17 nil]]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query
             {:filter   [:> [:field 4 nil] 1]
              :breakout [[:field 17 nil]]}))))))

(deftest ^:parallel segments-test
  (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                    (lib.tu/mock-metadata-provider
                                     {:segments [{:id         1
                                                  :name       "Segment 1"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:filter [:= [:field 5 nil] "abc"]}}
                                                 {:id         2
                                                  :name       "Segment 2"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:filter [:is-null [:field 7 nil]]}}]})
                                    meta/metadata-provider)
    (is (= (mbql-query
            {:filter   [:and
                        [:= [:field 5 nil] "abc"]
                        [:or
                         [:is-null [:field 7 nil]]
                         [:> [:field 4 nil] 1]]]
             :breakout [[:field 17 nil]]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query
             {:filter   [:and
                         [:segment 1]
                         [:or
                          [:segment 2]
                          [:> [:field 4 nil] 1]]]
              :breakout [[:field 17 nil]]}))))))

(deftest ^:parallel nested-segments-test
  (let [metadata-provider (lib/composed-metadata-provider
                           (lib.tu/mock-metadata-provider
                            {:segments [{:id         1
                                         :name       "Segment 1"
                                         :table-id   (meta/id :venues)
                                         :definition {:filter [:< [:field (meta/id :venues :price) nil] 3]}}
                                        {:id         2
                                         :name       "Segment 2"
                                         :table-id   (meta/id :venues)
                                         :definition {:filter [:and
                                                               [:segment 1]
                                                               [:> [:field (meta/id :venues :price) nil] 1]]}}]})
                           meta/metadata-provider)]
    (qp.store/with-metadata-provider metadata-provider
      (testing "Nested segments are correctly expanded (#30866)"
        (is (= (lib.tu.macros/mbql-query venues
                 {:filter [:and [:< $price 3] [:> $price 1]]})
               (#'expand-macros/expand-metrics-and-segments
                (lib.tu.macros/mbql-query venues
                  {:filter [:segment 2]}))))))
    ;; Next line makes temporary segment definitions mutually recursive.
    (let [metadata-provider' (lib/composed-metadata-provider
                              (lib.tu/mock-metadata-provider
                               {:segments [(assoc (lib.metadata/segment metadata-provider 1)
                                                  :definition
                                                  {:filter [:and [:< (meta/id :venues :price) 3] [:segment 2]]})]})
                              metadata-provider)]
      (qp.store/with-metadata-provider metadata-provider'
        (testing "Expansion of mutually recursive segments causes an exception"
          (is (thrown-with-msg?
               Exception
               #"\QSegment expansion failed. Check mutually recursive segment definitions.\E"
               (#'expand-macros/expand-metrics-and-segments
                (lib.tu.macros/mbql-query venues {:filter [:segment 2]})))))))))

(deftest ^:parallel metric-test
  (testing "just a metric (w/out nested segments)"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics [{:id         1
                                                   :name       "Toucans in the rainforest"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:count]]
                                                                :filter      [:= [:field 5 nil] "abc"]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "Toucans in the rainforest"}]]
               :filter      [:and
                             [:> [:field 4 nil] 1]
                             [:= [:field 5 nil] "abc"]]
               :breakout    [[:field 17 nil]]
               :order-by    [[:asc [:field 1 nil]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:metric 1]]
                :filter      [:> [:field 4 nil] 1]
                :breakout    [[:field 17 nil]]
                :order-by    [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel use-metric-filter-definition-test
  (testing "check that when the original filter is empty we simply use our metric filter definition instead"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics [{:id         1
                                                   :name       "ABC Fields"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:count]]
                                                                :filter      [:= [:field 5 nil] "abc"]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:count] {:display-name "ABC Fields"}]]
               :filter       [:= [:field 5 nil] "abc"]
               :breakout     [[:field 17 nil]]
               :order-by     [[:asc [:field 1 nil]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric 1]]
                :breakout     [[:field 17 nil]]
                :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel metric-with-no-filter-test
  (testing "metric w/ no filter definition"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics [{:id         1
                                                   :name       "My Metric"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:count]]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "My Metric"}]]
               :filter      [:= [:field 5 nil] "abc"]
               :breakout    [[:field 17 nil]]
               :order-by    [[:asc [:field 1 nil]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:metric 1]]
                :filter      [:= [:field 5 nil] "abc"]
                :breakout    [[:field 17 nil]]
                :order-by    [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel metric-with-nested-segments-test
  (testing "metric w/ nested segments"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:segments [{:id         1
                                                    :name       "Segment 1"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:filter [:between [:field 9 nil] 0 25]}}
                                                   {:id         2
                                                    :name       "Segment 2"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:filter [:is-null [:field 7 nil]]}}]
                                        :metrics  [{:id         1
                                                    :name       "My Metric"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:aggregation [[:sum [:field 18 nil]]]
                                                                 :filter      [:and
                                                                               [:= [:field 5 nil] "abc"]
                                                                               [:segment 1]]}}]})
                                      meta/metadata-provider)
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
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric 1]]
                :filter       [:and
                               [:> [:field 4 nil] 1]
                               [:segment 2]]
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
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:metric (u/the-id metric)]]
                    :breakout    [$price]}))))))))

(deftest ^:parallel dont-expand-ga-metrics-test
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

(deftest ^:parallel dont-expand-ga-segments-test
  (testing "make sure we don't try to expand GA 'segments'"
    (is (= (mbql-query {:filter [:segment "gaid:-11"]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query {:filter [:segment "gaid:-11"]}))))))

(deftest ^:parallel named-metrics-test
  (testing "make sure we can name a :metric"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics  [{:id         1
                                                    :name       "My Metric"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:aggregation [[:sum [:field 20 nil]]]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "Named Metric"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric 1] {:display-name "Named Metric"}]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest include-display-name-test
  (testing (str "if the `:metric` is wrapped in aggregation options that do *not* give it a display name, "
                "`:display-name` should be added to the options")
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics  [{:id         1
                                                    :name       "Toucans in the rainforest"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:aggregation [[:sum [:field 20 nil]]]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric 1] {:name "auto_generated_name"}]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel include-display-name-test-2
  (testing "a Metric whose :aggregation is already named should not get wrapped in an `:aggregation-options` clause"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics  [{:id         1
                                                    :name       "Toucans in the rainforest"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:aggregation [[:aggregation-options
                                                                                [:sum [:field 20 nil]]
                                                                                {:display-name "My Cool Aggregation"}]]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "My Cool Aggregation"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric 1]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel include-display-name-test-3
  (testing "...but if it's wrapped in `:aggregation-options`, but w/o given a display name, we should merge the options"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics  [{:id         1
                                                    :name       "Toucans in the rainforest"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:aggregation [[:aggregation-options
                                                                                [:sum [:field 20 nil]]
                                                                                {:name "auto_generated_name"}]]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric 1]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel segments-in-share-clauses-test
  (testing "segments in :share clauses"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:segments [{:id         1
                                                    :name       "Segment 1"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:filter [:= [:field 5 nil] "abc"]}}
                                                   {:id         2
                                                    :name       "Segment 2"
                                                    :table-id   (meta/id :venues)
                                                    :definition {:filter [:is-null [:field 7 nil]]}}]})
                                      meta/metadata-provider)
      (is (= (mbql-query
              {:aggregation [[:share [:and
                                      [:= [:field 5 nil] "abc"]
                                      [:or
                                       [:is-null [:field 7 nil]]
                                       [:> [:field 4 nil] 1]]]]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:share [:and
                                       [:segment 1]
                                       [:or
                                        [:segment 2]
                                        [:> [:field 4 nil] 1]]]]]})))))))

(deftest ^:parallel expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (qp.store/with-metadata-provider (lib/composed-metadata-provider
                                      (lib.tu/mock-metadata-provider
                                       {:metrics  [(lib.tu.macros/$ids checkins
                                                     {:id         1
                                                      :name       "Toucans in the rainforest"
                                                      :table-id   $$checkins
                                                      :definition {:source-table $$checkins
                                                                   :aggregation  [[:count]]
                                                                   :filter       [:not-null $id]}})]
                                        :segments [(lib.tu.macros/$ids checkins
                                                     {:id         2
                                                      :name       "Segment 1"
                                                      :table-id   $$checkins
                                                      :definition {:filter [:not-null $id]}})]})
                                      meta/metadata-provider)
      (doseq [[macro-type {:keys [before after]}]
              (lib.tu.macros/$ids checkins
                {"Metrics"
                 {:before {:source-table $$checkins
                           :aggregation  [[:metric 1]]}
                  :after  {:source-table $$checkins
                           :aggregation  [[:aggregation-options [:count] {:display-name "Toucans in the rainforest"}]]
                           :filter       [:not-null $id]}}

                 "Segments"
                 {:before {:source-table $$checkins
                           :filter       [:segment 2]}
                  :after  {:source-table $$checkins
                           :filter       [:not-null $id]}}})]
        (testing macro-type
          (testing "nested 1 level"
            (is (= (lib.tu.macros/mbql-query nil
                     {:source-query after})
                   (expand-macros/expand-macros
                    (lib.tu.macros/mbql-query nil
                      {:source-query before})))))
          (testing "nested 2 levels"
            (is (= (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query after}})
                   (expand-macros/expand-macros
                    (lib.tu.macros/mbql-query nil
                      {:source-query {:source-query before}})))))
          (testing "nested 3 levels"
            (is (= (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query {:source-query after}}})
                   (expand-macros/expand-macros
                    (lib.tu.macros/mbql-query nil
                      {:source-query {:source-query {:source-query before}}})))))
          (testing "nested at different levels"
            (is (= (lib.tu.macros/mbql-query nil
                     {:source-query (-> after
                                        (dissoc :source-table)
                                        (assoc :source-query after))})
                   (expand-macros/expand-macros
                    (lib.tu.macros/mbql-query nil
                      {:source-query (-> before
                                         (dissoc :source-table)
                                         (assoc :source-query before))})))))
          (testing "inside :source-query inside :joins"
            (is (= (lib.tu.macros/mbql-query checkins
                     {:joins [{:condition    [:= 1 2]
                               :source-query after}]})
                   (expand-macros/expand-macros
                    (lib.tu.macros/mbql-query checkins
                      {:joins [{:condition    [:= 1 2]
                                :source-query before}]})))))
          (when (= macro-type "Segments")
            (testing "inside join condition"
              (is (= (lib.tu.macros/mbql-query checkins
                       {:joins [{:source-table $$checkins
                                 :condition    (:filter after)}]})
                     (expand-macros/expand-macros
                      (lib.tu.macros/mbql-query checkins
                        {:joins [{:source-table $$checkins
                                  :condition    (:filter before)}]}))))))
          (testing "inside :joins inside :source-query"
            (is (= (lib.tu.macros/mbql-query nil
                     {:source-query {:source-table $$checkins
                                     :joins        [{:condition    [:= 1 2]
                                                     :source-query after}]}})
                   (expand-macros/expand-macros (lib.tu.macros/mbql-query nil
                                    {:source-query {:source-table $$checkins
                                                    :joins        [{:condition    [:= 1 2]
                                                                    :source-query before}]}}))))))))))
