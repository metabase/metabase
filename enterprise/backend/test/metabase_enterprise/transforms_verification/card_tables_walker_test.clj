(ns metabase-enterprise.transforms-verification.card-tables-walker-test
  "Tests for [[metabase-enterprise.transforms-verification.card-refs/card->tables]].

  The primary contract under test:
  - Returns the set of all physical table ids transitively reachable through the
    card→source-card graph (breadth-first, cycle-safe, deduped).
  - Loads one `t2/select :model/Card` per BFS layer, not per card."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.card-refs :as card-refs]
   [metabase-enterprise.transforms-verification.test-util :as tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Linear chain: A → B → physical table
;;; ---------------------------------------------------------------------------

(deftest linear-chain-test
  (testing "Linear chain A→B→physical table: card->tables returns the leaf table"
    (mt/with-temp [:model/Card b {:dataset_query (tu/table-query (mt/id :orders))}
                   :model/Card a {:dataset_query (tu/card-query (:id b))}]
      (is (= #{(mt/id :orders)}
             (card-refs/card->tables a))
          "A references B references orders; only orders is a physical table"))))

;;; ---------------------------------------------------------------------------
;;; Diamond: A → {B, C} → D → physical table
;;; ---------------------------------------------------------------------------

(deftest diamond-test
  (testing "Diamond A→{B,C}→D: shared descendant D expanded once; union of tables correct"
    (mt/with-temp [:model/Card d {:dataset_query (tu/table-query (mt/id :orders))}
                   :model/Card b {:dataset_query (tu/card-query (:id d))}
                   :model/Card c {:dataset_query (tu/card-query (:id d))}
                   :model/Card a {:dataset_query (tu/join-card (tu/card-query (:id b)) (:id c))}]
      ;; A references both B and C; both reference D; D references orders.
      ;; card->tables must return #{orders-id} — deduped, with D expanded once.
      (is (= #{(mt/id :orders)}
             (card-refs/card->tables a))
          "orders appears once despite two paths through B and C"))))

;;; ---------------------------------------------------------------------------
;;; Cycle: A → B → A (must terminate)
;;; ---------------------------------------------------------------------------

(deftest cycle-terminates-test
  (testing "Cycle A→B→A terminates without infinite loop or exception"
    ;; Create A and B, then point A at B so A→B→A is a cycle.
    (mt/with-temp [:model/Card a {:dataset_query (tu/table-query (mt/id :orders))}
                   :model/Card b {:dataset_query (tu/card-query (:id a))}]
      (t2/update! :model/Card (:id a) {:dataset_query (tu/card-query (:id b))})
      (let [a-reloaded (t2/select-one :model/Card :id (:id a))]
        ;; Should terminate (no stack overflow) and return #{} because
        ;; all paths lead back to cards, never to a physical table id.
        (is (= #{} (card-refs/card->tables a-reloaded))
            "terminates and returns #{} — no physical table anywhere in the cycle")))))

;;; ---------------------------------------------------------------------------
;;; Mixed: root directly references a table AND a card
;;; ---------------------------------------------------------------------------

(deftest mixed-table-and-card-test
  (testing "Root card references both a physical table and a source card: union of all tables"
    (mt/with-temp [:model/Card inner {:dataset_query (tu/table-query (mt/id :people))}
                   :model/Card root  {:dataset_query (tu/join-card (tu/table-query (mt/id :orders)) (:id inner))}]
      (is (= #{(mt/id :orders) (mt/id :people)}
             (card-refs/card->tables root))
          "orders from direct ref + people via inner card"))))

;;; ---------------------------------------------------------------------------
;;; Metric ref: root aggregates a metric whose definition joins another table
;;; ---------------------------------------------------------------------------

(deftest metric-ref-unwinds-test
  (testing "A [:metric id] aggregation ref unwinds like a source card: the metric's tables surface"
    (mt/with-temp [:model/Card metric
                   {:type          :metric
                    :dataset_query (let [mp (mt/metadata-provider)]
                                     (-> (tu/table-query (mt/id :orders))
                                         (lib/join (lib/join-clause
                                                    (lib.metadata/table mp (mt/id :products))
                                                    [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                                            (lib.metadata/field mp (mt/id :products :id)))]))
                                         (lib/aggregate (lib/count))))}
                   :model/Card root {:dataset_query (-> (tu/table-query (mt/id :orders))
                                                        (tu/aggregate-metric (:id metric)))}]
      (is (= #{(mt/id :orders) (mt/id :products)}
             (card-refs/card->tables root))
          "products is reachable only through the metric's definition"))))

;;; ---------------------------------------------------------------------------
;;; Batching-contract test
;;;
;;; Redefs `batch-load-cards` to a counting wrapper and asserts the load count is
;;; the number of BFS layers, not the number of cards.
;;;
;;; Diamond A→{B,C}→D:
;;;   Layer 1: expand root A → frontier {B, C}  → 1 batch load of {B,C}
;;;   Layer 2: expand {B,C} → frontier {D}       → 1 batch load of {D}
;;;   Layer 3: expand {D}   → frontier {}         → no load (D has no card refs)
;;;   Total: 2 batch loads, not 3 per-card loads.
;;; ---------------------------------------------------------------------------

(deftest batching-contract-test
  (testing "BFS issues one card-row load per layer, not per card"
    (mt/with-temp [:model/Card d {:dataset_query (tu/table-query (mt/id :orders))}
                   :model/Card b {:dataset_query (tu/card-query (:id d))}
                   :model/Card c {:dataset_query (tu/card-query (:id d))}
                   :model/Card a {:dataset_query (tu/join-card (tu/card-query (:id b)) (:id c))}]
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
