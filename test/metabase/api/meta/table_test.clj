(ns metabase.api.meta.table-test
  "Tests for /api/meta/table endpoints."
  (:require [expectations :refer :all]
            [metabase.http-client :as http]
            [metabase.test-data :refer [table->id db-id org-id user->client]]))

;; Test GET /api/meta/table?org
(expect [{:description nil, :entity_type nil, :name "CATEGORIES", :rows 75, :entity_name nil, :active true, :id (table->id :categories), :db_id @db-id}
         {:description nil, :entity_type nil, :name "CHECKINS", :rows 1000, :entity_name nil, :active true, :id (table->id :checkins), :db_id @db-id}
         {:description nil, :entity_type nil, :name "USERS", :rows 15, :entity_name nil, :active true, :id (table->id :users), :db_id @db-id}
         {:description nil, :entity_type nil, :name "VENUES", :rows 100, :entity_name nil, :active true, :id (table->id :venues), :db_id @db-id}]
  (->> ((user->client :rasta) :get 200 "meta/table" :org @org-id)
       (map #(dissoc % :db :created_at :updated_at)))) ; don't care about checking nested DB, and not sure how to compare `:created_at` / `:updated_at`
