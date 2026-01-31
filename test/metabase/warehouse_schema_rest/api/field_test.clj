(ns ^:mb/driver-tests metabase.warehouse-schema-rest.api.field-test
  "Tests for `/api/field` endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.util :as driver.u]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins :db))

;; Helper Fns

(defn- db-details []
  (merge
   {:engine   "h2"
    :name     "test-data (h2)"
    :features (mapv u/qualified-name (driver.u/features :h2 (mt/db)))
    :settings {}}
   (select-keys (mt/db) [:id :initial_sync_status :cache_field_values_schedule :metadata_sync_schedule])))

(deftest ^:parallel get-field-test
  (testing "GET /api/field/:id"
    (is (=? (merge
             (t2/select-one [:model/Field :created_at :updated_at :last_analyzed :fingerprint :fingerprint_version
                             :database_position :database_required :database_is_auto_increment]
                            :id (mt/id :users :name))
             {:table_id         (mt/id :users)
              :table            (merge
                                 (t2/select-one [:model/Table :created_at :updated_at
                                                 :initial_sync_status :view_count]
                                                :id (mt/id :users))
                                 {:description             nil
                                  :entity_type             "entity/UserTable"
                                  :visibility_type         nil
                                  :db                      (db-details)
                                  :schema                  "PUBLIC"
                                  :name                    "USERS"
                                  :display_name            "Users"
                                  :active                  true
                                  :id                      (mt/id :users)
                                  :db_id                   (mt/id)
                                  :caveats                 nil
                                  :points_of_interest      nil
                                  :show_in_getting_started false})
              :semantic_type    "type/Name"
              :name             "NAME"
              :display_name     "Name"
              :position         1
              :target           nil
              :id               (mt/id :users :name)
              :visibility_type  "normal"
              :database_type    "CHARACTER VARYING"
              :base_type        "type/Text"
              :effective_type   "type/Text"
              :has_field_values "list"
              :database_required false
              ;; Index sync is turned off across the application as it is not used ATM.
              #_#_:database_indexed  false
              :database_is_auto_increment false
              :dimensions       []
              :name_field       nil})
            (-> (mt/user-http-request :rasta :get 200 (format "field/%d" (mt/id :users :name)))
                (update-in [:table :db] dissoc :updated_at :created_at :timezone :dbms_version))))))

(deftest ^:parallel get-field-test-2
  (testing "GET /api/field/:id"
    (testing "target should be hydrated"
      (is (=? {:target {:id (mt/id :categories :id)}}
              (mt/user-http-request :rasta :get 200 (format "field/%d" (mt/id :venues :category_id))))))))

(deftest ^:parallel get-field-summary-test
  (testing "GET /api/field/:id/summary"
    ;; TODO -- why doesn't this come back as a dictionary ?
    (is (= [["count" 75]
            ["distincts" 75]]
           (mt/user-http-request :crowberto :get 200 (format "field/%d/summary" (mt/id :categories :name)))))))

(defn simple-field-details [field]
  (select-keys field [:name
                      :display_name
                      :description
                      :visibility_type
                      :semantic_type
                      :json_unfolding
                      :fk_target_field_id
                      :nfc_path]))

(mt/defdataset integer-coerceable
  [["t" [{:field-name "f"
          :base-type  :type/Integer}]
    [[100000] [200000] [300000]]]])

(deftest update-field-test
  (testing "PUT /api/field/:id"
    (testing "test that we can do basic field update work, including unsetting some fields such as semantic-type"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test"}]
        (let [original-val (simple-field-details (t2/select-one :model/Field :id field-id))]
          (testing "orignal value"
            (is (= {:name               "Field Test"
                    :display_name       "Field Test"
                    :description        nil
                    :semantic_type      nil
                    :visibility_type    :normal
                    :json_unfolding     false
                    :fk_target_field_id nil
                    :nfc_path           nil}
                   original-val)))
          (let [;; set it
                response (mt/user-http-request :crowberto :put 200
                                               (format "field/%d" field-id)
                                               {:name            "something else"
                                                :display_name    "yay"
                                                :description     "foobar"
                                                :semantic_type   :type/Name
                                                :json_unfolding  true
                                                :visibility_type :sensitive
                                                :nfc_path        ["bob" "dobbs"]})
                updated-val (simple-field-details (t2/select-one :model/Field :id field-id))]
            (testing "response body should be the updated field"
              (is (= {:name               "Field Test"
                      :display_name       "yay"
                      :description        "foobar"
                      :semantic_type      "type/Name"
                      :visibility_type    "sensitive"
                      :json_unfolding     true
                      :fk_target_field_id nil
                      :nfc_path           ["bob" "dobbs"]}
                     (simple-field-details response))))
            (testing "updated value"
              (is (= {:name               "Field Test"
                      :display_name       "yay"
                      :description        "foobar"
                      :semantic_type      :type/Name
                      :visibility_type    :sensitive
                      :json_unfolding     true
                      :fk_target_field_id nil
                      :nfc_path           ["bob" "dobbs"]}
                     updated-val)))
            ;; unset it
            (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id) {:description   nil
                                                                                    :semantic_type nil
                                                                                    :nfc_path      nil})
            (testing "response"
              (is (= {:name               "Field Test"
                      :display_name       "yay"
                      :description        nil
                      :semantic_type      nil
                      :visibility_type    :sensitive
                      :json_unfolding     true
                      :fk_target_field_id nil
                      :nfc_path           nil}
                     (simple-field-details (t2/select-one :model/Field :id field-id)))))))))))

