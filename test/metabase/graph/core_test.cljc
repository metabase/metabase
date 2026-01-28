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

(defn- assert-keep-children-order
  ([expected input]
   (assert-keep-children-order expected input identity))
  ([expected input recur?]
   (is (= expected
          (graph/keep-children recur? input)))))

(deftest ^:parallel keep-children-handles-simple-parents-test
  (testing "keep-children puts parents before children"
    (assert-keep-children-order
     [[:card 4] [:card 3] [:card 2]]
     {[:card 4] #{[:card 3]}
      [:card 3] #{[:card 2]}})))

(deftest ^:parallel keep-children-sorts-nodes-at-same-level-test
  (testing "keep-children sorts sibling nodes"
    (assert-keep-children-order
     [[:card 6] [:card 2] [:card 4] [:card 7] [:card 3] [:card 5]]
     {[:card 6] #{[:card 2]
                  [:card 4]}
      [:card 7] #{[:card 3]
                  [:card 5]}})))

(deftest ^:parallel keep-children-handles-multiple-parents-test
  (testing "keep-children handles children with multiple parents"
    (assert-keep-children-order
     [[:card 2] [:card 4] [:card 3]]
     {[:card 2] #{[:card 3]
                  [:card 4]}
      [:card 4] #{[:card 3]}})))

(deftest ^:parallel keep-children-ignores-children-when-asked-test
  (testing "keep-children ignores children when asked"
    (assert-keep-children-order
     [[:card 2] [:card 3] [:card 4]]
     {[:card 2] #{[:card 3]
                  [:card 4]}
      [:card 5] #{[:card 6]
                  [:card 7]}}
     (fn [node]
       (if (= node [:card 5])
         ::graph/stop
         node)))))

(deftest ^:parallel keep-children-recurses-through-nodes-test
  (testing "keep-children ignores nil values while recursing through the node"
    (assert-keep-children-order
     [[:card 3] [:card 4]]
     {[:segment 2] #{[:card 3]
                     [:card 4]}}
     (fn [[node-type _node-id :as node]]
       (when (= node-type :card)
         node)))))

(deftest ^:parallel transitive-children-of-test
  (testing "transitive-children-of returns basic graph unchanged"
    (let [nodes {1 #{2}
                 2 #{3}
                 3 #{}}]
      (is (= nodes
             (graph/transitive-children-of (graph/in-memory nodes)
                                           [1]))))))

(deftest ^:parallel transitive-children-of-only-returns-connected-nodes-test
  (testing "transitive-children-of only returns connected graph nodes"
    (let [nodes {1 #{2}
                 2 #{3}
                 3 #{}
                 4 #{5}
                 5 #{}}]
      (is (= {1 #{2}
              2 #{3}
              3 #{}}
             (graph/transitive-children-of (graph/in-memory nodes)
                                           [1]))))))

(deftest ^:parallel transitive-children-of-accepts-multiple-starts-test
  (testing "transitive-children-of accepts multiple start nodes"
    (let [nodes {1 #{2}
                 2 #{3}
                 3 #{}
                 4 #{5}
                 5 #{}}]
      (is (= nodes
             (graph/transitive-children-of (graph/in-memory nodes)
                                           [1 4]))))))

(deftest ^:parallel filtered-graph-test
  (testing "filtered-graph does the thing"
    (let [g (graph/in-memory {1 #{2}
                              2 #{3 5}
                              3 #{4}})]
      (is (= {1 #{2}
              2 #{3}
              3 #{}}
             (graph/children-of (graph/filtered-graph g #(<= % 3))
                                [1 2 3]))))))
