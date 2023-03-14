(ns metabase.lib.metadata.calculate.describe-query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculate.describe-query :as describe-query]
   [metabase.lib.query :as lib.query]
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

;;; the following tests use raw legacy MBQL because they're direct ports of JavaScript tests from MLv1 and I wanted to
;;; make sure that given an existing query, the expected description was generated correctly.

(defn- describe-legacy-query [query]
  (describe-query/describe-query (lib.query/query meta/metadata-provider (lib.convert/->pMBQL query))))

(deftest ^:parallel multiple-aggregations-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:count]
                                         [:sum [:field (meta/id :venues :id) nil]]]}}]
    (is (= "Venues, Count and Sum of ID"
           (describe-legacy-query query)))))

(deftest ^:parallel named-aggregations-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:aggregation-options
                                          [:sum [:field (meta/id :venues :id) nil]]
                                          {:display-name "Revenue"}]]}}]
    (is (= "Venues, Revenue"
           (describe-legacy-query query)))))

(defn- describe-legacy-query-order-by [query]
  (-> (lib.query/query meta/metadata-provider (lib.convert/->pMBQL query))
      (#'describe-query/describe-part -1 :order-by)))

(deftest ^:parallel describe-order-by-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :order-by     [[:asc [:field (meta/id :venues :category-id) nil]]]}}]
    (is (= "Sorted by Category ID ascending"
           (describe-legacy-query-order-by query)))))

(deftest ^:parallel describe-order-by-aggregation-reference-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:count]]
                          :breakout     [[:field (meta/id :venues :category-id) nil]]
                          :order-by     [[:asc [:aggregation 0]]]}}]
    (is (= "Sorted by Count ascending"
           (describe-legacy-query-order-by query)))))

(deftest ^:parallel describe-order-by-expression-reference-test
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
