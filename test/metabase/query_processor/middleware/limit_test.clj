(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require [expectations :refer :all]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.limit :as limit]))

;;; ------------------------------------------------------------ LIMIT-MAX-RESULT-ROWS ------------------------------------------------------------
;; Apply limit-max-result-rows to an infinite sequence and make sure it gets capped at `i/absolute-max-results`
(expect
  i/absolute-max-results
  (->> ((limit/limit identity) {:rows (repeat [:ok])})
       :rows
       count))

;; Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained
(expect
  1234
  (->> ((limit/limit identity) {:constraints {:max-results 1234}
                                :query       {:aggregation [{:aggregation-type :count}]}
                                :rows        (repeat [:ok])})
       :rows
       count))

;; Apply a max-results-bare-rows limit specifically on :rows type query
(expect
  [46 46]
  (let [res ((limit/limit identity) {:constraints {:max-results 46}
                                     :query       {:aggregation [{:aggregation-type :rows}]}
                                     :rows        (repeat [:ok])})]
    [(->> res :rows count)
     (->> res :query :limit)]))
