(ns metabase.transforms-base.ordering-test
  "Tests for pure graph algorithms in transforms-base."
  (:require
   [clojure.test :refer :all]
   [metabase.transforms-base.ordering :as transforms-base.ordering]))

(defn- rotations
  [v]
  (let [n (count v)
        elements (cycle v)]
    (into #{} (map #(take n (drop % elements)))
          (range n))))

(deftest find-cycle-test
  (let [test-graph
        {1 #{2}
         2 #{3 5}
         3 #{4}
         4 #{6}
         5 #{6}
         6 #{7}
         7 #{3}}
        cycles (rotations [3 4 6 7])]
    (is (contains? cycles
                   (transforms-base.ordering/find-cycle test-graph)))))

(deftest ^:parallel find-cycle-no-cycle-test
  (testing "returns nil for acyclic graph"
    (let [graph {1 #{2} 2 #{3} 3 #{}}]
      (is (nil? (transforms-base.ordering/find-cycle graph))))))

(deftest ^:parallel available-transforms-test
  (testing "returns transforms with no unmet dependencies"
    (let [ordering {1 #{} 2 #{1} 3 #{1 2}}]
      (is (= [1] (transforms-base.ordering/available-transforms ordering #{} #{})))
      (is (= [2] (transforms-base.ordering/available-transforms ordering #{} #{1})))
      (is (= [3] (transforms-base.ordering/available-transforms ordering #{} #{1 2})))))

  (testing "excludes running and completed transforms"
    (let [ordering {1 #{} 2 #{} 3 #{}}]
      (is (= [3] (transforms-base.ordering/available-transforms ordering #{1} #{2})))))

  (testing "returns empty when all blocked"
    (let [ordering {1 #{2} 2 #{1}}]
      (is (empty? (transforms-base.ordering/available-transforms ordering #{} #{}))))))
