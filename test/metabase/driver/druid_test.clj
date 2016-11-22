(ns metabase.driver.druid-test
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.query-processor :as qp]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer [rows]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets, :refer [expect-with-engine]]
            [metabase.timeseries-query-processor-test :as timeseries-qp-test]
            [metabase.query :as q]))

(def ^:const ^:private ^String native-query-1
  (json/generate-string
    {:intervals   ["1900-01-01/2100-01-01"]
     :granularity :all
     :queryType   :select
     :pagingSpec  {:threshold 2}
     :dataSource  :checkins
     :dimensions  [:venue_price
                   :venue_name
                   :user_name
                   :id]
     :metrics     [:count]}))

(defn- process-native-query [query]
  (datasets/with-engine :druid
    (timeseries-qp-test/with-flattened-dbdef
      (qp/process-query {:native   {:query query}
                         :type     :native
                         :database (data/id)}))))

;; test druid native queries
(expect-with-engine :druid
  {:row_count 2
   :status    :completed
   :data      {:columns     ["timestamp" "id" "user_name" "venue_price" "venue_name" "count"]
               :rows        [["2013-01-03T08:00:00.000Z" "931" "Simcha Yan" "1" "Kinaree Thai Bistro"       1]
                             ["2013-01-10T08:00:00.000Z" "285" "Kfir Caj"   "2" "Ruen Pair Thai Restaurant" 1]]
               :annotate?   nil
               :cols        [{:name "timestamp",   :base_type :type/Text}
                             {:name "id",          :base_type :type/Text}
                             {:name "user_name",   :base_type :type/Text}
                             {:name "venue_price", :base_type :type/Text}
                             {:name "venue_name",  :base_type :type/Text}
                             {:name "count",       :base_type :type/Integer}]
               :native_form {:query native-query-1}}}
  (process-native-query native-query-1))


;; make sure we can run a native :timeseries query. This was throwing an Exception -- see #3409
(def ^:const ^:private ^String native-query-2
  (json/generate-string
    {:intervals    ["1900-01-01/2100-01-01"]
     :granularity  {:type     :period
                    :period   :P1M
                    :timeZone :UTC}
     :queryType    :timeseries
     :dataSource   :checkins
     :aggregations [{:type :count
                     :name :count}]}))

(expect-with-engine :druid
  :completed
  (:status (process-native-query native-query-2)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                   MATH AGGREGATIONS                                                    |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defmacro ^:private druid-query-returning-rows {:style/indent 0} [& body]
  `(rows (timeseries-qp-test/with-flattened-dbdef
           (qp/process-query {:database (data/id)
                              :type     :query
                              :query    (data/query ~'checkins
                                          ~@body)}))))

;; sum, *
(expect-with-engine :druid
  [["1" 110688.0]
   ["2" 616708.0]
   ["3" 179661.0]
   ["4"  86284.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/sum (ql/* $id $venue_price)))
    (ql/breakout $venue_price)))

;; min, +
(expect-with-engine :druid
  [["1"  4.0]
   ["2"  3.0]
   ["3"  8.0]
   ["4" 12.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/min (ql/+ $id $venue_price)))
    (ql/breakout $venue_price)))

;; max, /
(expect-with-engine :druid
  [["1" 1000.0]
   ["2"  499.5]
   ["3"  332.0]
   ["4"  248.25]]
  (druid-query-returning-rows
    (ql/aggregation (ql/max (ql// $id $venue_price)))
    (ql/breakout $venue_price)))

;; avg, -
(expect-with-engine :druid
  [["1" 500.85067873303166]
   ["2" 1002.7772357723577]
   ["3" 1562.2695652173913]
   ["4" 1760.8979591836735]]
  (druid-query-returning-rows
    (ql/aggregation (ql/avg (ql/* $id $venue_price)))
    (ql/breakout $venue_price)))

;; post-aggregation math w/ 2 args: count + sum
(expect-with-engine :druid
  [["1"  442.0]
   ["2" 1845.0]
   ["3"  460.0]
   ["4"  245.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/+ (ql/count $id)
                          (ql/sum $venue_price)))
    (ql/breakout $venue_price)))

;; post-aggregation math w/ 3 args: count + sum + count
(expect-with-engine :druid
  [["1"  663.0]
   ["2" 2460.0]
   ["3"  575.0]
   ["4"  294.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/+ (ql/count $id)
                          (ql/sum $venue_price)
                          (ql/count $venue_price)))
    (ql/breakout $venue_price)))

;; post-aggregation math w/ a constant: count * 10
(expect-with-engine :druid
  [["1" 2210.0]
   ["2" 6150.0]
   ["3" 1150.0]
   ["4"  490.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/* (ql/count $id)
                          10))
    (ql/breakout $venue_price)))

;; nested post-aggregation math: count + (count * sum)
(expect-with-engine :druid
  [["1"  49062.0]
   ["2" 757065.0]
   ["3"  39790.0]
   ["4"  9653.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/+ (ql/count $id)
                          (ql/* (ql/count $id)
                                (ql/sum $venue_price))))
    (ql/breakout $venue_price)))

;; post-aggregation math w/ avg: count + avg
(expect-with-engine :druid
  [["1"  721.8506787330316]
   ["2" 1116.388617886179]
   ["3"  635.7565217391304]
   ["4"  489.2244897959184]]
  (druid-query-returning-rows
    (ql/aggregation (ql/+ (ql/count $id)
                          (ql/avg $id)))
    (ql/breakout $venue_price)))

;; post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)
(expect-with-engine :druid
  [["1" -998.0]
   ["2" -995.0]
   ["3" -990.0]
   ["4" -985.0]]
  (druid-query-returning-rows
    (ql/aggregation (ql/+ (ql/max $venue_price)
                          (ql/min (ql/- $venue_price $id))))
    (ql/breakout $venue_price)))
