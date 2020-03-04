(ns metabase.api.field-test
  "Tests for `/api/field` endpoints."
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.api.field :as field-api]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [metabase.test.util.log :as tu.log]
            [metabase.timeseries-query-processor-test.util :as tqp.test]
            [ring.util.codec :as codec]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :plugins))

;; Helper Fns

(defn- db-details []
  (merge
   (select-keys (data/db) [:id :created_at :updated_at :timezone])
   {:engine                      "h2"
    :caveats                     nil
    :points_of_interest          nil
    :name                        "test-data"
    :is_sample                   false
    :is_full_sync                true
    :is_on_demand                false
    :description                 nil
    :features                    (mapv u/qualified-name (driver.u/features :h2))
    :cache_field_values_schedule "0 50 0 * * ? *"
    :metadata_sync_schedule      "0 50 * * * ? *"
    :options                     nil
    :auto_run_queries            true}))

;; ## GET /api/field/:id
(expect
  (merge
   (db/select-one [Field :created_at :updated_at :last_analyzed :fingerprint :fingerprint_version]
     :id (data/id :users :name))
   {:description         nil
    :table_id            (data/id :users)
    :table               (merge
                          (db/select-one [Table :created_at :updated_at :fields_hash] :id (data/id :users))
                          {:description             nil
                           :entity_type             "entity/UserTable"
                           :visibility_type         nil
                           :db                      (db-details)
                           :schema                  "PUBLIC"
                           :name                    "USERS"
                           :display_name            "Users"
                           :rows                    nil
                           :entity_name             nil
                           :active                  true
                           :id                      (data/id :users)
                           :db_id                   (data/id)
                           :caveats                 nil
                           :points_of_interest      nil
                           :show_in_getting_started false})
    :special_type        "type/Name"
    :name                "NAME"
    :display_name        "Name"
    :caveats             nil
    :points_of_interest  nil
    :active              true
    :id                  (data/id :users :name)
    :visibility_type     "normal"
    :position            0
    :preview_display     true
    :database_type       "VARCHAR"
    :base_type           "type/Text"
    :has_field_values    "list"
    :fk_target_field_id  nil
    :parent_id           nil
    :dimensions          []
    :name_field          nil
    :settings            nil})
  ((test-users/user->client :rasta) :get 200 (format "field/%d" (data/id :users :name))))



;;; ------------------------------------------- GET /api/field/:id/summary -------------------------------------------

(expect
  [["count" 75]                         ; why doesn't this come back as a dictionary ?
   ["distincts" 75]]
  ((test-users/user->client :rasta) :get 200 (format "field/%d/summary" (data/id :categories :name))))


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
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id) {:name            "something else"
                                                                                   :display_name    "yay"
                                                                                   :description     "foobar"
                                                                                   :special_type    :type/Name
                                                                                   :visibility_type :sensitive})
      (let [updated-val (simple-field-details (Field field-id))]
        ;; unset it
        ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id) {:description  nil
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
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id) {:special_type :type/Name})
      (array-map
       1 original-val
       2 (db/select-one-field :fk_target_field_id Field, :id field-id)))))


;; check that you *can* set it if it *is* the proper base type
(expect
  :type/UNIXTimestampSeconds
  (tt/with-temp* [Field [{field-id :id} {:base_type :type/Integer}]]
    ((test-users/user->client :crowberto) :put 200 (str "field/" field-id) {:special_type :type/UNIXTimestampSeconds})
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
    ((test-users/user->client :rasta) :get 200 (format "field/%d/values" (data/id :venues :price)))))

;; Should return nothing for a field whose `has_field_values` is not `list`
(expect
  {:values [], :field_id (data/id :venues :id)}
  ((test-users/user->client :rasta) :get 200 (format "field/%d/values" (data/id :venues :id))))

;; Sensisitive fields do not have field values and should return empty
(expect
  {:values [], :field_id (data/id :users :password)}
  ((test-users/user->client :rasta) :get 200 (format "field/%d/values" (data/id :users :password))))


;;; ------------------------------------------- POST /api/field/:id/values -------------------------------------------

(def ^:private list-field {:name "Field Test", :base_type :type/Integer, :has_field_values "list"})

(deftest update-field-values-no-human-readable-values-test
  (testing "Human readable values are optional"
    (tt/with-temp* [Field       [{field-id :id}       list-field]
                    FieldValues [{field-value-id :id} {:values (range 5 10), :field_id field-id}]]
      (testing "fetch initial values"
        (is (= {:values [[5] [6] [7] [8] [9]], :field_id true}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id))))))
      (testing "update values"
        (is (= {:status "success"}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :post 200 (format "field/%d/values" field-id)
                 {:values (map vector (range 1 5))})))))
      (testing "fetch updated values"
        (is (= {:values [[1] [2] [3] [4]], :field_id true}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id)))))))))

