(ns metabase.api.field-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.database :refer [Database]]
            (metabase.models [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

;; Helper Fns

(defn- db-details []
  (tu/match-$ (db)
    {:created_at      $
     :engine          "h2"
     :id              $
     :updated_at      $
     :name            "test-data"
     :is_sample       false
     :is_full_sync    true
     :organization_id nil
     :description     nil
     :features        (mapv name (metabase.driver/features (metabase.driver/engine->driver :h2)))}))


;; ## GET /api/field/:id
(expect
    (tu/match-$ (Field (id :users :name))
      {:description     nil
       :table_id        (id :users)
       :raw_column_id   $
       :table           (tu/match-$ (Table (id :users))
                          {:description     nil
                           :entity_type     nil
                           :visibility_type nil
                           :db              (db-details)
                           :schema          "PUBLIC"
                           :name            "USERS"
                           :display_name    "Users"
                           :rows            15
                           :updated_at      $
                           :entity_name     nil
                           :active          true
                           :id              (id :users)
                           :db_id           (id)
                           :raw_table_id    $
                           :created_at      $})
       :special_type    "name"
       :name            "NAME"
       :display_name    "Name"
       :updated_at      $
       :last_analyzed   $
       :active          true
       :id              (id :users :name)
       :field_type      "info"
       :visibility_type "normal"
       :position        0
       :preview_display true
       :created_at      $
       :base_type       "TextField"
       :fk_target_field_id nil
       :parent_id       nil})
    ((user->client :rasta) :get 200 (format "field/%d" (id :users :name))))


;; ## GET /api/field/:id/summary
(expect [["count" 75]      ; why doesn't this come back as a dictionary ?
         ["distincts" 75]]
  ((user->client :rasta) :get 200 (format "field/%d/summary" (id :categories :name))))


;; ## PUT /api/field/:id

(defn simple-field-details [field]
  (select-keys field [:name :display_name :description :visibility_type :special_type]))

;; test that we can do basic field update work, including unsetting some fields such as special-type
(expect
  [{:name            "Field Test"
    :display_name    "Field test"
    :description     nil
    :special_type    nil
    :visibility_type :normal}
   {:name            "Field Test"
    :display_name    "yay"
    :description     "foobar"
    :special_type    :name
    :visibility_type :sensitive}
   {:name            "Field Test"
    :display_name    "yay"
    :description     nil
    :special_type    nil
    :visibility_type :sensitive}]
  (tu/with-temp Database [{database-id :id} {:name      "Field Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Field Test"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Field [{field-id :id} {:table_id    table-id
                                           :name        "Field Test"
                                           :base_type   :TextField
                                           :field_type  :info
                                           :special_type nil
                                           :active      true
                                           :preview_display true
                                           :position    1}]
        (let [original-val (simple-field-details (db/sel :one Field :id field-id))]
          ;; set it
          ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:name "something else"
                                                                            :display_name "yay"
                                                                            :description "foobar"
                                                                            :special_type :name
                                                                            :visibility_type :sensitive})
          (let [updated-val (simple-field-details (db/sel :one Field :id field-id))]
            ;; unset it
            ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:description nil
                                                                              :special_type nil})
            [original-val
             updated-val
             (simple-field-details (db/sel :one Field :id field-id))]))))))

;; when we set the special-type from :fk to something else, make sure fk_target_field_id is set to nil
(expect
  [true
   nil]
  (tu/with-temp Database [{database-id :id} {:name      "Field Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Field Test"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Field [{field-id1 :id} {:table_id    table-id
                                            :name        "Target Field"
                                            :base_type   :TextField
                                            :field_type  :info
                                            :special_type :id
                                            :active      true
                                            :preview_display true
                                            :position    1}]
        (tu/with-temp Field [{field-id :id} {:table_id    table-id
                                             :name        "Field Test"
                                             :base_type   :TextField
                                             :field_type  :info
                                             :special_type :fk
                                             :fk_target_field_id field-id1
                                             :active      true
                                             :preview_display true
                                             :position    1}]
          (let [original-val (boolean (db/sel :one :field [Field :fk_target_field_id] :id field-id))]
            ;; unset the :fk special-type
            ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:special_type :name})
            [original-val
             (db/sel :one :field [Field :fk_target_field_id] :id field-id)]))))))

;; check that you can't set a field to :timestamp_seconds if it's not of a proper base_type
(expect
  ["Invalid Request."
   nil]
  (tu/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Field    [{field-id :id} {:table_id table-id}]]
    [((user->client :crowberto) :put 400 (str "field/" field-id) {:special_type :timestamp_seconds})
     (db/sel :one :field [Field :special_type], :id field-id)]))


(defn- field->field-values
  "Fetch the `FieldValues` object that corresponds to a given `Field`."
  [table-kw field-kw]
  (db/sel :one FieldValues :field_id (id table-kw field-kw)))

;; ## GET /api/field/:id/values
;; Should return something useful for a field that has special_type :category
(tu/expect-eval-actual-first
    (tu/match-$ (field->field-values :venues :price)
      {:field_id              (id :venues :price)
       :human_readable_values {}
       :values                [1 2 3 4]
       :updated_at            $
       :created_at            $
       :id                    $})
  (do (db/upd FieldValues (:id (field->field-values :venues :price)) :human_readable_values nil) ; clear out existing human_readable_values in case they're set
      ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))))

;; Should return nothing for a field whose special_type is *not* :category
(expect
    {:values                {}
     :human_readable_values {}}
  ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :id))))


;; ## POST /api/field/:id/value_map_update

;; Check that we can set values
(tu/expect-eval-actual-first
    [{:status "success"}
     (tu/match-$ (db/sel :one FieldValues :field_id (id :venues :price))
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
(tu/expect-eval-actual-first
    [{:status "success"}
     (tu/match-$ (db/sel :one FieldValues :field_id (id :venues :price))
       {:field_id              (id :venues :price)
        :human_readable_values {}
        :values                [1 2 3 4]
        :updated_at            $
        :created_at            $
        :id                    $})]
  [(do (db/upd FieldValues (:id (field->field-values :venues :price)) :human_readable_values {:1 "$" ; make sure they're set
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
