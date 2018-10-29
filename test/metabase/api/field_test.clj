(ns metabase.api.field-test
  "Tests for `/api/field` endpoints."
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [query-processor-test :as qpt]]
            [metabase.api.field :as field-api]
            [metabase.models
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :refer [user->client]]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [ring.util.codec :as codec]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]
            [metabase.util :as u]
            [metabase.test.util.log :as tu.log]))

;; Helper Fns

(defn- db-details []
  (tu/match-$ (data/db)
    {:created_at                  $
     :engine                      "h2"
     :caveats                     nil
     :points_of_interest          nil
     :id                          $
     :updated_at                  $
     :name                        "test-data"
     :is_sample                   false
     :is_full_sync                true
     :is_on_demand                false
     :description                 nil
     :features                    (mapv name (driver/features (driver/engine->driver :h2)))
     :cache_field_values_schedule "0 50 0 * * ? *"
     :metadata_sync_schedule      "0 50 * * * ? *"
     :options                     nil
     :timezone                    $}))

;; ## GET /api/field/:id
(expect
  (tu/match-$ (Field (data/id :users :name))
    {:description         nil
     :table_id            (data/id :users)
     :fingerprint         $
     :fingerprint_version $
     :table               (tu/match-$ (Table (data/id :users))
                            {:description             nil
                             :entity_type             "entity/UserTable"
                             :visibility_type         nil
                             :db                      (db-details)
                             :schema                  "PUBLIC"
                             :name                    "USERS"
                             :display_name            "Users"
                             :rows                    nil
                             :updated_at              $
                             :entity_name             nil
                             :active                  true
                             :id                      (data/id :users)
                             :db_id                   (data/id)
                             :caveats                 nil
                             :points_of_interest      nil
                             :show_in_getting_started false
                             :created_at              $
                             :fields_hash             $})
     :special_type        "type/Name"
     :name                "NAME"
     :display_name        "Name"
     :caveats             nil
     :points_of_interest  nil
     :updated_at          $
     :last_analyzed       $
     :active              true
     :id                  (data/id :users :name)
     :visibility_type     "normal"
     :position            0
     :preview_display     true
     :created_at          $
     :database_type       "VARCHAR"
     :base_type           "type/Text"
     :has_field_values    "list"
     :fk_target_field_id  nil
     :parent_id           nil
     :dimensions          []
     :name_field          nil
     :settings            nil})
  ((user->client :rasta) :get 200 (format "field/%d" (data/id :users :name))))



;;; ------------------------------------------- GET /api/field/:id/summary -------------------------------------------

(expect [["count" 75]      ; why doesn't this come back as a dictionary ?
         ["distincts" 75]]
  ((user->client :rasta) :get 200 (format "field/%d/summary" (data/id :categories :name))))


;;; ----------------------------------------------- PUT /api/field/:id -----------------------------------------------

(defn simple-field-details [field]
  (select-keys field [:name :display_name :description :visibility_type :special_type :fk_target_field_id]))

;; test that we can do basic field update work, including unsetting some fields such as special-type
(expect
  [{:name               "Field Test"
    :display_name       "Field Test"
    :description        nil
    :special_type       nil
    :visibility_type    :normal
    :fk_target_field_id nil}
   {:name               "Field Test"
    :display_name       "yay"
    :description        "foobar"
    :special_type       :type/Name
    :visibility_type    :sensitive
    :fk_target_field_id nil}
   {:name               "Field Test"
    :display_name       "yay"
    :description        nil
    :special_type       nil
    :visibility_type    :sensitive
    :fk_target_field_id nil}]
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
  {1 true
   2 nil}
  (tt/with-temp* [Field [{fk-field-id :id}]
                  Field [{field-id :id}    {:special_type :type/FK, :fk_target_field_id fk-field-id}]]
    (let [original-val (boolean (db/select-one-field :fk_target_field_id Field, :id field-id))]
      ;; unset the :type/FK special-type
      ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:special_type :type/Name})
      (array-map
       1 original-val
       2 (db/select-one-field :fk_target_field_id Field, :id field-id)))))


;; check that you *can* set it if it *is* the proper base type
(expect
  :type/UNIXTimestampSeconds
  (tt/with-temp* [Field [{field-id :id} {:base_type :type/Integer}]]
    ((user->client :crowberto) :put 200 (str "field/" field-id) {:special_type :type/UNIXTimestampSeconds})
    (db/select-one-field :special_type Field, :id field-id)))


