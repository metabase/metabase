(ns metabase.agent-lib.repair.stages-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.repair.stages :as repair.stages]
   [metabase.lib.test-metadata :as meta]))

(deftest insert-stage-boundaries-adds-post-aggregation-stage-test
  (let [source     {:type "context" :ref "source"}
        operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                    ["expression" "Revenue K" ["/" ["aggregation-ref" 0] 1000]]]
        expected   [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                    ["append-stage"]
                    ["expression" "Revenue K" ["/" ["aggregation-ref" 0] 1000]]]]
    (is (= expected
           (repair.stages/insert-stage-boundaries source operations)))))

(deftest insert-stage-boundaries-respects-existing-boundaries-test
  (let [source     {:type "context" :ref "source"}
        operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                    ["append-stage"]
                    ["filter" [">" ["aggregation-ref" 0] 100]]]]
    (is (= operations
           (repair.stages/insert-stage-boundaries source operations)))))