(deftest update-field-values-with-human-readable-values-test
  (testing "Existing field values can be updated (with their human readable values)"
    (tt/with-temp* [Field [{field-id :id} list-field]
                    FieldValues [{field-value-id :id} {:values (range 1 5), :field_id field-id}]]
      (testing "fetch initial values"
        (is (= {:values [[1] [2] [3] [4]], :field_id true}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id))))))
      (testing "update values"
        (is (= {:status "success"}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :post 200 (format "field/%d/values" field-id)
                 {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]]})))))
      (testing "fetch updated values"
        (is (= {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id)))))))))

(deftest create-field-values-when-not-present-test
  (testing "Field values should be created when not present"
    ;; this will print an error message because it will try to fetch the FieldValues, but the Field doesn't
    ;; exist; we can ignore that
    (tu.log/suppress-output
      (tt/with-temp Field [{field-id :id} list-field]
        (is (= {:values [], :field_id true}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id)))))

        (is (= {:status "success"}
               ((test-users/user->client :crowberto) :post 200 (format "field/%d/values" field-id)
                {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]]})))

        (is (= {:values [1 2 3 4], :human_readable_values ["$" "$$" "$$$" "$$$$"]}
               (into {} (db/select-one [FieldValues :values :human_readable_values] :field_id field-id))))

        (is (= {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true}
               (tu/boolean-ids-and-timestamps
                ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id)))))))))

;; Can unset values
(expect
  [{:values [[1] [2] [3] [4]], :field_id true}
   {:status "success"}
   {:values [], :field_id true}]
  (tt/with-temp* [Field       [{field-id :id}       list-field]
                  FieldValues [{field-value-id :id} {:values (range 1 5), :field_id field-id}]]
    (mapv tu/boolean-ids-and-timestamps
          [((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id))
           ((test-users/user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values [], :field_id true})
           ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Can unset just human readable values
(expect
  [{:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true}
   {:status "success"}
   {:values [[1] [2] [3] [4]], :field_id true}]
  (tt/with-temp* [Field       [{field-id :id}       list-field]
                  FieldValues [{field-value-id :id} {:values (range 1 5), :field_id field-id
                                                     :human_readable_values ["$" "$$" "$$$" "$$$$"]}]]
    (mapv tu/boolean-ids-and-timestamps
          [((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id))
           ((test-users/user->client :crowberto) :post 200 (format "field/%d/values" field-id)
            {:values [[1] [2] [3] [4]]})
           ((test-users/user->client :crowberto) :get 200 (format "field/%d/values" field-id))])))

;; Should throw when human readable values are present but not for every value
(expect
  "If remapped values are specified, they must be specified for all field values"
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test", :base_type :type/Integer, :has_field_values "list"}]]
    ((test-users/user->client :crowberto) :post 400 (format "field/%d/values" field-id)
     {:values [[1 "$"] [2 "$$"] [3] [4]]})))

;; ## PUT /api/field/:id/dimension

(defn- dimension-for-field [field-id]
  (-> (Field :id field-id)
      (hydrate :dimensions)
      :dimensions))

(defn- create-dimension-via-API!
  {:style/indent 1}
  [field-id map-to-post & {:keys [expected-status-code]
                           :or   {expected-status-code 200}}]
  ((test-users/user->client :crowberto) :post expected-status-code (format "field/%d/dimension" field-id) map-to-post))

(deftest create-update-dimension-test
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test"}]]
    (testing "no dimension should exist for a new Field"
      (is (= []
             (dimension-for-field field-id))))
    (testing "Create a dimension"
      (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
      (let [new-dim (dimension-for-field field-id)]
        (is (= {:id                      true
                :created_at              true
                :updated_at              true
                :type                    :internal
                :name                    "some dimension name"
                :human_readable_field_id false
                :field_id                true}
               (tu/boolean-ids-and-timestamps new-dim)))
        (testing "Update a Dimension"
          (create-dimension-via-API! field-id {:name "different dimension name", :type "internal"})
          (let [updated-dim (dimension-for-field field-id)]
            (is (= {:id                      true
                    :created_at              true
                    :updated_at              true
                    :type                    :internal
                    :name                    "different dimension name"
                    :human_readable_field_id false
                    :field_id                true}
                   (tu/boolean-ids-and-timestamps updated-dim)))
            (testing "attempting to create a dimension when one already exists should update the existing"
              (is (= (u/get-id new-dim)
                     (u/get-id updated-dim))))))))))

(deftest virtual-field-values-test
  (testing "Check that trying to get values for a 'virtual' field just returns a blank values map"
    (is (= {:values []}
           ((test-users/user->client :rasta) :get 200 (format "field/%s/values" (codec/url-encode "field-literal,created_at,type/Datetime")))))))

(deftest create-dimension-with-human-readable-field-id-test
  (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                  Field [{field-id-2 :id} {:name "Field Test 2"}]]
    (testing "before creation"
      (is (= []
             (dimension-for-field field-id-1))))
    (create-dimension-via-API! field-id-1
      {:name "some dimension name", :type "external" :human_readable_field_id field-id-2})
    (testing "after creation"
      (is (= {:id                      true
              :created_at              true
              :updated_at              true
              :type                    :external
              :name                    "some dimension name"
              :human_readable_field_id true
              :field_id                true}
             (tu/boolean-ids-and-timestamps (dimension-for-field field-id-1)))))))

;; External remappings require a human readable field id
(expect
  "Foreign key based remappings require a human readable field id"
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test 1"}]]
    (create-dimension-via-API! field-id
      {:name "some dimension name", :type "external"}
      :expected-status-code 400)))

;; Non-admin users can't update dimension, :field_id trues
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Field [{field-id :id} {:name "Field Test 1"}]]
    ((test-users/user->client :rasta) :post 403 (format "field/%d/dimension" field-id)
     {:name "some dimension name", :type "external"})))

