(ns ^:parallel metabase-enterprise.serialization.metadata-file-import.schemas-test
  "Tests for the Malli schemas validating per-line shapes streamed by the
  metadata file importer.

  NOTE (intermediate state): these tests still use portable-key fixtures from
  Iteration 3 (vectors for `:id`, `:table_id`, `:parent_id`, etc.). Iteration 4
  uses integer IDs. The acceptance tests below currently fail because the
  fixtures don't match the I4 schema shape; the negative tests still hold.
  Tests will be rewritten with integer-ID fixtures alongside any further schema
  work. The wire-format contract is meanwhile anchored by `wire_format_test.clj`,
  which validates the I4 schemas against actual export output."
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

(deftest database-info-accepts-portable-shape-test
  (is (mr/validate ::schemas/database-info {:name "warehouse" :engine "postgres"})))

(deftest database-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/database-info {:name "warehouse"}))
      "missing :engine")
  (is (not (mr/validate ::schemas/database-info {:engine "postgres"}))
      "missing :name")
  (is (not (mr/validate ::schemas/database-info {}))))

(deftest database-info-rejects-non-string-name-or-engine-test
  (is (not (mr/validate ::schemas/database-info {:name 5 :engine "postgres"})))
  (is (not (mr/validate ::schemas/database-info {:name "warehouse" :engine 42}))))

;;; ============================== ::table-info ========================================

(deftest table-info-accepts-portable-shape-test
  (testing "all required keys"
    (is (mr/validate ::schemas/table-info
                     {:db_id "warehouse" :name "orders"})))
  (testing "with optional :schema and :description"
    (is (mr/validate ::schemas/table-info
                     {:db_id "warehouse"
                      :name "orders"
                      :schema "public"
                      :description "customer orders"}))))

(deftest table-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/table-info {:db_id "warehouse"}))
      "missing :name")
  (is (not (mr/validate ::schemas/table-info {:name "orders"}))
      "missing :db_id"))

;;; ============================== ::field-info ========================================

(def ^:private valid-table-id ["warehouse" "public" "orders"])
(def ^:private valid-field-id ["warehouse" "public" "orders" "zip"])
(def ^:private valid-parent-id ["warehouse" "public" "orders" "address"])
(def ^:private valid-fk-target-id ["warehouse" "public" "users" "id"])

(deftest field-info-accepts-flat-root-field-test
  (testing "flat root field — :id, :table_id, :name, :base_type required; :parent_id and :nfc_path absent"
    (is (mr/validate ::schemas/field-info
                     {:id ["warehouse" "public" "orders" "address"]
                      :table_id valid-table-id
                      :name "address"
                      :base_type "type/Text"}))))

(deftest field-info-accepts-row-with-parent-id-and-nfc-path-test
  (testing "row carrying both :parent_id and :nfc_path"
    (is (mr/validate ::schemas/field-info
                     {:id ["warehouse" "public" "orders" "address" "zip"]
                      :table_id valid-table-id
                      :name "zip"
                      :parent_id valid-parent-id
                      :nfc_path ["address"]
                      :base_type "type/Text"}))))

(deftest field-info-accepts-fk-target-test
  (is (mr/validate ::schemas/field-info
                   {:id ["warehouse" "public" "orders" "user_id"]
                    :table_id valid-table-id
                    :name "user_id"
                    :base_type "type/Integer"
                    :fk_target_field_id valid-fk-target-id})))

(deftest field-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/field-info
                        {:id valid-field-id :table_id valid-table-id :name "x"}))
      "missing :base_type")
  (is (not (mr/validate ::schemas/field-info
                        {:id valid-field-id :table_id valid-table-id :base_type "type/Text"}))
      "missing :name")
  (is (not (mr/validate ::schemas/field-info
                        {:id valid-field-id :name "x" :base_type "type/Text"}))
      "missing :table_id")
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id :name "x" :base_type "type/Text"}))
      "missing :id"))

(deftest field-info-accepts-all-optional-keys-test
  (is (mr/validate ::schemas/field-info
                   {:id ["warehouse" "public" "orders" "amount"]
                    :table_id valid-table-id
                    :name "amount"
                    :base_type "type/Float"
                    :description "order total"
                    :database_type "DECIMAL"
                    :effective_type "type/Float"
                    :semantic_type "type/Currency"
                    :coercion_strategy "Coercion/UNIXSeconds->DateTime"})))

;;; JSON-unfolded leaves — wire carries `:nfc_path` verbatim from storage and
;;; no `:parent_id` (no parent storage row exists).

(deftest field-info-accepts-row-with-nfc-path-and-no-parent-id-test
  (testing "row carries :nfc_path, no :parent_id"
    (is (mr/validate ::schemas/field-info
                     {:id ["warehouse" "public" "orders" "payload" "address" "zip"]
                      :table_id valid-table-id
                      :name "payload → address → zip"
                      :nfc_path ["payload" "address" "zip"]
                      :base_type "type/Text"})))
  (testing "Jackson ArrayList for :nfc_path also validates"
    (is (mr/validate ::schemas/field-info
                     {:id (al ["warehouse" "public" "orders" "payload" "address" "zip"])
                      :table_id valid-table-id
                      :name "payload → address → zip"
                      :nfc_path (al ["payload" "address" "zip"])
                      :base_type "type/Text"}))))

(deftest field-info-rejects-malformed-nfc-path-test
  (is (not (mr/validate ::schemas/field-info
                        {:id valid-field-id
                         :table_id valid-table-id
                         :name "x"
                         :nfc_path "not-a-list"
                         :base_type "type/Text"}))
      ":nfc_path must be a list/vector")
  (is (not (mr/validate ::schemas/field-info
                        {:id valid-field-id
                         :table_id valid-table-id
                         :name "x"
                         :nfc_path [1 2 3]
                         :base_type "type/Text"}))
      "elements must be strings"))
