(ns metabase.api.meta.table-test
  "Tests for /api/meta/table endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            [metabase.middleware.auth :as auth]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]))


;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get auth/response-unauthentic :body) (http/client :get 401 "meta/table"))
(expect (get auth/response-unauthentic :body) (http/client :get 401 (format "meta/table/%d" (table->id :users))))


;; ## GET /api/meta/table?org
;; These should come back in alphabetical order and include relevant metadata
(expect [{:description nil, :entity_type nil, :name "CATEGORIES", :rows 75, :entity_name nil, :active true, :id (table->id :categories), :db_id @db-id}
         {:description nil, :entity_type nil, :name "CHECKINS", :rows 1000, :entity_name nil, :active true, :id (table->id :checkins), :db_id @db-id}
         {:description nil, :entity_type nil, :name "USERS", :rows 15, :entity_name nil, :active true, :id (table->id :users), :db_id @db-id}
         {:description nil, :entity_type nil, :name "VENUES", :rows 100, :entity_name nil, :active true, :id (table->id :venues), :db_id @db-id}]
  (->> ((user->client :rasta) :get 200 "meta/table" :org @org-id)
       (map #(dissoc % :db :created_at :updated_at)))) ; don't care about checking nested DB, and not sure how to compare `:created_at` / `:updated_at`

;; ## GET /api/meta/table/:id
(expect
    (match-$ (sel :one Table :id (table->id :venues))
      {:description nil
       :entity_type nil
       :db (match-$ @test-db
             {:created_at $
              :engine "h2"
              :id $
              :details $
              :updated_at $
              :name "Test Database"
              :organization_id @org-id
              :description nil})
       :name "VENUES"
       :rows 100
       :updated_at $
       :entity_name nil
       :active true
       :pk_field (deref $pk_field)
       :id (table->id :venues)
       :db_id (:id @test-db)
       :created_at $})
  ((user->client :rasta) :get 200 (format "meta/table/%d" (table->id :venues))))

;; ## GET /api/meta/table/:id/fields
(expect [(match-$ (sel :one Field :id (field->id :categories :name))
           {:description nil
            :table_id (table->id :categories)
            :special_type nil
            :name "NAME"
            :updated_at $
            :active true
            :id (field->id :categories :name)
            :field_type "info"
            :position 0
            :preview_display true
            :created_at $
            :base_type "TextField"})
         (match-$ (sel :one Field :id (field->id :categories :id))
           {:description nil
            :table_id (table->id :categories)
            :special_type "id"
            :name "ID"
            :updated_at $
            :active true
            :id (field->id :categories :id)
            :field_type "info"
            :position 0
            :preview_display true
            :created_at $
            :base_type "BigIntegerField"})]
  ((user->client :rasta) :get 200 (format "meta/table/%d/fields" (table->id :categories))))

;; ## GET /api/meta/table/:id/query_metadata
(expect
    (match-$ (sel :one Table :id (table->id :categories))
      {:description nil
       :entity_type nil
       :db (match-$ @test-db
             {:created_at $
              :engine "h2"
              :id $
              :details $
              :updated_at $
              :name "Test Database"
              :organization_id @org-id
              :description nil})
       :name "CATEGORIES"
       :fields [(match-$ (sel :one Field :id (field->id :categories :name))
                  {:description nil
                   :table_id (table->id :categories)
                   :special_type nil
                   :name "NAME"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "TextField"})
                (match-$ (sel :one Field :id (field->id :categories :id))
                  {:description nil
                   :table_id (table->id :categories)
                   :special_type "id"
                   :name "ID"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "BigIntegerField"})]
       :rows 75
       :updated_at $
       :entity_name nil
       :active true
       :id (table->id :categories)
       :db_id (:id @test-db)
       :created_at $})
  ((user->client :rasta) :get 200 (format "meta/table/%d/query_metadata" (table->id :categories))))


;; ## PUT /api/meta/table/:id
(expect-eval-actual-first
    [(match-$ (sel :one Table :id (table->id :users))
       {:description "What a nice table!"
        :entity_type "person"
        :db (match-$ @test-db
              {:description nil
               :organization_id $
               :name "Test Database"
               :updated_at $
               :details $
               :id $
               :engine "h2"
               :created_at $})
        :name "USERS"
        :rows 15
        :updated_at $
        :entity_name "Userz"
        :active true
        :pk_field (deref $pk_field)
        :id $
        :db_id @db-id
        :created_at $})
     true]
  [(do ((user->client :crowberto) :put 200 (format "meta/table/%d" (table->id :users)) {:entity_name "Userz"
                                                                                        :entity_type "person"
                                                                                        :description "What a nice table!"})
       ((user->client :crowberto) :get 200 (format "meta/table/%d" (table->id :users))))
   ;; Now reset the Table to it's original state
   (upd Table (table->id :users) :entity_name nil :entity_type nil :description nil)])


;; ## GET /api/meta/table/:id/fks
;; We expect a single FK from CHECKINS.USER_ID -> USERS.ID
(expect-let [checkins-user-field (sel :one Field :table_id (table->id :checkins) :name "USER_ID")
             users-id-field (sel :one Field :table_id (table->id :users) :name "ID")]
  [(match-$ (sel :one ForeignKey :destination_id (:id users-id-field))
     {:id $
      :origin_id (:id checkins-user-field)
      :destination_id (:id users-id-field)
      :relationship "Mt1"
      :created_at $
      :updated_at $
      :origin (match-$ checkins-user-field
                {:id $
                 :table_id $
                 :name "USER_ID"
                 :description nil
                 :base_type "IntegerField"
                 :preview_display $
                 :position $
                 :field_type "info"
                 :active true
                 :special_type "fk"
                 :created_at $
                 :updated_at $
                 :table (match-$ (sel :one Table :id (table->id :checkins))
                          {:description nil
                           :entity_type nil
                           :name "CHECKINS"
                           :rows 1000
                           :updated_at $
                           :entity_name nil
                           :active true
                           :id $
                           :db_id $
                           :created_at $})})
      :destination (match-$ users-id-field
                     {:id $
                      :table_id $
                      :name "ID"
                      :description nil
                      :base_type "IntegerField"
                      :preview_display $
                      :position $
                      :field_type "info"
                      :active true
                      :special_type "id"
                      :created_at $
                      :updated_at $
                      :table (match-$ (sel :one Table :id (table->id :users))
                               {:description nil
                                :entity_type nil
                                :name "USERS"
                                :rows 15
                                :updated_at $
                                :entity_name nil
                                :active true
                                :id $
                                :db_id $
                                :created_at $})})})]
  ((user->client :rasta) :get 200 (format "meta/table/%d/fks" (table->id :users))))