(deftest update-field-test-2
  (testing "PUT /api/field/:id"
    (testing "updating coercion strategies"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test"}]
        (testing "When valid, updates coercion strategy and effective type"
          (is (= ["type/DateTime" "Coercion/YYYYMMDDHHMMSSString->Temporal"]
                 ((juxt :effective_type :coercion_strategy)
                  (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id)
                                        {:coercion_strategy :Coercion/YYYYMMDDHHMMSSString->Temporal})))))
        (testing "Sending a nil coercion_strategy restores the effective type"
          (is (= ["type/Text" nil]
                 ((juxt :effective_type :coercion_strategy)
                  (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id)
                                        {:coercion_strategy nil})))))))))

(deftest update-field-test-2b
  (testing "PUT /api/field/:id"
    (testing "updating coercion strategies"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test"}]
        (testing "When not a valid strategy does not change the coercion or effective type"
          (is (=? {:message "Incompatible coercion strategy."
                   :base-type "type/Text"
                   :coercion-strategy "Coercion/UNIXMicroSeconds->DateTime"
                   :effective-type "type/Instant"}
                  (mt/user-http-request :crowberto :put 400 (format "field/%d" field-id)
                                        ;; unix is an integer->Temporal conversion
                                        {:coercion_strategy :Coercion/UNIXMicroSeconds->DateTime}))))))))

(deftest update-field-test-2c
  (testing "PUT /api/field/:id"
    (testing "updating coercion strategies"
      (testing "Refingerprints field when updated"
        (with-redefs [quick-task/submit-task! (fn [task] (task))]
          (mt/dataset integer-coerceable
            (sync/sync-database! (t2/select-one :model/Database :id (mt/id)))
            (let [field-id      (mt/id :t :f)
                  set-strategy! (fn [strategy]
                                  (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id)
                                                        {:coercion_strategy strategy}))]
              ;; ensure that there is no coercion strategy from previous tests
              (set-strategy! nil)
              (let [field (t2/select-one :model/Field :id field-id)]
                (is (= :type/Integer (:effective_type field)))
                (is (contains? (get-in field [:fingerprint :type]) :type/Number)))
              (set-strategy! :Coercion/UNIXSeconds->DateTime)
              (let [field (t2/select-one :model/Field :id field-id)]
                (is (= :type/Instant (:effective_type field)))
                (is (contains? (get-in field [:fingerprint :type]) :type/DateTime))))))))))

(deftest update-field-test-3
  (testing "PUT /api/field/:id"
    (testing "A field can only be updated by a superuser"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test"}]
        (mt/user-http-request :rasta :put 403 (format "field/%d" field-id) {:name "Field Test 2"})))))

(deftest ^:parallel update-field-hydrated-target-test
  (testing "PUT /api/field/:id"
    (testing "target should be hydrated"
      (mt/with-temp [:model/Field fk-field-1 {}
                     :model/Field fk-field-2 {}
                     :model/Field field {:semantic_type :type/FK :fk_target_field_id (:id fk-field-1)}]
        (is (= (:id fk-field-2)
               (:id (:target (mt/user-http-request :crowberto :put 200 (format "field/%d" (:id field)) (assoc field :fk_target_field_id (:id fk-field-2)))))))))))

(deftest remove-fk-semantic-type-test
  (testing "PUT /api/field/:id"
    (testing "when we set the semantic-type from `:type/FK` to something else, make sure `:fk_target_field_id` is set to nil"
      (mt/with-temp [:model/Field {fk-field-id :id} {}
                     :model/Field {field-id :id} {:semantic_type :type/FK :fk_target_field_id fk-field-id}]
        (let [original-val (boolean (t2/select-one-fn :fk_target_field_id :model/Field, :id field-id))]
          (testing "before API call"
            (is (true?
                 original-val)))
          ;; unset the :type/FK semantic-type
          (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id) {:semantic_type :type/Name})
          (testing "after API call"
            (is (= nil
                   (t2/select-one-fn :fk_target_field_id :model/Field, :id field-id)))))))))

(deftest update-fk-target-field-id-test
  (testing "PUT /api/field/:id"
    (testing "check that you *can* set `:fk_target_field_id` if it *is* the proper base type"
      (mt/with-temp [:model/Field {field-id :id} {:base_type :type/Integer}]
        (mt/user-http-request :crowberto :put 200 (str "field/" field-id)
                              {:semantic_type :type/Quantity})
        (is (= :type/Quantity
               (t2/select-one-fn :semantic_type :model/Field, :id field-id)))))))

(defn- field->field-values
  "Fetch the `FieldValues` object that corresponds to a given `Field`."
  [table-kw field-kw]
  (t2/select-one :model/FieldValues :field_id (mt/id table-kw field-kw)))

(defn- field-values-id [table-key field-key]
  (:id (field->field-values table-key field-key)))

