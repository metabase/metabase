(ns metabase.api.meta.field-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [match-$]]))

;; ## GET /api/meta/field/:id
(expect
    (match-$ (sel :one Field :id (field->id :users :name))
      {:description nil
       :table_id (table->id :users)
       :table (match-$ (sel :one Table :id (table->id :users))
                {:description nil
                 :entity_type nil
                 :db (match-$ @test-db
                       {:created_at $
                        :engine "h2"
                        :id $
                        :details {:conn_str "file:t.db;AUTO_SERVER=TRUE"}
                        :updated_at $
                        :name "Test Database"
                        :organization_id (:id @test-org)
                        :description nil})
                 :name "USERS"
                 :rows 15
                 :updated_at $
                 :entity_name nil
                 :active true
                 :id (table->id :users)
                 :db_id (:id @test-db)
                 :created_at $})
       :special_type nil
       :name "NAME"
       :updated_at $
       :active true
       :id (field->id :users :name)
       :field_type "dimension"
       :position 0
       :preview_display true
       :created_at $
       :base_type "TextField"})
  ((user->client :rasta) :get 200 (format "meta/field/%d" (field->id :users :name))))

;; GET /api/meta/field/:id/summary

(expect [["count" 75]      ; why doesn't this come back as a dictionary ?
         ["distincts" 75]]
  ((user->client :rasta) :get 200 (format "meta/field/%d/summary" (field->id :categories :name))))
