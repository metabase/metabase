(ns metabase.warehouse-schema.table-test
  (:require
   [clojure.test :refer :all]
   [metabase.warehouse-schema.table :as schema.table]))

(deftest ^:parallel dimension-options-sort-test
  (testing "Ensure dimensions options are sorted numerically, but returned as strings"
    (testing "datetime indexes"
      (is (= (map str (sort (map parse-long @#'schema.table/datetime-dimension-indexes)))
             @#'schema.table/datetime-dimension-indexes)))
    (testing "numeric indexes"
      (is (= (map str (sort (map parse-long @#'schema.table/numeric-dimension-indexes)))
             @#'schema.table/numeric-dimension-indexes)))))
