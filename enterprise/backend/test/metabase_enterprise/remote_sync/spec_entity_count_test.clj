(ns metabase-enterprise.remote-sync.spec-entity-count-test
  "Tests of `spec/exportable-entity-count`. No app DB."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.spec :as spec]))

(set! *warn-on-reflection* true)

(deftest ^:parallel exportable-entity-count-test
  (testing "exportable-entity-count sums the ids across every model in the targets map"
    (is (= 0 (spec/exportable-entity-count {})))
    (is (= 5 (spec/exportable-entity-count {"Card" [1 2 3] "Collection" [4 5]})))))
