(ns metabase.query-processor-test.sum-where-test
  (:require [metabase
             [query-processor-test :refer :all]
             [test :as mt]]
            [metabase.models
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [toucan.util.test :as tt]))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  179.0
  (->> {:aggregation [[:sum-where [:field-id (data/id :venues :price)] [:< [:field-id (data/id :venues :price)] 4]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

;; Test normalization
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  179.0
  (->> {:aggregation [["sum-where" ["field-id" (data/id :venues :price)] ["<" ["field-id" (data/id :venues :price)] 4]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  34.0
  (->> {:aggregation [[:sum-where
                       [:field-id (data/id :venues :price)]
                       [:and [:< [:field-id (data/id :venues :price)] 4]
                        [:or [:starts-with [:field-id (data/id :venues :name)] "M"]
                         [:ends-with [:field-id (data/id :venues :name)] "t"]]]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  nil
  (->> {:aggregation [[:sum-where [:field-id (data/id :venues :price)] [:< [:field-id (data/id :venues :price)] 4]]]
        :filter      [:> [:field-id (data/id :venues :price)] Long/MAX_VALUE]}
       (data/run-mbql-query venues)
       rows
       ffirst))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  [[2 0.0]
   [3 0.0]
   [4 1.0]
   [5 1.0]]
  (->> {:aggregation [[:sum-where [:field-id (data/id :venues :price)] [:< [:field-id (data/id :venues :price)] 2]]]
        :breakout    [[:field-id (data/id :venues :category_id)]]
        :limit       4}
       (data/run-mbql-query venues)
       (tu/round-all-decimals 2)
       rows
       (map (fn [[k v]]
              [(long k) (double v)]))))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
  90.5
  (->> {:aggregation [[:+ [:/ [:sum-where [:field-id (data/id :venues :price)] [:< [:field-id (data/id :venues :price)] 4]] 2] 1]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       double))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  179.0
  (tt/with-temp* [Segment [{segment-id :id} {:table_id   (data/id :venues)
                                             :definition {:source-table (data/id :venues)
                                                          :filter       [:< [:field-id (data/id :venues :price)] 4]}}]]
    (->> {:aggregation [[:sum-where [:field-id (data/id :venues :price)] [:segment segment-id]]]}
         (data/run-mbql-query venues)
         rows
         ffirst
         double)))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  179.0
  (tt/with-temp* [Metric [{metric-id :id} {:table_id   (data/id :venues)
                                           :definition {:source-table (data/id :venues)
                                                        :aggregation  [:sum-where [:field-id (data/id :venues :price)] [:< [:field-id (data/id :venues :price)] 4]]}}]]
    (->> {:aggregation [[:metric metric-id]]}
         (data/run-mbql-query venues)
         rows
         ffirst
         double)))