(deftest field-values-test
  (testing "GET /api/field/:id/values"
    (testing "Should return something useful for a field whose `has_field_values` is `list`"
      (mt/with-temp-copy-of-db
        ;; clear out existing human_readable_values in case they're set
        (when-let [id (field-values-id :venues :price)]
          (t2/update! :model/FieldValues id {:human_readable_values nil}))
        (t2/update! :model/Field (mt/id :venues :price) {:has_field_values "list"})
        ;; now update the values via the API
        (is (= {:values [[1] [2] [3] [4]], :field_id (mt/id :venues :price), :has_more_values false}
               (mt/user-http-request :crowberto :get 200 (format "field/%d/values" (mt/id :venues :price)))))))

    (testing "Should return nothing for a field whose `has_field_values` is not `list`"
      (is (= {:values [], :field_id (mt/id :venues :id), :has_more_values false}
             (mt/user-http-request :crowberto :get 200 (format "field/%d/values" (mt/id :venues :id))))))

    (testing "Sensitive fields do not have field values and should return empty"
      (is (= {:values [], :field_id (mt/id :users :password), :has_more_values false}
             (mt/user-http-request :crowberto :get 200 (format "field/%d/values" (mt/id :users :password))))))

    (testing "External remapping"
      (mt/with-column-remappings [venues.category_id categories.name]
        (mt/with-temp-vals-in-db :model/Field (mt/id :venues :category_id) {:has_field_values "list"}
          (is (partial= {:field_id (mt/id :venues :category_id)
                         :values   [[1 "African"]
                                    [2 "American"]
                                    [3 "Artisan"]]}
                        (mt/user-http-request :crowberto :get 200 (format "field/%d/values" (mt/id :venues :category_id))))))))))

(def ^:private list-field {:name "Field Test", :base_type :type/Integer, :has_field_values "list"})

(deftest update-field-values-no-human-readable-values-test
  (testing "POST /api/field/:id/values"
    (testing "Human readable values are optional"
      (mt/with-temp [:model/Field       {field-id :id} list-field
                     :model/FieldValues _              {:values (range 5 10) :field_id field-id}]
        (testing "fetch initial values"
          (is (= {:values [[5] [6] [7] [8] [9]], :field_id true, :has_more_values false}
                 (mt/boolean-ids-and-timestamps
                  (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id))))))
        (testing "update values"
          (is (= {:status "success"}
                 (mt/boolean-ids-and-timestamps
                  (mt/user-http-request :crowberto :post 200 (format "field/%d/values" field-id)
                                        {:values (map vector (range 1 5))})))))
        (testing "fetch updated values"
          (is (= {:values [[1] [2] [3] [4]], :field_id true, :has_more_values false}
                 (mt/boolean-ids-and-timestamps
                  (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id))))))))))

(deftest update-field-values-with-human-readable-values-test
  (testing "POST /api/field/:id/values"
    (testing "Existing field values can be updated (with their human readable values)"
      (mt/with-temp [:model/Field {field-id :id} list-field
                     :model/FieldValues _ {:values (conj (range 1 5) nil) :field_id field-id}]
        (testing "fetch initial values"
          (is (= {:values [[nil] [1] [2] [3] [4]], :field_id true, :has_more_values false}
                 (mt/boolean-ids-and-timestamps
                  (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id))))))
        (testing "update values"
          (is (= {:status "success"}
                 (mt/boolean-ids-and-timestamps
                  (mt/user-http-request :crowberto :post 200 (format "field/%d/values" field-id)
                                        {:values [[nil "no $"] [1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :has_more_values false})))))
        (testing "fetch updated values"
          (is (= {:values [[nil "no $"] [1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true, :has_more_values false}
                 (mt/boolean-ids-and-timestamps
                  (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id))))))))))

(deftest create-field-values-when-not-present-test
  (testing "POST /api/field/:id/values"
    (testing "Field values should be created when not present"
      ;; this will print an error message because it will try to fetch the FieldValues, but the Field doesn't
      ;; exist; we can ignore that
      (mt/with-temp [:model/Field {field-id :id} list-field]
        (is (= {:values [], :field_id true, :has_more_values false}
               (mt/boolean-ids-and-timestamps
                (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id)))))

        (is (= {:status "success"}
               (mt/user-http-request :crowberto :post 200 (format "field/%d/values" field-id)
                                     {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]]})))

        (is (= {:values [1 2 3 4], :human_readable_values ["$" "$$" "$$$" "$$$$"], :has_more_values false}
               (into {} (t2/select-one [:model/FieldValues :values :human_readable_values, :has_more_values] :field_id field-id))))

        (is (= {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true, :has_more_values false}
               (mt/boolean-ids-and-timestamps
                (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id)))))))))

