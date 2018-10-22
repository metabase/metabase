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
            [metabase.query-processor.middleware.expand-macros :as expand-macros :refer :all]
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

;; Does expansion work if :and isn't capitalized? (MBQL is case-insensitive!) (#5706, #5530)
(expect
  (mbql-query
   {:filter   [:and
               [:= [:field-id 5] "abc"]
               [:is-null [:field-id 7]]]
    :breakout [[:field-id 17]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}     {:db_id database-id}]
                  Segment  [{segment-1-id :id} {:table_id   table-id
                                                :definition {:filter [:= [:field-id 5] "abc"]}}]
                  Segment  [{segment-2-id :id} {:table_id   table-id
                                                :definition {:filter [:is-null [:field-id 7]]}}]]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query
      {:filter   [:and
                  [:segment segment-1-id]
                  [:segment segment-2-id]]
       :breakout [[:field-id 17]]}))))

;; just a metric (w/out nested segments)
(expect
  (mbql-query
   {:aggregation [[:count]]
    :filter      [:and
                  [:> [:field-id 4] 1]
                  [:= [:field-id 5] "abc"]]
    :breakout    [[:field-id 17]]
    :order-by    [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:table_id   table-id
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
    :aggregation  [[:count]]
    :filter       [:= [:field-id 5] "abc"]
    :breakout     [[:field-id 17]]
    :order-by     [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:table_id   table-id
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
   {:aggregation [[:count]]
    :filter      [:= [:field-id 5] "abc"]
    :breakout    [[:field-id 17]]
    :order-by    [[:asc [:field-id 1]]]})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{metric-1-id :id} {:table_id   table-id
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
    :aggregation  [[:sum [:field-id 18]]]
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
                  Metric   [{metric-1-id :id}  {:table_id   table-id
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
                          :aggregation  [[:metric (u/get-id metric)]]
                          :breakout     [[:field-id (data/id :venues :price)]]}})))))

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
   {:aggregation [[:named [:sum [:field-id 20]] "My Cool Metric"]]
    :breakout    [[:field-id 10]]})
  (tt/with-temp Metric [metric {:definition {:aggregation [[:sum [:field-id 20]]]}}]
    (#'expand-macros/expand-metrics-and-segments
     (mbql-query {:aggregation [[:named [:metric (u/get-id metric)] "My Cool Metric"]]
                  :breakout    [[:field-id 10]]}))))
