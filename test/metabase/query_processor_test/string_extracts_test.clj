(ns metabase.query-processor-test.string-extracts-test
  (:require [metabase.query-processor-test :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

(defn- test-string-extract
  [expr]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; To ensure stable ordering
        :order-by    [[:asc [:field-id (data/id :venues :id)]]]
        :limit       1}
       (data/run-mbql-query venues)
       rows
       ffirst))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "foo"
  (test-string-extract [:trim " foo "]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "foo "
  (test-string-extract [:ltrim " foo "]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  " foo"
  (test-string-extract [:rtrim " foo "]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "RED MEDICINE"
  (test-string-extract [:upper [:field-id (data/id :venues :name)]]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "red medicine"
  (test-string-extract [:lower [:field-id (data/id :venues :name)]]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "Red"
  (test-string-extract [:substring [:field-id (data/id :venues :name)] 1 3]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "ed Medicine"
  (test-string-extract [:substring [:field-id (data/id :venues :name)] 2]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "Blue Medicine"
  (test-string-extract [:replace [:field-id (data/id :venues :name)] "Red" "Blue"]))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  1
  (int (test-string-extract [:coalesce 1 2])))

(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions :regex)
  "Red"
  (test-string-extract [:regex-match-first [:field-id (data/id :venues :name)] ".ed+"]))

;; test nesting
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  "MED"
  (test-string-extract [:upper [:substring [:trim [:substring [:field-id (data/id :venues :name)] 4]] 1 3]]))