(deftest remove-field-values-test
  (testing "POST /api/field/:id/values"
    (mt/with-temp [:model/Field {field-id :id} list-field]
      (testing "should be able to unset FieldValues"
        (mt/with-temp [:model/FieldValues _ {:values (range 1 5), :field_id field-id}]
          (testing "before updating values"
            (is (= {:values [[1] [2] [3] [4]], :field_id true, :has_more_values false}
                   (mt/boolean-ids-and-timestamps (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id))))))
          (testing "API response"
            (is (= {:status "success"}
                   (mt/user-http-request :crowberto :post 200 (format "field/%d/values" field-id) {:values [], :field_id true}))))
          (testing "after updating values"
            (is (= {:values [], :field_id true, :has_more_values false}
                   (mt/boolean-ids-and-timestamps (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id)))))) [])))))

(deftest remove-field-values-test-2
  (testing "POST /api/field/:id/values"
    (mt/with-temp [:model/Field {field-id :id} list-field]
      (testing "should be able to unset just the human-readable values"
        (mt/with-temp [:model/FieldValues _ {:values                (range 1 5)
                                             :field_id              field-id
                                             :human_readable_values ["$" "$$" "$$$" "$$$$"]}]
          (testing "before updating values"
            (is (= {:values [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]], :field_id true, :has_more_values false}
                   (mt/boolean-ids-and-timestamps (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id))))))
          (testing "API response"
            (is (= {:status "success"}
                   (mt/user-http-request :crowberto :post 200 (format "field/%d/values" field-id) {:values [[1] [2] [3] [4]]}))))
          (testing "after updating values"
            (is (= {:values [[1] [2] [3] [4]], :field_id true, :has_more_values false}
                   (mt/boolean-ids-and-timestamps (mt/user-http-request :crowberto :get 200 (format "field/%d/values" field-id)))))))))))

(deftest remove-field-values-test-3
  (testing "POST /api/field/:id/values"
    (testing "attempting to updated values should throw when human readable values are present but not for every value"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test", :base_type :type/Integer, :has_field_values "list"}]
        (is (= "If remapped values are specified, they must be specified for all field values"
               (mt/user-http-request :crowberto :post 400 (format "field/%d/values" field-id)
                                     {:values [[1 "$"] [2 "$$"] [3] [4]]})))))))

(defn- dimension-for-field [field-id]
  (-> (t2/select-one :model/Field :id field-id)
      (t2/hydrate :dimensions)
      :dimensions
      first))

(defn- create-dimension-via-API!
  [field-id map-to-post & {:keys [expected-status-code]
                           :or   {expected-status-code 200}}]
  (mt/user-http-request :crowberto :post expected-status-code (format "field/%d/dimension" field-id) map-to-post))

(deftest update-display-name-dimension-test
  (testing "Updating a field's display_name should update the dimension's name"
    (mt/with-temp
      [:model/Database  db    {:name "field-db" :engine :h2}
       :model/Table     table1 {:schema "PUBLIC" :name "widget" :db_id (:id db)}
       :model/Table     table2 {:schema "PUBLIC" :name "orders" :db_id (:id db)}
       :model/Field     field {:name          "WIDGET_ID"
                               :display_name  "Widget ID"
                               :table_id      (:id table2)
                               :semantic_type :type/FK}
       :model/Field     human-readable-field {:name "Name" :table_id (:id table1)}
       :model/Dimension _dim  {:field_id                (:id field)
                               :name                    (:display_name field)
                               :type                    :external
                               :human_readable_field_id (:id human-readable-field)}]
      (testing "before update"
        (is (= "Widget ID"
               (:name (dimension-for-field (:id field))))))
      (mt/user-http-request :crowberto :put 200 (format "field/%d" (:id field)) (assoc field :display_name "SKU"))
      (testing "after update"
        (is (= "SKU"
               (:name (dimension-for-field (:id field)))))))))

(deftest create-update-dimension-test
  (mt/with-temp [:model/Field {field-id :id} {:name "Field Test"}]
    (testing "no dimension should exist for a new Field"
      (is (= nil
             (dimension-for-field field-id))))
    (testing "Create a dimension"
      (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
      (let [new-dim (dimension-for-field field-id)]
        (is (= {:id                      true
                :entity_id               true
                :created_at              true
                :updated_at              true
                :type                    :internal
                :name                    "some dimension name"
                :human_readable_field_id false
                :field_id                true}
               (mt/boolean-ids-and-timestamps new-dim)))
        (testing "Update a Dimension"
          (create-dimension-via-API! field-id {:name "different dimension name", :type "internal"})
          (let [updated-dim (dimension-for-field field-id)]
            (is (= {:id                      true
                    :entity_id               true
                    :created_at              true
                    :updated_at              true
                    :type                    :internal
                    :name                    "different dimension name"
                    :human_readable_field_id false
                    :field_id                true}
                   (mt/boolean-ids-and-timestamps updated-dim)))
            (testing "attempting to create a dimension when one already exists should update the existing"
              (is (= (u/the-id new-dim)
                     (u/the-id updated-dim))))))))))

(deftest create-dimension-with-human-readable-field-id-test
  (testing "POST /api/field/:id/dimension"
    (mt/with-temp [:model/Field {field-id-1 :id} {:name "Field Test 1"}
                   :model/Field {field-id-2 :id} {:name "Field Test 2"}]
      (testing "before creation"
        (is (nil? (dimension-for-field field-id-1))))
      (is (=? {:id       pos-int?
               :field_id pos-int?}
              (create-dimension-via-API! field-id-1
                                         {:name "some dimension name", :type "external" :human_readable_field_id field-id-2})))
      (testing "after creation"
        (is (=? {:id                      pos-int?
                 :entity_id               string?
                 :created_at              java.time.temporal.Temporal
                 :updated_at              java.time.temporal.Temporal
                 :type                    :external
                 :name                    "some dimension name"
                 :human_readable_field_id pos-int?
                 :field_id                pos-int?}
                (dimension-for-field field-id-1)))))))

(deftest create-dimension-validation-test
  (testing "POST /api/field/:id/dimension"
    (testing "External remappings require a human readable field id"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test 1"}]
        (is (= "Foreign key based remappings require a human readable field id"
               (create-dimension-via-API! field-id
                                          {:name "some dimension name", :type "external"}
                                          :expected-status-code 400)))))))

