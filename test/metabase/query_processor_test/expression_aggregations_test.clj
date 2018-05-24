(ns metabase.query-processor-test.expression-aggregations-test
  "Tests for expression aggregations and for named aggregations."
  (:require [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.models.metric :refer [Metric]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets :refer [*driver* *engine*]]
            [toucan.util.test :as tt]))

;; sum, *
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 1211]
   [2 5710]
   [3 1845]
   [4 1476]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/sum (ql/* $id $price)))
            (ql/breakout $price)))))

;; min, +
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 10]
   [2  4]
   [3  4]
   [4 20]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/min (ql/+ $id $price)))
            (ql/breakout $price)))))

;; max, /
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 94]
   [2 50]
   [3 26]
   [4 20]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/max (ql// $id $price)))
            (ql/breakout $price)))))

;; avg, -
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  (if (= *engine* :h2)
    [[1  55]
     [2  97]
     [3 142]
     [4 246]]
    [[1  55]
     [2  96]
     [3 141]
     [4 246]])
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/avg (ql/* $id $price)))
            (ql/breakout $price)))))

;; post-aggregation math w/ 2 args: count + sum
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1  44]
   [2 177]
   [3  52]
   [4  30]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/sum $price)))
            (ql/breakout $price)))))

;; post-aggregation math w/ 3 args: count + sum + count
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1  66]
   [2 236]
   [3  65]
   [4  36]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/sum $price)
                                  (ql/count $price)))
            (ql/breakout $price)))))

;; post-aggregation math w/ a constant: count * 10
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 220]
   [2 590]
   [3 130]
   [4  60]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/* (ql/count $id)
                                  10))
            (ql/breakout $price)))))

;; nested post-aggregation math: count + (count * sum)
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1  506]
   [2 7021]
   [3  520]
   [4  150]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/* (ql/count $id)
                                        (ql/sum $price))))
            (ql/breakout $price)))))

;; post-aggregation math w/ avg: count + avg
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  (if (= *engine* :h2)
    [[1  77]
     [2 107]
     [3  60]
     [4  68]]
    [[1  77]
     [2 107]
     [3  60]
     [4  67]])
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/avg $id)))
            (ql/breakout $price)))))

;; post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 -92]
   [2 -96]
   [3 -74]
   [4 -73]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/max $price)
                                  (ql/min (ql/- $price $id))))
            (ql/breakout $price)))))

;; aggregation w/o field
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 23]
   [2 60]
   [3 14]
   [4  7]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ 1 (ql/count)))
            (ql/breakout $price)))))

;; Sorting by an un-named aggregate expression
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1 2] [2 2] [12 2] [4 4] [7 4] [10 4] [11 4] [8 8]]
  (format-rows-by [int int]
    (rows (data/run-query users
            (ql/aggregation (ql/* (ql/count) 2))
            (ql/breakout (ql/datetime-field $last_login :month-of-year))
            (ql/order-by (ql/asc (ql/aggregation 0)))))))

;; aggregation with math inside the aggregation :scream_cat:
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1  44]
   [2 177]
   [3  52]
   [4  30]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/sum (ql/+ $price 1)))
            (ql/breakout $price)))))

;; check that we can name an expression aggregation w/ aggregation at top-level
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  {:rows    [[1  44]
             [2 177]
             [3  52]
             [4  30]]
   :columns [(data/format-name "price")
             (driver/format-custom-field-name *driver* "New Price")]} ; Redshift annoyingly always lowercases column aliases
  (format-rows-by [int int]
    (rows+column-names (data/run-query venues
                         (ql/aggregation (ql/named (ql/sum (ql/+ $price 1)) "New Price"))
                         (ql/breakout $price)))))

;; check that we can name an expression aggregation w/ expression at top-level
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  {:rows    [[1 -19]
             [2  77]
             [3  -2]
             [4 -17]]
   :columns [(data/format-name "price")
             (driver/format-custom-field-name *driver* "Sum-41")]}
  (format-rows-by [int int]
    (rows+column-names (data/run-query venues
                         (ql/aggregation (ql/named (ql/- (ql/sum $price) 41) "Sum-41"))
                         (ql/breakout $price)))))

;; check that we can handle METRICS (ick) inside expression aggregation clauses
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[2 119]
   [3  40]
   [4  25]]
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [:sum [:field-id (data/id :venues :price)]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (format-rows-by [int int]
      (rows (qp/process-query
              {:database (data/id)
               :type     :query
               :query    {:source-table (data/id :venues)
                          :aggregation  [:+ ["METRIC" (u/get-id metric)] 1]
                          :breakout     [(ql/breakout (ql/field-id (data/id :venues :price)))]}})))))

;; check that we can handle METRICS (ick) inside a NAMED clause
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  {:rows    [[2 118]
             [3  39]
             [4  24]]
   :columns [(data/format-name "price")
             (driver/format-custom-field-name *driver* "My Cool Metric")]}
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [:sum [:field-id (data/id :venues :price)]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (format-rows-by [int int]
      (rows+column-names (qp/process-query
                           {:database (data/id)
                            :type     :query
                            :query    {:source-table (data/id :venues)
                                       :aggregation  [[:named ["METRIC" (u/get-id metric)] "My Cool Metric"]]
                                       :breakout     [(ql/breakout (ql/field-id (data/id :venues :price)))]}})))))

;; check that METRICS (ick) with a nested aggregation still work inside a NAMED clause
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  {:rows    [[2 118]
             [3  39]
             [4  24]]
   :columns [(data/format-name "price")
             (driver/format-custom-field-name *driver* "My Cool Metric")]}
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [[:sum [:field-id (data/id :venues :price)]]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (format-rows-by [int int]
      (rows+column-names (qp/process-query
                           {:database (data/id)
                            :type     :query
                            :query    {:source-table (data/id :venues)
                                       :aggregation  [[:named ["METRIC" (u/get-id metric)] "My Cool Metric"]]
                                       :breakout     [(ql/breakout (ql/field-id (data/id :venues :price)))]}})))))

;; check that named aggregations come back with the correct column metadata (#4002)
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  (let [col-name (driver/format-custom-field-name *driver* "Count of Things")]
    (assoc (aggregate-col :count)
      :name         col-name
      :display_name col-name))
  (-> (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-table (data/id :venues)
                    :aggregation  [[:named ["COUNT"] "Count of Things"]]}})
      :data :cols first))

;; check that we can use cumlative count in expression aggregations
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expression-aggregations)
  [[1000]]
  (format-rows-by [int]
    (rows (qp/process-query
            {:database (data/id)
             :type     :query
             :query    {:source-table (data/id :venues)
                        :aggregation  [["*" ["cum_count"] 10]]}}))))
