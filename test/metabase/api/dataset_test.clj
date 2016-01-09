(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            [metabase.driver.query-processor.expand :as ql]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]))

;;; ## POST /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect-eval-actual-first
    (match-$ (sel :one :fields [QueryExecution :id :uuid] (k/order :id :desc))
      {:data      {:rows    [[1000]]
                   :columns ["count"]
                   :cols    [{:base_type "IntegerField", :special_type "number", :name "count", :display_name "count", :id nil, :table_id nil,
                              :description nil, :target nil, :extra_info {}}]}
       :row_count 1
       :status    "completed"
       :id        $
       :uuid      $})
  ((user->client :rasta) :post 200 "dataset" (ql/wrap-inner-query
                                               (query checkins
                                                 (ql/aggregation (ql/count))))))

;; Even if a query fails we still expect a 200 response from the api
(expect-eval-actual-first
  (match-$ (sel :one QueryExecution (k/order :id :desc))
    {:data {:rows []
            :cols []
            :columns []}
     :error "Syntax error in SQL statement \"FOOBAR[*] \"; expected \"FROM, {\""
     :raw_query ""
     :row_count 0
     :result_rows 0
     :status "failed"
     :version 0
     :json_query $
     :started_at $
     :finished_at $
     :running_time $
     :id $
     :uuid $})
  ((user->client :rasta) :post 200 "dataset" {:database (id)
                                                   :type "native"
                                                   :native {:query "foobar"}}))
