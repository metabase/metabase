(ns metabase-enterprise.workspaces.dag-test
  (:require
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dag-abstract :as dag-abstract]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures
  :once
  (fn [f]
    (mt/with-premium-features [:dependencies :transforms :workspaces]
      (mt/with-model-cleanup [:model/Dependency :model/Transform :model/Table :model/Workspace]
        (f)))))

;;;; Example graphs for testing

(def ^:private example-graph
  {:x3  [:x1 :t2]
   :x4  [:x3]
   :m6  [:x4 :t5]
   :m10 [:t9]
   :x11 [:m10]
   :m12 [:x11]
   :m13 [:x11 :m12]})

;;;; Test data helpers

(defn- translate-result
  "Translate result from real IDs back to shorthand notation for easier comparison."
  [workspace-id {:keys [inputs outputs entities dependencies] :as _result} id-map]
  (let [reverse-map (u/for-map [[k v] id-map] [v k])
        table->kw   (comp reverse-map :id)
        node->kw    (fn [{:keys [node-type id]}]
                      (reverse-map (case node-type
                                     :table (:id id)
                                     :external-transform id
                                     :workspace-transform (t2/select-one-fn :global_id [:model/WorkspaceTransform :global_id]
                                                                            :workspace_id workspace-id :ref_id id))))]
    {:inputs       (into #{} (map table->kw) inputs)
     :outputs      (into #{} (map table->kw) outputs)
     :entities     (into #{} (map node->kw) entities)
     :dependencies (u/for-map [[child parents] dependencies]
                     [(node->kw child) (into #{} (map node->kw parents))])}))

;;;; Tests

(deftest path-induced-subgraph-shorthand-test
  (testing "graph built from shorthand matches abstract solver"
    (let [{:keys [workspace-id global-map workspace-map]}
          (ws.tu/create-resources!
           {:global    {:x2 [:t1]}
            :workspace {:checkouts [:x2]}})]
      (ws.tu/analyze-workspace! workspace-id)
      (let [entity     {:entity-type :transform, :id (workspace-map :x2)}
            result     (ws.dag/path-induced-subgraph workspace-id [entity])
            translated (translate-result workspace-id result global-map)]
        (is (=? {:inputs       #{:t1}
                 :outputs      #{:t2}
                 :entities     #{:x2}
                 :dependencies {:x2 #{:t1}}}
                translated))))))

(deftest path-induced-subgraph-larger-test
  (testing "graph built from shorthand matches abstract solver"
    ;; check-outs x2, x4
    (let [{:keys [workspace-id global-map workspace-map]}
          (ws.tu/create-resources!
           {:global    {:x1 [:t0]
                        :x2 [:x1 :t10]
                        :x3 [:x2 :t8]
                        :x4 [:x3]
                        :x5 [:x2 :x4 :t9]}
            :workspace {:checkouts [:x2 :x4]}})]
      (ws.tu/analyze-workspace! workspace-id)
      (let [entities   (for [tx [:x2 :x4]]
                         {:entity-type :transform, :id (workspace-map tx)})
            result     (ws.dag/path-induced-subgraph workspace-id entities)
            translated (translate-result workspace-id result global-map)]
        (is (=? {:inputs       #{:t1 :t8 :t10}
                 :outputs      #{:t2 :t3 :t4}
                 :entities     #{:x2 :x3 :x4}
                 :dependencies {:x2 #{:t1 :t10}
                                :x3 #{:x2 :t8}
                                :x4 #{:x3}}}
                translated))))))

(deftest expand-solver-test
  (testing "expand-shorthand inserts interstitial nodes for transform output tables"
    (is (= {:t1  [:x1]
            :x3  [:t1 :t2]
            :t3  [:x3]
            :x4  [:t3]
            :t4  [:x4]
            :m6  [:t4 :t5]
            :m10 [:t9]
            :x11 [:m10]
            :t11 [:x11]
            :m12 [:t11]
            :m13 [:t11 :m12]}
           (dag-abstract/expand-shorthand example-graph)))))

(deftest abstract-path-induced-subgraph-test
  (testing "path-induced-subgraph computes correct result for example graph"
    (is (= {:check-outs   [:x3 :m6 :m10 :m13]
            :inputs       [:t1 :t2 :t5 :t9]
            :tables       [:t3 :t4 :t11]
            :transforms   [:x3 :x4 :x11]
            :entities     [:x3 :x4 :m6 :m10 :x11 :m12 :m13]
            :dependencies (ordered-map/ordered-map
                           :m10 []
                           :x11 [:m10]
                           :m12 [:t11]
                           :m13 [:t11 :m12]
                           :x3 []
                           :x4 [:t3]
                           :m6 [:t4])}
           (dag-abstract/path-induced-subgraph
            {:check-outs   #{:x3 :m6 :m10 :m13}
             :dependencies (dag-abstract/expand-shorthand example-graph)})))))

;;;; Graph utility tests

(deftest reverse-graph-test
  (testing "empty graph"
    (is (= {} (ws.dag/reverse-graph {}))))

  (testing "single edge"
    (is (= {:a [:b]}
           (ws.dag/reverse-graph {:b [:a]}))))

  (testing "chain graph - reverses direction"
    (is (= {:a [:b], :b [:c], :c [:d]}
           (ws.dag/reverse-graph {:b [:a], :c [:b], :d [:c]}))))

  (testing "diamond graph - a -> b -> d, a -> c -> d"
    (is (= {:a [:b :c], :b [:d], :c [:d]}
           (ws.dag/reverse-graph {:b [:a], :c [:a], :d [:b :c]}))))

  (testing "multiple parents become multiple children - x has parents [a b c] => a, b, c each get child x"
    (is (= {:a [:x], :b [:x], :c [:x]}
           (ws.dag/reverse-graph {:x [:a :b :c]})))))

(deftest bfs-reduce-test
  (testing "empty adjacency returns empty"
    (is (= [] (ws.dag/bfs-reduce {} [:a]))))

  (testing "no neighbors returns empty"
    (is (= [] (ws.dag/bfs-reduce {:a []} [:a]))))

  (testing "single hop"
    (is (= [:b :c]
           (ws.dag/bfs-reduce {:a [:b :c]} [:a]))))

  (testing "chain traversal - collects all reachable nodes"
    (let [graph {:a [:b], :b [:c], :c [:d], :d []}]
      (is (= [:b :c :d] (ws.dag/bfs-reduce graph [:a])))
      (is (= [:c :d] (ws.dag/bfs-reduce graph [:b])))
      (is (= [:d] (ws.dag/bfs-reduce graph [:c])))
      (is (= [] (ws.dag/bfs-reduce graph [:d])))))

  (testing "diamond graph - no duplicates (a -> b -> d, a -> c -> d)"
    (let [graph {:a [:b :c], :b [:d], :c [:d], :d []}]
      (is (= [:b :c :d] (ws.dag/bfs-reduce graph [:a])))))

  (testing "works with map nodes (like workspace transform nodes)"
    (let [tx1 {:node-type :workspace-transform :id "tx1"}
          tx2 {:node-type :workspace-transform :id "tx2"}
          tx3 {:node-type :workspace-transform :id "tx3"}
          tbl {:node-type :table :id {:db 1 :schema "public" :table "foo"}}
          graph {tx1 [tx2 tbl], tx2 [tx3], tx3 [], tbl []}]
      (is (= [tx2 tbl tx3] (ws.dag/bfs-reduce graph [tx1])))
      (is (= [tx3] (ws.dag/bfs-reduce graph [tx2])))))

  (testing "handles cycles gracefully - a -> b -> c -> a (cycle), should not infinite loop"
    (let [graph {:a [:b], :b [:c], :c [:a]}]
      (is (= [:b :c :a] (ws.dag/bfs-reduce graph [:a])))))

  (testing "include-start? option"
    (let [graph {:a [:b], :b [:c], :c []}]
      (is (= [:a :b :c] (ws.dag/bfs-reduce graph [:a] :include-start? true)))
      (is (= [:b :c] (ws.dag/bfs-reduce graph [:a] :include-start? false)))))

  (testing "multiple start nodes"
    (let [graph {:a [:x], :b [:y], :x [], :y []}]
      (is (= [:x :y] (ws.dag/bfs-reduce graph [:a :b])))
      (is (= [:a :b :x :y] (ws.dag/bfs-reduce graph [:a :b] :include-start? true)))))

  (testing "traverses through different node types"
    (let [tx1 {:node-type :workspace-transform :id "tx1"}
          tx2 {:node-type :workspace-transform :id "tx2"}
          ext {:node-type :external-transform :id "ext"}
          graph {tx1 [ext], ext [tx2], tx2 []}]
      (is (= [ext tx2] (ws.dag/bfs-reduce graph [tx1])))))

  (testing "custom :init collects into a set"
    (let [graph {:a [:b :c], :b [:d], :c [:d], :d []}]
      (is (= #{:b :c :d} (ws.dag/bfs-reduce graph [:a] :init #{})))
      (is (= #{:a :b :c :d} (ws.dag/bfs-reduce graph [:a] :init #{} :include-start? true)))))

  (testing "custom :rf filters during traversal"
    (let [tx1 {:node-type :workspace-transform :id "t1"}
          tx2 {:node-type :workspace-transform :id "t2"}
          tbl {:node-type :table :id "tbl"}
          graph {tx1 [tx2 tbl], tx2 [], tbl []}
          xf (keep #(when (= :workspace-transform (:node-type %)) (:id %)))]
      (is (= ["t2"] (ws.dag/bfs-reduce graph [tx1] :rf (xf conj)))))))

(deftest collapse-test
  (is (= {:x1 [:x2 :x3]
          :x2 [:t3]
          :x3 [:x5]
          :x4 []
          :x5 []}
         (#'ws.dag/collapse
          ws.tu/mock-table?
          {:x1 [:t1 :t2]
           :t1 [:x2]
           :t2 [:x3]
           :x2 [:t3]
           :x3 [:t4]
           :t4 [:x5]
           :t5 [:x4]
           :x4 []
           :x5 []}))))

(defn tx->table [kw]
  (when (ws.tu/transform? kw)
    (keyword (str "t" (ws.tu/kw->id kw)))))

(defn- solve-in-memory [init-nodes graph]
  (let [tx-nodes (filter ws.tu/transform? init-nodes)
        tables   (map tx->table tx-nodes)]
    (#'ws.dag/path-induced-subgraph*
      ;; Include all changeset targets in the init-nodes
     (distinct (into init-nodes tables))
     {:node-parents (dag-abstract/expand-shorthand graph)
      :table?       ws.tu/mock-table?
      :table-sort   ws.tu/kw->id
      :unwrap-table identity})))

(defn- chain->deps [chain]
  (reduce
   (fn [deps [from to]]
     (assoc deps from [to]))
   {}
   (partition 2 1 (reverse chain))))

(deftest in-memory-path-induced-subgraph-test
  (testing "singleton"
    (is (= {:inputs       [:t1]
            :outputs      [:t2]
            :entities     [:x2]
            :dependencies {:x2 [:t1]}}
           (solve-in-memory [:x2] {:x2 [:t1]}))))

  (testing "encloses middle of a chain"
    (is (= {:inputs       [:t1]
            :outputs      [:t2 :t3 :t4]
            :entities     [:x2 :x3 :x4]
            :dependencies {:x2 [:t1]
                           :x3 [:x2]
                           :x4 [:x3]}}
           (solve-in-memory [:x2 :x4] (chain->deps [:x1 :x2 :x3 :x4 :x5])))))

  (testing "larger graph"
    (is (= {:inputs       [:t1 :t2 :t5 :t9]
            :outputs      [:t3 :t4 :t11]
            :entities     [:m10 :x11 :m12 :m13 :x3 :x4 :m6]
            :dependencies {:m10 [:t9]
                           :m12 [:x11]
                           :m13 [:m12 :x11]
                           :m6  [:x4 :t5]
                           :x11 [:m10]
                           :x3  [:t2 :t1]
                           :x4  [:x3]}}
           (solve-in-memory
            [:x3 :m6 :m10 :m13]
            {:x3  [:x1 :t2]
             :x4  [:x3]
             :m6  [:x4 :t5]
             :m10 [:t9]
             :x11 [:m10]
             :m12 [:x11]
             :m13 [:x11 :m12]})))))
