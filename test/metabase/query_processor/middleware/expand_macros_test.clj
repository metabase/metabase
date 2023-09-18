(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
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

(deftest segments-test
 (t2.with-temp/with-temp [:model/Segment {segment-1-id :id} {:table_id   (mt/id :venues)
                                                             :definition {:filter [:and [:= [:field 5 nil] "abc"]]}}
                          :model/Segment {segment-2-id :id} {:table_id   (mt/id :venues)
                                                             :definition {:filter [:and [:is-null [:field 7 nil]]]}}]
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
             (#'expand-macros/expand-metrics-and-segments
              (mt/mbql-query venues {:filter [:segment s2-id]})))))
    ;; Next line makes temporary segment definitions mutually recursive.
    (t2/update! :model/Segment :id s1-id {:definition {:filter [:and [:< (mt/id :venues :price) 3] [:segment s2-id]]}})
    (testing "Expansion of mutually recursive segments causes an exception"
      (is (thrown? Exception (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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

(deftest named-metrics-test
  (testing "make sure we can name a :metric"
    (t2.with-temp/with-temp [:model/Metric metric {:definition {:aggregation [[:sum [:field 20 nil]]]}}]
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "Named Metric"}]]
               :breakout    [[:field 10 nil]]})
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
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
             (#'expand-macros/expand-metrics-and-segments
              (mbql-query
               {:aggregation [[:share [:and
                                       [:segment segment-1-id]
                                       [:or
                                        [:segment segment-2-id]
                                        [:> [:field 4 nil] 1]]]]]})))))))

(defn- expand-macros [query]
  (expand-macros/expand-macros query))

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

;; (deftest metric-expand-filter-test)

;; (deftest metric-breakout-test)

;; (deftest metric-naming-test)

;; (deftest metric-correct-order-test)

;; (deftest metric-with-expression-test
;;   (mt/test-drivers (mt/normal-drivers)
;;     (testing "bla"
;;       (mt/mbql-query venues))))

;;;; TODO: metric-query-unexpanded-segments-test, expect exception

;;;; TODO: no breakout, one breakout, multiple breakouts (join condition) -- variadic :and

;;;; TODO: verify that there are enough join conditions generated

;;;; TODO: filter expandsion

;;;; TODO: duplicit naming

;;;; TODO: proper ordering test

;;;; TODO: transform-aggregation

;;;; TODO: metric in nested join

;;;; TODO: metric in source-query

;;;; TODO: metric in saved query

;;;; TODO: use of metrics with named expressions, maybe think of order by updates


;;;; TODO: :order-by handling some aggregation would have to become fields... maybe :breakout...


;;;; TODO is that metadata computation recursive --- not but using join metrics to generate double join alias display name


;;;; TODO: metric in model?




;;;; TODO: i could modify metadata
;;;;         - name is normally used, and display name is overriden
;;;;         - options contain
;;;;           - source-metric for some fields (to create that map) ---- this way i could operate on metadata generated
;;;;           - 

;;;; This test sample query which I'm using during development. Test will probably be factored out later.
;;;; TODO: Verify following test actaully checks for correct values.
(deftest multiple-metrics-wip-test
  ;; TODO: Consider other features that should be tested for, to support metrics expansion correctly!
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric {m1-id :id} {:name "venues, count"
                                  :description "Metric doing count with no filtering."
                                  :definition (mt/$ids venues {:source-table $$venues
                                                               ;;;; Here we will be testing also correct handling 
                                                               ;;;; of unnamed aggregation.
                                                               :aggregation [[:count]]})}
       :model/Metric {m2-id :id} {:name "venues, sum price, cat id lt 50"
                                  :description (str "This is metric doing sum of price with filter for category id "
                                                    "less than 50.")
                                  :definition (mt/$ids venues {:source-table $$venues
                                                               :filter [:< $category_id 50]
                                                               :aggregation [[:sum $price]]})}
       ;;;; Following metric requires ids of previously defined metrics. Those ids are autogenrated, hence available
       ;;;;   in body of `with-temp`. Because of that, definition for this metrics will be set there.
       :model/Metric {m3-id :id} {:name "venues, count metric div sum metric, cat id gt 30"
                                  :description (str "Metric that combines another metrics. "
                                                    "It divides values of `m1` by values of `m2`, filtering for "
                                                    "category ids greater than 20")}]
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
            prepr @(def pp (qp/preprocess query))]
        (is (= [[2 nil 20 8]
               [3 nil 4 2]
               [4 nil 4 2]
               [5 nil 14 7]
               [6 nil 3 2]]
             (mt/formatted-rows [int num int int]
                                @(def p (qp/process-query q)))))))))

(comment
  (require '[mb.hawk.core :as hawk])
  (hawk/run-tests [#'metabase.query-processor.middleware.expand-macros-test/multiple-metrics-wip-test])

  (def orig (t2/select :model/Metric 6))

  (mt/formatted-rows [int num int int] p)

  (t2/update! :model/Metric 6 {:definition (mt/$ids venues
                                                    {:source-table $$venues
                                                     :aggregation [[:count]]
                                                     :filter [:> $category_id 20]})})

  (t2/update! :model/Metric 6 {:definition {:source-table 9,
                                            :aggregation
                                            [[:aggregation-options
                                              [:/ [:metric 4] [:metric 5]]
                                              {:name "count div sum price", :display-name "count div sum price"}]],
                                            :filter [:> [:field 85 nil] 20]}})

  (t2/update! :model/Metric 6 (get orig :archived))
  (keys orig)




  )

(deftest simple-metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {id :id}
       {:name "venues, count"
        :description "Metric doing count with no filtering."
        :definition (mt/$ids venues {:source-table $$venues
                                     :aggregation [[:count]]})}]
      (testing "Query containing metric returns correct results"
        (testing "no query filter, no breakout"
          (is (= [[100]]
                 (->> (mt/run-mbql-query venues {:aggregation [[:metric id]]})
                      (mt/formatted-rows [int])))))
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
                      (mt/formatted-rows [int int])))))))))

;;;; TODO: Check correctness of results by comparing with equivalent aggregation query.
;;;; TODO: Here make more tests for expansion rather then query execution.
(deftest metric-with-filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {id :id}
       {:name "venues, count"
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

;;;; TODO: Check correctness of results by comparing with equivalent aggregation query.
;;;; TODO: Here make more tests for expansion rather then query execution.
;;;; NOTE: Prev testing: Filter in query is correctly combined with segment filter in metric
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

;;;; TODO: Isn't it overkill to test returned result? Maybe checking just transformation is sufficient.
;;;; TODO: Check correctness of data returned!
(deftest metric-with-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {metric-id :id}
       {:name "venues, count"
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

;;;; TODO: Still WIP, verify correctness, probably rewrite to just transformation checking, w/o execution!
(deftest recursively-defined-metric-WIP-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (t2.with-temp/with-temp
      [:model/Metric
       {nesting-metric-id :id}
       {:name "Just nesting"
        :description "x"}

       :model/Metric
       {nested-metric-id :id}
       {:name "venues, count"
        :description "x"
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