(deftest ^:parallel create-dimension-validation-test-2
  (testing "POST /api/field/:id/dimension"
    (testing "Non-admin users can't update dimension"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test 1"}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (format "field/%d/dimension" field-id)
                                     {:name "some dimension name", :type "external"})))))))

(deftest delete-dimension-test
  (testing "DELETE /api/field/:id/dimension"
    (testing "Ensure we can delete a dimension"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test"}]
        (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
        (testing "before deletion"
          (is (= {:id                      true
                  :entity_id               true
                  :created_at              true
                  :updated_at              true
                  :type                    :internal
                  :name                    "some dimension name"
                  :human_readable_field_id false
                  :field_id                true}
                 (mt/boolean-ids-and-timestamps (dimension-for-field field-id)))))
        (mt/user-http-request :crowberto :delete 204 (format "field/%d/dimension" field-id))
        (testing "after deletion"
          (is (= nil
                 (dimension-for-field field-id))))))))

(deftest ^:parallel delete-dimension-permissions-test
  (testing "DELETE /api/field/:id/dimension"
    (testing "Non-admin users can't delete a dimension"
      (mt/with-temp [:model/Field {field-id :id} {:name "Field Test 1"}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (format "field/%d/dimension" field-id))))))))

(deftest clear-external-dimension-when-fk-semantic-type-is-removed-test
  (testing "PUT /api/field/:id"
    (testing "When an FK field gets it's semantic_type removed, we should clear the external dimension"
      (mt/with-temp [:model/Field {field-id-1 :id} {:name          "Field Test 1"
                                                    :semantic_type :type/FK}
                     :model/Field {field-id-2 :id} {:name "Field Test 2"}]
        (create-dimension-via-API! field-id-1
                                   {:name "fk-remove-dimension", :type "external" :human_readable_field_id field-id-2})
        (testing "before update"
          (is (= {:id                      true
                  :entity_id               true
                  :created_at              true
                  :updated_at              true
                  :type                    :external
                  :name                    "fk-remove-dimension"
                  :human_readable_field_id true
                  :field_id                true}
                 (mt/boolean-ids-and-timestamps (dimension-for-field field-id-1)))))
        (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id-1) {:semantic_type nil})
        (testing "after update"
          (is (= nil
                 (mt/boolean-ids-and-timestamps (dimension-for-field field-id-1)))))))))

(deftest update-field-should-not-affect-dimensions-test
  (testing "PUT /api/field/:id"
    (testing "Updating unrelated properties should not affect a Field's `:dimensions`"
      (mt/with-temp [:model/Field {field-id-1 :id} {:name          "Field Test 1"
                                                    :semantic_type :type/FK}
                     :model/Field {field-id-2 :id} {:name "Field Test 2"}]
        ;; create the Dimension
        (create-dimension-via-API! field-id-1
                                   {:name "fk-remove-dimension", :type "external" :human_readable_field_id field-id-2})
        (let [expected {:id                      true
                        :entity_id               true
                        :created_at              true
                        :updated_at              true
                        :type                    :external
                        :name                    "fk-remove-dimension"
                        :human_readable_field_id true
                        :field_id                true}]
          (testing "before API request"
            (is (= expected
                   (mt/boolean-ids-and-timestamps (dimension-for-field field-id-1)))))
          ;; now change something unrelated: description
          (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id-1)
                                {:description "something diffrent"})
          (testing "after API request"
            (is (= expected
                   (mt/boolean-ids-and-timestamps (dimension-for-field field-id-1))))))))))

(deftest remove-fk-semantic-type-test-2
  (testing "When removing the FK semantic type, the fk_target_field_id should be cleared as well"
    (mt/with-temp [:model/Field {field-id-1 :id} {:name "Field Test 1"}
                   :model/Field {field-id-2 :id} {:name               "Field Test 2"
                                                  :semantic_type      :type/FK
                                                  :fk_target_field_id field-id-1}]
      (testing "before change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :semantic_type      :type/FK
                :fk_target_field_id true
                :json_unfolding     false
                :nfc_path           nil}
               (mt/boolean-ids-and-timestamps (simple-field-details (t2/select-one :model/Field :id field-id-2))))))
      (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id-2) {:semantic_type nil})
      (testing "after change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :semantic_type      nil
                :fk_target_field_id false
                :json_unfolding     false
                :nfc_path           nil}
               (mt/boolean-ids-and-timestamps (simple-field-details (t2/select-one :model/Field :id field-id-2)))))))))