(deftest delete-dimension-test
  (testing "Ensure we can delete a dimension"
    (tt/with-temp Field [{field-id :id} {:name "Field Test"}]
      (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
      (testing "before deletion"
        (is (= {:id                      true
                :created_at              true
                :updated_at              true
                :type                    :internal
                :name                    "some dimension name"
                :human_readable_field_id false
                :field_id                true}
               (mt/boolean-ids-and-timestamps (dimension-for-field field-id)))))
      ((test-users/user->client :crowberto) :delete 204 (format "field/%d/dimension" field-id))
      (testing "after deletion"
        (is (= []
               (dimension-for-field field-id)))))))

(deftest delete-dimension-permissions-test
  (testing "Non-admin users can't delete a dimension"
    (tt/with-temp Field [{field-id :id} {:name "Field Test 1"}]
      (is (= "You don't have permissions to do that."
             ((test-users/user->client :rasta) :delete 403 (format "field/%d/dimension" field-id)))))))

(deftest clear-exetrnal-dimension-when-fk-special-type-is-removed-test
  (testing "When an FK field gets it's special_type removed, we should clear the external dimension"
    (tt/with-temp* [Field [{field-id-1 :id} {:name         "Field Test 1"
                                             :special_type :type/FK}]
                    Field [{field-id-2 :id} {:name "Field Test 2"}]]
      (create-dimension-via-API! field-id-1
        {:name "fk-remove-dimension", :type "external" :human_readable_field_id field-id-2})
      (testing "before update"
        (is (= {:id                      true
                :created_at              true
                :updated_at              true
                :type                    :external
                :name                    "fk-remove-dimension"
                :human_readable_field_id true
                :field_id                true}
               (tu/boolean-ids-and-timestamps (dimension-for-field field-id-1)))))
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id-1) {:special_type nil})
      (testing "after update"
        (is (= []
               (tu/boolean-ids-and-timestamps (dimension-for-field field-id-1))))))))

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
         _                ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id-1)
                           {:description "something diffrent"})
         dim-after-update (dimension-for-field field-id-1)]
     [(tu/boolean-ids-and-timestamps new-dim)
      (tu/boolean-ids-and-timestamps dim-after-update)])))

(deftest remove-fk-special-type-test
  (testing "When removing the FK special type, the fk_target_field_id should be cleared as well"
    (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                    Field [{field-id-2 :id} {:name               "Field Test 2"
                                             :special_type       :type/FK
                                             :fk_target_field_id field-id-1}]]
      (testing "before change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :special_type       :type/FK
                :fk_target_field_id true}
               (tu/boolean-ids-and-timestamps (simple-field-details (Field field-id-2))))))
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id-2) {:special_type nil})
      (testing "after change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :special_type       nil
                :fk_target_field_id false}
               (tu/boolean-ids-and-timestamps (simple-field-details (Field field-id-2)))))))))

