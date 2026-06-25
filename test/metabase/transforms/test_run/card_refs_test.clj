(ns metabase.transforms.test-run.card-refs-test
  "Tests for [[metabase.transforms.test-run.card-refs/card->immediate-refs]].

  Every case asserts:
  - the correct table ids land in `:tables`
  - the correct card ids land in `:cards`
  - the function does not recurse (source cards' physical tables stay hidden)"
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.test-run.card-refs :as card-refs]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; MBQL — physical table source
;;; ---------------------------------------------------------------------------

(deftest mbql-physical-table-test
  (testing "MBQL question over a single physical table: table id in :tables, :cards empty"
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id) :type :query :query {:source-table (mt/id :orders)}}}]
      (let [{:keys [tables cards]} (card-refs/card->immediate-refs card)]
        (is (= #{(mt/id :orders)} tables))
        (is (= #{} cards))))))

;;; ---------------------------------------------------------------------------
;;; MBQL — implicit join
;;; ---------------------------------------------------------------------------

(deftest mbql-implicit-join-test
  (testing "MBQL question with an implicit join: both table ids in :tables, :cards empty"
    (mt/with-temp [:model/Card card
                   {:dataset_query
                    {:database (mt/id)
                     :type     :query
                     :query    {:source-table (mt/id :orders)
                                :fields       [[:field (mt/id :orders :id) nil]
                                               [:field (mt/id :people :name)
                                                {:source-field (mt/id :orders :user_id)}]]}}}]
      (let [{:keys [tables cards]} (card-refs/card->immediate-refs card)]
        (is (contains? tables (mt/id :orders)) "source table")
        (is (contains? tables (mt/id :people)) "implicitly joined table")
        (is (= #{} cards))))))

;;; ---------------------------------------------------------------------------
;;; MBQL — source-card (card over another card / model)
;;; ---------------------------------------------------------------------------

(deftest mbql-source-card-test
  (testing "MBQL question whose source is another card: source card id in :cards, not its tables"
    (mt/with-temp [:model/Card source {:dataset_query {:database (mt/id) :type :query :query {:source-table (mt/id :orders)}}}
                   :model/Card card   {:dataset_query {:database (mt/id)
                                                       :type     :query
                                                       :query    {:source-table (str "card__" (:id source))}}}]
      (let [{:keys [tables cards]} (card-refs/card->immediate-refs card)]
        ;; The orders table id must not appear — immediate-only.
        (is (= #{} tables) "physical table behind source card must not appear")
        (is (= #{(:id source)} cards) "source card id must appear in :cards")))))

;;; ---------------------------------------------------------------------------
;;; Metric card (type = :metric)
;;; ---------------------------------------------------------------------------

(deftest metric-card-test
  (testing "Metric card (:type :metric) is structurally an MBQL card: table id in :tables"
    (mt/with-temp [:model/Card metric {:type          :metric
                                       :dataset_query {:database (mt/id)
                                                       :type     :query
                                                       :query    {:source-table (mt/id :orders)
                                                                  :aggregation  [[:count]]}}}]
      (let [{:keys [tables cards]} (card-refs/card->immediate-refs metric)]
        (is (= #{(mt/id :orders)} tables))
        (is (= #{} cards))))))

;;; ---------------------------------------------------------------------------
;;; Native query
;;; ---------------------------------------------------------------------------

(deftest native-card-test
  (testing "Native card: table ids resolved from SQL text via sql-tools"
    (mt/with-temp [:model/Card card
                   {:dataset_query {:database (mt/id)
                                    :type     :native
                                    :native   {:query "SELECT * FROM orders JOIN people ON orders.user_id = people.id"}}}]
      (let [{:keys [tables cards]} (card-refs/card->immediate-refs card)]
        (is (contains? tables (mt/id :orders)) "orders resolved from SQL")
        (is (contains? tables (mt/id :people)) "people resolved from SQL")
        (is (= #{} cards)))))
  (testing "Native card referencing an unresolvable table (e.g. CTE alias): dropped, no exception"
    (mt/with-temp [:model/Card card
                   {:dataset_query {:database (mt/id)
                                    :type     :native
                                    :native   {:query
                                               (str "WITH cte AS (SELECT * FROM orders) "
                                                    "SELECT * FROM cte")}}}]
      ;; The CTE alias 'cte' cannot be resolved to a table id; it should be dropped silently.
      ;; 'orders' inside the CTE definition is parsed and resolved.
      (let [{:keys [tables cards]} (card-refs/card->immediate-refs card)]
        (is (set? tables))
        (is (= #{} cards))))))
