(ns metabase.api.query-test
  "Tests for /api/query endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [query :refer [Query]])
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.test-data :refer :all]))

;; ## POST /api/query
;; Check that we can save a Query

(expect-eval-actual-first
    (match-$ (sel :one Query (order :id :DESC))
      {:database_id (:id @test-db)
       :name $
       :type "rawsql"
       :creator_id (user->id :rasta)
       :updated_at $
       :details {:timezone nil
                 :sql "SELECT COUNT(*) FROM VENUES;"}
       :id $
       :version $
       :public_perms 0
       :created_at $})
  ((user->client :rasta) :post 200 "query" {:database (:id @test-db)
                                            :sql "SELECT COUNT(*) FROM VENUES;"}))
