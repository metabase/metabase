(ns metabase.lib-metric.ast.walk-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.ast.build :as ast.build]
   [metabase.lib-metric.ast.walk :as ast.walk]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")

(def ^:private dim-ref-1 (ast.build/dimension-ref uuid-1))
(def ^:private dim-ref-2 (ast.build/dimension-ref uuid-2))

(def ^:private filter-a (ast.build/comparison-filter := dim-ref-1 "a"))
(def ^:private filter-b (ast.build/comparison-filter :> dim-ref-2 10))
(def ^:private filter-c (ast.build/string-filter :contains dim-ref-1 "foo"))

(def ^:private sample-ast
  {:node/type  :ast/root
   :source     {:node/type   :source/metric
                :id          1
                :aggregation {:node/type :aggregation/count}
                :base-table  {:node/type :ast/table :id 1}}
   :dimensions [{:node/type :ast/dimension :id uuid-1}
                {:node/type :ast/dimension :id uuid-2}]
   :mappings   [{:node/type    :ast/dimension-mapping
                 :dimension-id uuid-1
                 :column       {:node/type :ast/column :id 1}}]
   :filter     (ast.build/and-filter filter-a filter-b)
   :group-by   [dim-ref-1]})

;;; -------------------------------------------------- Predicates --------------------------------------------------

(deftest ^:parallel node?-test
  (testing "returns true for AST nodes"
    (is (ast.walk/node? {:node/type :ast/root}))
    (is (ast.walk/node? {:node/type :filter/comparison :operator := :dimension dim-ref-1 :value 1}))
    (is (ast.walk/node? {:node/type :ast/column :id 1})))

  (testing "returns false for non-nodes"
    (is (not (ast.walk/node? {})))
    (is (not (ast.walk/node? nil)))
    (is (not (ast.walk/node? "string")))
    (is (not (ast.walk/node? [:vector])))))

(deftest ^:parallel filter-node?-test
  (testing "returns true for filter nodes"
    (is (ast.walk/filter-node? filter-a))
    (is (ast.walk/filter-node? filter-b))
    (is (ast.walk/filter-node? (ast.build/and-filter filter-a filter-b)))
    (is (ast.walk/filter-node? (ast.build/not-filter filter-a))))

  (testing "returns false for non-filter nodes"
    (is (not (ast.walk/filter-node? {:node/type :ast/root})))
    (is (not (ast.walk/filter-node? {:node/type :ast/column :id 1})))
    (is (not (ast.walk/filter-node? dim-ref-1)))))

(deftest ^:parallel source-node?-test
  (testing "returns true for source nodes"
    (is (ast.walk/source-node? {:node/type :source/metric :id 1}))
    (is (ast.walk/source-node? {:node/type :source/measure :id 1})))

  (testing "returns false for non-source nodes"
    (is (not (ast.walk/source-node? {:node/type :ast/root})))
    (is (not (ast.walk/source-node? filter-a)))))

(deftest ^:parallel dimension-ref-node?-test
  (testing "returns true for dimension ref nodes"
    (is (ast.walk/dimension-ref-node? dim-ref-1))
    (is (ast.walk/dimension-ref-node? (ast.build/dimension-ref uuid-1 {:temporal-unit :month}))))

  (testing "returns false for other nodes"
    (is (not (ast.walk/dimension-ref-node? {:node/type :ast/dimension :id uuid-1})))
    (is (not (ast.walk/dimension-ref-node? filter-a)))))

;;; -------------------------------------------------- Walking --------------------------------------------------