(defn- field->field-values
  "Fetch the `FieldValues` object that corresponds to a given `Field`."
  [table-kw field-kw]
  (FieldValues :field_id (data/id table-kw field-kw)))

(defn- field-values-id [table-key field-key]
  (:id (field->field-values table-key field-key)))

;; ## GET /api/field/:id/values
;; Should return something useful for a field whose `has_field_values` is `list`
(expect
  {:values [[1] [2] [3] [4]], :field_id (data/id :venues :price)}
  (do
    ;; clear out existing human_readable_values in case they're set
    (db/update! FieldValues (field-values-id :venues :price)
      :human_readable_values nil)
    ;; now update the values via the API
    ((user->client :rasta) :get 200 (format "field/%d/values" (data/id :venues :price)))))

;; Should return nothing for a field whose `has_field_values` is not `list`
(expect
  {:values [], :field_id (data/id :venues :id)}
  ((user->client :rasta) :get 200 (format "field/%d/values" (data/id :venues :id))))

;; Sensisitive fields do not have field values and should return empty
(expect
  {:values [], :field_id (data/id :users :password)}
  ((user->client :rasta) :get 200 (format "field/%d/values" (data/id :users :password))))


;;; ------------------------------------------- POST /api/field/:id/values -------------------------------------------

(def ^:private list-field {:name "Field Test", :base_type :type/Integer, :has_field_values "list"})

