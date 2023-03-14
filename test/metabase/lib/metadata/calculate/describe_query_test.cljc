(ns metabase.lib.metadata.calculate.describe-query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculate.describe-query :as describe-query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]))

(defn- FIXME-sum
  "Placeholder until we have a function for adding a `:sum` aggregation to a query."
  [query expr]
  (let [sum-clause (lib/sum query -1 expr)]
    (lib.util/update-query-stage query -1 update :aggregation (fn [aggregations]
                                                                (conj (vec aggregations) sum-clause)))))

(defn- FIXME-equals
  "Placeholder until we have a function for adding an `:=` aggregation to a query."
  [query x y]
  (let [=-clause (lib/= query -1 x y)]
    (lib.util/update-query-stage query -1 assoc :filter =-clause)))

(deftest ^:parallel TODO-test
  ;; describe("Question.generateQueryDescription", () => {
  ;;   const mockTableMetadata = {
  ;;     display_name: "Order",
  ;;     fields: [{ id: 1, display_name: "Total" }],
  ;;   };

  ;;   it("should work with multiple aggregations", () => {
  ;;     const question = base_question.setDatasetQuery({
  ;;       query: {
  ;;         "source-table": ORDERS.id,
  ;;         aggregation: [["count"], ["sum", ["field", 1, null]]],
  ;;       },
  ;;     });
  ;;     expect(question.generateQueryDescription(mockTableMetadata)).toEqual(
  ;;       "Orders, Count and Sum of Total",
  ;;     );
  ;;   });

  ;;   it("should work with named aggregations", () => {
  ;;     const question = base_question.setDatasetQuery({
  ;;       query: {
  ;;         "source-table": ORDERS.id,
  ;;         aggregation: [
  ;;           [
  ;;             "aggregation-options",
  ;;             ["sum", ["field", 1, null]],
  ;;             { "display-name": "Revenue" },
  ;;           ],
  ;;         ],
  ;;       },
  ;;     });
  ;;     expect(question.generateQueryDescription(mockTableMetadata)).toEqual(
  ;;       "Orders, Revenue",
  ;;     );
  ;;   });
  ;; });
  )

;;; TODO
(deftest ^:parallel describe-order-by-test
  ;; describe("Question._getOrderByDescription", () => {
  ;;   it("should work with fields", () => {
  ;;     const query = {
  ;;       "source-table": PRODUCTS.id,
  ;;       "order-by": [["asc", ["field", PRODUCTS.CATEGORY.id, null]]],
  ;;     };

  ;;     expect(base_question._getOrderByDescription(PRODUCTS, query)).toEqual([
  ;;       "Sorted by ",
  ;;       ["Category ascending"],
  ;;     ]);
  ;;   });

  ;;   it("should work with aggregations", () => {
  ;;     const query = {
  ;;       "source-table": PRODUCTS.id,
  ;;       aggregation: [["count"]],
  ;;       breakout: [["field", PRODUCTS.CATEGORY.id, null]],
  ;;       "order-by": [["asc", ["aggregation", 0, null]]],
  ;;     };
  ;;     expect(base_question._getOrderByDescription(PRODUCTS, query)).toEqual([
  ;;       "Sorted by ",
  ;;       ["Count ascending"],
  ;;     ]);
  ;;   });

  ;;   it("should work with expressions", () => {
  ;;     const query = {
  ;;       "source-table": PRODUCTS.id,
  ;;       expressions: {
  ;;         Foo: ["concat", "Foo ", ["field", 4, null]],
  ;;       },
  ;;       "order-by": [["asc", ["expression", "Foo", null]]],
  ;;     };
  ;;     expect(base_question._getOrderByDescription(PRODUCTS, query)).toEqual([
  ;;       "Sorted by ",
  ;;       ["Foo ascending"],
  ;;     ]);
  ;;   });
  ;; });
  )

(deftest ^:parallel describe-query-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (FIXME-sum (lib/field (meta/id :venues :price)))
                  (FIXME-equals (lib/field (meta/id :venues :name)) "Toucannery")
                  (lib/breakout (lib/field (meta/id :venues :category-id)))
                  (lib/order-by (lib/field (meta/id :venues :id)))
                  (lib/limit 100))]
    (is (= (str "Venues,"
                " Sum of Price,"
                " Grouped by Category ID,"
                " Filtered by Name equals \"Toucannery\","
                " Sorted by ID ascending,"
                " 100 rows")
           (describe-query/describe-query query)))))