(deftest update-fk-target-field-id-test-2
  (testing "Checking update of the fk_target_field_id"
    (mt/with-temp [:model/Field {field-id-1 :id} {:name "Field Test 1"}
                   :model/Field {field-id-2 :id} {:name "Field Test 2"}
                   :model/Field {field-id-3 :id} {:name               "Field Test 3"
                                                  :semantic_type      :type/FK
                                                  :fk_target_field_id field-id-1}]
      (let [before-change (simple-field-details (t2/select-one :model/Field :id field-id-3))]
        (testing "before change"
          (is (= {:name               "Field Test 3"
                  :display_name       "Field Test 3"
                  :description        nil
                  :visibility_type    :normal
                  :semantic_type      :type/FK
                  :fk_target_field_id true
                  :json_unfolding     false
                  :nfc_path           nil}
                 (mt/boolean-ids-and-timestamps before-change))))
        (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id-3) {:fk_target_field_id field-id-2})
        (testing "after change"
          (let [after-change (simple-field-details (t2/select-one :model/Field :id field-id-3))]
            (is (= {:name               "Field Test 3"
                    :display_name       "Field Test 3"
                    :description        nil
                    :visibility_type    :normal
                    :semantic_type      :type/FK
                    :fk_target_field_id true
                    :json_unfolding     false
                    :nfc_path           nil}
                   (mt/boolean-ids-and-timestamps after-change)))
            (is (not= (:fk_target_field_id before-change)
                      (:fk_target_field_id after-change)))))))))

(deftest update-fk-target-field-id-with-fk-test
  (testing "Checking update of the fk_target_field_id along with an FK change"
    (mt/with-temp [:model/Field {field-id-1 :id} {:name "Field Test 1"}
                   :model/Field {field-id-2 :id} {:name "Field Test 2"}]

      (testing "before change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :semantic_type      nil
                :fk_target_field_id false
                :json_unfolding     false
                :nfc_path           nil}
               (mt/boolean-ids-and-timestamps (simple-field-details (t2/select-one :model/Field :id field-id-2))))))
      (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id-2) {:semantic_type      :type/FK
                                                                                :fk_target_field_id field-id-1})
      (testing "after change"
        (is (= {:name               "Field Test 2"
                :display_name       "Field Test 2"
                :description        nil
                :visibility_type    :normal
                :semantic_type      :type/FK
                :fk_target_field_id true
                :json_unfolding     false
                :nfc_path           nil}
               (mt/boolean-ids-and-timestamps (simple-field-details (t2/select-one :model/Field :id field-id-2)))))))))

(deftest fk-target-field-id-shouldnt-change-test
  (testing "PUT /api/field/:id"
    (testing "fk_target_field_id and FK should remain unchanged on updates of other fields"
      (mt/with-temp [:model/Field {field-id-1 :id} {:name "Field Test 1"}
                     :model/Field {field-id-2 :id} {:name               "Field Test 2"
                                                    :semantic_type      :type/FK
                                                    :fk_target_field_id field-id-1}]
        (testing "before change"
          (is (= {:name               "Field Test 2"
                  :display_name       "Field Test 2"
                  :description        nil
                  :visibility_type    :normal
                  :semantic_type      :type/FK
                  :fk_target_field_id true
                  :json_unfolding     false
                  :nfc_path           nil}
                 (mt/boolean-ids-and-timestamps (simple-field-details (t2/select-one :model/Field :id field-id-2))))))
        (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id-2) {:description "foo"})
        (testing "after change"
          (is (= {:name               "Field Test 2"
                  :display_name       "Field Test 2"
                  :description        "foo"
                  :visibility_type    :normal
                  :semantic_type      :type/FK
                  :fk_target_field_id true
                  :json_unfolding     false
                  :nfc_path           nil}
                 (mt/boolean-ids-and-timestamps (simple-field-details (t2/select-one :model/Field :id field-id-2))))))))))

(deftest update-field-type-dimension-test
  (testing "PUT /api/field/:id"
    (testing "Changing a remapped field's type to something that can't be remapped will clear the dimension"
      (mt/with-temp [:model/Field {field-id :id} {:name      "Field Test"
                                                  :base_type "type/Integer"}]
        (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
        (testing "before API request"
          (is (= {:id                      true
                  :entity_id               true
                  :created_at              true
                  :updated_at              true
                  :type                    :internal
                  :name                    "some dimension name"
                  :human_readable_field_id false
                  :field_id                true}
                 (mt/boolean-ids-and-timestamps (dimension-for-field field-id)))))
        (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id) {:semantic_type "type/AvatarURL"})
        (testing "after API request"
          (is (= nil
                 (dimension-for-field field-id))))))

    (testing "Change from supported type to supported type will leave the dimension"
      (mt/with-temp [:model/Field {field-id :id} {:name      "Field Test"
                                                  :base_type "type/Integer"}]
        (create-dimension-via-API! field-id {:name "some dimension name", :type "internal"})
        (let [expected {:id                      true
                        :entity_id               true
                        :created_at              true
                        :updated_at              true
                        :type                    :internal
                        :name                    "some dimension name"
                        :human_readable_field_id false
                        :field_id                true}]
          (testing "before API request"
            (is (= expected
                   (mt/boolean-ids-and-timestamps (dimension-for-field field-id)))))
          (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id) {:has_field_values "list"})
          (testing "after API request"
            (is (= expected
                   (mt/boolean-ids-and-timestamps (dimension-for-field field-id))))))))))

