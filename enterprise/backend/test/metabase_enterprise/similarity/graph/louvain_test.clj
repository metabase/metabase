(ns metabase-enterprise.similarity.graph.louvain-test
  "Pure-Clojure unit tests for Louvain modularity-optimization. No DB; the
   reducible input is a vector of `{:u :v :w}` maps that `build-graph`
   consumes via `reduce`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.graph.louvain :as louvain]))

(set! *warn-on-reflection* true)

(defn- build [edges]
  (louvain/build-graph edges))

(defn- partition->by-comm [partition]
  (reduce-kv (fn [acc node cid]
               (update acc cid (fnil conj #{}) node))
             {}
             partition))

;; ---- tiny / degenerate cases ----------------------------------------------

(deftest empty-graph-test
  (let [g (build [])
        {:keys [partition modularity iterations]} (louvain/louvain g)]
    (is (= {} partition))
    (is (zero? modularity))
    (is (zero? iterations))))

(deftest single-edge-keeps-pair-together-test
  (let [g (build [{:u 1 :v 2 :w 1.0}])
        {:keys [partition]} (louvain/louvain g)
        comms (partition->by-comm partition)]
    (is (= 2 (count partition)))
    (is (= 1 (count comms))
        "two endpoints of the only edge belong to the same community")))

;; ---- two cliques bridged by a weak edge ------------------------------------

(deftest two-cliques-bridged-by-weak-edge-test
  (testing "K3 -- weak bridge -- K3 splits into two communities"
    (let [edges (concat
                 ;; left K3: nodes 1,2,3 — strong edges
                 [{:u 1 :v 2 :w 1.0}
                  {:u 1 :v 3 :w 1.0}
                  {:u 2 :v 3 :w 1.0}]
                 ;; right K3: nodes 4,5,6 — strong edges
                 [{:u 4 :v 5 :w 1.0}
                  {:u 4 :v 6 :w 1.0}
                  {:u 5 :v 6 :w 1.0}]
                 ;; bridge: 3 -- 4 — very weak
                 [{:u 3 :v 4 :w 0.001}])
          g     (build edges)
          {:keys [partition modularity]} (louvain/louvain g)
          comms (partition->by-comm partition)]
      (is (= 2 (count comms)) "expect exactly two communities")
      (is (or (= comms {0 #{1 2 3} 1 #{4 5 6}})
              (= comms {0 #{4 5 6} 1 #{1 2 3}}))
          "left and right cliques must each be a single community")
      (is (pos? modularity)))))

;; ---- disjoint cliques ------------------------------------------------------

(deftest disjoint-cliques-test
  (testing "two fully-disconnected K3s → two communities, well-defined Q > 0"
    (let [edges [{:u 1 :v 2 :w 1.0}
                 {:u 1 :v 3 :w 1.0}
                 {:u 2 :v 3 :w 1.0}
                 {:u 4 :v 5 :w 1.0}
                 {:u 4 :v 6 :w 1.0}
                 {:u 5 :v 6 :w 1.0}]
          g     (build edges)
          {:keys [partition modularity]} (louvain/louvain g)
          comms (partition->by-comm partition)]
      (is (= 2 (count comms)))
      (is (pos? modularity)))))

;; ---- determinism with seeded RNG -------------------------------------------

(deftest seeded-determinism-test
  (testing "same seed → identical partition + modularity"
    (let [edges [{:u 1 :v 2 :w 1.0}
                 {:u 1 :v 3 :w 1.0}
                 {:u 2 :v 3 :w 1.0}
                 {:u 4 :v 5 :w 1.0}
                 {:u 4 :v 6 :w 1.0}
                 {:u 5 :v 6 :w 1.0}
                 {:u 3 :v 4 :w 0.05}]
          g     (build edges)
          a     (louvain/louvain g :rng-seed 42)
          b     (louvain/louvain g :rng-seed 42)]
      (is (= (:partition a) (:partition b)))
      (is (== (:modularity a) (:modularity b))))))

;; ---- modularity computation directly --------------------------------------

(deftest modularity-of-perfect-partition-test
  (testing "perfect partition of K3+K3 has higher modularity than singleton split"
    (let [edges [{:u 1 :v 2 :w 1.0}
                 {:u 1 :v 3 :w 1.0}
                 {:u 2 :v 3 :w 1.0}
                 {:u 4 :v 5 :w 1.0}
                 {:u 4 :v 6 :w 1.0}
                 {:u 5 :v 6 :w 1.0}]
          g     (build edges)
          perfect    {1 0 2 0 3 0 4 1 5 1 6 1}
          singletons (zipmap [1 2 3 4 5 6] [0 1 2 3 4 5])
          one-blob   (zipmap [1 2 3 4 5 6] (repeat 0))]
      (is (> (louvain/modularity g perfect)
             (louvain/modularity g singletons)))
      (is (> (louvain/modularity g perfect)
             (louvain/modularity g one-blob))))))

;; ---- resolution knob -------------------------------------------------------

(deftest resolution-affects-community-count-test
  (testing "higher resolution → more (smaller) communities"
    (let [edges (concat
                 ;; three K3 islands connected by weak bridges
                 [{:u 1 :v 2 :w 1.0} {:u 1 :v 3 :w 1.0} {:u 2 :v 3 :w 1.0}]
                 [{:u 4 :v 5 :w 1.0} {:u 4 :v 6 :w 1.0} {:u 5 :v 6 :w 1.0}]
                 [{:u 7 :v 8 :w 1.0} {:u 7 :v 9 :w 1.0} {:u 8 :v 9 :w 1.0}]
                 ;; weak bridges between the three islands
                 [{:u 3 :v 4 :w 0.05}
                  {:u 6 :v 7 :w 0.05}])
          g     (build edges)
          low   (louvain/louvain g :resolution 0.1)
          high  (louvain/louvain g :resolution 2.0)
          low-c (count (set (vals (:partition low))))
          hi-c  (count (set (vals (:partition high))))]
      ;; Higher resolution should not yield FEWER communities than lower.
      (is (<= low-c hi-c)))))

;; ---- centrality -----------------------------------------------------------

(deftest within-community-centrality-test
  (testing "size-1/2 communities get reciprocal centrality; size-3+ get pagerank"
    (let [edges [{:u 1 :v 2 :w 1.0}
                 {:u 1 :v 3 :w 1.0}
                 {:u 2 :v 3 :w 1.0}
                 {:u 5 :v 6 :w 1.0}]
          g          (build edges)
          partition  {1 0 2 0 3 0 5 1 6 1}
          centrality (louvain/within-community-pagerank g partition)]
      (is (= #{1 2 3 5 6} (set (keys centrality))))
      (is (every? pos? (vals centrality)))
      (is (every? #(<= % 1.0) (vals centrality)))
      (is (== 0.5 (centrality 5)))
      (is (== 0.5 (centrality 6))))))

(deftest within-community-singleton-test
  (testing "isolated singleton gets centrality 1.0"
    (let [g          (build [{:u 1 :v 2 :w 1.0}])
          partition  {1 0 2 1}
          centrality (louvain/within-community-pagerank g partition)]
      (is (== 1.0 (centrality 1)))
      (is (== 1.0 (centrality 2))))))

;; ---- community-rows shape --------------------------------------------------

(deftest community-rows-shape-test
  (let [partition  {10 0 11 0 12 1}
        centrality {10 0.4 11 0.6 12 1.0}
        rows       (louvain/community-rows partition centrality :card "now")]
    (is (= 3 (count rows)))
    (is (every? #(= "card" (:scope %)) rows))
    (is (every? #(= :card  (:entity_type %)) rows))
    (is (every? #(integer? (:community_id %)) rows))
    (is (= "now" (-> rows first :computed_at)))))
