(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require [expectations :refer [expect]]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.limit :as limit]))

;;; --------------------------------------------- LIMIT-MAX-RESULT-ROWS ----------------------------------------------

(def ^:private ^{:arglists '([query])} limit (limit/limit identity))

;; Apply limit-max-result-rows to an infinite sequence and make sure it gets capped at `i/absolute-max-results`
(expect
  i/absolute-max-results
  (->> (limit {:type :native
               :rows (repeat [:ok])})
       :rows
       count))

;; Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained
(expect
  1234
  (->> (limit {:constraints {:max-results 1234}
               :type        :query
               :query       {:aggregation [[:count]]}
               :rows        (repeat [:ok])})
       :rows
       count))

;; Apply a max-results-bare-rows limit specifically on no-aggregation query
(expect
  [46 46]
  (let [res (limit {:constraints {:max-results 46}
                    :type        :query
                    :query       {}
                    :rows        (repeat [:ok])})]
    [(->> res :rows count)
     (->> res :query :limit)]))
