(ns metabase.query-processor-test.case-test
  (:require [metabase.models
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.query-processor-test :refer :all]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [toucan.util.test :as tt]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  116.0
  (->> {:aggregation [[:sum [:case [[[:< [:field-id (data/id :venues :price)] 2] 2]
                                    [[:< [:field-id (data/id :venues :price)] 4] 1]] ]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Can use fields as values
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  179.0
  (->> {:aggregation [[:sum [:case [[[:< [:field-id (data/id :venues :price)] 2] [:field-id (data/id :venues :price)]]
                                    [[:< [:field-id (data/id :venues :price)] 4] [:field-id (data/id :venues :price)]]] ]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Can use expressions as values
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  194.5
  (->> {:aggregation [[:sum [:case [[[:< [:field-id (data/id :venues :price)] 2] [:+ [:field-id (data/id :venues :price)] 1]]
                                    [[:< [:field-id (data/id :venues :price)] 4] [:+ [:/ [:field-id (data/id :venues :price)] 2] 1]]] ]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Test else clause
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  122.0
  (->> {:aggregation [[:sum [:case [[[:< [:field-id (data/id :venues :price)] 2] 2]]
                             {:default 1}]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Test implicit else clause
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  nil
  (->> {:aggregation [[:sum [:case [[[:> [:field-id (data/id :venues :price)] 200] 2]]]]]}
       (data/run-mbql-query venues)
       rows
       ffirst))

;; Test normalization
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  116.0
  (->> {:aggregation [["sum" ["case" [[["<" ["field-id" (data/id :venues :price)] 2] 2]
                                      [["<" ["field-id" (data/id :venues :price)] 4] 1]] ]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Test complex filters
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  34.0
  (->> {:aggregation [[:sum
                       [:case [[[:and [:< [:field-id (data/id :venues :price)] 4]
                                 [:or [:starts-with [:field-id (data/id :venues :name)] "M"]
                                  [:ends-with [:field-id (data/id :venues :name)] "t"]]]
                                [:field-id (data/id :venues :price)]]]]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  [[2 0.0]
   [3 0.0]
   [4 1.0]
   [5 1.0]]
  (->> {:aggregation [[:sum [:case [[[:< [:field-id (data/id :venues :price)] 2] [:field-id (data/id :venues :price)]]]
                             {:default 0}]]]
        :breakout    [[:field-id (data/id :venues :category_id)]]
        :limit       4}
       (data/run-mbql-query venues)
       (tu/round-all-decimals 2)
       rows
       (map (fn [[k v]]
              [(long k) (double v)]))))

;; Can we use case in metric expressions
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations :expressions)
  90.5
  (->> {:aggregation [[:+ [:/ [:sum [:case [[[:< [:field-id (data/id :venues :price)] 4] [:field-id (data/id :venues :price)]]]
                             {:default 0}]] 2] 1]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Can we use segments in case
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  179.0
  (tt/with-temp* [Segment [{segment-id :id} {:table_id   (data/id :venues)
                                             :definition {:source-table (data/id :venues)
                                                          :filter       [:< [:field-id (data/id :venues :price)] 4]}}]]
    (->> {:aggregation [[:sum [:case [[[:segment segment-id] [:field-id (data/id :venues :price)]]]]]]}
         (data/run-mbql-query venues)
         rows
         ffirst
         double)))

;; Can we use case in metrics
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  179.0
  (tt/with-temp* [Metric [{metric-id :id} {:table_id   (data/id :venues)
                                           :definition {:source-table (data/id :venues)
                                                        :aggregation  [:sum
                                                                       [:case [[[:< [:field-id (data/id :venues :price)] 4]
                                                                                [:field-id (data/id :venues :price)]]]]]}}]]
    (->> {:aggregation [[:metric metric-id]]}
         (data/run-mbql-query venues)
         rows
         ffirst
         double)))

;; Can we use case in expressions
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :basic-aggregations)
  [nil -2.0 -1.0]
  (->> {:expressions {"case_test" [:case [[[:< [:field-id (data/id :venues :price)] 2] -1.0]
                                          [[:< [:field-id (data/id :venues :price)] 3] -2.0]] ]}
        :fields [[:expression "case_test"]]}
       (data/run-mbql-query venues)
       rows
       (map (comp #(some-> % double) first))
       distinct
       sort))
