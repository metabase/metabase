(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]
   [metabase.util :as u]))

(defn- mbql-query [inner-query]
  {:database 1, :type :query, :query (merge {:source-table 1}
                                            inner-query)})

(deftest basic-expansion-test ^:parallel
  (testing "no Segment or Metric should yield exact same query"
    (is (= (mbql-query
            {:filter   [:> [:field 4 nil] 1]
             :breakout [[:field 17 nil]]})
           (#'expand-macros/expand-metrics-and-segments
            (mbql-query
             {:filter   [:> [:field 4 nil] 1]
              :breakout [[:field 17 nil]]}))))))

(def ^:private mock-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:segments [{:id         1
                :name       "Segment 1"
                :table-id   (meta/id :venues)
                :definition {:filter [:= [:field 5 nil] "abc"]}}
               {:id         2
                :name       "Segment 2"
                :table-id   (meta/id :venues)
                :definition {:filter [:is-null [:field 7 nil]]}}]
    :metrics  [{:id         1
                :name       "Metric 1"
                :table-id   (meta/id :venues)
                :definition {:aggregation [[:aggregation-options
                                            [:sum [:field 20 nil]]
                                            {:display-name "My Cool Aggregation"}]]
                             :filter      [:= [:field 5 nil] "abc"]}}]}))

(deftest ^:parallel segments-test
  (qp.store/with-metadata-provider mock-metadata-provider
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

(comment
  (require '[mb.hawk.core :as hawk])
  (hawk/run-tests [#'metabase.query-processor.middleware.expand-macros-test/segments-test])
  )

(deftest ^:parallel nested-segments-test
  (let [metadata-provider (lib.tu/mock-metadata-provider
                           mock-metadata-provider
                           {:segments [{:id         2
                                        :name       "Segment 2"
                                        :table-id   (meta/id :venues)
                                        :definition {:filter [:and
                                                              [:segment 1]
                                                              [:> [:field 6 nil] 1]]}}]})]
    (qp.store/with-metadata-provider metadata-provider
      (testing "Nested segments are correctly expanded (#30866)"
        (is (= (lib.tu.macros/mbql-query venues
                 {:filter [:and
                           [:= [:field 5 nil] "abc"]
                           [:> [:field 6 nil] 1]]})
               (#'expand-macros/expand-metrics-and-segments
                (lib.tu.macros/mbql-query venues
                  {:filter [:segment 2]}))))))
    ;; Next line makes temporary segment definitions mutually recursive.
    (let [metadata-provider' (lib.tu/mock-metadata-provider
                              metadata-provider
                              {:segments [(assoc (lib.metadata/segment metadata-provider 1)
                                                 :definition
                                                 {:filter [:and [:< (meta/id :venues :price) 3] [:segment 2]]})]})]
      (qp.store/with-metadata-provider metadata-provider'
        (testing "Expansion of mutually recursive segments causes an exception"
          (is (thrown-with-msg?
               Exception
               #"\QSegment expansion failed. Check mutually recursive segment definitions.\E"
               (#'expand-macros/expand-metrics-and-segments
                (lib.tu.macros/mbql-query venues {:filter [:segment 2]})))))))))

(deftest ^:parallel metric-test
  (testing "just a metric (w/out nested segments)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:display-name "My Cool Aggregation"}]]
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
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics [{:id         1
                                                  :name       "ABC Fields"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:aggregation [[:count]]
                                                               :filter      [:= [:field 5 nil] "abc"]}}]})
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
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics [{:id         1
                                                  :name       "My Metric"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:aggregation [[:count]]}}]})
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
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      mock-metadata-provider
                                      {:metrics [{:id         1
                                                  :name       "My Metric"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:aggregation [[:sum [:field 18 nil]]]
                                                               :filter      [:and
                                                                             [:between [:field 9 nil] 0 25]
                                                                             [:segment 1]]}}]})
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:sum [:field 18 nil]] {:display-name "My Metric"}]]
               :filter       [:and
                              [:> [:field 4 nil] 1]
                              [:is-null [:field 7 nil]]
                              [:between [:field 9 nil] 0 25]
                              [:= [:field 5 nil] "abc"]]
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

