(ns metabase.query-processor.middleware.add-row-count-and-status-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.add-row-count-and-status :as add-row-count-and-status]))

(expect
  {:row_count 5
   :status    :completed
   :data      {:rows           [[1] [1] [1] [1] [1]]
               :rows_truncated 5}}
  ;; NOTE: the default behavior is to treat the query as no aggregation and use :max-results-bare-rows
  ((add-row-count-and-status/add-row-count-and-status (constantly {:rows [[1] [1] [1] [1] [1]]}))
    {:constraints {:max-results           10
                   :max-results-bare-rows 5}}))

(expect
  {:row_count      5
   :status         :completed
   :data           {:rows [[1] [1] [1] [1] [1]]}}
  ;; when we aren't a no-aggregation query the then we use :max-results for our limit
  ((add-row-count-and-status/add-row-count-and-status (constantly {:rows [[1] [1] [1] [1] [1]]}))
    {:query       {:aggregation [[:count]]}
     :constraints {:max-results           10
                   :max-results-bare-rows 5}}))
