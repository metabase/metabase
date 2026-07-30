(ns metabase-enterprise.transforms-verification.inputs-test
  "Tests for strict input resolution: resolve-table-dep and match-fixtures."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase-enterprise.transforms-verification.inputs :as inputs]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; resolve-table-dep — error cases
;;; ---------------------------------------------------------------------------

(deftest resolve-table-dep-table-id-not-synced-throws-test
  (testing "A {:table id} dep whose id doesn't match any synced Table throws a typed error"
    ;; Exercises the resolution failure directly with a bogus id, without building
    ;; a real MBQL query under a stub metadata provider.
    (let [bogus-id 9999999
          e        (is (thrown? clojure.lang.ExceptionInfo
                                (inputs/resolve-table-dep {:table bogus-id})))]
      (is (= ::errors/table-not-found (-> e ex-data :error-type)))
      (is (= bogus-id (-> e ex-data :table-id))))))

(deftest resolve-table-dep-table-ref-not-found-throws-test
  (testing "A {:table-ref ...} dep whose (db-id, schema, table) matches nothing throws a typed error"
    (let [bad-ref {:database_id 173 :schema "public" :table "nonexistent_xyz"}
          e (is (thrown? clojure.lang.ExceptionInfo
                         (inputs/resolve-table-dep {:table-ref bad-ref})))]
      (is (= ::errors/table-not-found (-> e ex-data :error-type)))
      (is (= bad-ref (-> e ex-data :table-ref))))))

(deftest resolve-table-dep-transform-dep-throws-test
  (testing "A {:transform id} dep (dep on another transform's output) throws a typed error"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (inputs/resolve-table-dep {:transform 42})))]
      (is (= ::errors/transform-dep-not-supported (-> e ex-data :error-type))))))

;;; ---------------------------------------------------------------------------
;;; match-fixtures — happy path
;;; ---------------------------------------------------------------------------

(deftest match-fixtures-happy-path-test
  (testing "All required tables covered by provided fixture keys → validates silently (nil)"
    (let [tables [{:id 10 :schema "public" :name "orders"   :columns []}
                  {:id 20 :schema "public" :name "products" :columns []}]
          keys   #{10 20}]
      (is (nil? (inputs/match-fixtures tables keys))))))

(deftest match-fixtures-empty-transform-test
  (testing "No required tables + no fixture keys → validates silently (not an error)"
    (is (nil? (inputs/match-fixtures [] #{})))))

;;; ---------------------------------------------------------------------------
;;; match-fixtures — error cases
;;; ---------------------------------------------------------------------------

(deftest match-fixtures-missing-fixture-throws-test
  (testing "Required table without a fixture key throws a typed error listing missing tables"
    (let [tables [{:id 10 :schema "public" :name "orders"   :columns []}
                  {:id 20 :schema "public" :name "products" :columns []}]
          ;; Only provide one of the two required fixtures
          keys   #{10}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::errors/missing-fixtures (-> e ex-data :error-type)))
      ;; Missing tables should be described by id and schema.name for the caller
      (let [missing (-> e ex-data :missing-tables)]
        (is (= 1 (count missing)))
        (is (= 20 (:id (first missing))))
        (is (= "products" (:name (first missing))))
        (is (= "public" (:schema (first missing))))))))

(deftest match-fixtures-unknown-fixture-key-throws-test
  (testing "Fixture key with no matching required table throws a typed error"
    (let [tables [{:id 10 :schema "public" :name "orders" :columns []}]
          ;; Provide the correct key plus an unknown key
          keys   #{10 99}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::errors/unknown-fixture-keys (-> e ex-data :error-type)))
      (is (= #{99} (-> e ex-data :unknown-keys))))))

(deftest match-fixtures-both-missing-and-unknown-throws-test
  (testing "when both missing and unknown keys occur, missing-fixtures fires (checked first)"
    (let [tables [{:id 10 :schema "public" :name "orders" :columns []}]
          ;; Missing: 10 (no fixture for orders)
          ;; Unknown: 99 (no required table with id 99)
          keys   #{99}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::errors/missing-fixtures (-> e ex-data :error-type))))))

;;; ---------------------------------------------------------------------------
;;; match-fixtures — missing and unknown together (separate check)
;;; ---------------------------------------------------------------------------

(deftest match-fixtures-missing-fixture-error-has-full-table-info-test
  (testing "Missing-fixture error lists id, schema, name for each missing table"
    (let [tables [{:id 1 :schema "myschema" :name "fact_table" :columns []}
                  {:id 2 :schema "myschema" :name "dim_table"  :columns []}]
          keys   #{}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::errors/missing-fixtures (-> e ex-data :error-type)))
      (let [missing (-> e ex-data :missing-tables)
            ids     (set (map :id missing))]
        (is (= #{1 2} ids))
        (is (every? #(and (integer? (:id %))
                          (string? (:schema %))
                          (string? (:name %)))
                    missing))))))
