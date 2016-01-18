(ns metabase.api.field-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]))



;; ## GET /api/field/:id
(expect
    (match-$ (Field (id :users :name))
      {:description     nil
       :table_id        (id :users)
       :table           (match-$ (Table (id :users))
                          {:description     nil
                           :entity_type     nil
                           :visibility_type nil
                           :db              (match-$ (db)
                                              {:created_at      $
                                               :engine          "h2"
                                               :id              $
                                               :updated_at      $
                                               :name            "test-data"
                                               :is_sample       false
                                               :organization_id nil
                                               :description     nil})
                           :schema          "PUBLIC"
                           :name            "USERS"
                           :display_name    "Users"
                           :rows            15
                           :updated_at      $
                           :entity_name     nil
                           :active          true
                           :id              (id :users)
                           :db_id           (id)
                           :created_at      $})
       :special_type    "category" ; metabase.driver.generic-sql.sync/check-for-low-cardinality should have marked this as such because it had no other special_type
       :name            "NAME"
       :display_name    "Name"
       :updated_at      $
       :active          true
       :id              (id :users :name)
       :field_type      "info"
       :position        0
       :preview_display true
       :created_at      $
       :base_type       "TextField"
       :parent_id       nil})
    ((user->client :rasta) :get 200 (format "field/%d" (id :users :name))))


;; ## GET /api/field/:id/summary
(expect [["count" 75]      ; why doesn't this come back as a dictionary ?
         ["distincts" 75]]
  ((user->client :rasta) :get 200 (format "field/%d/summary" (id :categories :name))))


;; ## PUT /api/field/:id
;; Check that we can update a Field
;; TODO - this should NOT be modifying a field from our test data, we should create new data to mess with
(expect-eval-actual-first
    (match-$ (let [field (Field (id :venues :latitude))]
               ;; this is sketchy. But return the Field back to its unmodified state so it won't affect other unit tests
               (upd Field (id :venues :latitude) :special_type "latitude")
               ;; match against the modified Field
               field)
             {:description     nil
              :table_id        (id :venues)
              :special_type    "fk"
              :name            "LATITUDE"
              :display_name    "Latitude"
              :updated_at      $
              :active          true
              :id              $
              :field_type      "info"
              :position        0
              :preview_display true
              :created_at      $
              :base_type       "FloatField"
              :parent_id       nil})
  ((user->client :crowberto) :put 200 (format "field/%d" (id :venues :latitude)) {:special_type :fk}))

(defn- field->field-values
  "Fetch the `FieldValues` object that corresponds to a given `Field`."
  [table-kw field-kw]
  (sel :one FieldValues :field_id (id table-kw field-kw)))

;; ## GET /api/field/:id/values
;; Should return something useful for a field that has special_type :category
(expect-eval-actual-first
    (match-$ (field->field-values :venues :price)
      {:field_id              (id :venues :price)
       :human_readable_values {}
       :values                [1 2 3 4]
       :updated_at            $
       :created_at            $
       :id                    $})
  (do (upd FieldValues (:id (field->field-values :venues :price)) :human_readable_values nil) ; clear out existing human_readable_values in case they're set
      ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))))

;; Should return nothing for a field whose special_type is *not* :category
(expect
    {:values                {}
     :human_readable_values {}}
  ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :id))))


;; ## POST /api/field/:id/value_map_update

;; Check that we can set values
(expect-eval-actual-first
    [{:status "success"}
     (match-$ (sel :one FieldValues :field_id (id :venues :price))
       {:field_id              (id :venues :price)
        :human_readable_values {:1 "$"
                                :2 "$$"
                                :3 "$$$"
                                :4 "$$$$"}
        :values                [1 2 3 4]
        :updated_at            $
        :created_at            $
        :id                    $})]
  [((user->client :crowberto) :post 200 (format "field/%d/value_map_update" (id :venues :price)) {:values_map {:1 "$"
                                                                                                                    :2 "$$"
                                                                                                                    :3 "$$$"
                                                                                                                    :4 "$$$$"}})
   ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))])

;; Check that we can unset values
(expect-eval-actual-first
    [{:status "success"}
     (match-$ (sel :one FieldValues :field_id (id :venues :price))
       {:field_id              (id :venues :price)
        :human_readable_values {}
        :values                [1 2 3 4]
        :updated_at            $
        :created_at            $
        :id                    $})]
  [(do (upd FieldValues (:id (field->field-values :venues :price)) :human_readable_values {:1 "$" ; make sure they're set
                                                                                           :2 "$$"
                                                                                           :3 "$$$"
                                                                                           :4 "$$$$"})
       ((user->client :crowberto) :post 200 (format "field/%d/value_map_update" (id :venues :price))
        {:values_map {}}))
   ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))])

;; Check that we get an error if we call value_map_update on something that isn't a category
(expect "You can only update the mapped values of a Field whose 'special_type' is 'category'/'city'/'state'/'country' or whose 'base_type' is 'BooleanField'."
  ((user->client :crowberto) :post 400 (format "field/%d/value_map_update" (id :venues :id))
   {:values_map {:1 "$"
                 :2 "$$"
                 :3 "$$$"
                 :4 "$$$$"}}))
