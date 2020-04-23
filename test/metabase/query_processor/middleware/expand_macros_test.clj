(ns metabase.query-processor.middleware.expand-macros-test
  (:require [expectations :refer [expect]]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.expand-macros :as expand-macros]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [toucan.util.test :as tt]))

(defn- mbql-query [inner-query]
  {:database 1, :type :query, :query (merge {:source-table 1}
                                            inner-query)})

;; no Segment or Metric should yield exact same query
(expect
  (mbql-query
   {:filter   [:> [:field-id 4] 1]
    :breakout [[:field-id 17]]})
  (#'expand-macros/expand-metrics-and-segments
   (mbql-query
    {:filter   [:> [:field-id 4] 1]
     :breakout [[:field-id 17]]})))

;; just segments
(expect
  (mbql-query
   {:filter   [:and
               [:= [:field-id 5] "abc"]
               [:or
                [:is-null [:field-id 7]]
                [:> [:field-id 4] 1]]]
    :breakout [[:field-id 17]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}     {:db_id database-id}]
                  Segment  [{segment-1-id :id} {:table_id   table-id
                                                :definition {:filter [:and [:= [:field-id 5] "abc"]]}}]
                  Segment  [{segment-2-id :id} {:table_id   table-id
                                                :definition {:filter [:and [:is-null [:field-id 7]]]}}]]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:filter   [:and
                  [:segment segment-1-id]
                  [:or
                   [:segment segment-2-id]
                   [:> [:field-id 4] 1]]]
       :breakout [[:field-id 17]]}))))

;; just a metric (w/out nested segments)
(expect
  (mbql-query
   {:aggregation [[:aggregation-options [:count] {:display-name "Toucans in the rainforest"}]]
    :filter      [:and
                  [:> [:field-id 4] 1]
                  [:= [:field-id 5] "abc"]]
    :breakout    [[:field-id 17]]
    :order-by    [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:name       "Toucans in the rainforest"
                                               :table_id   table-id
                                               :definition {:aggregation [[:count]]
                                                            :filter      [:and [:= [:field-id 5] "abc"]]}}]]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:aggregation [[:metric metric-1-id]]
       :filter      [:> [:field-id 4] 1]
       :breakout    [[:field-id 17]]
       :order-by    [[:asc [:field-id 1]]]}))))

;; check that when the original filter is empty we simply use our metric filter definition instead
(expect
  (mbql-query
   {:source-table 1000
    :aggregation  [[:aggregation-options [:count] {:display-name "ABC Fields"}]]
    :filter       [:= [:field-id 5] "abc"]
    :breakout     [[:field-id 17]]
    :order-by     [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:name       "ABC Fields"
                                               :table_id   table-id
                                               :definition {:aggregation [[:count]]
                                                            :filter      [:and [:= [:field-id 5] "abc"]]}}]]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:source-table 1000
       :aggregation  [[:metric metric-1-id]]
       :breakout     [[:field-id 17]]
       :order-by     [[:asc [:field-id 1]]]}))))

;; metric w/ no filter definition
(expect
  (mbql-query
   {:aggregation [[:aggregation-options [:count] {:display-name "My Metric"}]]
    :filter      [:= [:field-id 5] "abc"]
    :breakout    [[:field-id 17]]
    :order-by    [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:name       "My Metric"
                                               :table_id   table-id
                                               :definition {:aggregation [[:count]]}}]]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:aggregation [[:metric metric-1-id]]
       :filter      [:= [:field-id 5] "abc"]
       :breakout    [[:field-id 17]]
       :order-by    [[:asc [:field-id 1]]]}))))

;; a metric w/ nested segments
(expect
  (mbql-query
   {:source-table 1000
    :aggregation  [[:aggregation-options [:sum [:field-id 18]] {:display-name "My Metric"}]]
    :filter       [:and
                   [:> [:field-id 4] 1]
                   [:is-null [:field-id 7]]
                   [:= [:field-id 5] "abc"]
                   [:between [:field-id 9] 0 25]]
    :breakout     [[:field-id 17]]
    :order-by     [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
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
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:source-table 1000
       :aggregation  [[:metric metric-1-id]]
       :filter       [:and
                      [:> [:field-id 4] 1]
                      [:segment segment-2-id]]
       :breakout     [[:field-id 17]]
       :order-by     [[:asc [:field-id 1]]]}))))