(deftest update-field-settings-test
  (testing "Can we update Field.settings, and fetch it?"
    (mt/with-temp [:model/Field field {:name "Crissy Field"}]
      (mt/user-http-request :crowberto :put 200 (format "field/%d" (u/the-id field)) {:settings {:field_is_cool true}})
      (is (= {:field_is_cool true}
             (-> (mt/user-http-request :crowberto :get 200 (format "field/%d" (u/the-id field)))
                 :settings))))))

(deftest ^:parallel search-values-test-everything
  (mt/test-drivers (mt/normal-drivers)
    (testing "must supply a limit if value is omitted"
      (is (mt/user-http-request :crowberto :get 400 (format "field/%d/search/%d"
                                                            (mt/id :venues :id)
                                                            (mt/id :venues :name)))))
    (testing "return the first N results if value is omitted"
      (is (= [[1 "Red Medicine"]
              [2 "Stout Burgers & Beers"]
              [3 "The Apple Pan"]]
             (mt/format-rows-by
              [int str]
              (mt/user-http-request :crowberto :get 200 (format "field/%d/search/%d?limit=3"
                                                                (mt/id :venues :id)
                                                                (mt/id :venues :name)))))))))

(deftest field-values-remapped-fields-test
  (testing "GET /api/field/:id/values"
    (testing "Should return tuples of [original remapped] for a remapped Field (#13235)"
      (mt/dataset test-data
        (mt/with-temp-copy-of-db
          ;; create a human-readable-values remapping. Do this via the API because the crazy things may or may not be
          ;; happening
          (is (partial= {:field_id                (mt/id :orders :product_id)
                         :human_readable_field_id (mt/id :products :title)
                         :type                    "external"}
                        (mt/user-http-request :crowberto :post 200
                                              (format "field/%d/dimension" (mt/id :orders :product_id))
                                              {:human_readable_field_id (mt/id :products :title)
                                               :name                    "Product ID"
                                               :type                    :external})))
          ;; trigger a field values rescan (this API endpoint is synchronous)
          (snowplow-test/with-fake-snowplow-collector
            (is (= {:status "success"}
                   (mt/user-http-request :crowberto :post 200 (format "field/%d/rescan_values" (mt/id :orders :product_id)))))
            (testing "triggers snowplow event"
              (is (=?
                   {"event" "field_manual_scan", "target_id" (mt/id :orders :product_id)}
                   (:data (last (snowplow-test/pop-event-data-and-user-id!)))))))
          ;; mark the Field as has_field_values = list
          (mt/with-temp-vals-in-db :model/Field (mt/id :orders :product_id) {:has_field_values "list"}
            (is (partial= {:values [[1 "Rustic Paper Wallet"]
                                    [2 "Small Marble Shoes"]
                                    [3 "Synergistic Granite Chair"]]}
                          (mt/user-http-request :crowberto :get 200 (format "field/%d/values" (mt/id :orders :product_id)))))))))))