(deftest update-fk-target-field-id-test
  (testing "Checking update of the fk_target_field_id"
    (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                    Field [{field-id-2 :id} {:name "Field Test 2"}]
                    Field [{field-id-3 :id} {:name               "Field Test 3"
                                             :special_type       :type/FK
                                             :fk_target_field_id field-id-1}]]
      (let [before-change (simple-field-details (Field field-id-3))]
        (testing "before change"
          (is (= {:name               "Field Test 3"
                  :display_name       "Field Test 3"
                  :description        nil
                  :visibility_type    :normal
                  :special_type       :type/FK
                  :fk_target_field_id true}
                 (tu/boolean-ids-and-timestamps before-change))))
        ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id-3) {:fk_target_field_id field-id-2})
        (testing "after change"
          (let [after-change (simple-field-details (Field field-id-3))]
            (is (= {:name               "Field Test 3"
                    :display_name       "Field Test 3"
                    :description        nil
                    :visibility_type    :normal
                    :special_type       :type/FK
                    :fk_target_field_id true}
                   (tu/boolean-ids-and-timestamps after-change)))
            (is (not= (:fk_target_field_id before-change)
                      (:fk_target_field_id after-change)))))))))

(deftest update-fk-target-field-id-with-fk-test
  (testing "Checking update of the fk_target_field_id along with an FK change"
    (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                    Field [{field-id-2 :id} {:name "Field Test 2"}]]

      (testing "before change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :special_type       nil
                :fk_target_field_id false}
               (tu/boolean-ids-and-timestamps (simple-field-details (Field field-id-2))))))
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id-2) {:special_type       :type/FK
                                                                                     :fk_target_field_id field-id-1})
      (testing "after change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :special_type       :type/FK
                :fk_target_field_id true}
               (tu/boolean-ids-and-timestamps (simple-field-details (Field field-id-2)))))))))

(deftest fk-target-field-id-shouldnt-change-test
  (testing "fk_target_field_id and FK should remain unchanged on updates of other fields"
    (tt/with-temp* [Field [{field-id-1 :id} {:name "Field Test 1"}]
                    Field [{field-id-2 :id} {:name               "Field Test 2"
                                             :special_type       :type/FK
                                             :fk_target_field_id field-id-1}]]
      (testing "before change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :special_type       :type/FK
                :fk_target_field_id true}
               (mt/boolean-ids-and-timestamps (simple-field-details (Field field-id-2))))))
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id-2) {:description "foo"})
      (testing "after change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        "foo"
                :visibility_type    :normal
                :special_type       :type/FK
                :fk_target_field_id true}
               (mt/boolean-ids-and-timestamps (simple-field-details (Field field-id-2)))))))))

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
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id) {:special_type "type/Text"})
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
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" field-id) {:has_field_values "list"})
      [(tu/boolean-ids-and-timestamps new-dim)
       (tu/boolean-ids-and-timestamps (dimension-for-field field-id))])))

(deftest update-field-settings-test
  (testing "Can we update Field.settings, and fetch it?"
    (tt/with-temp Field [field {:name "Crissy Field"}]
      ((test-users/user->client :crowberto) :put 200 (format "field/%d" (u/get-id field)) {:settings {:field_is_cool true}})
      (is (= {:field_is_cool true}
             (-> ((test-users/user->client :crowberto) :get 200 (format "field/%d" (u/get-id field)))
                 :settings))))))

(deftest search-values-test
  (testing "make sure `search-values` works on with our various drivers"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [[1 "Red Medicine"]]
             (mt/format-rows-by [int str]
               (field-api/search-values (Field (data/id :venues :id))
                                        (Field (data/id :venues :name))
                                        "Red")))))
    (tqp.test/test-timeseries-drivers
      (is (= [["139" "Red Medicine"]
              ["375" "Red Medicine"]
              ["72"  "Red Medicine"]]
             (field-api/search-values (Field (data/id :checkins :id))
                                      (Field (data/id :checkins :venue_name))
                                      "Red"))))))

(deftest search-values-with-field-same-as-search-field-test
  (testing "make sure it also works if you use the same Field twice"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [["Red Medicine" "Red Medicine"]]
             (field-api/search-values (Field (data/id :venues :name))
                                      (Field (data/id :venues :name))
                                      "Red"))))
    (tqp.test/test-timeseries-drivers
      (is (= [["Red Medicine" "Red Medicine"]]
             (field-api/search-values (Field (data/id :checkins :venue_name))
                                      (Field (data/id :checkins :venue_name))
                                      "Red"))))))
