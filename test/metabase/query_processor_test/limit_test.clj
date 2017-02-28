(ns metabase.query-processor-test.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require [expectations :refer :all]
            [metabase.query-processor :refer [absolute-max-results]]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer :all]
            [metabase.util :as u]))

;;; ------------------------------------------------------------ LIMIT-MAX-RESULT-ROWS ------------------------------------------------------------
;; Apply limit-max-result-rows to an infinite sequence and make sure it gets capped at `absolute-max-results`
(expect
  absolute-max-results
  (->> (((resolve 'metabase.query-processor/limit) identity) {:rows (repeat [:ok])})
       :rows
       count))

;; Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained
(expect
  1234
  (->> (((resolve 'metabase.query-processor/limit) identity) {:constraints {:max-results 1234}
                                                              :query       {:aggregation [{:aggregation-type :count}]}
                                                              :rows        (repeat [:ok])})
       :rows
       count))

;; Apply a max-results-bare-rows limit specifically on :rows type query
(expect
  [46 46]
  (let [res (((resolve 'metabase.query-processor/limit) identity) {:constraints {:max-results 46}
                                                                   :query       {:aggregation [{:aggregation-type :rows}]}
                                                                   :rows        (repeat [:ok])})]
    [(->> res :rows count)
     (->> res :query :limit)]))
