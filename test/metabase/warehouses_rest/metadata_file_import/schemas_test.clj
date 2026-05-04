(ns ^:parallel metabase.warehouses-rest.metadata-file-import.schemas-test
  "Tests for the Malli schemas validating per-line shapes streamed in
  `MB_TABLE_METADATA_PATH`. The schemas describe the **portable-id** wire
  format produced by `GET /api/database/metadata` after Alex Polyankin's
  2026-04-29 rework (see plan §16). Both Clojure vectors (YAML parser
  output) and `java.util.ArrayList` (Jackson JSON parser output) must
  validate, since `:tuple` rejects ArrayList and the importer reads from
  both formats."
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouses-rest.metadata-file-import.schemas :as schemas]))

(defn- al
  "Build a `java.util.ArrayList` from `xs` — mimics what Jackson hands the
  importer for JSON arrays."
  [xs]
  (java.util.ArrayList. ^java.util.List xs))

;;; ============================== ::portable-database-id ==============================

(deftest portable-database-id-accepts-strings-test
  (is (mr/validate ::schemas/portable-database-id "warehouse"))
  (is (mr/validate ::schemas/portable-database-id "")
      "empty string is shape-valid; semantic check is the loader's job"))

(deftest portable-database-id-rejects-non-strings-test
  (is (not (mr/validate ::schemas/portable-database-id 42)))
  (is (not (mr/validate ::schemas/portable-database-id nil)))
  (is (not (mr/validate ::schemas/portable-database-id ["warehouse"]))
      "a single-element list is not a database id"))

;;; ============================== ::portable-table-id =================================

(deftest portable-table-id-accepts-vectors-and-arraylists-test
  (testing "Clojure vector (YAML parser output)"
    (is (mr/validate ::schemas/portable-table-id ["warehouse" "public" "orders"])))
  (testing "Jackson ArrayList (JSON parser output)"
    (is (mr/validate ::schemas/portable-table-id (al ["warehouse" "public" "orders"]))))
  (testing "schema-less engine: nil schema slot"
    (is (mr/validate ::schemas/portable-table-id ["warehouse" nil "raw_table"]))
    (is (mr/validate ::schemas/portable-table-id (al ["warehouse" nil "raw_table"])))))

(deftest portable-table-id-rejects-wrong-shapes-test
  (testing "wrong length"
    (is (not (mr/validate ::schemas/portable-table-id ["warehouse" "public"])))
    (is (not (mr/validate ::schemas/portable-table-id ["warehouse" "public" "orders" "extra"]))))
  (testing "wrong element types"
    (is (not (mr/validate ::schemas/portable-table-id [42 "public" "orders"]))
        "db must be string")
    (is (not (mr/validate ::schemas/portable-table-id ["warehouse" 42 "orders"]))
        "schema must be string-or-nil")
    (is (not (mr/validate ::schemas/portable-table-id ["warehouse" "public" 42]))
        "table must be string"))
  (testing "non-list inputs"
    (is (not (mr/validate ::schemas/portable-table-id "warehouse")))
    (is (not (mr/validate ::schemas/portable-table-id nil)))))

;;; ============================== ::portable-field-id =================================

(deftest portable-field-id-accepts-length-ge-4-test
  (testing "depth-1 nested field: [db schema table leaf-name]"
    (is (mr/validate ::schemas/portable-field-id ["warehouse" "public" "orders" "address"]))
    (is (mr/validate ::schemas/portable-field-id (al ["warehouse" "public" "orders" "address"]))))
  (testing "depth-2 nested field: [db schema table parent leaf]"
    (is (mr/validate ::schemas/portable-field-id ["warehouse" "public" "orders" "address" "zip"]))
    (is (mr/validate ::schemas/portable-field-id (al ["warehouse" "public" "orders" "address" "zip"]))))
  (testing "deep nesting (5 path elements)"
    (is (mr/validate ::schemas/portable-field-id ["w" "s" "t" "a" "b" "c" "leaf"])))
  (testing "schema-less engine: nil schema slot still valid"
    (is (mr/validate ::schemas/portable-field-id ["warehouse" nil "raw_table" "field"]))))

(deftest portable-field-id-rejects-too-short-test
  (testing "length < 4 rejected (need at least db, schema, table, leaf)"
    (is (not (mr/validate ::schemas/portable-field-id ["warehouse" "public" "orders"])))
    (is (not (mr/validate ::schemas/portable-field-id ["warehouse" "public"])))
    (is (not (mr/validate ::schemas/portable-field-id [])))))

(deftest portable-field-id-rejects-wrong-element-types-test
  (is (not (mr/validate ::schemas/portable-field-id [42 "public" "orders" "f"]))
      "db must be string")
  (is (not (mr/validate ::schemas/portable-field-id ["w" 42 "orders" "f"]))
      "schema must be string-or-nil")
  (is (not (mr/validate ::schemas/portable-field-id ["w" "s" "orders" 42]))
      "leaf path elements must be strings")
  (is (not (mr/validate ::schemas/portable-field-id ["w" "s" "orders" "a" 42 "leaf"]))
      "interior path elements must be strings"))

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

