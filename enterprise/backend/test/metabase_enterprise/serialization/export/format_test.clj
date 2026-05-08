(ns metabase-enterprise.serialization.export.format-test
  "Unit tests for `format-entity` in
  `metabase-enterprise.serialization.export.format`. Each deftest exercises a
  single case so that failures pinpoint the exact behavior that broke."
  (:require
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.serialization.export.format :as export.format]))

(defn- mock-database
  "Default :model/Database query row, with per-test overrides merged in."
  [overrides]
  (merge {:name "Sample" :engine "h2"} overrides))

(defn- mock-table
  "Default :model/Table query row, with per-test overrides merged in."
  [overrides]
  (merge {:db_name     "Sample"
          :schema      "PUBLIC"
          :table_name  "Orders"
          :description nil}
         overrides))

(defn- mock-field
  "Default :model/Field query row, with per-test overrides merged in. Covers
  every key destructured by `format-entity :model/Field`, so tests only need to
  set the fields relevant to what they're checking."
  [overrides]
  (merge {:db_name           "Sample"
          :engine            "h2"
          :table_schema      "PUBLIC"
          :table_name        "Orders"
          :field_name        "id"
          :parent_id         nil
          :description       nil
          :base_type         "type/Integer"
          :database_type     nil
          :effective_type    nil
          :semantic_type     nil
          :coercion_strategy nil
          :nfc_path          nil
          :fk_db_name        nil
          :fk_db_engine      nil
          :fk_table_schema   nil
          :fk_table_name     nil
          :fk_field_name     nil
          :fk_parent_id      nil
          :fk_field_nfc_path nil}
         overrides))

(deftest format-database-test
  (is (=? {:name "Sample" :engine "h2"}
          (export.format/format-entity :model/Database (mock-database {})))))

(deftest format-table-with-schema-and-description-test
  (is (=? {:db_id       "Sample"
           :name        "Orders"
           :schema      "PUBLIC"
           :description "Orders table"}
          (export.format/format-entity :model/Table
                                       (mock-table {:description "Orders table"})))))

(deftest format-table-without-schema-test
  (let [out (export.format/format-entity :model/Table (mock-table {:schema nil}))]
    (is (=? {:db_id "Sample" :name "Orders"} out))
    (is (not (contains? out :schema)))
    (is (not (contains? out :description)))))

(deftest format-field-root-test
  (let [out (export.format/format-entity :model/Field (mock-field {}))]
    (is (=? {:table_id  ["Sample" "PUBLIC" "Orders"]
             :name      "id"
             :base_type "type/Integer"}
            out))
    (is (not (contains? out :parent_id)))
    (is (not (contains? out :fk_target_field_id)))))

(deftest format-field-mongo-nested-parent-id-test
  (is (=? {:name      "city"
           :parent_id ["Sample" "PUBLIC" "Orders" "data"]}
          (export.format/format-entity :model/Field
                                       (mock-field {:engine     "mongo"
                                                    :field_name "city"
                                                    :parent_id  42
                                                    :base_type  "type/Text"
                                                    :nfc_path   ["data" "city"]})))))

(deftest format-field-bigquery-nested-parent-id-test
  (is (=? {:name      "city"
           :parent_id ["Sample" nil "orders" "data"]}
          (export.format/format-entity :model/Field
                                       (mock-field {:engine       "bigquery-cloud-sdk"
                                                    :table_schema nil
                                                    :table_name   "orders"
                                                    :field_name   "city"
                                                    :parent_id    42
                                                    :base_type    "type/Text"
                                                    :nfc_path     ["data"]})))))

(deftest format-field-no-parent-id-when-raw-parent-id-missing-test
  (let [out (export.format/format-entity :model/Field
                                         (mock-field {:engine     "mongo"
                                                      :field_name "city"
                                                      :base_type  "type/Text"
                                                      :nfc_path   ["data" "city"]}))]
    (is (not (contains? out :parent_id)))))

(deftest format-field-fk-target-root-test
  (is (=? {:fk_target_field_id ["Sample" "PUBLIC" "Orders" "id"]}
          (export.format/format-entity :model/Field
                                       (mock-field {:field_name      "user_id"
                                                    :fk_db_name      "Sample"
                                                    :fk_db_engine    "h2"
                                                    :fk_table_schema "PUBLIC"
                                                    :fk_table_name   "Orders"
                                                    :fk_field_name   "id"})))))

(deftest format-field-fk-target-mongo-nested-test
  (is (=? {:fk_target_field_id ["Sample" "PUBLIC" "Orders" "data" "city"]}
          (export.format/format-entity :model/Field
                                       (mock-field {:engine            "mongo"
                                                    :table_name        "Customers"
                                                    :field_name        "city_ref"
                                                    :base_type         "type/Text"
                                                    :fk_db_name        "Sample"
                                                    :fk_db_engine      "mongo"
                                                    :fk_table_schema   "PUBLIC"
                                                    :fk_table_name     "Orders"
                                                    :fk_field_name     "city"
                                                    :fk_parent_id      99
                                                    :fk_field_nfc_path ["data" "city"]})))))

(deftest format-field-fk-target-bigquery-nested-test
  (is (=? {:fk_target_field_id ["Sample" nil "orders" "data" "city"]}
          (export.format/format-entity :model/Field
                                       (mock-field {:table_name        "Customers"
                                                    :field_name        "city_ref"
                                                    :base_type         "type/Text"
                                                    :fk_db_name        "Sample"
                                                    :fk_db_engine      "bigquery-cloud-sdk"
                                                    :fk_table_schema   nil
                                                    :fk_table_name     "orders"
                                                    :fk_field_name     "city"
                                                    :fk_parent_id      99
                                                    :fk_field_nfc_path ["data"]})))))

(deftest format-field-effective-type-redundant-with-base-type-test
  (let [out (export.format/format-entity :model/Field
                                         (mock-field {:effective_type "type/Integer"}))]
    (is (not (contains? out :effective_type)))))

(deftest format-field-effective-type-distinct-from-base-type-test
  (is (=? {:effective_type "type/Date"}
          (export.format/format-entity :model/Field
                                       (mock-field {:field_name     "created_at"
                                                    :base_type      "type/Text"
                                                    :effective_type "type/Date"})))))
