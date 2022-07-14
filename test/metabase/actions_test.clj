(ns metabase.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions :as actions]))

(deftest normalize-as-mbql-query-test
  (testing "Make sure normalize-as-mbql-query can exclude certain keys from normalization"
    (is (= {:database    1
            :type        :query
            :updated-row {:my_snake_case_column 1000
                          "CamelCaseColumn"     {:ABC 200}}
            :query       {:source-table 2}}
           (#'actions/normalize-as-mbql-query
            {"database"   1
             :updated_row {:my_snake_case_column 1000
                           "CamelCaseColumn"     {:ABC 200}}
             :query       {"source_table" 2}}
            :exclude #{:updated-row})))))
