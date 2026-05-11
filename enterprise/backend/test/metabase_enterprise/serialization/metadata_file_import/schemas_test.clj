(ns ^:parallel metabase-enterprise.serialization.metadata-file-import.schemas-test
  "Tests for the Malli schemas validating per-line shapes streamed by the
  metadata file importer. The schemas describe the wire format
  (source-side integer IDs); each row's `:id` is an integer, and cross-row
  references (`:db_id`, `:table_id`, `:parent_id`, `:fk_target_field_id`)
  are integers pointing at another row's `:id` in the same file.

  The wire-format contract against actual export output is anchored by
  `wire_format_test.clj`; these tests focus on schema-level
  acceptance/rejection semantics in isolation."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.util.malli.registry :as mr]))

(defn- al
  "Build a `java.util.ArrayList` from `xs` — mimics what Jackson hands the
  importer for JSON arrays."
  [xs]
  (java.util.ArrayList. ^java.util.List xs))

;;; ============================== ::database-info =====================================

(deftest database-info-accepts-valid-shape-test
  (is (mr/validate ::schemas/database-info {:id 7 :name "warehouse" :engine "postgres"})))

(deftest database-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/database-info {:name "warehouse" :engine "postgres"}))
      "missing :id")
  (is (not (mr/validate ::schemas/database-info {:id 7 :name "warehouse"}))
      "missing :engine")
  (is (not (mr/validate ::schemas/database-info {:id 7 :engine "postgres"}))
      "missing :name")
  (is (not (mr/validate ::schemas/database-info {}))))

(deftest database-info-rejects-wrong-types-test
  (is (not (mr/validate ::schemas/database-info {:id "not-an-int" :name "warehouse" :engine "postgres"}))
      ":id must be an integer")
  (is (not (mr/validate ::schemas/database-info {:id 7 :name 5 :engine "postgres"}))
      ":name must be a string")
  (is (not (mr/validate ::schemas/database-info {:id 7 :name "warehouse" :engine 42}))
      ":engine must be a string"))

;;; ============================== ::table-info ========================================

(deftest table-info-accepts-valid-shape-test
  (testing "required keys only"
    (is (mr/validate ::schemas/table-info
                     {:id 100 :db_id 7 :name "orders"})))
  (testing "with optional :schema and :description"
    (is (mr/validate ::schemas/table-info
                     {:id 100 :db_id 7 :name "orders"
                      :schema "public" :description "customer orders"})))
  (testing ":schema present-and-null is accepted"
    (is (mr/validate ::schemas/table-info
                     {:id 100 :db_id 7 :name "orders" :schema nil}))))

(deftest table-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/table-info {:db_id 7 :name "orders"}))
      "missing :id")
  (is (not (mr/validate ::schemas/table-info {:id 100 :name "orders"}))
      "missing :db_id")
  (is (not (mr/validate ::schemas/table-info {:id 100 :db_id 7}))
      "missing :name"))

(deftest table-info-rejects-wrong-types-test
  (is (not (mr/validate ::schemas/table-info {:id "wh" :db_id 7 :name "orders"}))
      ":id must be an integer")
  (is (not (mr/validate ::schemas/table-info {:id 100 :db_id "wh" :name "orders"}))
      ":db_id must be an integer"))

;;; ============================== ::field-info ========================================

(deftest field-info-accepts-flat-root-field-test
  (testing "flat root field — required keys only, no parent or nfc_path"
    (is (mr/validate ::schemas/field-info
                     {:id 1000 :table_id 100 :name "id"
                      :base_type "type/Integer" :database_type "integer"}))))

(deftest field-info-accepts-row-with-parent-id-and-nfc-path-test
  (testing "nested leaf: both :parent_id and :nfc_path set"
    (is (mr/validate ::schemas/field-info
                     {:id 1002 :table_id 100 :name "zip"
                      :base_type "type/Text" :database_type "text"
                      :parent_id 1001
                      :nfc_path ["address"]}))))

(deftest field-info-accepts-fk-target-test
  (is (mr/validate ::schemas/field-info
                   {:id 1003 :table_id 100 :name "user_id"
                    :base_type "type/Integer" :database_type "integer"
                    :fk_target_field_id 2000})))

(deftest field-info-accepts-row-with-nfc-path-and-no-parent-id-test
  (testing "unfolded leaf: :nfc_path set, no :parent_id (no parent storage row exists)"
    (is (mr/validate ::schemas/field-info
                     {:id 1004 :table_id 100 :name "payload → address → zip"
                      :base_type "type/Text" :database_type "text"
                      :nfc_path ["payload" "address" "zip"]})))
  (testing "Jackson ArrayList for :nfc_path also validates"
    (is (mr/validate ::schemas/field-info
                     {:id 1004 :table_id 100 :name "payload → address → zip"
                      :base_type "type/Text" :database_type "text"
                      :nfc_path (al ["payload" "address" "zip"])}))))

(deftest field-info-accepts-all-optional-keys-test
  (is (mr/validate ::schemas/field-info
                   {:id 1005 :table_id 100 :name "amount"
                    :base_type "type/Float" :database_type "DECIMAL"
                    :description "order total"
                    :effective_type "type/Float"
                    :semantic_type "type/Currency"
                    :coercion_strategy "Coercion/UNIXSeconds->DateTime"
                    :parent_id 1001
                    :fk_target_field_id 2000
                    :nfc_path ["amount"]})))

(deftest field-info-rejects-missing-required-keys-test
  (let [base {:id 1000 :table_id 100 :name "x"
              :base_type "type/Integer" :database_type "integer"}]
    (is (not (mr/validate ::schemas/field-info (dissoc base :id)))            "missing :id")
    (is (not (mr/validate ::schemas/field-info (dissoc base :table_id)))      "missing :table_id")
    (is (not (mr/validate ::schemas/field-info (dissoc base :name)))          "missing :name")
    (is (not (mr/validate ::schemas/field-info (dissoc base :base_type)))     "missing :base_type")
    (is (not (mr/validate ::schemas/field-info (dissoc base :database_type))) "missing :database_type")))

(deftest field-info-rejects-wrong-id-types-test
  (let [base {:id 1000 :table_id 100 :name "x"
              :base_type "type/Integer" :database_type "integer"}]
    (is (not (mr/validate ::schemas/field-info (assoc base :id "not-int")))
        ":id must be an integer")
    (is (not (mr/validate ::schemas/field-info (assoc base :table_id "not-int")))
        ":table_id must be an integer")
    (is (not (mr/validate ::schemas/field-info (assoc base :parent_id "not-int")))
        ":parent_id (when present) must be an integer")
    (is (not (mr/validate ::schemas/field-info (assoc base :fk_target_field_id "not-int")))
        ":fk_target_field_id (when present) must be an integer")))

(deftest field-info-rejects-malformed-nfc-path-test
  (let [base {:id 1000 :table_id 100 :name "x"
              :base_type "type/Integer" :database_type "integer"}]
    (is (not (mr/validate ::schemas/field-info (assoc base :nfc_path "not-a-list")))
        ":nfc_path must be a list/vector")
    (is (not (mr/validate ::schemas/field-info (assoc base :nfc_path [1 2 3])))
        ":nfc_path elements must be strings")))
