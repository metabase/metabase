(ns metabase-enterprise.sandbox.models.params.chain-filter-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [FieldValues]]
            [metabase.models.params.chain-filter :as chain-filter]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest chain-filter-sandboxed-field-values-test
  (testing "When chain-filter would normally return cached FieldValues (#13832), make sure sandboxing is respected"
    (mt/with-model-cleanup [FieldValues]
      (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
        (mt/with-model-cleanup [FieldValues]
          (field-values/clear-advanced-field-values-for-field! (mt/id :categories :name))
          (testing "values"
            (is (= ["African" "American"]
                   (mt/$ids (chain-filter/chain-filter %categories.name nil))))
            (is (= 1 (db/count FieldValues :field_id (mt/id :categories :name) :type :sandbox))))

          (testing "search"
            (is (= ["African" "American"]
                   (mt/$ids (chain-filter/chain-filter-search %categories.name nil "a"))))))))

    (testing "When chain-filter with constraints"
      (testing "creates a linked-filter FieldValues if not sandboxed"
        (is (= ["Artisan"]
               (mt/$ids (chain-filter/chain-filter %categories.name {%categories.id 3}))))
        (is (= 1 (db/count FieldValues :field_id (mt/id :categories :name) :type :linked-filter))))

      (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
        (testing "creates another linked-filter FieldValues if  sandboxed"
          (is (= []
                 (mt/$ids (chain-filter/chain-filter %categories.name {%categories.id 3}))))
          (is (= 2 (db/count FieldValues :field_id (mt/id :categories :name) :type :linked-filter))))))))
