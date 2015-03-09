(ns metabase.api.qs-test
  "Tests for /api/qs endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [query-execution :refer [QueryExecution]])
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.test-data :refer :all]))

;; ## Helper Fns
(defn create-query []
  ((user->client :rasta) :post 200 "qs" {:database (:id @test-db)
                                         :sql "SELECT COUNT(*) FROM CATEGORIES;"}))

(defn fetch-query [uuid]
  ((user->client :rasta) :get (format "qs/%s" uuid)))

;; POST /api/qs
;; Test that we can create a Query
(expect-eval-actual-first
    (match-$ (sel :one QueryExecution (order :id :desc))
      {:id $
       :uuid $
       :query_id nil
       :version 0
       :started_at $})
  (-> (create-query)
      (dissoc :status))) ; status is a race condition and can be either 'running' or 'completed'

;; GET /api/qs/:uuid
;; Can we fetch the results of a Query ?
(expect-eval-actual-first
    (match-$ (sel :one QueryExecution (order :id :desc))
      {:id $
       :uuid $
       :status "completed"
       :data {:columns ["count(*)"]
              :cols [{:base_type "IntegerField"
                      :name "count(*)"}]
              :rows [[75]]}
       :row_count 1})
  (let [{uuid :uuid} (create-query)]
    (Thread/sleep 100)   ; this query is simple as f**k. Give it 100ms to complete
    (fetch-query uuid))) ; if it doesn't by then our QP might be brokesies