(deftest ^:parallel metric-with-multiple-aggregation-syntax-test
  (testing "Check that a metric w/ multiple aggregation syntax (nested vector) still works correctly"
    ;; so-called "multiple aggregation syntax" is the norm now -- query normalization will do this automatically
    (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                        {:metrics [(mt/$ids venues
                                                     {:id         1
                                                      :name       "Metric 1"
                                                      :table-id   $$venues
                                                      :definition {:aggregation [[:sum $price]]
                                                                   :filter      [:> $price 1]}})]})
        (is (= [[2 118]
                [3  39]
                [4  24]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:metric 1]]
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
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics  [{:id         1
                                                   :name       "My Metric"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:sum [:field 20 nil]]]}}]})
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
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics  [{:id         1
                                                   :name       "Metric 1"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:sum [:field 20 nil]]]}}]})
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Metric 1"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric 1] {:name "auto_generated_name"}]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel include-display-name-test-2
  (testing "a Metric whose :aggregation is already named should not get wrapped in an `:aggregation-options` clause"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (=? (mbql-query
               {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "My Cool Aggregation"}]]
                :breakout    [[:field 10 nil]]})
              (#'expand-macros/expand-metrics-and-segments
               (mbql-query {:aggregation [[:metric 1]]
                            :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel include-display-name-test-3
  (testing "...but if it's wrapped in `:aggregation-options`, but w/o given a display name, we should merge the options"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics  [{:id         1
                                                   :name       "Metric 1"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:aggregation-options
                                                                               [:sum [:field 20 nil]]
                                                                               {:name "auto_generated_name"}]]}}]})
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Metric 1"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query {:aggregation [[:metric 1]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel segments-in-share-clauses-test
  (testing "segments in :share clauses"
    (qp.store/with-metadata-provider mock-metadata-provider
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

;;;; TODO: double check agains master!
(deftest ^:parallel expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (doseq [[macro-type {:keys [before after]}]
              (lib.tu.macros/$ids checkins
                {"Metrics"
                 {:before {:source-table $$checkins
                           :aggregation  [[:metric 1]]}
                  :after  {:source-table $$checkins
                           :aggregation  [[:aggregation-options [:sum [:field 20 nil]] {:display-name "My Cool Aggregation"}]]
                           :filter       [:= [:field 5 nil] "abc"]}}

                 "Segments"
                 {:before {:source-table $$checkins
                           :filter       [:segment 2]}
                  :after  {:source-table $$checkins
                           :filter       [:is-null [:field 7 nil]]}}})]
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

;; (deftest metric-expand-filter-test)


;; (deftest metric-naming-test)

;; (deftest metric-correct-order-test)


;;;; - [ ] metric-query-unexpanded-segments-test, expect exception

;;;; - [ ] no breakout, one breakout, multiple breakouts (join condition) -- variadic :and

;;;; - [ ] verify that there are enough join conditions generated

;;;; - [ ] filter expandsion

;;;; - [ ] duplicit naming

;;;; - [ ] proper ordering test

;;;; - [ ] transform-aggregation

;;;; - [ ] metric in nested join

;;;; - [ ] metric in source-query

;;;; - [ ] metric in saved query

;;;; TODO: Here make more tests for expansion rather then query execution.
(deftest simple-metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {id :id}
       {:name "venues, count"
        :description "Metric doing count with no filtering."
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:aggregation [[:count]]})}]
      (testing "Query containing metric returns correct results"
        (testing "no query filter, no breakout"
          (let [_q @(def qqq (mt/mbql-query venues {:aggregation [[:metric id]]}))]
            (is (= [[100]]
                   (mt/rows (mt/run-mbql-query venues {:aggregation [[:metric id]]}))))))
        (testing "no filter, with breakout"
          (is (= [[2 8] [3 2] [4 2] [5 7] [6 2]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]
                                                 :breakout [$category_id]
                                                 :order-by [[:asc $category_id]]
                                                 :limit 5})
                      (mt/formatted-rows [int int])))))
        (testing "with query filter, with breakout"
          (is (= [[11 4] [12 1] [13 1] [14 1] [15 1]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]
                                                 :filter [:> $category_id 10]
                                                 :breakout [$category_id]
                                                 :order-by [[:asc $category_id]]
                                                 :limit 5})
                      (mt/formatted-rows [int int])))))
        (testing "with query filter, no breakout"
          (is (= [[67]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]
                                                 :filter [:> $category_id 10]})
                      (mt/formatted-rows [int])))))))))

(comment
  (mt/with-db (t2/select-one :model/Database :id 2)
    (mt/with-everything-store
      (t2.with-temp/with-temp
        [:model/Metric
         {id :id}
         {:name "some metric"
          :definition {:aggregation [[:count]]}}]
        (def mm (t2/select-one :model/Metric :id id))
        (mt/run-mbql-query venues {:aggregation [[:metric id]]}))))
  mm
  )

;;;; TODO: Double check values!
;;;; TODO: Here make more tests for expansion rather then query execution.
(deftest metric-with-filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {id :id}
       {:name "venues, count"
        :table_id (mt/id :venues)
        :description "Metric doing count with no filtering."
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]
                                     :filter [:> $category_id 2]})}]
      (testing "Query with metric that uses filter returns correct results"
        (testing "No query filter, no query breakout"
          (is (= [[92]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]})
                      (mt/formatted-rows [int])))))
        (testing "No query filter, breakout"
          (is (= [[2 nil] [3 2] [4 2] [5 7] [6 2]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]
                                                 :breakout [$category_id]
                                                 :order-by [[:asc $category_id]]
                                                 :limit 5})
                      (mt/formatted-rows [int int])))))
        (testing "Query filter, breakout"
          (is (= [[2 nil] [3 2] [4 2] [5 7]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]
                                                 :filter [:< $category_id 6]
                                                 :breakout [$category_id]
                                                 :order-by [[:asc $category_id]]
                                                 :limit 5})
                      (mt/formatted-rows [int int])))))
        (testing "with query filter, no breakout"
          (is (= [[11]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]
                                                 :filter [:< $category_id 6]})
                      (mt/formatted-rows [int int])))))))))

