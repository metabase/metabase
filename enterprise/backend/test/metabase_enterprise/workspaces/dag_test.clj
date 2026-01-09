(ns metabase-enterprise.workspaces.dag-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dag-abstract :as dag-abstract]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.app-db.core :as app-db]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures
  :once
  (fn [f]
    (mt/with-premium-features [:dependencies :transforms :workspaces]
      (mt/with-model-cleanup [:model/Dependency :model/Transform :model/Table]
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

(defn- transform? [kw] (= \x (first (name kw))))
(defn- table? [kw] (= \t (first (name kw))))
(defn- kw->id [kw] (parse-long (subs (name kw) 1)))

(defn- create-test-graph!
  "Create test transforms and tables from shorthand notation, returning id mappings.

   Shorthand uses keywords like :x1, :t2, :m3 where:
   - :x<n> is a transform
   - :t<n> is a table (source/generated)
   - :m<n> is a model (card)

   Returns a map from shorthand id to real database id, e.g. {:x1 123, :t2 456}

   NOTE: Caller should wrap in mt/with-model-cleanup for proper cleanup."
  [dependencies]
  (let [schema     (str/replace (str (random-uuid)) "-" "_")
        all-ids    (set (concat (keys dependencies)
                                (mapcat val dependencies)))
        transforms (filter transform? all-ids)
        driver     (t2/select-one-fn :engine [:model/Database :engine] (mt/id))
        normalize  #(sql.normalize/normalize-name driver %)
        tables     (filter table? all-ids)
        table-ids  (u/for-map [t tables]
                     [t (t2/insert-returning-pk! :model/Table
                                                 {:db_id  (mt/id)
                                                  :schema (some-> schema normalize)
                                                  :name   (normalize (str "test_table_" (kw->id t)))
                                                  :active true})])
        ;; Create transforms that reference their input tables
        tx-ids     (u/for-map [tx transforms]
                     (let [parent-tables (->> (get dependencies tx []) (filter table?) (map table-ids))
                           id            (t2/insert-returning-pk! :model/Transform
                                                                  {:name   (str "Test " (name tx))
                                                                   :source {:type  :query
                                                                            :query (if (seq parent-tables)
                                                                                     #_{:database (mt/id)
                                                                                        :type     :query
                                                                                        :query    {:source-table (first parent-tables)
                                                                                                   :joins        (for [pt (rest parent-tables)]
                                                                                                                   {:source-table pt
                                                                                                                    :condition    [:= 1 1]})}}
                                                                                     {:database (mt/id)
                                                                                      :type     :native
                                                                                      :native   {:query (->> (t2/select-fn-vec #(str (:schema %) "." (:name %))
                                                                                                                               [:model/Table :schema :name]
                                                                                                                               :id [:in parent-tables])
                                                                                                             (str/join ", ")
                                                                                                             (str "SELECT * FROM "))}}
                                                                                     {:database (mt/id)
                                                                                      :type     :native
                                                                                      :native   {:query "SELECT 1"}})}
                                                                   :target {:type     "table"
                                                                            :database (mt/id)
                                                                            :schema   schema
                                                                            :name     (str "test_table_" (kw->id tx))}})]
                       [tx id]))]

    ;; This is a workaround for the dependency between transforms and their output only being inserted on run.
    (doseq [[tx-kw tx-id] tx-ids]
      (app-db/update-or-insert! :model/Dependency
                                {:to_entity_type   "transform"
                                 :to_entity_id     tx-id
                                 :from_entity_type "table"
                                 :from_entity_id   (table-ids (keyword (str "t" (kw->id tx-kw))))}))

    (merge tx-ids table-ids)))

(defn- translate-result
  "Translate result from real IDs back to shorthand notation for easier comparison."
  [{:keys [inputs outputs entities dependencies] :as _result} id-map]
  (let [reverse-map (u/for-map [[k v] id-map] [v k])
        table->kw   (comp reverse-map :id)
        node->kw    (fn [{:keys [node-type id]}]
                      (reverse-map (case node-type
                                     :table (:id id)
                                     :external-transform id
                                     :workspace-transform (t2/select-one-fn :global_id [:model/WorkspaceTransform :global_id] :ref_id id))))]
    {:inputs       (into #{} (map table->kw) inputs)
     :outputs      (into #{} (map table->kw) outputs)
     :entities     (into #{} (map node->kw) entities)
     :dependencies (u/for-map [[child parents] dependencies]
                     [(node->kw child) (into #{} (map node->kw parents))])}))

;;;; Tests

(deftest path-induced-subgraph-shorthand-test
  (testing "graph built from shorthand matches abstract solver"
    (let [shorthand   {:x2 [:t1]}
          id-map      (create-test-graph! (dag-abstract/expand-shorthand shorthand))
          gtx         (t2/select-one :model/Transform (id-map :x2))]
      ;; TODO make this nice and declarative too
      (mt/with-temp [:model/Workspace          ws  {:name "Test Workspace", :database_id (mt/id)}
                     :model/WorkspaceTransform wtx (merge
                                                    (select-keys gtx [:name :source :target])
                                                    {:workspace_id (:id ws)
                                                     :global_id    (:id gtx)})]
        (ws.tu/analyze-workspace! (:id ws))
        (let [entity     {:entity-type :transform, :id (:ref_id wtx)}
              result     (ws.dag/path-induced-subgraph (:id ws) [entity])
              translated (translate-result result id-map)]
          (is (=? {:inputs       #{:t1}
                   :outputs      #{:t2}
                   :entities     #{:x2}
                   :dependencies {:x2 #{:t1}}}
                  translated)))))))

(deftest path-induced-subgraph-larger-test
  (testing "graph built from shorthand matches abstract solver"
    ;; check-outs x2, x4
    (let [shorthand   {:x1 [:t0]
                       :x2 [:x1, :t10]
                       :x3 [:x2, :t8]
                       :x4 [:x3]
                       :x5 [:x2, :x4, :t9]}
          id-map     (create-test-graph! (dag-abstract/expand-shorthand shorthand))
          gtx-2       (t2/select-one :model/Transform (id-map :x2))
          gtx-4       (t2/select-one :model/Transform (id-map :x4))
          fork        (fn [ws gtx]
                        (merge
                         (select-keys gtx [:name :source :target])
                         {:workspace_id (:id ws)
                          :global_id    (:id gtx)}))]
      ;; TODO make a convenience method / method for doing these checkouts too
      (mt/with-temp [:model/Workspace          ws    {:name "Test Workspace", :database_id (mt/id)}
                     :model/WorkspaceTransform wtx-2 (fork ws gtx-2)
                     :model/WorkspaceTransform wtx-4 (fork ws gtx-4)]
        (ws.tu/analyze-workspace! (:id ws))
        (let [entities   (for [wtx [wtx-2 wtx-4]]
                           {:entity-type :transform, :id (:ref_id wtx)})
              result     (ws.dag/path-induced-subgraph (:id ws) entities)
              translated (translate-result result id-map)]
          (is (=? {:inputs       #{:t1 :t8 :t10}
                   :outputs      #{:t2 :t3 :t4}
                   :entities     #{:x2 :x3 :x4}
                   :dependencies {:x2 #{:t1 :t10}
                                  :x3 #{:x2 :t8}
                                  :x4 #{:x3}}}
                  translated)))))))

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
                           :x3  []
                           :x4  [:t3]
                           :m6  [:t4])}
           (dag-abstract/path-induced-subgraph
            {:check-outs   #{:x3 :m6 :m10 :m13}
             :dependencies (dag-abstract/expand-shorthand example-graph)})))))

;;;; Card dependency detection tests

(deftest unsupported-dependency-no-transforms-test
  (testing "empty input returns nil"
    (is (nil? (ws.dag/unsupported-dependency? {})))
    (is (nil? (ws.dag/unsupported-dependency? {:transforms []})))))

(deftest unsupported-dependency-mbql-card-test
  #_(testing "transform with card dependencies are unsupported"
      (let [tx-with-no-dependencies               1
            ;; These tests transforms must seem pretty redundant - but it's intentional: we may relax them one case at
            ;; at time in the future.
            ;; ----------------------
            ;; We don't allow MBQL card dependencies, as we do not support re-mapping their references on execution.
            ;; This is only a problem if the card depends on a table that is shadowed in the isolated schema, but we
            ;; want to keep the semantics simple.
            tx-with-direct-mbql-card-dependency   2
            ;; Even a transitive dependency would need to be remapped.
            tx-with-indirect-mbql-card-dependency 3
            ;; In fact, we don't allow *any* card dependency for two reasons:
            ;; 1. We don't yet support reference re-mapping across entity references.
            ;; 2. It's an anti-pattern to build transforms on models, the relationship is intended to be the other way
            ;;    around.
            tx-with-sql-card-dependency           4]
        (is (= nil (ws.dag/unsupported-dependency? {:transforms [1]})))
        (is (= {:transforms [2 3 4]} (ws.dag/unsupported-dependency? {:transforms [1 2 3 4]}))))))

(deftest collapse-test
  (is (= {:x1 [:x2 :x3]
          :x2 [:t3]
          :x3 [:x5]
          :x4 []
          :x5 []}
         (#'ws.dag/collapse
          table?
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
  (when (transform? kw)
    (keyword (str "t" (kw->id kw)))))

(defn- solve-in-memory [init-nodes graph]
  (let [tx-nodes (filter transform? init-nodes)
        tables   (map tx->table tx-nodes)]
    (#'ws.dag/path-induced-subgraph*
     ;; Include all changeset targets in the init-nodes
     (distinct (into init-nodes tables))
     {:node-parents (dag-abstract/expand-shorthand graph)
      :table?       table?
      :table-sort   kw->id
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