;; Human readable values are optional
(expect
  [{:values [[5] [6] [7] [8] [9]], :field_id true}
   {:status "success"}
   {:values [[1] [2] [3] [4]], :field_id true}]
  (tt/with-temp* [Field       [{field-id :id}       list-field]
                  FieldValues [{field-value-id :id} {:values (range 5 10), :field_id field-id}]]
    (mapv tu/boolean-ids-and-timestamps
          [((user->client :crowberto) :get 200 (format "field/%d/values" field-id))
           ((user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values (map vector (range 1 5))})
           ((user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Existing field values can be updated (with their human readable values)
(expect
  [{:values [[1] [2] [3] [4]], :field_id true}
   {:status "success"}
   {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true}]
  (tt/with-temp* [Field [{field-id :id} list-field]
                  FieldValues [{field-value-id :id} {:values (range 1 5), :field_id field-id}]]
    (mapv tu/boolean-ids-and-timestamps
          [((user->client :crowberto) :get 200 (format "field/%d/values" field-id))
           ((user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]]})
           ((user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Field values are created when not present
(expect
  [{:values [], :field_id true}
   {:status "success"}
   {:values [1 2 3 4], :human_readable_values ["$" "$$" "$$$" "$$$$"]}
   {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true}]
  (tt/with-temp* [Field [{field-id :id} list-field]]
    (mapv tu/boolean-ids-and-timestamps
          [ ;; this will print an error message because it will try to fetch the FieldValues, but the Field doesn't
           ;; exist; we can ignore that
           (tu.log/suppress-output
             ((user->client :crowberto) :get 200 (format "field/%d/values" field-id)))
           ((user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]]})
           (db/select-one [FieldValues :values :human_readable_values] :field_id field-id)
           ((user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Can unset values
(expect
  [{:values [[1] [2] [3] [4]], :field_id true}
   {:status "success"}
   {:values [], :field_id true}]
  (tt/with-temp* [Field       [{field-id :id}       list-field]
                  FieldValues [{field-value-id :id} {:values (range 1 5), :field_id field-id}]]
    (mapv tu/boolean-ids-and-timestamps
          [((user->client :crowberto) :get 200 (format "field/%d/values" field-id))
           ((user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values [], :field_id true})
           ((user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Can unset just human readable values
(expect
  [{:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true}
   {:status "success"}
   {:values [[1] [2] [3] [4]], :field_id true}]
  (tt/with-temp* [Field       [{field-id :id}       list-field]
                  FieldValues [{field-value-id :id} {:values (range 1 5), :field_id field-id
                                                     :human_readable_values ["$" "$$" "$$$" "$$$$"]}]]
    (mapv tu/boolean-ids-and-timestamps
          [((user->client :crowberto) :get 200 (format "field/%d/values" field-id))
           ((user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values [[1] [2] [3] [4]]})
           ((user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Should throw when human readable values are present but not for every value
(expect
  "If remapped values are specified, they must be specified for all field values"
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test", :base_type :type/Integer, :has_field_values "list"}]]
    ((user->client :crowberto) :post 400 (format "field/%d/values" field-id)
     {:values [[1 "$"] [2 "$$"] [3] [4]]})))

;; ## PUT /api/field/:id/dimension

(defn- dimension-for-field [field-id]
  (-> (Field :id field-id)
      (hydrate :dimensions)
      :dimensions))

(defn- create-dimension-via-API! {:style/indent 1} [field-id map-to-post]
  ((user->client :crowberto) :post 200 (format "field/%d/dimension" field-id) map-to-post))

;; test that we can do basic field update work, including unsetting some fields such as special-type
(expect
  [[]
   {:id                      true
    :created_at              true
    :updated_at              true
    :type                    :internal
    :name                    "some dimension name"
    :human_readable_field_id false
    :field_id                true}
   {:id                      true
    :created_at              true
    :updated_at              true
    :type                    :internal
    :name                    "different dimension name"
    :human_readable_field_id false
    :field_id                true}
   true]
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test"}]]
    (let [before-creation (dimension-for-field field-id)
          _               (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
          new-dim         (dimension-for-field field-id)
          _               (create-dimension-via-API! field-id {:name "different dimension name", :type "internal"})
          updated-dim     (dimension-for-field field-id)]
      [before-creation
       (tu/boolean-ids-and-timestamps new-dim)
       (tu/boolean-ids-and-timestamps updated-dim)
       (= (:id new-dim) (:id updated-dim))])))

;; Check that trying to get values for a 'virtual' field just returns a blank values map
(expect
  {:values []}
  ((user->client :rasta) :get 200 (format "field/%s/values" (codec/url-encode "field-literal,created_at,type/Datetime"))))

;; test that we can do basic field update work, including unsetting some fields such as special-type
(expect
  [[]
   {:id                      true
    :created_at              true
    :updated_at              true
    :type                    :external
    :name                    "some dimension name"
    :human_readable_field_id true
    :field_id                true}]
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                  Field [{field-id-2 :id} {:name "Field Test 2"}]]
    (let [before-creation (dimension-for-field field-id-1)
          _               (create-dimension-via-API! field-id-1
                            {:name "some dimension name", :type "external" :human_readable_field_id field-id-2})
          new-dim         (dimension-for-field field-id-1)]
      [before-creation
       (tu/boolean-ids-and-timestamps new-dim)])))

;; External remappings require a human readable field id
(expect
  clojure.lang.ExceptionInfo
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]]
    (create-dimension-via-API! field-id-1 {:name "some dimension name", :type "external"})))

;; Non-admin users can't update dimension, :field_id trues
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test 1"}]]
    ((user->client :rasta) :post 403 (format "field/%d/dimension" field-id)
     {:name "some dimension name", :type "external"})))

;; Ensure we can delete a dimension
(expect
  [{:id                      true
    :created_at              true
    :updated_at              true
    :type                    :internal
    :name                    "some dimension name"
    :human_readable_field_id false
    :field_id                true}
   []]
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test"}]]

    (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})

    (let [new-dim (dimension-for-field field-id)]
      ((user->client :crowberto) :delete 204 (format "field/%d/dimension" field-id))
      [(tu/boolean-ids-and-timestamps new-dim)
       (dimension-for-field field-id)])))

;; Non-admin users can't delete a dimension
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test 1"}]]
    ((user->client :rasta) :delete 403 (format "field/%d/dimension" field-id))))

;; When an FK field gets it's special_type removed, we should clear the external dimension
(expect
  [{:id                      true
    :created_at              true
    :updated_at              true
    :type                    :external
    :name                    "fk-remove-dimension"
    :human_readable_field_id true
    :field_id                true}
   []]
  (tt/with-temp* [Field [{field-id-1 :id} {:name         "Field Test 1"
                                           :special_type :type/FK}]
                  Field [{field-id-2 :id} {:name "Field Test 2"}]]
    ;; create the Dimension
    (create-dimension-via-API! field-id-1
      {:name "fk-remove-dimension", :type "external" :human_readable_field_id field-id-2})
    ;; not remove the special type (!) TODO
    (let [new-dim          (dimension-for-field field-id-1)
          _                ((user->client :crowberto) :put 200 (format "field/%d" field-id-1) {:special_type nil})
          dim-after-update (dimension-for-field field-id-1)]
      [(tu/boolean-ids-and-timestamps new-dim)
       (tu/boolean-ids-and-timestamps dim-after-update)])))

;; The dimension should stay as long as the FK didn't change
(expect
  (repeat 2 {:id                      true
             :created_at              true
             :updated_at              true
             :type                    :external
             :name                    "fk-remove-dimension"
             :human_readable_field_id true
             :field_id                true})
  (tt/with-temp* [Field [{field-id-1 :id} {:name         "Field Test 1"
                                           :special_type :type/FK}]
                  Field [{field-id-2 :id} {:name "Field Test 2"}]]
    ;; create the Dimension
    (create-dimension-via-API! field-id-1
      {:name "fk-remove-dimension", :type "external" :human_readable_field_id field-id-2})
    ;; now change something unrelated: description
    (let [new-dim          (dimension-for-field field-id-1)
          _                ((user->client :crowberto) :put 200 (format "field/%d" field-id-1)
                            {:description "something diffrent"})
          dim-after-update (dimension-for-field field-id-1)]
      [(tu/boolean-ids-and-timestamps new-dim)
       (tu/boolean-ids-and-timestamps dim-after-update)])))

;; When removing the FK special type, the fk_target_field_id should be cleared as well
(expect
  [{:name               "Field Test 2"
    :display_name       "Field Test 2"
    :description        nil
    :visibility_type    :normal
    :special_type       :type/FK
    :fk_target_field_id true}
   {:name               "Field Test 2"
    :display_name       "Field Test 2"
    :description        nil
    :visibility_type    :normal
    :special_type       nil
    :fk_target_field_id false}]
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                  Field [{field-id-2 :id} {:name               "Field Test 2"
                                           :special_type       :type/FK
                                           :fk_target_field_id field-id-1}]]

    (let [before-change (simple-field-details (Field field-id-2))
          _             ((user->client :crowberto) :put 200 (format "field/%d" field-id-2) {:special_type nil})
          after-change  (simple-field-details (Field field-id-2))]
      [(tu/boolean-ids-and-timestamps before-change)
       (tu/boolean-ids-and-timestamps after-change)])))

;; Checking update of the fk_target_field_id
(expect
  [{:name               "Field Test 3"
    :display_name       "Field Test 3"
    :description        nil
    :visibility_type    :normal
    :special_type       :type/FK
    :fk_target_field_id true}
   {:name               "Field Test 3"
    :display_name       "Field Test 3"
    :description        nil
    :visibility_type    :normal
    :special_type       :type/FK
    :fk_target_field_id true}
   true]
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                  Field [{field-id-2 :id} {:name "Field Test 2"}]
                  Field [{field-id-3 :id} {:name               "Field Test 3"
                                           :special_type       :type/FK
                                           :fk_target_field_id field-id-1}]]

    (let [before-change (simple-field-details (Field field-id-3))
          _             ((user->client :crowberto) :put 200 (format "field/%d" field-id-3) {:fk_target_field_id field-id-2})
          after-change  (simple-field-details (Field field-id-3))]
      [(tu/boolean-ids-and-timestamps before-change)
       (tu/boolean-ids-and-timestamps after-change)
       (not= (:fk_target_field_id before-change)
             (:fk_target_field_id after-change))])))

;; Checking update of the fk_target_field_id along with an FK change
(expect
  [{:name               "Field Test 2"
    :display_name       "Field Test 2"
    :description        nil
    :visibility_type    :normal
    :special_type       nil
    :fk_target_field_id false}
   {:name               "Field Test 2"
    :display_name       "Field Test 2"
    :description        nil
    :visibility_type    :normal
    :special_type       :type/FK
    :fk_target_field_id true}]
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                  Field [{field-id-2 :id} {:name "Field Test 2"}]]

    (let [before-change (simple-field-details (Field field-id-2))
          _             ((user->client :crowberto) :put 200 (format "field/%d" field-id-2) {:special_type       :type/FK
                                                                                            :fk_target_field_id field-id-1})
          after-change  (simple-field-details (Field field-id-2))]
      [(tu/boolean-ids-and-timestamps before-change)
       (tu/boolean-ids-and-timestamps after-change)])))

;; Checking update of the fk_target_field_id and FK remain unchanged on updates of other fields
(expect
  [{:name               "Field Test 2"
    :display_name       "Field Test 2"
    :description        nil
    :visibility_type    :normal
    :special_type       :type/FK
    :fk_target_field_id true}
   {:name               "Field Test 2"
    :display_name       "Field Test 2"
    :description        "foo"
    :visibility_type    :normal
    :special_type       :type/FK
    :fk_target_field_id true}]
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                  Field [{field-id-2 :id} {:name               "Field Test 2"
                                           :special_type       :type/FK
                                           :fk_target_field_id field-id-1}]]

    (let [before-change (simple-field-details (Field field-id-2))
          _             ((user->client :crowberto) :put 200 (format "field/%d" field-id-2) {:description "foo"})
          after-change  (simple-field-details (Field field-id-2))]
      [(tu/boolean-ids-and-timestamps before-change)
       (tu/boolean-ids-and-timestamps after-change)])))

;; Changing a remapped field's type to something that can't be remapped will clear the dimension
(expect
  [{:id                      true
    :created_at              true
    :updated_at              true
    :type                    :internal
    :name                    "some dimension name"
    :human_readable_field_id false
    :field_id                true}
   []]
  (tt/with-temp Field [{field-id :id} {:name      "Field Test"
                                       :base_type "type/Integer"}]
    (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
    (let [new-dim (dimension-for-field field-id)]
      ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:special_type "type/Text"})
      [(tu/boolean-ids-and-timestamps new-dim)
       (dimension-for-field field-id)])))

;; Change from supported type to supported type will leave the dimension
(expect
  (repeat 2 {:id                      true
             :created_at              true
             :updated_at              true
             :type                    :internal
             :name                    "some dimension name"
             :human_readable_field_id false
             :field_id                true})
  (tt/with-temp Field [{field-id :id} {:name      "Field Test"
                                       :base_type "type/Integer"}]
    (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
    (let [new-dim (dimension-for-field field-id)]
      ((user->client :crowberto) :put 200 (format "field/%d" field-id) {:has_field_values "list"})
      [(tu/boolean-ids-and-timestamps new-dim)
       (tu/boolean-ids-and-timestamps (dimension-for-field field-id))])))

;; Can we update Field.settings, and fetch it?
(expect
  {:field_is_cool true}
  (tt/with-temp Field [field {:name "Crissy Field"}]
    ((user->client :crowberto) :put 200 (format "field/%d" (u/get-id field)) {:settings {:field_is_cool true}})
    (-> ((user->client :crowberto) :get 200 (format "field/%d" (u/get-id field)))
        :settings)))


;; make sure `search-values` works on with our various drivers
(qpt/expect-with-non-timeseries-dbs
  [[1 "Red Medicine"]]
  (qpt/format-rows-by [int str]
    (field-api/search-values (Field (data/id :venues :id))
                             (Field (data/id :venues :name))
                             "Red")))

(tqpt/expect-with-timeseries-dbs
  [["139" "Red Medicine"]
   ["375" "Red Medicine"]
   ["72"  "Red Medicine"]]
  (field-api/search-values (Field (data/id :checkins :id))
                           (Field (data/id :checkins :venue_name))
                           "Red"))

;; make sure it also works if you use the same Field twice
(qpt/expect-with-non-timeseries-dbs
  [["Red Medicine" "Red Medicine"]]
  (field-api/search-values (Field (data/id :venues :name))
                           (Field (data/id :venues :name))
                           "Red"))

;; disabled for now because for some reason Druid itself is failing to run this query with an “Invalid type marker
;; byte 0x3c” error message. The query itself is fine so I suspect this might be an issue with Druid itself. Either
;; way, I can find very little information about it online. Try reenabling this test next time we upgrade Druid.
#_(tqpt/expect-with-timeseries-dbs
  [["Red Medicine" "Red Medicine"]]
  (field-api/search-values (Field (data/id :checkins :venue_name))
                           (Field (data/id :checkins :venue_name))
                           "Red"))
