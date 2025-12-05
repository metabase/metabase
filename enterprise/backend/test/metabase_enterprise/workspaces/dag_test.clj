(ns metabase-enterprise.workspaces.dag-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase-enterprise.dependencies.models.dependency :as deps]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dag-abstract :as dag-abstract]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :all (fn [f] (mt/with-premium-features [:dependencies :transforms :workspaces] (f))))

;;;; Example graphs for testing

(def ^:private example
  {:check-outs   #{:x3 :m6 :m10 :m13}
   :dependencies {:x3  [:x1 :t2]
                  :x4  [:x3]
                  :m6  [:x4 :t5]
                  :m10 [:t9]
                  :x11 [:m10]
                  :m12 [:x11]
                  :m13 [:x11 :m12]}})

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
  [{:keys [check-outs dependencies]}]
  (let [schema     (str/replace (str (random-uuid)) "-" "_")
        all-ids    (set (concat (keys dependencies)
                                (mapcat val dependencies)
                                check-outs))
        transforms (filter transform? all-ids)
        tables     (filter table? all-ids)
        table-ids  (u/for-map [t tables]
                     [t (t2/insert-returning-pk! :model/Table
                                                 {:db_id  (mt/id)
                                                  :schema schema
                                                  :name   (str "test_table_" (kw->id t))
                                                  :active true})])
        ;; Create transforms that reference their input tables
        tx-ids     (u/for-map [tx transforms]
                     (let [parent-tables (->> (get dependencies tx []) (filter table?) (map table-ids))
                           id            (t2/insert-returning-pk! :model/Transform
                                                                  {:name   (str "Test " (name tx))
                                                                   :source {:type  :query
                                                                            :query (if (seq parent-tables)
                                                                                     {:database (mt/id)
                                                                                      :type     :query
                                                                                      :query    {:source-table (first parent-tables)
                                                                                                 :joins        (for [pt (rest parent-tables)]
                                                                                                                 {:source-table pt
                                                                                                                  :condition    [:= 1 1]})}}
                                                                                     {:database (mt/id)
                                                                                      :type     :native
                                                                                      :native   {:query "SELECT 1"}})}
                                                                   :target {:type     "table"
                                                                            :database (mt/id)
                                                                            :schema   schema
                                                                            :name     (str "test_table_" (kw->id tx))}})]
                       [tx id]))]

    ;; TODO This is a workaround for the dependency between transforms and their output only being inserted on run.
    ;;      We will need to do something about this when we mirror as well - ideally the deps module would "just work"
    (doseq [[tx-kw tx-id] tx-ids]
      (t2/insert! :model/Dependency
                  {:from_entity_type "table"
                   :from_entity_id   (table-ids (keyword (str "t" (kw->id tx-kw))))
                   :to_entity_type   "transform"
                   :to_entity_id     tx-id}))

    (merge tx-ids table-ids)))