(deftest ^:parallel postwalk-test
  (testing "visits all nodes depth-first"
    (let [visited (atom [])
          result  (ast.walk/postwalk
                   (fn [node]
                     (when (ast.walk/node? node)
                       (swap! visited conj (:node/type node)))
                     node)
                   sample-ast)]
      ;; Children should be visited before parents
      (is (= result sample-ast))
      ;; Should have visited filter nodes
      (is (some #{:filter/comparison} @visited))
      (is (some #{:filter/and} @visited))
      ;; And root
      (is (some #{:ast/root} @visited)))))

(deftest ^:parallel prewalk-test
  (testing "visits nodes before children"
    (let [visited (atom [])
          _       (ast.walk/prewalk
                   (fn [node]
                     (when (ast.walk/node? node)
                       (swap! visited conj (:node/type node)))
                     node)
                   sample-ast)]
      ;; Root should be first
      (is (= :ast/root (first @visited))))))

;;; -------------------------------------------------- Collecting --------------------------------------------------

(deftest ^:parallel collect-test
  (testing "collects nodes matching predicate"
    (let [filters (ast.walk/collect ast.walk/filter-node? sample-ast)]
      (is (= 3 (count filters))) ; filter-a, filter-b, and the :filter/and
      (is (every? ast.walk/filter-node? filters)))))

(deftest ^:parallel collect-dimension-refs-test
  (testing "collects all dimension refs"
    (let [refs (ast.walk/collect-dimension-refs sample-ast)]
      ;; dim-ref-1 in group-by, dim-ref-1 in filter-a, dim-ref-2 in filter-b
      (is (= 3 (count refs)))
      (is (every? ast.walk/dimension-ref-node? refs)))))

(deftest ^:parallel collect-by-type-test
  (testing "collects nodes by type"
    (let [dims (ast.walk/collect-by-type :ast/dimension sample-ast)]
      (is (= 2 (count dims)))
      (is (every? #(= :ast/dimension (:node/type %)) dims)))))

;;; -------------------------------------------------- Transforming --------------------------------------------------

(deftest ^:parallel transform-test
  (testing "transforms matching nodes"
    (let [result (ast.walk/transform
                  #(= :filter/comparison (:node/type %))
                  #(assoc % :transformed true)
                  sample-ast)]
      ;; Original filters in :filter/and children should be transformed
      (is (every? :transformed (get-in result [:filter :children]))))))

(deftest ^:parallel transform-by-type-test
  (testing "transforms nodes by type"
    (let [result (ast.walk/transform-by-type
                  :ast/dimension-ref
                  #(assoc % :marked true)
                  sample-ast)]
      ;; All dimension refs should be marked
      (let [refs (ast.walk/collect-dimension-refs result)]
        (is (every? :marked refs))))))

;;; -------------------------------------------------- Finding --------------------------------------------------

(deftest ^:parallel find-first-test
  (testing "finds first matching node"
    (let [found (ast.walk/find-first
                 #(= :filter/comparison (:node/type %))
                 sample-ast)]
      (is (= :filter/comparison (:node/type found)))))

  (testing "returns nil when not found"
    (let [found (ast.walk/find-first
                 #(= :nonexistent (:node/type %))
                 sample-ast)]
      (is (nil? found)))))

(deftest ^:parallel count-nodes-test
  (testing "counts matching nodes"
    (is (= 2 (ast.walk/count-nodes
              #(= :filter/comparison (:node/type %))
              sample-ast)))
    (is (= 3 (ast.walk/count-nodes
              ast.walk/dimension-ref-node?
              sample-ast)))))

;;; -------------------------------------------------- Replace/Remove --------------------------------------------------

(deftest ^:parallel replace-node-test
  (testing "replaces matching nodes with value"
    (let [placeholder {:node/type :filter/comparison
                       :operator  :=
                       :dimension dim-ref-1
                       :value     "REPLACED"}
          result      (ast.walk/replace-node
                       #(and (= :filter/comparison (:node/type %))
                             (= := (:operator %)))
                       placeholder
                       sample-ast)]
      ;; filter-a had := operator, should be replaced
      (is (= "REPLACED" (get-in result [:filter :children 0 :value]))))))

(deftest ^:parallel remove-filters-test
  (testing "removes matching filters from and"
    (let [result (ast.walk/remove-filters
                  #(= :> (:operator %))
                  sample-ast)]
      ;; filter-b had :> operator, should be removed
      ;; Since only one child remains, :filter/and should be unwrapped
      (is (= :filter/comparison (get-in result [:filter :node/type])))
      (is (= := (get-in result [:filter :operator])))))

  (testing "removes all filters leaving nil"
    (let [all-comparison (ast.walk/remove-filters
                          #(= :filter/comparison (:node/type %))
                          sample-ast)]
      (is (nil? (:filter all-comparison)))))

  (testing "handles nested compound filters"
    (let [nested-ast (assoc sample-ast
                            :filter (ast.build/and-filter
                                     (ast.build/or-filter filter-a filter-b)
                                     filter-c))
          result     (ast.walk/remove-filters
                      #(= :> (:operator %))
                      nested-ast)]
      ;; filter-b removed from inner :or, leaving just filter-a
      ;; Inner :or should unwrap to just filter-a
      (is (= :filter/and (get-in result [:filter :node/type])))
      (is (= 2 (count (get-in result [:filter :children])))))))

;;; -------------------------------------------------- Complex Transformations --------------------------------------------------

(def ^:private audit-uuid "550e8400-e29b-41d4-a716-446655440099")

(deftest ^:parallel complex-transformation-test
  (testing "can inject audit filter into source"
    (let [audit-filter (ast.build/comparison-filter := (ast.build/dimension-ref audit-uuid) 123)
          result       (ast.walk/transform
                        ast.walk/source-node?
                        (fn [source]
                          (update source :filters
                                  (fn [existing]
                                    (if existing
                                      (ast.build/and-filter existing audit-filter)
                                      audit-filter))))
                        sample-ast)]
      (is (= audit-filter (get-in result [:source :filters]))))))

(deftest ^:parallel dimension-ref-collection-from-filters-test
  (testing "can collect dimension refs from filters only"
    (let [filter-only-ast {:node/type :ast/root
                           :source    (:source sample-ast)
                           :dimensions []
                           :mappings  []
                           :filter    (ast.build/and-filter
                                       (ast.build/comparison-filter := dim-ref-1 1)
                                       (ast.build/comparison-filter := dim-ref-2 2)
                                       (ast.build/or-filter
                                        (ast.build/comparison-filter := dim-ref-1 3)
                                        (ast.build/comparison-filter := dim-ref-2 4)))
                           :group-by  []}
          refs            (ast.walk/collect-dimension-refs filter-only-ast)]
      (is (= 4 (count refs)))
      (is (= #{uuid-1 uuid-2} (set (map :dimension-id refs)))))))
