(ns metabase-enterprise.sandbox.models.params.chain-filter-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.models :refer [FieldValues]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.field-values :as field-values]
   [metabase.models.params.chain-filter :as chain-filter]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest chain-filter-sandboxed-field-values-test
  (testing "When chain-filter would normally return cached FieldValues (#13832), make sure sandboxing is respected"
    (mt/with-model-cleanup [FieldValues]
      (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
        (field-values/clear-advanced-field-values-for-field! (mt/id :categories :name))
        (testing "values"
          (is (= {:values          [["African"] ["American"]]
                  :has_more_values false}
                 (mt/$ids (chain-filter/chain-filter %categories.name nil))))
          (is (= 1 (t2/count FieldValues :field_id (mt/id :categories :name) :type :sandbox))))

        (testing "search"
          (is (= {:values          [["African"] ["American"]]
                  :has_more_values false}
                 (mt/$ids (chain-filter/chain-filter-search %categories.name nil "a")))))

        (testing "When chain-filter with constraints"
          (testing "creates a linked-filter FieldValues if not sandboxed"
            (binding [data-perms/*sandboxes-for-user* (delay nil)]
              (is (= {:values          [["Artisan"]]
                      :has_more_values false}
                     (mt/$ids (chain-filter/chain-filter %categories.name
                                                         [{:field-id %categories.id :op := :value 3}])))))
            (is (= 1 (t2/count FieldValues :field_id (mt/id :categories :name) :type :linked-filter))))

          (testing "creates another linked-filter FieldValues if sandboxed"
            (is (= {:values          []
                    :has_more_values false}
                   (mt/$ids (chain-filter/chain-filter %categories.name
                                                       [{:field-id %categories.id :op := :value 3}]))))
            (is (= 2 (t2/count FieldValues :field_id (mt/id :categories :name) :type :linked-filter)))))))))
