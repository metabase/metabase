(ns metabase.api.meta.db-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.models.table :refer [Table]]
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [match-$]]))

;; ## GET /api/meta/db/:id
(expect
    (match-$ @test-db
      {:created_at $
       :engine "h2"
       :id $
       :details {:conn_str "file:t.db;AUTO_SERVER=TRUE"}
       :updated_at $
       :organization {:id (:id @test-org)
                      :slug "test"
                      :name "Test Organization"
                      :description nil
                      :logo_url nil
                      :inherits true}
       :name "Test Database"
       :organization_id (:id @test-org)
       :description nil})
  ((user->client :rasta) :get 200 (format "meta/db/%d" (:id @test-db))))

;; ## GET /api/meta/db/:id/tables
;; These should come back in alphabetical order
(expect
    (let [db-id (:id @test-db)]
      [(match-$ (sel :one Table :id (table->id :categories))
         {:description nil, :entity_type nil, :name "CATEGORIES", :rows 75, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})
       (match-$ (sel :one Table :id (table->id :checkins))
         {:description nil, :entity_type nil, :name "CHECKINS", :rows 1000, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})
       (match-$ (sel :one Table :id (table->id :users))
         {:description nil, :entity_type nil, :name "USERS", :rows 15, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})
       (match-$ (sel :one Table :id (table->id :venues))
         {:description nil, :entity_type nil, :name "VENUES", :rows 100, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})])
  ((user->client :rasta) :get 200 (format "meta/db/%d/tables" (:id @test-db))))
