(ns metabase.query-processor.middleware.expand-macros-test
  (:require [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware
             [expand :as ql]
             [expand-macros :as expand-macros :refer :all]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [toucan.util.test :as tt]))

;; no Segment or Metric should yield exact same query
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["rows"]
              :filter      ["AND" [">" 4 1]]
              :breakout    [17]}}
  (#'expand-macros/expand-metrics-and-segments {:database 1
                                                :type     :query
                                                :query    {:aggregation ["rows"]
                                                           :filter      ["AND" [">" 4 1]]
                                                           :breakout    [17]}}))

;; just segments
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["rows"]
              :filter      ["AND" ["AND" ["=" 5 "abc"]]
                            ["OR" ["AND" ["IS_NULL" 7]]
                             [">" 4 1]]]
              :breakout    [17]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}     {:db_id database-id}]
                  Segment  [{segment-1-id :id} {:table_id   table-id
                                                :definition {:filter ["AND" ["=" 5 "abc"]]}}]
                  Segment  [{segment-2-id :id} {:table_id   table-id
                                                :definition {:filter ["AND" ["IS_NULL" 7]]}}]]
    (#'expand-macros/expand-metrics-and-segments {:database 1
                                                  :type     :query
                                                  :query    {:aggregation ["rows"]
                                                             :filter      ["AND" ["SEGMENT" segment-1-id] ["OR" ["SEGMENT" segment-2-id] [">" 4 1]]]
                                                             :breakout    [17]}})))

;; Does expansion work if "AND" isn't capitalized? (MBQL is case-insensitive!) (#5706, #5530)
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["rows"]
              :filter      ["and"
                            ["=" 5 "abc"]
                            ["IS_NULL" 7]]
              :breakout    [17]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}     {:db_id database-id}]
                  Segment  [{segment-1-id :id} {:table_id   table-id
                                                :definition {:filter ["=" 5 "abc"]}}]
                  Segment  [{segment-2-id :id} {:table_id   table-id
                                                :definition {:filter ["IS_NULL" 7]}}]]
    (#'expand-macros/expand-metrics-and-segments {:database 1
                                                  :type     :query
                                                  :query    {:aggregation ["rows"]
                                                             :filter      ["and"
                                                                           ["SEGMENT" segment-1-id]
                                                                           ["SEGMENT" segment-2-id]]
                                                             :breakout    [17]}})))

;; just a metric (w/out nested segments)
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["count"]
              :filter      [:and
                            ["AND" [">" 4 1]]
                            ["AND" ["=" 5 "abc"]]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:table_id   table-id
                                               :definition {:aggregation ["count"]
                                                            :filter      ["AND" ["=" 5 "abc"]]}}]]
    (#'expand-macros/expand-metrics-and-segments {:database 1
                                                  :type     :query
                                                  :query    {:aggregation ["METRIC" metric-1-id]
                                                             :filter      ["AND" [">" 4 1]]
                                                             :breakout    [17]
                                                             :order_by    [[1 "ASC"]]}})))

;; check that when the original filter is empty we simply use our metric filter definition instead
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["count"]
              :filter      ["AND" ["=" 5 "abc"]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:table_id   table-id
                                               :definition {:aggregation ["count"]
                                                            :filter      ["AND" ["=" 5 "abc"]]}}]]
    (#'expand-macros/expand-metrics-and-segments {:database 1
                                                  :type     :query
                                                  :query    {:aggregation ["METRIC" metric-1-id]
                                                             :filter      []
                                                             :breakout    [17]
                                                             :order_by    [[1 "ASC"]]}})))

;; metric w/ no filter definition
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["count"]
              :filter      ["AND" ["=" 5 "abc"]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:table_id   table-id
                                               :definition {:aggregation ["count"]}}]]
    (#'expand-macros/expand-metrics-and-segments {:database 1
                                                  :type     :query
                                                  :query    {:aggregation ["METRIC" metric-1-id]
                                                             :filter      ["AND" ["=" 5 "abc"]]
                                                             :breakout    [17]
                                                             :order_by    [[1 "ASC"]]}})))

;; a metric w/ nested segments
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["sum" 18]
              :filter      [:and
                            ["AND"
                             [">" 4 1]
                             ["AND" ["IS_NULL" 7]]]
                            ["AND"
                             ["=" 5 "abc"]
                             ["AND" ["BETWEEN" 9 0 25]]]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}     {:db_id database-id}]
                  Segment  [{segment-1-id :id} {:table_id   table-id
                                                :definition {:filter ["AND" ["BETWEEN" 9 0 25]]}}]
                  Segment  [{segment-2-id :id} {:table_id   table-id
                                                :definition {:filter ["AND" ["IS_NULL" 7]]}}]
                  Metric   [{metric-1-id :id}  {:table_id    table-id
                                                :definition  {:aggregation ["sum" 18]
                                                              :filter      ["AND" ["=" 5 "abc"] ["SEGMENT" segment-1-id]]}}]]
    (#'expand-macros/expand-metrics-and-segments {:database 1
                                                  :type     :query
                                                  :query    {:aggregation ["METRIC" metric-1-id]
                                                             :filter      ["AND" [">" 4 1] ["SEGMENT" segment-2-id]]
                                                             :breakout    [17]
                                                             :order_by    [[1 "ASC"]]}})))

;; Check that a metric w/ multiple aggregation syntax (nested vector) still works correctly
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[2 118]
   [3  39]
   [4  24]]
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [[:sum [:field-id (data/id :venues :price)]]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (format-rows-by [int int]
      (rows (qp/process-query
              {:database (data/id)
               :type     :query
               :query    {:source-table (data/id :venues)
                          :aggregation  [["METRIC" (u/get-id metric)]]
                          :breakout     [(ql/breakout (ql/field-id (data/id :venues :price)))]}})))))

;; make sure that we don't try to expand GA "metrics" (#6104)
(expect
  {:query {:aggregation [[:metric :ga:users]]}}
  (#'expand-macros/expand-metrics-and-segments {:query {:aggregation [[:metric :ga:users]]}}))

(expect
  {:query {:aggregation [[:metric :gaid:users]]}}
  (#'expand-macros/expand-metrics-and-segments {:query {:aggregation [[:metric :gaid:users]]}}))

;; make sure expansion works with multiple GA "metrics" (#7399)
(expect
  {:query {:aggregation [[:METRIC :ga:users] [:METRIC :ga:1dayUsers]]}}
  (#'expand-macros/expand-metrics-and-segments {:query {:aggregation [[:METRIC :ga:users] [:METRIC :ga:1dayUsers]]}}))