;; Check that a metric w/ multiple aggregation syntax (nested vector) still works correctly
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[2 118]
   [3  39]
   [4  24]]
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [[:sum [:field-id (data/id :venues :price)]]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (qp.test/format-rows-by [int int]
      (qp.test/rows
        (data/run-mbql-query venues
          {:aggregation  [[:metric (u/get-id metric)]]
           :breakout     [$price]})))))

;; make sure that we don't try to expand GA "metrics" (#6104)
(expect
  (mbql-query {:aggregation [[:metric "ga:users"]]})
  (#'expand-macros/expand-metrics-and-segments
   (mbql-query {:aggregation [[:metric "ga:users"]]})))

(expect
  (mbql-query {:aggregation [[:metric "gaid:users"]]})
  (#'expand-macros/expand-metrics-and-segments
   (mbql-query {:aggregation [[:metric "gaid:users"]]})))

;; make sure expansion works with multiple GA "metrics" (#7399)
(expect
  (mbql-query {:aggregation [[:metric "ga:users"]
                             [:metric "ga:1dayUsers"]]})
  (#'expand-macros/expand-metrics-and-segments
   (mbql-query {:aggregation [[:metric "ga:users"]
                              [:metric "ga:1dayUsers"]]})))

;; make sure we don't try to expand GA "segments"
(expect
  (mbql-query {:filter [:segment "gaid:-11"]})
  (#'expand-macros/expand-metrics-and-segments
   (mbql-query {:filter [:segment "gaid:-11"]})))

;; make sure we can name a :metric (ick)
(expect
  (mbql-query
   {:aggregation [[:aggregation-options [:sum [:field-id 20]] {:display-name "Named Metric"}]]
    :breakout    [[:field-id 10]]})
  (tt/with-temp Metric [metric {:definition {:aggregation [[:sum [:field-id 20]]]}}]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query {:aggregation [[:aggregation-options [:metric (u/get-id metric)] {:display-name "Named Metric"}]]
                  :breakout    [[:field-id 10]]}))))

;; if the `:metric` is wrapped in aggregation options that do *not* give it a display name, `:display-name` should be
;; added to the options
(expect
  (mbql-query
   {:aggregation [[:aggregation-options
                   [:sum [:field-id 20]]
                   {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
    :breakout    [[:field-id 10]]})
  (tt/with-temp Metric [metric {:definition {:aggregation [[:sum [:field-id 20]]]}}]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query {:aggregation [[:aggregation-options [:metric (u/get-id metric)] {:name "auto_generated_name"}]]
                  :breakout    [[:field-id 10]]}))))

;; a Metric whose :aggregation is already named should not get wrapped in an `:aggregation-options` clause
(expect
  (mbql-query
   {:aggregation [[:aggregation-options [:sum [:field-id 20]] {:display-name "My Cool Aggregation"}]]
    :breakout    [[:field-id 10]]})
  (tt/with-temp Metric [metric {:definition {:aggregation [[:aggregation-options
                                                            [:sum [:field-id 20]]
                                                            {:display-name "My Cool Aggregation"}]]}}]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query {:aggregation [[:metric (u/get-id metric)]]
                  :breakout    [[:field-id 10]]}))))

;; ...but if it's wrapped in `:aggregation-options`, but w/o given a display name, we should merge the options
(expect
  (mbql-query
   {:aggregation [[:aggregation-options
                   [:sum [:field-id 20]]
                   {:name "auto_generated_name", :display-name "Toucans in the rainforest"}]]
    :breakout    [[:field-id 10]]})
  (tt/with-temp Metric [metric {:definition {:aggregation [[:aggregation-options
                                                            [:sum [:field-id 20]]
                                                            {:name "auto_generated_name"}]]}}]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query {:aggregation [[:metric (u/get-id metric)]]
                  :breakout    [[:field-id 10]]}))))


;; segments in :share clauses
(expect
  (mbql-query
   {:aggregation [[:share [:and
                           [:= [:field-id 5] "abc"]
                           [:or
                            [:is-null [:field-id 7]]
                            [:> [:field-id 4] 1]]]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}     {:db_id database-id}]
                  Segment  [{segment-1-id :id} {:table_id   table-id
                                                :definition {:filter [:and [:= [:field-id 5] "abc"]]}}]
                  Segment  [{segment-2-id :id} {:table_id   table-id
                                                :definition {:filter [:and [:is-null [:field-id 7]]]}}]]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:aggregation [[:share [:and
                              [:segment segment-1-id]
                              [:or
                               [:segment segment-2-id]
                               [:> [:field-id 4] 1]]]]]}))))
