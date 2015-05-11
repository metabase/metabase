(ns metabase.api.meta.table-test
  "Tests for /api/meta/table endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.mongo.test-data :as mongo-data :refer [mongo-test-db-id]]
            [metabase.http-client :as http]
            [metabase.middleware.auth :as auth]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data.datasets :as datasets, :refer [*dataset* with-dataset-when-testing]]
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]))


;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get auth/response-unauthentic :body) (http/client :get 401 "meta/table"))
(expect (get auth/response-unauthentic :body) (http/client :get 401 (format "meta/table/%d" (table->id :users))))


;; ## GET /api/meta/table?org
;; These should come back in alphabetical order and include relevant metadata
(expect (set (mapcat (fn [dataset-name]
                       (with-dataset-when-testing dataset-name
                         (let [db-id (:id (datasets/db *dataset*))]
                           [{:name (datasets/format-name *dataset* "categories"), :db_id db-id, :active true, :rows   75, :id (datasets/table-name->id *dataset* :categories)}
                            {:name (datasets/format-name *dataset* "checkins"),   :db_id db-id, :active true, :rows 1000, :id (datasets/table-name->id *dataset* :checkins)}
                            {:name (datasets/format-name *dataset* "users"),      :db_id db-id, :active true, :rows   15, :id (datasets/table-name->id *dataset* :users)}
                            {:name (datasets/format-name *dataset* "venues"),     :db_id db-id, :active true, :rows  100, :id (datasets/table-name->id *dataset* :venues)}])))
                     @datasets/test-dataset-names))
  (->> ((user->client :rasta) :get 200 "meta/table" :org @org-id)
       (map #(dissoc % :db :created_at :updated_at :entity_name :description :entity_type))
       set))

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
(expect [(match-$ (sel :one Field :id (field->id :categories :id))
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
            :base_type "BigIntegerField"})
         (match-$ (sel :one Field :id (field->id :categories :name))
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
            :base_type "TextField"})]
  ((user->client :rasta) :get 200 (format "meta/table/%d/fields" (table->id :categories))))

;; ## GET /api/meta/table/:id/query_metadata
; TODO - create test which includes :field_values
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
       :fields [(match-$ (sel :one Field :id (field->id :categories :id))
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
                   :base_type "BigIntegerField"})
                (match-$ (sel :one Field :id (field->id :categories :name))
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
                   :base_type "TextField"})]
       :field_values nil
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
    (match-$ (let [table (sel :one Table :id (table->id :users))]
               ;; reset Table back to its original state
               (upd Table (table->id :users) :entity_name nil :entity_type nil :description nil)
               table)
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
  (do ((user->client :crowberto) :put 200 (format "meta/table/%d" (table->id :users)) {:entity_name "Userz"
                                                                                       :entity_type "person"
                                                                                       :description "What a nice table!"})
      ((user->client :crowberto) :get 200 (format "meta/table/%d" (table->id :users)))))


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
                           :created_at $
                           :db (match-$ @test-db
                                 {:description nil,
                                  :organization_id 1,
                                  :name "Test Database",
                                  :updated_at $,
                                  :id $,
                                  :engine "h2",
                                  :created_at $
                                  :details $})})})
      :destination (match-$ users-id-field
                     {:id $
                      :table_id $
                      :name "ID"
                      :description nil
                      :base_type "BigIntegerField"
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


;; ## POST /api/meta/table/:id/reorder
(expect-eval-actual-first
  {:result "success"}
  (let [categories-id-field (sel :one Field :table_id (table->id :categories) :name "ID")
        categories-name-field (sel :one Field :table_id (table->id :categories) :name "NAME")
        api-response ((user->client :rasta) :post 200 (format "meta/table/%d/reorder" (table->id :categories))
                       {:new_order [(:id categories-name-field) (:id categories-id-field)]})]
    ;; check the modified values (have to do it here because the api response tells us nothing)
    (assert (= 0 (:position (sel :one :fields [Field :position] :id (:id categories-name-field)))))
    (assert (= 1 (:position (sel :one :fields [Field :position] :id (:id categories-id-field)))))
    ;; put the values back to their previous state
    (upd Field (:id categories-name-field) :position 0)
    (upd Field (:id categories-id-field) :position 0)
    ;; return our origin api response for validation
    api-response))
