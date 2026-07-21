(ns metabase-enterprise.transforms-verification.subgraph-test
  "Pure unit tests for sub-graph resolution (chained test runs).

  The slice/order/leaf logic is exercised here over synthetic dependency maps."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-verification.subgraph :as subgraph]))

(set! *warn-on-reflection* true)

;;; Synthetic DAG (integer ids):
;;;   1 → 3, 2 → 3, 3 → 4[target], 5 → 4 (sibling)
;;; deps = target's upstream closure {id -> #{upstream-ids}}
(def ^:private deps {4 #{3 5}, 3 #{1 2}, 1 #{}, 2 #{}, 5 #{}})

(deftest ^:parallel compute-slice-sources-at-leaves-test
  (testing "selecting boundary sources {1,2} includes interior node 3, excludes sibling 5"
    (let [{:keys [slice order bad-sources]} (subgraph/compute-slice deps #{1 2} #{4})]
      (is (= #{1 2 3 4} slice))
      (is (= [1 2 3 4] order) "topological, upstream first")
      (is (empty? bad-sources)))))

(deftest ^:parallel compute-slice-interior-source-test
  (testing "selecting interior node 3 as a source excludes 1 and 2 (their outputs become leaves)"
    (let [{:keys [slice order]} (subgraph/compute-slice deps #{3} #{4})]
      (is (= #{3 4} slice))
      (is (= [3 4] order)))))

(deftest ^:parallel compute-slice-target-only-test
  (testing "selecting only the target reduces to a single-node slice (single-transform semantics)"
    (let [{:keys [slice order]} (subgraph/compute-slice deps #{4} #{4})]
      (is (= #{4} slice))
      (is (= [4] order)))))

(deftest ^:parallel compute-slice-partial-selection-test
  (testing "selecting {1,3} keeps 2 out of the slice (2's output becomes a sibling leaf)"
    (let [{:keys [slice order]} (subgraph/compute-slice deps #{1 3} #{4})]
      (is (= #{1 3 4} slice))
      (is (= [1 3 4] order)))))

(deftest ^:parallel compute-slice-bad-source-test
  (testing "a source that is not an ancestor of the target is reported in :bad-sources"
    (let [{:keys [slice bad-sources]} (subgraph/compute-slice deps #{99} #{4})]
      (is (= #{99} bad-sources))
      (is (= #{4} slice) "degenerate slice is still returned; caller decides to refuse"))))

(deftest ^:parallel topo-order-cycle-test
  (testing "a cyclic dependency map throws ::cycle"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Cycle detected"
         (subgraph/compute-slice {1 #{2}, 2 #{1}} #{1 2} #{1})))))

;;; ---------------------------------------------------------------------------
;;; leaf-deps (injectable, pure)
;;; ---------------------------------------------------------------------------

(deftest ^:parallel leaf-deps-classification-test
  (testing "leaves = node inputs whose producer is nil (raw) or outside the slice (sibling)"
    (let [slice         #{1 2 3 4}
          id->raw-deps  {1 [{:table :t1}]
                         2 [{:table :t2}]
                         3 [{:transform 1} {:transform 2}]
                         4 [{:transform 3} {:table :t3} {:transform 5}]}
          ;; {:transform n} produced by n; {:table _} is raw (nil producer)
          producer-of   (fn [{:keys [transform]}] transform)
          leaves        (subgraph/leaf-deps slice id->raw-deps producer-of)]
      (is (= #{{:table :t1} {:table :t2} {:table :t3} {:transform 5}}
             leaves)
          (str "raw tables t1/t2/t3 and sibling-5's output are leaves; "
               "in-slice producers 1/2/3 are satisfied internally")))))
