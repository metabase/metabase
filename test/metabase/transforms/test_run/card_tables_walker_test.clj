(ns metabase.transforms.test-run.card-tables-walker-test
  "Tests for [[metabase.transforms.test-run.card-refs/card->tables]].

  The primary contract under test:
  - Returns the set of all physical table ids transitively reachable through the
    card→source-card graph (breadth-first, cycle-safe, deduped).
  - Achieves this layer by layer: one `t2/select :model/Card` per BFS layer, not
    per card. The batching-contract test spies on the loader to enforce the
    invariant."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.test-run.card-refs :as card-refs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Helpers
;;; ---------------------------------------------------------------------------

(defn- source-card-query
  "A dataset_query whose source is card `c` (MBQL source-card pattern)."
  [c]
  {:database (mt/id)
   :type     :query
   :query    {:source-table (str "card__" (:id c))}})

(defn- table-query
  "A dataset_query whose source is the physical table `table-id`."
  [table-id]
  {:database (mt/id)
   :type     :query
   :query    {:source-table table-id}})

;;; ---------------------------------------------------------------------------
;;; Linear chain: A → B → physical table
;;; ---------------------------------------------------------------------------

(deftest linear-chain-test
  (testing "Linear chain A→B→physical table: card->tables returns the leaf table"
    (mt/with-temp [:model/Card b {:dataset_query (table-query (mt/id :orders))}
                   :model/Card a {:dataset_query (source-card-query b)}]
      (is (= #{(mt/id :orders)}
             (card-refs/card->tables a))
          "A references B references orders; only orders is a physical table"))))

;;; ---------------------------------------------------------------------------
;;; Diamond: A → {B, C} → D → physical table
;;; ---------------------------------------------------------------------------

(deftest diamond-test
  (testing "Diamond A→{B,C}→D: shared descendant D expanded once; union of tables correct"
    (mt/with-temp [:model/Card d {:dataset_query (table-query (mt/id :orders))}
                   :model/Card b {:dataset_query (source-card-query d)}
                   :model/Card c {:dataset_query (source-card-query d)}
                   :model/Card a {:dataset_query {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (str "card__" (:id b))
                                                             ;; second source via explicit join
                                                             :joins [{:source-table (str "card__" (:id c))
                                                                      :alias        "c_join"
                                                                      :condition    [:= 1 1]
                                                                      :fields       :none}]}}}]
      ;; A references both B and C; both reference D; D references orders.
      ;; card->tables must return #{orders-id} — not #{orders-id orders-id} (dedup) and not an
      ;; error from double-expanding D.
      (is (= #{(mt/id :orders)}
             (card-refs/card->tables a))
          "orders appears once despite two paths through B and C"))))

;;; ---------------------------------------------------------------------------
;;; Cycle: A → B → A (must terminate)
;;; ---------------------------------------------------------------------------

(deftest cycle-terminates-test
  (testing "Cycle A→B→A terminates without infinite loop or exception"
    ;; We create A and B manually so we can set up mutual references.
    (mt/with-temp [:model/Card a {:dataset_query (table-query (mt/id :orders))}
                   :model/Card b {:dataset_query (source-card-query a)}]
      ;; Now update A to source from B, creating the cycle A→B→A.
      (t2/update! :model/Card (:id a) {:dataset_query (source-card-query b)})
      (let [a-reloaded (t2/select-one :model/Card :id (:id a))]
        ;; Should terminate (no stack overflow) and return #{} because
        ;; all paths lead back to cards, never to a physical table id.
        (is (set? (card-refs/card->tables a-reloaded))
            "returns a set without blowing the stack")))))

;;; ---------------------------------------------------------------------------
;;; Mixed: root directly references a table AND a card
;;; ---------------------------------------------------------------------------

(deftest mixed-table-and-card-test
  (testing "Root card references both a physical table and a source card: union of all tables"
    (mt/with-temp [:model/Card inner {:dataset_query (table-query (mt/id :people))}
                   :model/Card root  {:dataset_query
                                      {:database (mt/id)
                                       :type     :query
                                       :query    {:source-table (mt/id :orders)
                                                  :joins [{:source-table (str "card__" (:id inner))
                                                           :alias        "inner_join"
                                                           :condition    [:= 1 1]
                                                           :fields       :none}]}}}]
      (is (= #{(mt/id :orders) (mt/id :people)}
             (card-refs/card->tables root))
          "orders from direct ref + people via inner card"))))

;;; ---------------------------------------------------------------------------
;;; Batching-contract test — the heart of this task
;;;
;;; Strategy: with-redefs `batch-load-cards` (the public seam wrapping
;;; `(t2/select :model/Card :id [:in …])`) to a counting wrapper, and verify that
;;; the load count equals the number of BFS layers, not the number of cards.
;;;
;;; Diamond A→{B,C}→D:
;;;   Layer 1: expand root A → frontier {B, C}  → 1 batch load of {B,C}
;;;   Layer 2: expand {B,C} → frontier {D}       → 1 batch load of {D}
;;;   Layer 3: expand {D}   → frontier {}         → no load (D has no card refs)
;;;   Total: 2 batch loads, not 3 per-card loads.
;;;
;;; The test fails against naive per-card depth-first recursion — which would issue
;;; three loads, one each for B, C, and D — and passes only against the
;;; layer-batched walk.
;;; ---------------------------------------------------------------------------

(deftest batching-contract-test
  (testing "BFS issues one card-row load per LAYER, not per card"
    (mt/with-temp [:model/Card d {:dataset_query (table-query (mt/id :orders))}
                   :model/Card b {:dataset_query (source-card-query d)}
                   :model/Card c {:dataset_query (source-card-query d)}
                   :model/Card a {:dataset_query {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (str "card__" (:id b))
                                                             :joins [{:source-table (str "card__" (:id c))
                                                                      :alias        "c_join"
                                                                      :condition    [:= 1 1]
                                                                      :fields       :none}]}}}]
      (let [load-count (atom 0)]
        (mt/with-dynamic-fn-redefs [card-refs/batch-load-cards
                                    (fn [ids]
                                      (swap! load-count inc)
                                      ;; call t2/select directly, not batch-load-cards — the
                                      ;; replacement must not re-enter the redefined var.
                                      (t2/select :model/Card :id [:in ids]))]
          (card-refs/card->tables a)
          (is (= 2 @load-count)
              (str "Expected 2 batch loads (one per layer: {B,C} then {D}), "
                   "got " @load-count ". "
                   "A naive per-card recursion would produce 3 loads.")))))))
