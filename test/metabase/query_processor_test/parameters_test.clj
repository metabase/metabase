(ns metabase.query-processor-test.parameters_test
  "Tests for query parameters."
  (:require [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]]
            [metabase.query-processor.expand :as ql]
            [metabase.test.data :as data]))

(expect-with-non-timeseries-dbs
  [[9 "Nils Gotam"]]
  (format-rows-by [int str]
    (let [inner-query (data/query users
                        (ql/aggregation (ql/rows)))
          outer-query (data/wrap-inner-query inner-query)
          outer-query (assoc outer-query :parameters [{:name "id", :type "id", :target ["field-id" (data/id :users :id)], :value 9}])]
      (rows (qp/process-query outer-query)))))


(expect-with-non-timeseries-dbs
  [[6]]
  (format-rows-by [int]
    (let [inner-query (data/query venues
                        (ql/aggregation (ql/count)))
          outer-query (data/wrap-inner-query inner-query)
          outer-query (assoc outer-query :parameters [{:name "price", :type "category", :target ["field-id" (data/id :venues :price)], :value 4}])]
      (rows (qp/process-query outer-query)))))
