(ns metabase.api.meta.dataset-test
  "Unit tests for /api/meta/dataset endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]
            [metabase.test-data :refer :all]))

;;; ## POST /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect-eval-actual-first (match-$ (sel :one :fields [QueryExecution :id :uuid] (order :id :desc))
                            {:data {:rows [[1000]]
                                    :columns ["count"]
                                    :cols [{:base_type "IntegerField", :special_type "number", :name "count", :id nil, :table_id nil, :description nil}]}
                             :row_count 1
                             :status "completed"
                             :id $
                             :uuid $})
  ((user->client :rasta) :post 200 "meta/dataset" {:database (:id @test-db)
                                                   :type "query"
                                                   :query {:aggregation ["count"]
                                                           :breakout [nil]
                                                           :filter [nil nil]
                                                           :limit nil
                                                           :source_table (table->id :checkins)}}))

;; Even if a query fails we still expect a 200 response from the api
(expect-eval-actual-first
  (match-$ (sel :one QueryExecution (order :id :desc))
    {:data {:rows []
            :cols []
            :columns []}
     :error "Syntax error in SQL statement \"FOOBAR[*] \"; expected \"FROM, {\""
     :raw_query ""
     :row_count 0
     :result_rows 0
     :status "failed"
     :query_id nil
     :version 0
     :json_query $
     :started_at $
     :finished_at $
     :running_time $
     :id $
     :uuid $})
  ((user->client :rasta) :post 200 "meta/dataset" {:database (:id @test-db)
                                                   :type "native"
                                                   :native {:query "foobar"}}))
