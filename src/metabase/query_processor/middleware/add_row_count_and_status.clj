(ns metabase.query-processor.middleware.add-row-count-and-status
  "Middleware for adding `:row_count` and `:status` info to QP results."
  (:require [metabase.query-processor
             [interface :as i]
             [util :as qputil]]))

(defn add-row-count-and-status
  "Wrap the results of a successfully processed query in the format expected by the frontend (add `row_count` and `status`)."
  [qp]
  (fn [{{:keys [max-results max-results-bare-rows]} :constraints, :as query}]
    (let [results-limit (or (when (qputil/query-without-aggregations-or-limits? query)
                              max-results-bare-rows)
                            max-results
                            i/absolute-max-results)
          results       (qp query)
          num-results   (count (:rows results))]
      (cond-> {:row_count num-results
               :status    :completed
               :data      results}
        ;; Add :rows_truncated if we've hit the limit so the UI can let the user know
        (= num-results results-limit) (assoc-in [:data :rows_truncated] results-limit)))))
