(ns metabase.agent-lib.repair.normalize.top-level-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.repair.normalize.top-level :as top-level]))

(deftest ^:parallel normalize-with-fields-selection-flattens-single-sequential-arg-test
  (is (= [["field" 1] ["field" 2]]
         (top-level/normalize-with-fields-selection [[["field" 1] ["field" 2]]]))))

(deftest ^:parallel repair-order-by-operations-normalizes-both-order-by-encodings-test
  (is (= [["order-by" ["desc" ["field" 1]]]
          ["order-by" ["field" 2] "asc"]]
         (top-level/repair-order-by-operations [["desc" ["field" 1]]
                                                ["field" 2]
                                                "asc"]))))

(deftest ^:parallel repair-with-fields-operation-extracts-inline-expressions-test
  (is (= [["expression" "Net" ["-" ["field" 1] 10]]
          ["with-fields" [["field" 1] ["expression-ref" "Net"]]]]
         (top-level/repair-with-fields-operation identity
                                                 [[["field" 1]
                                                   ["expression" "Net" ["-" ["field" 1] 10]]]]))))

(deftest ^:parallel repair-top-level-operation-rewrites-aggregation-expressions-test
  (is (= [["aggregate" ["count"]]]
         (top-level/repair-top-level-operation identity
                                               ["expression" "Total" ["count"]]))))
