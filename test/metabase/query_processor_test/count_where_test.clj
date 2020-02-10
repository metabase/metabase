(ns metabase.query-processor-test.count-where-test
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
  94
  (->> {:aggregation [[:count-where [:< [:field-id (data/id :venues :price)] 4]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       long))

;; Test normalization
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  94
  (->> {:aggregation [["count-where" ["<" ["field-id" (data/id :venues :price)] 4]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       long))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  17
  (->> {:aggregation [[:count-where [:and [:< [:field-id (data/id :venues :price)] 4]
                                     [:or [:starts-with [:field-id (data/id :venues :name)] "M"]
                                      [:ends-with [:field-id (data/id :venues :name)] "t"]]]]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       long))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  nil
  (->> {:aggregation [[:count-where [:< [:field-id (data/id :venues :price)] 4]]]
        :filter      [:> [:field-id (data/id :venues :price)] Long/MAX_VALUE]}
       (data/run-mbql-query venues)
       rows
       ffirst))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  [[2 0]
   [3 0]
   [4 1]
   [5 1]]
  (->> {:aggregation [[:count-where [:< [:field-id (data/id :venues :price)] 2]]]
        :breakout    [[:field-id (data/id :venues :category_id)]]
        :limit       4}
       (data/run-mbql-query venues)
       (tu/round-all-decimals 2)
       rows
       (map (fn [[k v]]
              [(long k) (long v)]))))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
  48
  (->> {:aggregation [[:+ [:/ [:count-where [:< [:field-id (data/id :venues :price)] 4]] 2] 1]]}
       (data/run-mbql-query venues)
       rows
       ffirst
       long))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  94
  (tt/with-temp* [Segment [{segment-id :id} {:table_id   (data/id :venues)
                                             :definition {:source-table (data/id :venues)
                                                          :filter       [:< [:field-id (data/id :venues :price)] 4]}}]]
    (->> {:aggregation [[:count-where [:segment segment-id]]]}
         (data/run-mbql-query venues)
         rows
         ffirst
         long)))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :basic-aggregations)
  94
  (tt/with-temp* [Metric [{metric-id :id} {:table_id   (data/id :venues)
                                           :definition {:source-table (data/id :venues)
                                                        :aggregation  [:count-where [:< [:field-id (data/id :venues :price)] 4]]}}]]
    (->> {:aggregation [[:metric metric-id]]}
         (data/run-mbql-query venues)
         rows
         ffirst
         long)))