;;;; TODO: Double check values!
;;;; TODO: Here make more tests for expansion rather then query execution.
;;;; NOTE: Prev testing: Filter in query is correctly combined with segment filter in metric
;;;; TODO: Wrong!
(deftest metric-with-segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Segment
       {segment->2 :id}
       {:definition (mt/$ids venues {:filter [:> $category_id 2]})}

       :model/Segment
       {segment-<6 :id}
       {:definition (mt/$ids venues {:filter [:< $category_id 6]})}

       :model/Metric
       {metric-id :id}
       {:name "venues, count"
        :description "Metric doing count with no filtering."
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]
                                     :filter [:segment segment->2]})}]
      (testing "Query with metric that uses segment returns expected results"
        (testing "No query filter, No breakout"
          (is (= [[92]]
                 (mt/rows (mt/run-mbql-query venues {:aggregation [[:metric metric-id]]})))))
        (testing "With segment query filter, No breakout"
          (is (= [[11]]
                 (mt/rows (mt/run-mbql-query venues {:aggregation [[:metric metric-id]]
                                                     :filter [:segment segment-<6]})))))
        (testing "With segment query filter, with breakout"
          (is (= [[2 nil] [3 2] [4 2] [5 7]]
                 (mt/rows (mt/run-mbql-query venues {:aggregation [[:metric metric-id]]
                                                     :filter [:segment segment-<6]
                                                     :breakout [$category_id]
                                                     :order-by [[:asc $category_id]]
                                                     :limit 5})))))
        (testing "No query filter, with breakout"
          (is (= [[2 nil] [3 2] [4 2] [5 7] [6 2]]
                 (mt/rows (mt/run-mbql-query venues {:aggregation [[:metric metric-id]]
                                                     :breakout [$category_id]
                                                     :order-by [[:asc $category_id]]
                                                     :limit 5})))))))))

;;;; TODO: Double check values!
(deftest metric-with-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {metric-id :id}
       {:name "venues, count"
        :table_id (mt/id :venues)
        :description "Metric doing count with no filtering."
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}]
      (testing "Query containing metrics and expressions returns correct results"
        (testing "Expression in breakout"
          (is (= [[12 8] [13 2] [14 2] [15 7] [16 2]] ;; data ok
                 (mt/rows (mt/run-mbql-query venues {:expressions {"cat+10" [:+ $category_id 10]
                                                                   "redundant expression" [:+ $category_id 111]}
                                                     :aggregation [[:metric metric-id]]
                                                     :breakout [[:expression "cat+10"]]
                                                     :order-by [[:asc $category_id]]
                                                     :limit 5})))))
        (testing "Expression in breakout with other fields"
          (is (= [[2 12 8] [3 13 2] [4 14 2] [5 15 7] [6 16 2]] ;; data ok
                 @(def x (mt/rows (mt/run-mbql-query venues {:expressions {"cat+10" [:+ $category_id 10]}
                                                             :aggregation [[:metric metric-id]]
                                                             :breakout [$category_id [:expression "cat+10"]]
                                                             :order-by [[:asc $category_id]]
                                                             :limit 5}))))))))))

(comment

  (mt/with-db (t2/select-one :model/Database :id 2)
    (mt/with-everything-store
      (t2.with-temp/with-temp
        [:model/Metric
         {metric-id :id}
         {:name "venues, count"
          :description "Metric doing count with no filtering."
          :definition (mt/$ids venues {:source-table $$venues
                                       :aggregation [[:count]]})}]
        (def mm (t2/select-one :model/Metric :id metric-id))
        (mt/run-mbql-query venues {:expressions {"cat+10" [:+ $category_id 10]
                                                 "redundant expression" [:+ $category_id 111]}
                                   :aggregation [[:metric metric-id]]
                                   :breakout [[:expression "cat+10"]]
                                   :order-by [[:asc $category_id]]
                                   :limit 5}))))
  mm
  )

;;;; TODO: verify, but looks ok-ish
(deftest expression-in-breakout-of-metric-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {metric-id :id}
       {:name "venues, count"
        :description "x"
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}]
      (let [query @(def qqq (mt/mbql-query venues {:aggregation [[:metric metric-id]]
                                                   :expressions {"cat+10" [:+ $category_id 10]}
                                                   :breakout [[:expression "cat+10"]]
                                                   :order-by [[:asc [:expression "cat+10"]]]
                                                   :limit 5}))
            _ @(def prep (qp/preprocess query))]
        (is (= [[12 8]
                [13 2]
                [14 2]
                [15 7]
                [16 2]]
               (mt/rows @(def post (qp/process-query query)))))))))


