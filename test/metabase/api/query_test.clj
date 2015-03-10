(ns metabase.api.query-test
  "Tests for /api/query endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [query :refer [Query]])
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.test-data :refer :all]))

;; ## Helper Fns

(defn create-query []
  ((user->client :rasta) :post 200 "query" {:database (:id @test-db)
                                            :sql "SELECT COUNT(*) FROM VENUES;"}))

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
  (create-query))

;; ## GET /api/query
;; Check that we can fetch details for a Query
(expect-eval-actual-first
    (match-$ (sel :one Query (order :id :DESC))
      {:id $
       :name $
       :type "rawsql"
       :creator_id (user->id :rasta)
       :updated_at $
       :details {:timezone nil
                 :sql "SELECT COUNT(*) FROM VENUES;"}
       :database_id (:id @test-db)
       :database (match-$ @test-db
                   {:created_at $
                    :engine "h2"
                    :id $
                    :details $
                    :updated_at $
                    :name "Test Database"
                    :organization_id (:id @test-org)
                    :description nil})
       :creator (match-$ (fetch-user :rasta)
                  {:common_name "Rasta Toucan"
                   :date_joined $
                   :last_name "Toucan"
                   :id $
                   :is_superuser false
                   :last_login $
                   :first_name "Rasta"
                   :email "rasta@metabase.com"})
       :can_read true
       :can_write true
       :version $
       :public_perms 0
       :created_at $})
  (let [{id :id} (create-query)]
    ((user->client :rasta) :get 200 (format "query/%d" id))))

;; ## PUT /api/query
;; Check that we can update a Query
(expect-eval-actual-first
    ["My Awesome Query"
     "My Awesome Query 2"]
  (let [{:keys [id name database_id]} (create-query)
        get-query-name (fn [] (sel :one :field [Query :name] :id id))]
    [(do ((user->client :rasta) :put 200 (format "query/%d" id) {:name "My Awesome Query"
                                                                 :database {:id database_id}})
         (get-query-name))
     (do ((user->client :rasta) :put 200 (format "query/%d" id) {:name "My Awesome Query 2"
                                                                 :database {:id database_id}})
         (get-query-name))]))
