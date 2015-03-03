(ns metabase.api.meta.dataset-test
  "Unit tests for /api/meta/dataset endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.test-data :refer :all]
            [metabase.test-utils :refer [match-$]]))

;; ## QUERY /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect (match-$ (sel :one :fields [QueryExecution :id :uuid] (order :id :desc))
          {:data {:rows [[1000]]
                  :columns ["count"]
                  :cols [{:base_type "IntegerField", :special_type "number", :name "count", :id nil, :table_id nil, :description nil}]}
           :row_count 1,
           :status "completed",
           :uuid $
           :id $})
  ((user->client :rasta) :post 200 "meta/dataset" {:database (:id @test-db)
                                                   :type "query"
                                                   :query {:aggregation ["count"]
                                                           :breakout [nil]
                                                           :filter [nil nil]
                                                           :limit nil
                                                           :source_table (table->id :checkins)}}))
