(ns metabase.transforms.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel table-target-name-rejects-dot-test
  (testing "a `.` in a table target's name is rejected -- some rename paths parse it as a schema
            qualifier, silently turning a single dotted identifier into two (#75973)"
    (is (not (mr/validate ::transforms.schema/table-target
                          {:type "table", :name "target.products"})))
    (is (mr/validate ::transforms.schema/table-target
                     {:type "table", :name "products"}))))

(deftest ^:parallel table-incremental-target-name-rejects-dot-test
  (testing "same rejection for the incremental target variant (#75973)"
    (is (not (mr/validate ::transforms.schema/table-incremental-target
                          {:type "table-incremental"
                           :name "target.products"
                           :target-incremental-strategy {:type "append"}})))
    (is (mr/validate ::transforms.schema/table-incremental-target
                     {:type "table-incremental"
                      :name "products"
                      :target-incremental-strategy {:type "append"}}))))
