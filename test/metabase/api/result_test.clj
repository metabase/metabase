(ns metabase.api.result-test
  "Tests for /api/result endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [query-execution :refer [QueryExecution]])
            [metabase.api.query-test :refer [create-query]]
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.test-data :refer :all]))

(defn create-and-execute-query
  "Create a `Query`, run it + wait for it to finish, and return the resulting `QueryExecution`."
  []
  (let [{query-id :id} (create-query)
        query-execution ((user->client :rasta) :post 200 (format "query/%d" query-id))]
    (Thread/sleep 100) ; Give it 100ms to finish
    query-execution))

;; ## GET /result/:id
;; Check that we can fetch the QueryResult object that gets created when we call POST /api/query/:id
(expect-eval-actual-first
    (match-$ (sel :one QueryExecution (order :id :DESC))
      {:query_id $
       :raw_query ""
       :result_rows 1
       :finished_at $
       :started_at $
       :json_query {:native {:timezone nil,
                             :query "SELECT COUNT(*) FROM VENUES;"}
                    :database (:id @test-db)
                    :type "native"}
       :status "completed"
       :id $
       :uuid $
       :row_count 1
       :running_time $
       :version 1})
  (let [{execution-id :id} (create-and-execute-query)]
    ((user->client :rasta) :get 200 (format "result/%d" execution-id))))


;; ## GET /result/:id/response
;; Can we get the results of a QueryExecution?
(expect-eval-actual-first
    (match-$ (sel :one QueryExecution (order :id :DESC))
      {:id $
       :uuid $
       :status "completed"
       :data {:columns ["count(*)"]
              :cols [{:base_type "IntegerField", :name "count(*)"}]
              :rows [[100]]}
       :row_count 1})
  (let [{execution-id :id} (create-and-execute-query)]
    ((user->client :rasta) :get 200 (format "result/%d/response" execution-id))))
