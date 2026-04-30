(ns metabase-enterprise.similarity.graph.pagerank-test
  "Pure-Clojure unit tests for the power-iteration PageRank. No DB; graphs
   are constructed inline as adjacency maps."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.graph.pagerank :as pagerank]))

(set! *warn-on-reflection* true)

(defn- approx=
  ([a b] (approx= a b 1e-6))
  ([a b eps] (< (Math/abs (- (double a) (double b))) (double eps))))

(defn- close-to-uniform? [scores eps]
  (let [n   (count scores)
        avg (/ 1.0 n)]
    (every? #(approx= % avg eps) (vals scores))))

(defn- sum-scores [scores]
  (reduce + 0.0 (vals scores)))

;; ---- helpers ---------------------------------------------------------------

(defn- mk-graph
  "Build a graph map directly. `out-edges` shape: `{from {to weight}}`. Nodes
   are inferred from edge endpoints."
  [out-edges]
  {:out-edges out-edges
   :all-nodes (vec (sort (into (set (keys out-edges))
                               (mapcat keys (vals out-edges)))))
   :scope     :card})

;; ---- empty / single-node ---------------------------------------------------

(deftest empty-graph-returns-empty-scores-test
  (let [{:keys [scores converged? iterations]}
        (pagerank/pagerank {:out-edges {} :all-nodes [] :scope :card})]
    (is (= {} scores))
    (is (true? converged?))
    (is (zero? iterations))))

(deftest single-node-test
  (let [{:keys [scores converged?]} (pagerank/pagerank (mk-graph {1 {}}))]
    (is (true? converged?))
    (is (approx= 1.0 (sum-scores scores)))
    (is (approx= 1.0 (get scores 1)))))

;; ---- triangle, weighted, hub -----------------------------------------------

(deftest triangle-uniform-test
  (testing "K3 with uniform weights → all three nodes converge to 1/3"
    (let [g (mk-graph {1 {2 1.0 3 1.0}
                       2 {1 1.0 3 1.0}
                       3 {1 1.0 2 1.0}})
          {:keys [scores]} (pagerank/pagerank g)]
      (is (approx= 1.0 (sum-scores scores) 1e-5))
      (is (close-to-uniform? scores 1e-5)))))

(deftest spider-hub-dominates-test
  (testing "1 hub + 5 leaves with mutual edges → hub strictly higher than leaves"
    (let [out (-> {0 (zipmap (range 1 6) (repeat 1.0))}
                  (into (map (fn [leaf] [leaf {0 1.0}])) (range 1 6)))
          g   (mk-graph out)
          {:keys [scores]} (pagerank/pagerank g)
          hub-pr   (get scores 0)
          leaf-prs (mapv #(get scores %) (range 1 6))]
      (is (every? #(> hub-pr %) leaf-prs)
          (str "hub PR " hub-pr " should beat each leaf PR " (vec leaf-prs)))
      (is (approx= 1.0 (sum-scores scores) 1e-5)))))

(deftest weighted-asymmetric-test
  (testing "A→B weight 5 vs A→C weight 1 → PR(B) > PR(C)"
    (let [g (mk-graph {:a {:b 5.0 :c 1.0}
                       :b {:a 1.0}
                       :c {:a 1.0}})
          {:keys [scores]} (pagerank/pagerank g)]
      (is (> (get scores :b) (get scores :c))))))

;; ---- two-node directed -----------------------------------------------------

(deftest two-node-directed-converges-test
  (testing "a→b only — b accumulates flow, both finite"
    (let [g (mk-graph {1 {2 1.0} 2 {}})
          {:keys [scores converged?]} (pagerank/pagerank g)]
      (is (true? converged?))
      (is (approx= 1.0 (sum-scores scores) 1e-5))
      (is (> (get scores 2) (get scores 1))))))

;; ---- disconnected components ----------------------------------------------

(deftest disconnected-components-mass-conservation-test
  (testing "two disjoint K2 components — mass sums per component, total = 1"
    (let [g (mk-graph {1 {2 1.0} 2 {1 1.0}
                       3 {4 1.0} 4 {3 1.0}})
          {:keys [scores]} (pagerank/pagerank g)
          c1 (+ (get scores 1) (get scores 2))
          c2 (+ (get scores 3) (get scores 4))]
      (is (approx= 1.0 (sum-scores scores) 1e-5))
      (is (approx= 0.5 c1 1e-5))
      (is (approx= 0.5 c2 1e-5)))))

;; ---- determinism -----------------------------------------------------------

(deftest determinism-test
  (testing "same input → byte-identical scores across runs"
    (let [g (mk-graph {1 {2 0.7 3 0.3}
                       2 {1 1.0 3 0.5}
                       3 {1 0.4}
                       4 {1 1.0}})
          a (:scores (pagerank/pagerank g))
          b (:scores (pagerank/pagerank g))]
      (is (= a b)))))

;; ---- convergence bound -----------------------------------------------------

(deftest convergence-iterations-test
  (testing "real-shaped graphs converge well under default 100-iter cap"
    (let [g (mk-graph {:a {:b 1.0 :c 1.0}
                       :b {:c 1.0 :d 1.0}
                       :c {:a 1.0 :e 1.0}
                       :d {:e 1.0}
                       :e {:a 1.0}})
          {:keys [iterations converged?]} (pagerank/pagerank g)]
      (is (true? converged?))
      (is (< iterations 50)))))

;; ---- polymorphic node IDs --------------------------------------------------

(deftest polymorphic-node-ids-test
  (testing "node ids may be vector pairs (e.g. [:card 1]) for :full scope"
    (let [g {:out-edges {[:card 1] {[:card 2] 1.0 [:dashboard 7] 0.5}
                         [:card 2] {[:card 1] 1.0}
                         [:dashboard 7] {[:card 1] 1.0}}
             :all-nodes (vec (sort [[:card 1] [:card 2] [:dashboard 7]]))
             :scope     :full}
          {:keys [scores]} (pagerank/pagerank g)]
      (is (approx= 1.0 (sum-scores scores) 1e-5))
      (is (every? scores (:all-nodes g))))))

;; ---- ranked-rows shape -----------------------------------------------------

(deftest ranked-rows-dense-rank-test
  (testing "ranked-rows assigns 1-based dense ranks, score-desc with id tiebreak"
    (let [scores {1 0.3 2 0.5 3 0.1 4 0.1}
          rows   (pagerank/ranked-rows scores :card "now")]
      (is (= [2 1 3 4] (mapv :entity_id rows)))
      (is (= [1 2 3 4] (mapv :rank rows)))
      (is (every? #(= "card" (:scope %)) rows))
      (is (every? #(= :card  (:entity_type %)) rows)))))

(deftest ranked-rows-full-scope-uses-pair-keys-test
  (testing ":full scope nodes are [type id] pairs; entity_type follows the type"
    (let [scores {[:card 1] 0.4 [:dashboard 9] 0.3}
          rows   (pagerank/ranked-rows scores :full "now")]
      (is (= ["full" "full"] (mapv :scope rows)))
      (is (= #{:card :dashboard} (set (mapv :entity_type rows))))
      (is (= #{1 9} (set (mapv :entity_id rows))))
      (is (= [1 2] (sort (mapv :rank rows)))))))
