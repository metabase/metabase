(ns metabase.api.field-test
  (:require [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.models
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; Helper Fns

(defn- db-details []
  (tu/match-$ (db)
    {:created_at         $
     :engine             "h2"
     :caveats            nil
     :points_of_interest nil
     :id                 $
     :updated_at         $
     :name               "test-data"
     :is_sample          false
     :is_full_sync       true
     :description        nil
     :features           (mapv name (driver/features (driver/engine->driver :h2)))}))


;; ## GET /api/field/:id
(expect
  (tu/match-$ (Field (id :users :name))
    {:description        nil
     :table_id           (id :users)
     :raw_column_id      $
     :table              (tu/match-$ (Table (id :users))
                           {:description             nil
                            :entity_type             nil
                            :visibility_type         nil
                            :db                      (db-details)
                            :schema                  "PUBLIC"
                            :name                    "USERS"
                            :display_name            "Users"
                            :rows                    15
                            :updated_at              $
                            :entity_name             nil
                            :active                  true
                            :id                      (id :users)
                            :db_id                   (id)
                            :caveats                 nil
                            :points_of_interest      nil
                            :show_in_getting_started false
                            :raw_table_id            $
                            :created_at              $})
     :special_type       "type/Name"
     :name               "NAME"
     :display_name       "Name"
     :caveats            nil
     :points_of_interest nil
     :updated_at         $
     :last_analyzed      $
     :active             true
     :id                 (id :users :name)
     :visibility_type    "normal"
     :position           0
     :preview_display    true
     :created_at         $
     :base_type          "type/Text"
     :fk_target_field_id nil
     :parent_id          nil})
  ((user->client :rasta) :get 200 (format "field/%d" (id :users :name))))


;; ## GET /api/field/:id/summary
(expect [["count" 75]      ; why doesn't this come back as a dictionary ?
         ["distincts" 75]]
  ((user->client :rasta) :get 200 (format "field/%d/summary" (id :categories :name))))


;; ## PUT /api/field/:id

(defn- simple-field-details [field]
  (select-keys field [:name :display_name :description :visibility_type :special_type]))

;; test that we can do basic field update work, including unsetting some fields such as special-type
(expect
  [{:name            "Field Test"
    :display_name    "Field Test"
    :description     nil
    :special_type    nil
    :visibility_type :normal}
   {:name            "Field Test"
    :display_name    "yay"
    :description     "foobar"
    :special_type    :type/Name
    :visibility_type :sensitive}
   {:name            "Field Test"
    :display_name    "yay"
    :description     nil
    :special_type    nil
    :visibility_type :sensitive}]
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test"}]]
    (let [original-val (simple-field-details (Field field-id))]
      ;; set it
      ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:name            "something else"
                                                                        :display_name    "yay"
                                                                        :description     "foobar"
                                                                        :special_type    :type/Name
                                                                        :visibility_type :sensitive})
      (let [updated-val (simple-field-details (Field field-id))]
        ;; unset it
        ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:description  nil
                                                                          :special_type nil})
        [original-val
         updated-val
         (simple-field-details (Field field-id))]))))

;; when we set the special-type from :type/FK to something else, make sure fk_target_field_id is set to nil
(expect
  [true
   nil]
  (tt/with-temp* [Field [{fk-field-id :id}]
                  Field [{field-id :id}    {:special_type :type/FK, :fk_target_field_id fk-field-id}]]
    (let [original-val (boolean (db/select-one-field :fk_target_field_id Field, :id field-id))]
      ;; unset the :type/FK special-type
      ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:special_type :type/Name})
      [original-val
       (db/select-one-field :fk_target_field_id Field, :id field-id)])))


;; check that you *can* set it if it *is* the proper base type
(expect
  :type/UNIXTimestampSeconds
  (tt/with-temp* [Field [{field-id :id} {:base_type :type/Integer}]]
    ((user->client :crowberto) :put 200 (str "field/" field-id) {:special_type :type/UNIXTimestampSeconds})
    (db/select-one-field :special_type Field, :id field-id)))


(defn- field->field-values
  "Fetch the `FieldValues` object that corresponds to a given `Field`."
  [table-kw field-kw]
  (FieldValues :field_id (id table-kw field-kw)))

(defn- field-values-id [table-key field-key]
  (:id (field->field-values table-key field-key)))

;; ## GET /api/field/:id/values
;; Should return something useful for a field that has special_type :type/Category
(expect
  {:field_id              (id :venues :price)
   :human_readable_values {}
   :values                [1 2 3 4]
   :id                    (field-values-id :venues :price)}
  (do
    ;; clear out existing human_readable_values in case they're set
    (db/update! FieldValues (field-values-id :venues :price)
      :human_readable_values nil)
    ;; now update the values via the API
    (-> ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))
        (dissoc :created_at :updated_at))))

;; Should return nothing for a field whose special_type is *not* :type/Category
(expect
  {:values                {}
   :human_readable_values {}}
  ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :id))))


;; ## POST /api/field/:id/value_map_update

;; Check that we can set values
(expect
  [{:status "success"}
   {:field_id              (id :venues :price)
    :human_readable_values {:1 "$"
                            :2 "$$"
                            :3 "$$$"
                            :4 "$$$$"}
    :values                [1 2 3 4]
    :id                    (field-values-id :venues :price)}]
  [((user->client :crowberto) :post 200 (format "field/%d/value_map_update" (id :venues :price)) {:values_map {:1 "$"
                                                                                                               :2 "$$"
                                                                                                               :3 "$$$"
                                                                                                               :4 "$$$$"}})
   (-> ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))
       (dissoc :created_at :updated_at))])

;; Check that we can unset values
(expect
  [{:status "success"}
   (tu/match-$ (FieldValues :field_id (id :venues :price))
     {:field_id              (id :venues :price)
      :human_readable_values {}
      :values                [1 2 3 4]
      :id                    (field-values-id :venues :price)})]
  [(do (db/update! FieldValues (:id (field->field-values :venues :price))
         :human_readable_values {:1 "$" ; make sure they're set
                                 :2 "$$"
                                 :3 "$$$"
                                 :4 "$$$$"})
       ((user->client :crowberto) :post 200 (format "field/%d/value_map_update" (id :venues :price)) {:values_map {}}))
   (-> ((user->client :rasta) :get 200 (format "field/%d/values" (id :venues :price)))
       (dissoc :created_at :updated_at))])

;; Check that we get an error if we call value_map_update on something that isn't a category
(expect "You can only update the mapped values of a Field whose 'special_type' is 'category'/'city'/'state'/'country' or whose 'base_type' is 'type/Boolean'."
  ((user->client :crowberto) :post 400 (format "field/%d/value_map_update" (id :venues :id))
   {:values_map {:1 "$"
                 :2 "$$"
                 :3 "$$$"
                 :4 "$$$$"}}))