;;;; TODO: Just transform, no exec?
(deftest recursively-defined-metric-WIP-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {nesting-metric-id :id}
       {:name "Just nesting"
        :table_id (mt/id :venues)
        :description "x"}

       :model/Metric
       {nested-metric-id :id}
       {:name "venues, count"
        :description "x"
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}]
      (t2/update! :model/Metric nesting-metric-id 
                  {:definition (mt/$ids venues {:source-table $$venues
                                                :aggregation [[:metric nested-metric-id]]})})
      (let [query @(def qqq (mt/mbql-query venues {:aggregation [[:metric nesting-metric-id]]
                                                   :breakout [$category_id]
                                                   :order-by [[:asc $category_id]]
                                                   :limit 5}))
            _ @(def ppp (qp/preprocess query))]
        (is (= [[2 8] [3 2] [4 2] [5 7] [6 2]]
               @(def rrr (mt/rows (qp/process-query query)))))))))

;;;; TODO: Metric in joins test
(deftest metrics-in-joined-card-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {metric-id :id}
       {:name "venues_count"
        :description "x"
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}

       :model/Card
       {card-id :id}
       {:dataset_query (mt/mbql-query venues {:aggregation [[:metric metric-id]]
                                              :breakout [$category_id]})}]
      (let [query (mt/mbql-query venues {:aggregation [[:count]]
                                         :breakout [$category_id &Q1.$category_id &Q1.*venues_count/Integer]
                                         :joins [{:alias "Q1"
                                                  :strategy :left-join
                                                  :source-table (str "card__" card-id)
                                                  :condition [:= $category_id &Q1.$category_id]}]
                                         :order-by [[:asc $category_id]]
                                         :limit 5})
            _ @(def prep (qp/preprocess query))
            _ @(def post (qp/process-query query))]
        (is (= [[2 2 8 8] [3 3 2 2] [4 4 2 2] [5 5 7 7] [6 6 2 2]]
               (mt/rows post)))))))

;;;; TODO: metric, aggregation on joined fields
;;;; TODO: nonsensical, at least verify results!
(deftest metrics-joins-data-source-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {metric-id :id}
       {:name "venues_count"
        :description "x"
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}]
      (let [query @(def qqq (mt/mbql-query venues {:aggregation [[:metric metric-id] [:max &Q2.$users.last_login]]
                                                   :breakout [$category_id]
                                                   :joins [{:alias "Q1"
                                                            :strategy :left-join
                                                            :source-table $$checkins
                                                            :condition [:= $id &Q1.$checkins.venue_id]}
                                                           {:alias "Q2"
                                                            :strategy :left-join
                                                            :source-table $$users
                                                            :condition [:= &Q1.$checkins.user_id &Q2.$users.id]}]
                                                   :order-by [[:asc $category_id]]
                                                   :limit 5}))
            _ @(def prep (qp/preprocess query))]
        (is (= ;;;; TODO: looks okish, but check!
             [[2 91 "2014-12-05T15:15:00Z"]
              [3 22 "2014-12-05T15:15:00Z"]
              [4 13 "2014-11-01T07:00:00Z"]
              [5 71 "2014-12-05T15:15:00Z"]
              [6 14 "2014-11-06T16:15:00Z"]]
               (mt/rows @(def ppp (qp/process-query query)))))))))

;;;; TODO
(deftest aggregation-with-expression-using-one-metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {metric-id :id}
       {:name "venues_count"
        :description "x"
        :table_id (mt/id :venues)
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}]
      (testing ""
        (let [query @(def qqq (mt/mbql-query venues
                                {:aggregation [[:aggregation-options
                                                [:sum [:+ [:metric metric-id] [:metric metric-id]]]
                                                {:name "m+m"
                                                 :display-name "M + M"}]]
                                 :breakout [$category_id]
                                 :order-by [[:desc [:aggregation 0]]]
                                 :limit 5}))
              _ @(def prep (qp/preprocess query))]
          (is (= nil 
                 (mt/rows @(def post (qp/process-query qqq))))))))))

;;;; TODO: make this to check also names!
(deftest same-metric-as-only-metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "stuff"
      (t2.with-temp/with-temp
        [:model/Metric
         {metric-id :id}
         {:name "venues count"
          :description "x"
          :table_id (mt/id :venues)
          :definition (mt/$ids venues {:source-table $$venues
                                       :aggregation [[:count]]})}]
        (let [query @(def qqq (mt/mbql-query venues
                                {:aggregation [[:aggregation-options [:metric metric-id] {:name "First one"
                                                                                          :display-name "First one"}]
                                               [:aggregation-options [:metric metric-id] {:name "Another"
                                                                                          :display-name "Another"}]]
                                 :breakout [$category_id]
                                 :order-by [[:desc [:aggregation 0]]]
                                 :limit 5}))]
          (is (= [[7 10 10] [50 10 10] [40 9 9] [2 8 8] [5 7 7]]
                 (mt/rows @(def post (qp/process-query qqq))))))))))

