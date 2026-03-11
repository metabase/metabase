(ns metabase.source-swap.compatibility-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.source-swap.compatibility :as source-swap.compatibility]))

(set! *warn-on-reflection* true)

(def ^:private mp
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "db" :engine :h2}
    :tables [{:id 100 :name "t" :db-id 1}]
    :fields [{:id 1 :table-id 100 :name "PLAIN"
              :base-type :type/Integer :effective-type :type/Integer}
             {:id 2 :table-id 100 :name "DIFFERENT_TYPE"
              :base-type :type/Text :effective-type :type/Text}
             {:id 3 :table-id 100 :name "PK"
              :base-type :type/Integer :effective-type :type/Integer
              :semantic-type :type/PK}
             {:id 4 :table-id 100 :name "FK_A"
              :base-type :type/Integer :effective-type :type/Integer
              :semantic-type :type/FK :fk-target-field-id 999}
             {:id 5 :table-id 100 :name "FK_B"
              :base-type :type/Integer :effective-type :type/Integer
              :semantic-type :type/FK :fk-target-field-id 888}
             {:id 6 :table-id 100 :name "NOT_FK"
              :base-type :type/Integer :effective-type :type/Integer}]}))

(defn- field [id]
  (lib.metadata/field mp id))

(deftest ^:parallel column-errors-no-errors-test
  (testing "should return empty errors for matching columns"
    (is (= []
           (source-swap.compatibility/column-errors (field 1) (field 1) :table :table)))))

(deftest ^:parallel column-errors-type-mismatch-test
  (testing "should detect column type mismatch"
    (is (= [:column-type-mismatch]
           (source-swap.compatibility/column-errors (field 1) (field 2) :table :table)))))

(deftest ^:parallel column-errors-missing-primary-key-test
  (testing "should detect missing primary key for table->table"
    (is (= [:column-type-mismatch :missing-primary-key]
           (source-swap.compatibility/column-errors (field 3) (field 2) :table :table))))
  (testing "should not flag missing primary key for table->card"
    (is (= [:column-type-mismatch]
           (source-swap.compatibility/column-errors (field 3) (field 2) :table :card)))))

(deftest ^:parallel column-errors-foreign-key-test
  (testing "should detect missing foreign key"
    (is (= [:missing-foreign-key]
           (source-swap.compatibility/column-errors (field 4) (field 6) :table :table))))
  (testing "should detect foreign key target mismatch"
    (is (= [:foreign-key-mismatch]
           (source-swap.compatibility/column-errors (field 4) (field 5) :table :table)))))
