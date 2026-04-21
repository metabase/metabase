(ns metabase.source-swap.compatibility-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.source-swap.compatibility :as source-swap.compatibility]))

(set! *warn-on-reflection* true)

(defn- field [mp id]
  (lib.metadata/field mp id))

(deftest ^:parallel column-errors-no-errors-test
  (let [mp (lib.tu/mock-metadata-provider
            {:database {:id 1 :name "db" :engine :h2}
             :tables [{:id 100 :name "orders" :db-id 1}
                      {:id 200 :name "transactions" :db-id 1}]
             :fields [{:id 1 :table-id 100 :name "quantity"
                       :base-type :type/Integer :effective-type :type/Integer}
                      {:id 2 :table-id 200 :name "quantity"
                       :base-type :type/Integer :effective-type :type/Integer}]})]
    (testing "should return empty errors for matching columns"
      (is (= []
             (source-swap.compatibility/column-errors (field mp 1) (field mp 2) :table :table))))))

(deftest ^:parallel column-errors-type-mismatch-test
  (let [mp (lib.tu/mock-metadata-provider
            {:database {:id 1 :name "db" :engine :h2}
             :tables [{:id 100 :name "orders" :db-id 1}
                      {:id 200 :name "transactions" :db-id 1}]
             :fields [{:id 1 :table-id 100 :name "quantity"
                       :base-type :type/Integer :effective-type :type/Integer}
                      {:id 2 :table-id 200 :name "quantity"
                       :base-type :type/Text :effective-type :type/Text}]})]
    (testing "should detect column type mismatch"
      (is (= [:column-type-mismatch]
             (source-swap.compatibility/column-errors (field mp 1) (field mp 2) :table :table))))))

(deftest ^:parallel column-errors-missing-primary-key-test
  (let [mp (lib.tu/mock-metadata-provider
            {:database {:id 1 :name "db" :engine :h2}
             :tables [{:id 100 :name "orders" :db-id 1}
                      {:id 200 :name "transactions" :db-id 1}]
             :fields [{:id 1 :table-id 100 :name "id"
                       :base-type :type/Integer :effective-type :type/Integer
                       :semantic-type :type/PK}
                      {:id 2 :table-id 200 :name "id"
                       :base-type :type/Text :effective-type :type/Text}]})]
    (testing "should detect missing primary key for table->table"
      (is (= [:column-type-mismatch :missing-primary-key]
             (source-swap.compatibility/column-errors (field mp 1) (field mp 2) :table :table))))
    (testing "should not flag missing primary key for table->card"
      (is (= [:column-type-mismatch]
             (source-swap.compatibility/column-errors (field mp 1) (field mp 2) :table :card))))))

(deftest ^:parallel column-errors-foreign-key-test
  (let [mp (lib.tu/mock-metadata-provider
            {:database {:id 1 :name "db" :engine :h2}
             :tables [{:id 100 :name "orders" :db-id 1}
                      {:id 200 :name "transactions" :db-id 1}
                      {:id 300 :name "invoices" :db-id 1}]
             :fields [{:id 1 :table-id 100 :name "user_id"
                       :base-type :type/Integer :effective-type :type/Integer
                       :semantic-type :type/FK :fk-target-field-id 999}
                      {:id 2 :table-id 200 :name "user_id"
                       :base-type :type/Integer :effective-type :type/Integer
                       :semantic-type :type/FK :fk-target-field-id 888}
                      {:id 3 :table-id 300 :name "user_id"
                       :base-type :type/Integer :effective-type :type/Integer}]})]
    (testing "should detect missing foreign key"
      (is (= [:missing-foreign-key]
             (source-swap.compatibility/column-errors (field mp 1) (field mp 3) :table :table))))
    (testing "should detect foreign key target mismatch"
      (is (= [:foreign-key-mismatch]
             (source-swap.compatibility/column-errors (field mp 1) (field mp 2) :table :table))))))

(deftest ^:parallel column-errors-nil-effective-type-test
  (let [mp (lib.tu/mock-metadata-provider
            {:database {:id 1 :name "db" :engine :h2}
             :tables [{:id 100 :name "orders" :db-id 1}
                      {:id 200 :name "transactions" :db-id 1}
                      {:id 300 :name "invoices" :db-id 1}]
             :fields [{:id 1 :table-id 100 :name "quantity"
                       :base-type :type/Integer :effective-type :type/Integer}
                      {:id 2 :table-id 200 :name "quantity"
                       :base-type :type/Integer}
                      {:id 3 :table-id 300 :name "quantity"
                       :base-type :type/Text}]})]
    (testing "same base_type, nil effective_type should be compatible"
      (is (= []
             (source-swap.compatibility/column-errors (field mp 2) (field mp 1) :table :table))))
    (testing "different base_type, nil effective_type should be incompatible"
      (is (= [:column-type-mismatch]
             (source-swap.compatibility/column-errors (field mp 2) (field mp 3) :table :table))))))

(deftest ^:parallel column-errors-coerced-effective-type-test
  (let [mp (lib.tu/mock-metadata-provider
            {:database {:id 1 :name "db" :engine :h2}
             :tables [{:id 100 :name "orders" :db-id 1}
                      {:id 200 :name "transactions" :db-id 1}]
             :fields [{:id 1 :table-id 100 :name "created_at"
                       :base-type :type/DateTime :effective-type :type/DateTime}
                      {:id 2 :table-id 200 :name "created_at"
                       :base-type :type/Text :effective-type :type/DateTime
                       :coercion-strategy :Coercion/ISO8601->DateTime}]})]
    (testing "text column coerced to DateTime should be compatible with native DateTime"
      (is (= []
             (source-swap.compatibility/column-errors (field mp 1) (field mp 2) :table :table))))))