(deftest table-info-rejects-integer-db-id-test
  (is (not (mr/validate ::schemas/table-info
                        {:db_id 42 :name "orders"}))
      "integer :db_id is the pre-pivot shape — must reject"))

(deftest table-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/table-info {:db_id "warehouse"}))
      "missing :name")
  (is (not (mr/validate ::schemas/table-info {:name "orders"}))
      "missing :db_id"))

;;; ============================== ::field-info ========================================

(def ^:private valid-table-id ["warehouse" "public" "orders"])
(def ^:private valid-parent-id ["warehouse" "public" "orders" "address"])
(def ^:private valid-fk-target-id ["warehouse" "public" "users" "id"])

(deftest field-info-accepts-top-level-field-test
  (is (mr/validate ::schemas/field-info
                   {:table_id valid-table-id
                    :name "address"
                    :base_type "type/Text"})))

(deftest field-info-accepts-nested-field-with-parent-id-test
  (is (mr/validate ::schemas/field-info
                   {:table_id valid-table-id
                    :name "zip"
                    :parent_id valid-parent-id
                    :base_type "type/Text"})))

(deftest field-info-accepts-fk-target-test
  (is (mr/validate ::schemas/field-info
                   {:table_id valid-table-id
                    :name "user_id"
                    :base_type "type/Integer"
                    :fk_target_field_id valid-fk-target-id})))

(deftest field-info-accepts-arraylist-portable-ids-test
  (testing "Jackson hands us ArrayLists for nested arrays — must validate"
    (is (mr/validate ::schemas/field-info
                     {:table_id (al valid-table-id)
                      :name "zip"
                      :parent_id (al valid-parent-id)
                      :fk_target_field_id (al valid-fk-target-id)
                      :base_type "type/Text"}))))

(deftest field-info-rejects-integer-table-id-test
  (is (not (mr/validate ::schemas/field-info
                        {:table_id 42 :name "address" :base_type "type/Text"}))
      "integer :table_id is the pre-pivot shape — must reject"))

(deftest field-info-rejects-integer-parent-or-fk-id-test
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id
                         :name "zip"
                         :parent_id 99
                         :base_type "type/Text"}))
      "integer :parent_id rejected")
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id
                         :name "user_id"
                         :base_type "type/Integer"
                         :fk_target_field_id 99}))
      "integer :fk_target_field_id rejected"))

(deftest field-info-rejects-malformed-portable-id-test
  (testing "table_id length 2 rejected"
    (is (not (mr/validate ::schemas/field-info
                          {:table_id ["only" "two"]
                           :name "x"
                           :base_type "type/Text"}))))
  (testing "parent_id length 3 rejected (parent ids need ≥ 4 elements)"
    (is (not (mr/validate ::schemas/field-info
                          {:table_id valid-table-id
                           :name "x"
                           :parent_id ["w" "s" "orders"]
                           :base_type "type/Text"})))))

(deftest field-info-rejects-missing-required-keys-test
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id :name "x"}))
      "missing :base_type")
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id :base_type "type/Text"}))
      "missing :name")
  (is (not (mr/validate ::schemas/field-info
                        {:name "x" :base_type "type/Text"}))
      "missing :table_id"))

(deftest field-info-accepts-all-optional-keys-test
  (is (mr/validate ::schemas/field-info
                   {:table_id valid-table-id
                    :name "amount"
                    :base_type "type/Float"
                    :description "order total"
                    :database_type "DECIMAL"
                    :effective_type "type/Float"
                    :semantic_type "type/Currency"
                    :coercion_strategy "Coercion/UNIXSeconds->DateTime"})))

;;; Convention B (Postgres JSON-unfolded leaves) — wire carries `:nfc_path`
;;; verbatim from storage instead of `:parent_id`. The two are mutually
;;; exclusive; both are optional.

(deftest field-info-accepts-convention-b-leaf-with-nfc-path-test
  (testing "Convention B: row carries :nfc_path, no :parent_id"
    (is (mr/validate ::schemas/field-info
                     {:table_id valid-table-id
                      :name "payload → address → zip"
                      :nfc_path ["payload" "address" "zip"]
                      :base_type "type/Text"})))
  (testing "Jackson ArrayList for :nfc_path also validates"
    (is (mr/validate ::schemas/field-info
                     {:table_id valid-table-id
                      :name "payload → address → zip"
                      :nfc_path (al ["payload" "address" "zip"])
                      :base_type "type/Text"}))))

(deftest field-info-rejects-malformed-nfc-path-test
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id
                         :name "x"
                         :nfc_path "not-a-list"
                         :base_type "type/Text"}))
      ":nfc_path must be a list/vector")
  (is (not (mr/validate ::schemas/field-info
                        {:table_id valid-table-id
                         :name "x"
                         :nfc_path [1 2 3]
                         :base_type "type/Text"}))
      "elements must be strings"))