(deftest json-unfolding-initially-true-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (when-not (mysql/mariadb? (mt/db))
      (mt/dataset json
        ;; Create a new database with the same details as the json dataset, with json unfolding enabled
        (let [database (t2/select-one :model/Database :id (mt/id))]
          (mt/with-temp [:model/Database database {:engine driver/*driver* :details (assoc (:details database) :json-unfolding true)}]
            (mt/with-db database
              ;; Sync the new database
              (sync/sync-database! database)
              (let [field (t2/select-one :model/Field :id (mt/id :json :json_bit))
                    get-database (fn [] (t2/select-one :model/Database :id (mt/id)))
                    set-json-unfolding-for-field! (fn [v]
                                                    (mt/user-http-request :crowberto :put 200 (format "field/%d" (mt/id :json :json_bit))
                                                                          (assoc field :json_unfolding v)))
                    set-json-unfolding-for-db! (fn [v]
                                                 (let [updated-db (into {} (assoc-in database [:details :json-unfolding] v))]
                                                   (mt/user-http-request :crowberto :put 200 (format "database/%d" (:id database))
                                                                         updated-db)))
                    nested-fields          (fn []
                                             (->> (t2/select :model/Field :table_id (mt/id :json) :active true :nfc_path [:not= nil])
                                                  (filter (fn [field] (= (first (:nfc_path field)) "json_bit")))))]
                (testing "json_unfolding is enabled by default at the field level"
                  (is (true? (:json_unfolding field))))
                (testing "nested fields are present since json unfolding is enabled by default"
                  (is (seq (nested-fields))))
                (testing "nested fields are removed when json unfolding is disabled for the DB"
                  (set-json-unfolding-for-db! false)
                  (sync/sync-database! (get-database))
                  (is (empty? (nested-fields))))
                (testing "nested fields are added when json unfolding is enabled again for the DB"
                  (set-json-unfolding-for-db! true)
                  (sync/sync-database! (get-database))
                  (is (seq (nested-fields))))
                (testing "nested fields are removed when json unfolding is disabled for the field"
                  (set-json-unfolding-for-field! false)
                  (is (empty? (nested-fields))))
                (testing "nested fields are added when json unfolding is enabled again for the field"
                  (set-json-unfolding-for-field! true)
                  (is (seq (nested-fields))))))))))))

(deftest json-unfolding-initially-false-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (when-not (mysql/mariadb? (mt/db))
      (mt/dataset json
        (let [database (t2/select-one :model/Database :id (mt/id))]
          (testing "When json_unfolding is disabled at the DB level on the first sync"
            ;; Create a new database with the same details as the json dataset, with json unfolding disabled
            (mt/with-temp [:model/Database database {:engine driver/*driver* :details (assoc (:details database) :json-unfolding false)}]
              (mt/with-db database
                ;; Sync the new database
                (sync/sync-database! database)
                (let [get-field (fn [] (t2/select-one :model/Field :id (mt/id :json :json_bit)))
                      get-database (fn [] (t2/select-one :model/Database :id (mt/id)))
                      set-json-unfolding-for-field! (fn [v]
                                                      (mt/user-http-request :crowberto :put 200 (format "field/%d" (mt/id :json :json_bit))
                                                                            (assoc (get-field) :json_unfolding v)))
                      set-json-unfolding-for-db! (fn [v]
                                                   (let [updated-db (into {} (assoc-in database [:details :json-unfolding] v))]
                                                     (mt/user-http-request :crowberto :put 200 (format "database/%d" (:id database))
                                                                           updated-db)))
                      nested-fields (fn []
                                      (->> (t2/select :model/Field :table_id (mt/id :json) :active true :nfc_path [:not= nil])
                                           (filter (fn [field] (= (first (:nfc_path field)) "json_bit")))))]
                  (testing "nested fields are not created"
                    (is (empty? (nested-fields))))
                  (testing "yet json_unfolding is enabled by default at the field level"
                    (is (true? (:json_unfolding (get-field)))))
                  (testing "nested fields are added automatically when json unfolding is enabled for the field,
                            and json unfolding is alread enabled for the DB"
                    (set-json-unfolding-for-field! false)
                    (set-json-unfolding-for-db! true)
                    (set-json-unfolding-for-field! true)
                    ;; Wait for the sync to finish
                    (Thread/sleep 500)
                    (is (seq (nested-fields))))
                  (testing "nested fields are added when json unfolding is enabled for the DB"
                    (set-json-unfolding-for-db! true)
                    (is (true? (:json-unfolding (:details (get-database)))))
                    (is (true? (:json_unfolding (get-field))))
                    (sync/sync-database! (get-database))
                    (is (seq (nested-fields))))
                  (testing "nested fields are removed when json unfolding is disabled again"
                    (set-json-unfolding-for-db! false)
                    (sync/sync-database! (get-database))
                    (is (empty? (nested-fields)))))))))))))

(deftest coercion-strategy-is-respected-after-follow-up-request-test
  (testing "Coercion is not erased on follow-up requests (#60483)"
    (mt/with-temp-copy-of-db
      (is (=? {:id (mt/id :venues :price)}
              (mt/user-http-request :crowberto :put 200 (str "field/" (mt/id :venues :price))
                                    {:coercion_strategy "Coercion/UNIXSeconds->DateTime"})))
      (let [field (t2/select-one :model/Field :id (mt/id :venues :price))]
        (is (= :Coercion/UNIXSeconds->DateTime (:coercion_strategy field)))
        (is (isa? (:effective_type field) :type/DateTime)))
      (mt/user-http-request :crowberto :put 200 (str "field/" (mt/id :venues :price))
                            {:settings {:time_enabled "minutes"}})
      (let [field (t2/select-one :model/Field :id (mt/id :venues :price))]
        (is (= :Coercion/UNIXSeconds->DateTime (:coercion_strategy field)))
        (is (isa? (:effective_type field) :type/DateTime))
        (is (= "minutes" (-> field :settings :time_enabled)))))))

(deftest field-values-requires-query-permission-test
  (testing "GET /api/field/:id/values requires query permission (view-data + create-queries)"
    (mt/with-temp-copy-of-db
      (t2/update! :model/Field (mt/id :venues :price) {:has_field_values "list"})
      (testing "User with only view-data permission (no create-queries) cannot access field values"
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "field/%d/values" (mt/id :venues :price)))))))
      (testing "User with both view-data and create-queries can access field values"
        (mt/with-temp [:model/PermissionsGroup           {pg-id :id :as pg} {}
                       :model/PermissionsGroupMembership _                  {:user_id  (mt/user->id :rasta)
                                                                             :group_id pg-id}]
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-database-permission! pg (mt/id) :perms/view-data :unrestricted)
            (data-perms/set-database-permission! pg (mt/id) :perms/create-queries :query-builder)
            (is (= {:values [[1] [2] [3] [4]], :field_id (mt/id :venues :price), :has_more_values false}
                   (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price)))))))))))
