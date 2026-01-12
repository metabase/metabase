(ns metabase.graph.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.graph.core :as graph]))

(deftest ^:parallel find-cycle-test
  (testing "no cycle in simple graph"
    (let [g (graph/in-memory {1 #{2}
                              2 #{3}
                              3 #{}})]
      (is (nil? (graph/find-cycle g [1])))))

  (testing "no cycle with multiple paths to same node"
    (let [g (graph/in-memory {1 #{2 3}
                              2 #{4}
                              3 #{4}
                              4 #{}})]
      (is (nil? (graph/find-cycle g [1])))))

  (testing "self-loop is a cycle"
    (let [g (graph/in-memory {1 #{1}})]
      (is (= [1 1] (graph/find-cycle g [1])))))

  (testing "direct cycle between two nodes"
    (let [g (graph/in-memory {1 #{2}
                              2 #{1}})]
      (is (= [1 2 1] (graph/find-cycle g [1])))))

  (testing "longer cycle"
    (let [g (graph/in-memory {1 #{2}
                              2 #{3}
                              3 #{1}})]
      (is (= [1 2 3 1] (graph/find-cycle g [1])))))

  (testing "cycle not reachable from start"
    (let [g (graph/in-memory {1 #{2}
                              2 #{}
                              3 #{4}
                              4 #{3}})]
      ;; Starting from 1, we can't reach the 3->4->3 cycle
      (is (nil? (graph/find-cycle g [1])))))

  (testing "multiple start nodes - finds cycle from any"
    (let [g (graph/in-memory {1 #{}
                              2 #{3}
                              3 #{2}})]
      (is (= [2 3 2] (graph/find-cycle g [1 2])))))

  (testing "cycle path excludes prefix before cycle"
    ;; Graph: 1 -> 2 -> 3 -> 2 (cycle is 2 -> 3 -> 2, prefix is 1)
    (let [g (graph/in-memory {1 #{2}
                              2 #{3}
                              3 #{2}})]
      ;; The cycle-path should be [2 3 2], not [1 2 3 2]
      (is (= [2 3 2] (graph/find-cycle g [1]))))))