(defn- translate-result
  "Translate result from real IDs back to shorthand notation for easier comparison."
  [result id-map]
  (let [reverse-map (u/for-map [[k v] id-map] [v k])
        translate   (fn [{:keys [id]}] (get reverse-map id))]
    (-> (reduce (fn [m k] (update m k #(set (map translate %))))
                result
                [:check-outs :inputs :outputs :transforms])
        (update :dependencies
                (fn [deps]
                  (into {}
                        (map (fn [[k v]]
                               [(translate k) (set (map translate v))]))
                        deps))))))

;;;; Tests

(deftest path-induced-subgraph-basic-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-temp [:model/Transform tx {:name "Test Transform"}]
      (let [table-id (mt/id :orders)]
        ;; Set up: transform depends on orders table
        (deps/replace-dependencies! "transform" (:id tx) {"table" #{table-id}})

        (testing "single transform returns correct subgraph"
          (let [result (ws.dag/path-induced-subgraph {:transforms [(:id tx)]})]
            (is (= [{:id (:id tx) :type :transform}] (:check-outs result)))
            (is (= [{:id (:id tx) :type :transform}] (:transforms result)))
            ;; Input should be the orders table
            (is (some #(= table-id (:id %)) (:inputs result)))))))))

(deftest path-induced-subgraph-chain-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-model-cleanup [:model/Transform :model/Dependency]
      (mt/with-temp [:model/Transform tx1 {:name "Transform 1"}
                     :model/Transform tx2 {:name "Transform 2"}
                     :model/Transform tx3 {:name "Transform 3"}]
        (let [table-id (mt/id :orders)]
          ;; Chain: orders -> tx1 -> tx2 -> tx3
          (deps/replace-dependencies! "transform" (:id tx1) {"table" #{table-id}})
          (deps/replace-dependencies! "transform" (:id tx2) {"transform" #{(:id tx1)}})
          (deps/replace-dependencies! "transform" (:id tx3) {"transform" #{(:id tx2)}})

          (testing "middle transform includes upstream and downstream"
            (let [result (ws.dag/path-induced-subgraph {:transforms [(:id tx2)]})]
              ;; tx2 is checked out
              (is (= [{:id (:id tx2) :type :transform}] (:check-outs result)))
              ;; Should include tx1 (upstream) and tx3 (downstream) since tx2 is on path between them
              ;; Actually no - tx2 is the only thing checked out, so we only get what's on paths through tx2
              ;; tx1 -> tx2 -> tx3 means tx2 has tx1 upstream and tx3 downstream
              ;; The intersection is just tx2 itself
              (is (= #{{:id (:id tx2) :type :transform}} (set (:transforms result)))))))))))

(deftest path-induced-subgraph-diamond-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-model-cleanup [:model/Transform :model/Dependency]
      (testing "diamond dependency pattern"
        ;; Create: t1 -> x1 -> t2
        ;;              \-> x2 -> t3
        ;;         both x1 and x2 depend on t1
        ;;         if we check out x1 and x2, we should get both
        (mt/with-temp [:model/Transform tx1 {:name "Transform 1"}
                       :model/Transform tx2 {:name "Transform 2"}]
          (let [source-table (mt/id :orders)]
            (deps/replace-dependencies! "transform" (:id tx1) {"table" #{source-table}})
            (deps/replace-dependencies! "transform" (:id tx2) {"table" #{source-table}})

            (let [result (ws.dag/path-induced-subgraph {:transforms [(:id tx1) (:id tx2)]})]
              (is (= 2 (count (:check-outs result))))
              (is (= 2 (count (:transforms result)))))))))))

(deftest upstream-entities-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-model-cleanup [:model/Transform :model/Dependency]
      (mt/with-temp [:model/Transform tx1 {:name "Transform 1"}
                     :model/Transform tx2 {:name "Transform 2"}]
        (let [table-id (mt/id :orders)]
          (deps/replace-dependencies! "transform" (:id tx1) {"table" #{table-id}})
          (deps/replace-dependencies! "transform" (:id tx2) {"transform" #{(:id tx1)}})

          (testing "upstream includes transitive dependencies"
            (let [upstream (#'ws.dag/upstream-entities {:transforms [(:id tx2)]})]
              (is (contains? upstream {:id (:id tx2) :type :transform}))
              (is (contains? upstream {:id (:id tx1) :type :transform}))
              (is (contains? upstream {:id table-id :type :table})))))))))

(deftest downstream-entities-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-model-cleanup [:model/Transform :model/Dependency]
      (mt/with-temp [:model/Transform tx1 {:name "Transform 1"}
                     :model/Transform tx2 {:name "Transform 2"}]
        (deps/replace-dependencies! "transform" (:id tx2) {"transform" #{(:id tx1)}})

        (testing "downstream includes transitive dependents"
          (let [downstream (#'ws.dag/downstream-entities {:transforms [(:id tx1)]})]
            (is (contains? downstream {:id (:id tx1) :type :transform}))
            (is (contains? downstream {:id (:id tx2) :type :transform}))))))))

(deftest path-induced-subgraph-shorthand-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-model-cleanup [:model/Table :model/Transform :model/Dependency]
      (testing "graph built from shorthand matches abstract solver"
        (let [shorthand  {:check-outs   #{:x1}
                          :dependencies {:x1 [:t1]}}
              id-map     (create-test-graph! shorthand)
              result     (ws.dag/path-induced-subgraph {:transforms [(id-map :x1)]})
              translated (translate-result result id-map)]
          ;; Check-outs should be :x1
          (is (= #{:x1} (:check-outs translated)))
          ;; Transforms should be :x1
          (is (= #{:x1} (:transforms translated)))
          ;; Inputs should be :t1
          (is (contains? (:inputs translated) :t1)))))))

(deftest path-induced-subgraph-larger-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-model-cleanup [:model/Table :model/Transform :model/Dependency]
      (testing "graph built from shorthand matches abstract solver"
        (let [shorthand  {:check-outs   #{:x2, :x4}
                          :dependencies {:x1 [:t0]
                                         :x2 [:x1, :t10]
                                         :x3 [:x2, :t8]
                                         :x4 [:x3]
                                         :x5 [:x2, :x4, :t9]}}
              id-map     (create-test-graph! (dag-abstract/expand-shorthand shorthand))
              result     (ws.dag/path-induced-subgraph {:transforms (mapv id-map (:check-outs shorthand))})
              translated (translate-result result id-map)]
          (is (=? {:check-outs   #{:x2, :x4}
                   :transforms   #{:x2, :x3, :x4}
                   :inputs       #{:t0, :t1, :t8, :t10}
                   :outputs      #{:t2, :t3, :t4}
                   ;; Dependencies outside the subgraph are not listed
                   :dependencies {:x2 #{}
                                  :x3 #{:x2}
                                  :x4 #{:x3}}}
                  translated)))))))

(deftest expand-solver-test
  (testing "expand-shorthand inserts interstitial nodes for transform output tables"
    (is (= {:check-outs   #{:x3 :m6 :m10 :m13}
            :dependencies {:t1  [:x1]
                           :x3  [:t1 :t2]
                           :t3  [:x3]
                           :x4  [:t3]
                           :t4  [:x4]
                           :m6  [:t4 :t5]
                           :m10 [:t9]
                           :x11 [:m10]
                           :t11 [:x11]
                           :m12 [:t11]
                           :m13 [:t11 :m12]}}
           (dag-abstract/expand-shorthand example)))))

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
           (dag-abstract/path-induced-subgraph (dag-abstract/expand-shorthand example))))))

;;;; Card dependency detection tests

(deftest unsupported-dependency-no-transforms-test
  (testing "empty input returns false"
    (is (nil? (ws.dag/unsupported-dependency? [])))))

(deftest unsupported-dependency-no-cards-test
  (testing "transform with no card dependencies returns false"
    (is (= #{1} (ws.dag/unsupported-dependency? #{1})))))

(deftest unsupported-dependency-mbql-card-test
  ;; We don't allow MBQL card dependencies, as we do not support re-mapping their references on execution.
  ;; This is only a problem if the card depends on a table that is shadowed in the isolated schema, but we want to
  ;; keep the semantics simple.
  (testing "transform with direct MBQL card dependency returns true"
    (is (true? (ws.dag/unsupported-dependency? #{#_tx})))))

(deftest unsupported-dependency-transitive-card-test
  ;; Even a transitive dependency would need to be remapped.
  (testing "transform with transitive MBQL card dependency (via another transform) returns true"
    (mt/with-model-cleanup [:model/Dependency :model/Transform]
      (is (true? (ws.dag/unsupported-dependency? #{#_tx}))))))

(deftest unsupported-dependency-sql-card-test
  ;; We don't allow *any* card dependency for two reasons:
  ;; 1. We don't yet support reference re-mapping across entity references.
  ;; 2. It's an anti-pattern to build transforms on models, the relationship is intended to be the other way around.
  (testing "transform with a direct SQL card dependency returns true"
    (is (true? (ws.dag/unsupported-dependency? #{#_tx})))))