;;;; This should be checking the transformation
(deftest metric-with-aggregation-options-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "stuff"
      (t2.with-temp/with-temp
        [:model/Metric
         {metric-id :id}
         {:name "venues count"
          :description "x"
          :table_id (mt/id :venues)
          :definition (mt/$ids venues {:source-table $$venues
                                       :aggregation [[:count]]})}]
        (let [query (mt/mbql-query venues
                                   {:aggregation [[:aggregation-options [:metric metric-id] {:name "First one"
                                                                                             :display-name "First one"}]]
                                    :breakout [$category_id]
                                    :limit 5})
              _ (def ppp (qp/preprocess query))]
          (is (= nil
                 (mt/rows (qp/process-query query)))))))))

(comment
  (-> (ns-publics 'metabase.query-processor.middleware.expand-macros-test) vals (->> (filter #(re-find #"test$" (str %)))) vec)

  (require 'mb.hawk.core)
  (mb.hawk.core/run-tests some-tests)

  (def some-tests [#_#'metabase.query-processor.middleware.expand-macros-test/nested-segments-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/metric-with-aggregation-options-test
                   #'metabase.query-processor.middleware.expand-macros-test/metric-with-segment-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/include-display-name-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/metric-with-multiple-aggregation-syntax-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/basic-expansion-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/named-metrics-test
                   #'metabase.query-processor.middleware.expand-macros-test/metrics-joins-data-source-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/metric-test
                   #'metabase.query-processor.middleware.expand-macros-test/multiple-metrics-wip-test
                   #'metabase.query-processor.middleware.expand-macros-test/metrics-in-joined-card-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/aggregation-with-expression-using-one-metric-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/segments-in-share-clauses-test
                   #'metabase.query-processor.middleware.expand-macros-test/simple-metric-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/segments-test
                   #'metabase.query-processor.middleware.expand-macros-test/expression-in-breakout-of-metric-query-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/metric-with-nested-segments-test
                   #'metabase.query-processor.middleware.expand-macros-test/metric-with-expression-test
                   #'metabase.query-processor.middleware.expand-macros-test/metric-with-filter-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/dont-expand-ga-metrics-test
                   #'metabase.query-processor.middleware.expand-macros-test/recursively-defined-metric-WIP-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/dont-expand-ga-segments-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/metric-with-no-filter-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/use-metric-filter-definition-test
                   #_#'metabase.query-processor.middleware.expand-macros-test/expand-macros-in-nested-queries-test
                   ;;;; TODO
                   #_#'metabase.query-processor.middleware.expand-macros-test/same-metric-as-only-metric-test])
  )

;; complex for examples
(deftest multiple-metrics-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m1-id :id} {:name "venues, count"
                                 :description "Metric doing count with no filtering."
                                 :table_id (mt/id :venues)
                                 :definition (mt/$ids venues {:source-table $$venues
                                                              :aggregation [[:count]]})}
      :model/Metric {m2-id :id} {:name "venues, sum price, cat id lt 50"
                                 :description (str "This is metric doing sum of price with filter for category id "
                                                   "less than 50.")
                                 :table_id (mt/id :venues)
                                 :definition (mt/$ids venues {:source-table $$venues
                                                              :filter [:< $category_id 50]
                                                              :aggregation [[:sum $price]]})}
       ;;;; Following metric requires ids of previously defined metrics. Those ids are autogenrated, hence available
       ;;;;   in body of `with-temp`. Because of that, definition for this metrics will be set there.
      :model/Metric {m3-id :id} {:name "venues, count metric div sum metric, cat id gt 30"
                                 :description (str "Metric that combines another metrics. "
                                                   "It divides values of `m1` by values of `m2`, filtering for "
                                                   "category ids greater than 20")
                                 :table_id (mt/id :venues)}]
     (t2/update! :model/Metric m3-id {:definition (mt/$ids venues
                                                           {:source-table $$venues
                                                            :filter [:> $category_id 20]
                                                            :aggregation
                                                            [[:aggregation-options
                                                              [:/ [:metric m1-id] [:metric m2-id]]
                                                              {:name "Metric dividing metric"
                                                               :display-name "Metric dividing metric"}]]})})
     (let [query @(def q (mt/mbql-query venues
                                        {:aggregation [[:metric m3-id]
                                                       [:metric m2-id]
                                                       [:metric m1-id]]
                                         :breakout [$category_id]
                                         :order-by [[:asc $category_id]]
                             ;; TODO: Change limit so non-nil col 1 is checked!
                                         :limit 5}))
           preprocessed @(def pp (qp/preprocess query))]
       (is (= [[2 nil 20 8]
               [3 nil 4 2]
               [4 nil 4 2]
               [5 nil 14 7]
               [6 nil 3 2]]
              (mt/formatted-rows [int num int int]
                                 @(def p (qp/process-query q)))))))))

(comment
  ;; snippet for initializing.
  (def m1 (t2/select :model/Metric :id m1-id))
  (def m2 (t2/select :model/Metric :id m2-id))
  (def m3 (t2/select :model/Metric :id m3-id))
  )

(deftest metrics-transformation-sanity-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m1-id :id} {:name "Just count"
                                 :description "Some description."
                                 :table_id (mt/id :venues)
                                 :definition (mt/$ids venues {:source-table $$venues
                                                              :aggregation [[:count]]})}]
     (let [query @(def q (mt/mbql-query venues
                                        {:aggregation [[:metric m1-id]]
                                         :breakout [$category_id]
                                         :order-by [[:asc $category_id]]
                                         :limit 5}))]
       (is (partial= (mt/$ids
                      venues
                      {:query
                       {:fields [[:field (mt/id :venues :category_id) nil]
                                 [:field "Just count" {:join-alias "metric__0"}]]
                        :source-query {:expressions {"Just count" [:field "Just count" {}]}
                                       :breakout [[:field (mt/id :venues :category_id) nil]
                                                  [:expression "Just count"]]
                                       :order-by [[:asc [:field (mt/id :venues :category_id) nil]]]}}})
                     @(def exex (mt/with-metadata-provider (mt/id)
                                  (#'expand-macros/expand-metrics-and-segments query)))))))))

(deftest metrics-transformation-nested-definition-test)

;;;; OK
(deftest metrics-cyclic-definition-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m1-id :id} {:name "m1"
                                 :description "This metric will use the m3 in its definition."
                                 :table_id (mt/id :venues)}
      :model/Metric {m2-id :id} {:name "m2"
                                 :description "This metric will use the m1 in its definition."
                                 :table_id (mt/id :venues)
                                 :definition {:source-table (mt/id :venues)
                                              :aggregation [[:metric m1-id]]}}
      :model/Metric {m3-id :id} {:name "m3"
                                 :description "This metric will use the m2 in its definition."
                                 :table_id (mt/id :venues)
                                 :definition {:source-table (mt/id :venues)
                                              :aggregation [[:metric m2-id]]}}]
     (t2/update! :model/Metric :id m1-id {:definition {:source-table (mt/id :venues)
                                                       :aggregation [[:metric m3-id]]}})
     (let [query @(def q (mt/mbql-query venues {:aggregation [[:metric m1-id]]}))]
       (testing "Expcetion is thrown on cycle in metrics definitions."
         (is (thrown? Exception (try @(def exex (mt/with-metadata-provider (mt/id)
                                                  (#'expand-macros/expand-metrics-and-segments query)))
                                     (catch Exception e
                                       (def eee e)
                                       (throw e))))))))))

;;;; OK
(deftest metrics-no-breakout-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m1-id :id} {:name "Just count"
                                 :description "Some description."
                                 :table_id (mt/id :venues)
                                 :definition (mt/$ids venues {:source-table $$venues
                                                              :aggregation [[:count]]})}]
     (let [query @(def q (mt/mbql-query venues
                                        {:aggregation [[:metric m1-id]]}))]
       #_(is (partial= (mt/$ids venues
                              {:query
                               {:fields [[:field "Just count" {:join-alias "metric__0"}]]
                                :source-query {:expressions {"Just count" [:field "Just count" {}]}
                                               :breakout [[:expression "Just count"]]}}})
                     @(def exex (mt/with-metadata-provider (mt/id)
                                  (#'expand-macros/expand-metrics-and-segments query)))))
       (testing "No breakout query containing metric produces expected results"
         (is (= [[100]]
                (mt/rows (qp/process-query q)))))))))

;;;; ! PROGRESS -- do all variations!
(deftest metrics-in-custom-expression-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (mt/dataset
    sample-dataset
    (t2.with-temp/with-temp
      [:model/Metric {m-gizmo-id :id} (mt/$ids products
                                       {:name "gizmo count"
                                        :description "It's about counting the gizmos."
                                        :table_id $$products
                                        :definition {:source-table $$products
                                                     :aggregation [[:count]]
                                                     :filter [:= $category "Gizmo"]}})
       :model/Metric {m-gadget-id :id} (mt/$ids products
                                        {:name "gadget count"
                                         :description "It's about counting the gadgets."
                                         :table_id $$products
                                         :definition {:source-table $$products
                                                      :aggregation [[:count]]
                                                      :filter [:= $category "Gadget"]}})
       :model/Metric {m-ratio-id :id} (mt/$ids products
                                       {:name "gizmo gadget ratio"
                                        :description "Now the ratio."
                                        :table_id $$products
                                        :definition {:source-table $$products
                                                     :aggregation [[:/ [:metric m-gadget-id] [:metric m-gizmo-id]]]}})]
      (let [query @(def q (mt/mbql-query
                           products
                           {:aggregation
                            [[:metric m-ratio-id]
                             [:aggregation-options [:/ [:metric m-gadget-id] [:metric m-gizmo-id]]
                              {:name "gadget / gizmo"
                               :display-name "gadget gizmo ratio"}]]}))
            ctrl-query-gizmo-count (mt/mbql-query products {:aggregation [[:count]] :filter [:= $category "Gizmo"]})
            ctrl-query-gadget-count (mt/mbql-query products {:aggregation [[:count]] :filter [:= $category "Gadget"]})
            ctrl-gizmo-count (ffirst (mt/format-rows-by [(partial u/round-to-decimals 4)]
                                                        (mt/rows (qp/process-query ctrl-query-gizmo-count))))
            ctrl-gadget-count (ffirst (mt/format-rows-by [(partial u/round-to-decimals 4)]
                                                           (mt/rows (qp/process-query ctrl-query-gadget-count))))]
        #_(is (partial= nil
                      @(def exex (mt/with-metadata-provider (mt/id)
                                   (#'expand-macros/expand-metrics-and-segments query)))))
        (testing "No breakout query containing metric produces expected results"
          (is (= [[(u/round-to-decimals 4 (/ ctrl-gadget-count ctrl-gizmo-count))
                   (u/round-to-decimals 4 (/ ctrl-gadget-count ctrl-gizmo-count))]]
                 @(def rrrr (mt/format-rows-by [(partial u/round-to-decimals 4) (partial u/round-to-decimals 4)]
                                               (mt/rows @(def qq (qp/process-query q)))))))))))))


;;;; PROGRESS
(deftest currently-failing-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (mt/dataset
    sample-dataset
    (t2.with-temp/with-temp
      [:model/Metric {m-gizmo-id :id} (mt/$ids products
                                               {:name "gizmo count"
                                                :description "It's about counting the gizmos."
                                                :table_id $$products
                                                :definition {:source-table $$products
                                                             :aggregation [[:count]]
                                                             :filter [:= $category "Gizmo"]}})
       :model/Metric {m-gadget-id :id} (mt/$ids products
                                                {:name "gadget count"
                                                 :description "It's about counting the gadgets."
                                                 :table_id $$products
                                                 :definition {:source-table $$products
                                                              :aggregation [[:count]]
                                                              :filter [:= $category "Gadget"]}})
       :model/Metric {m-ratio-id :id} (mt/$ids products
                                               {:name "gizmo gadget ratio"
                                                :description "Now the ratio."
                                                :table_id $$products
                                                :definition {:source-table $$products
                                                             :aggregation [[:/ [:metric m-gadget-id] [:metric m-gizmo-id]]]}})]
        ;;;; TODO: there is a wrong field ref for [:/ ... ...] metric aggregation!
        ;;;;  Add joined stuff to breakout! Why it is not happening?
      (let [query @(def q (mt/mbql-query
                           products
                           {:aggregation
                            [; expansion of this metric creates breakout entry. That ensures the group by action.
                             #_[:metric m-ratio-id]
                             ;;; following tested first
                             #_[:aggregation-options [:/ [:metric m-gadget-id] [:metric m-gizmo-id]]
                                {:name "gadget / gizmo"
                                 :display-name "gadget / gizmo"}]
                             ;;;; check how unnamed is handled
                             [:/ [:metric m-gadget-id] [:metric m-gizmo-id]]
                             [:/ [:metric m-gizmo-id] [:metric m-gadget-id]]
                             ]}))]
        (is (partial= nil
                      @(def exex (mt/with-metadata-provider (mt/id)
                                   (#'expand-macros/expand-metrics-and-segments query)))))
        (testing "No breakout query containing metric produces expected results"
          (is (= [[100]]
                 (mt/rows @(def qq (qp/process-query q)))))))))))

(deftest metic-in-expression-with-aggregation-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m-count-id :id} (mt/$ids venues
                                              {:name "Just count"
                                               :description "It's about counting the gizmos."
                                               :table_id $$venues
                                               :definition {:source-table $$venues
                                                            :aggregation [[:count]]
                                                            :filter [:= $category_id 1]}})]
     ;;;; this is ok
     (let [query @(def q (mt/mbql-query
                          venues
                          {:aggregation
                           [[:aggregation-options [:+ [:sum $price] [:metric m-count-id]]
                             {:name "jeee"
                              :display-name "ssss"}]]}))]
       (is (partial= nil
                     @(def exex (mt/with-metadata-provider (mt/id)
                                  (#'expand-macros/expand-metrics-and-segments query)))))
       (testing "Something"
         (is (= [[100]]
                (mt/rows @(def qq (qp/process-query q)))))))
     ;;;; this is nok
     (let [query @(def q (mt/mbql-query
                          venues
                          {:aggregation
                           [[:aggregation-options [:+ [:sum $price] [:metric m-count-id]]
                             {:name "jeee"
                              :display-name "ssss"}]]}))]
       (is (partial= nil
                     @(def exex (mt/with-metadata-provider (mt/id)
                                  (#'expand-macros/expand-metrics-and-segments query)))))
       (testing "Something"
         (is (= [[100]]
                (mt/rows @(def qq (qp/process-query q)))))))
     )))

;;;; Will probably drop this case or add it elsewhere!
(deftest only-metric-in-ag-opts-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m-count-id :id} (mt/$ids venues
                                              {:name "Just count for cat 2"
                                               :description ""
                                               :table_id $$venues
                                               :definition {:source-table $$venues
                                                            :aggregation [[:count]]
                                                            :filter [:= $category_id 2]}})]
     (let [query @(def q (mt/mbql-query
                          venues
                          {:aggregation
                           [[:aggregation-options [:metric m-count-id] {:name "jeee" :display-name "ssss"}]]}))]
       (is (partial= nil
                     @(def exex (mt/with-metadata-provider (mt/id)
                                  (#'expand-macros/expand-metrics-and-segments query)))))
       (testing "Something"
         (is (= [[100]]
                (mt/rows @(def qq (qp/process-query q))))))))))

;;;; OK
;;;; Reason for use of expressions follows. Ie. same metric named differently by aggregation options.
(deftest same-name-metrics-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (t2.with-temp/with-temp
     [:model/Metric {m-1-id :id} (mt/$ids venues
                                        {:name "Just count"
                                         :description "Just count desc."
                                         :table_id $$venues
                                         :definition {:source-table $$venues
                                                      :aggregation [[:count]]}})]
     (let [query @(def q (mt/mbql-query
                          venues
                          {:aggregation [[:aggregation-options [:metric m-1-id] {:display-name "X" :name "X"}]
                                         [:aggregation-options [:metric m-1-id] {:display-name "Y" :name "Y"}]
                                         [:metric m-1-id]]}))]
       (testing ":aggregation-options can use same metirc, naming it differently"
         (is (partial= {:query {:fields [[:field "X" {:base-type :type/Integer :join-alias "metric__0"}]
                                         [:field "Y" {:base-type :type/Integer :join-alias "metric__0"}]
                                         [:field "Just count" {:base-type :type/Integer :join-alias "metric__0"}]]}}
                       (mt/with-metadata-provider (mt/id)
                         (#'expand-macros/expand-metrics-and-segments query)))))
       (testing "Query returns expected results"
         (is (apply = (first (mt/rows @(def qq (qp/process-query query)))))))))))

(deftest metric-column-order-test)

;;;; TODO: also breakout examples!
(deftest metrics-exclusive-filters-test
  (mt/test-drivers
   (mt/normal-drivers-with-feature :nested-queries :left-join)
   (testing "Metrics with exclusive filters used in one query work correctly"
    (t2.with-temp/with-temp
      [:model/Metric {m1-id :id} {:name "Sum of Price for category_id lt 30"
                                  :description "Some description."
                                  :table_id (mt/id :venues)
                                  :definition (mt/$ids venues {:source-table $$venues
                                                               :aggregation [[:sum $price]]
                                                               :filter [:< $category_id 30]})}
       :model/Metric {m2-id :id} {:name "Sum of Price for category_id gt 50"
                                  :description "Some description."
                                  :table_id (mt/id :venues)
                                  :definition (mt/$ids venues {:source-table $$venues
                                                               :aggregation [[:sum $price]]
                                                               :filter [:> $category_id 50]})}]
      (let [query @(def q (mt/mbql-query venues
                                         {:aggregation [[:metric m1-id]
                                                        [:metric m2-id]]}))
            verification-query-1 @(def v1 (mt/run-mbql-query venues {:aggregation [[:sum $price]]
                                                                     :filter [:< $category_id 30]}))
            verification-query-2 @(def v2 (mt/run-mbql-query venues {:aggregation [[:sum $price]]
                                                                     :filter [:> $category_id 50]}))
            lt-30-sum (ffirst (mt/rows verification-query-1))
            gt-50-sum (ffirst (mt/rows verification-query-2))
            ;; dummy
            join-alias-lt-30 (#'expand-macros/query->join-alias (mt/$ids venues {:filter [:< $category_id 30]}))
            join-alias-gt-50 (#'expand-macros/query->join-alias (mt/$ids venues {:filter [:> $category_id 50]}))]
        (testing "Query transformation is correct"
          (is (partial= (mt/$ids venues
                                 {:query
                                  {:fields [[:field "Sum of Price for category_id lt 30" {:join-alias join-alias-lt-30}]
                                            [:field "Sum of Price for category_id gt 50" {:join-alias join-alias-gt-50}]]
                                   :source-query
                                   {:joins [{:alias join-alias-lt-30
                                             :source-query
                                             {:source-table $$venues
                                              :filter [:< $category_id 30]
                                              :aggregation [[:aggregation-options [:sum $price]
                                                             {:display-name "Sum of Price for category_id lt 30"
                                                              :name "Sum of Price for category_id lt 30"}]]}}
                                            {:alias join-alias-gt-50
                                             :source-query
                                             {:source-table $$venues
                                              :filter [:> $category_id 50]
                                              :aggregation [[:aggregation-options [:sum $price]
                                                             {:display-name "Sum of Price for category_id gt 50"
                                                              :name "Sum of Price for category_id gt 50"}]]}}]}}})
                        @(def exex (mt/with-metadata-provider (mt/id)
                                     (#'expand-macros/expand-metrics-and-segments query))))))
        (testing "Query results are correct"
         (is (= [[lt-30-sum gt-50-sum]]
                (mt/rows (qp/process-query query))))))))))


#_(is (partial= (mt/$ids venues
                         {:query
                                 ;; nil = i dont care
                          {:fields [[:field "Sum of Price for category_id lt 30" nil]
                                    [:field "Sum of Price for category_id gt 50" nil]]}})
                @(def exex (mt/with-metadata-provider (mt/id)
                             (#'expand-macros/expand-metrics-and-segments query)))))