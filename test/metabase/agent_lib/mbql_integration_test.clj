(ns metabase.agent-lib.mbql-integration-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.test-util :as tu]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.test-metadata :as meta]))

(def ^:private mbql-ns 'metabase.agent-lib.mbql-integration)

(defn- runtime-fields-by-id
  []
  (:fields-by-id (runtime/build-runtime meta/metadata-provider)))

(defn- comparable-ref
  [ref-clause]
  (lib.schema.util/remove-lib-uuids ref-clause))

(defn- call-private
  [sym & args]
  (apply (var-get (ns-resolve mbql-ns sym)) args))

(defn- current-query-field
  [query table-name field-name]
  (or (lib/find-matching-column query
                                -1
                                (meta/field-metadata table-name field-name)
                                (mbql/current-query-field-candidates query))
      (throw (ex-info "Expected field to be available in query context"
                      {:table-name table-name
                       :field-name field-name
                       :query      query}))))

(defn- current-aggregation-column
  [query idx]
  (or (lib/find-matching-column query -1 (lib/aggregation-ref query idx) (lib/orderable-columns query))
      (throw (ex-info "Expected aggregation column in query context"
                      {:aggregation-index idx
                       :query             query}))))

(deftest query?-uses-normalized-query-type-test
  (is (true? (mbql/query? (tu/query-for-table :orders))))
  (is (false? (mbql/query? (meta/table-metadata :orders)))))

(deftest extracted-field-resolution-helper-test
  (let [fields-by-id         (runtime-fields-by-id)
        orders-query         (tu/query-for-table :orders)
        by-table             (call-private 'fields-by-table-id fields-by-id)
        query-candidates     (mbql/current-query-field-candidates orders-query)
        product-id-field-id  (meta/id :orders :product-id)
        venues-category-id   (meta/id :venues :category-id)
        category-id-field-id (meta/id :products :category)
        product-table-id     (meta/id :products)
        category-table-id    (meta/id :categories)]
    (testing "candidate preference is explicit and deterministic"
      (is (= {:id 10 :name "ID"}
             (call-private 'prefer-single-candidate
                           [{:id 10 :name "ID" :lib/join-alias "Products"}
                            {:id 10 :name "ID"}])))
      (is (= {:id 20 :name "Category"}
             (call-private 'prefer-single-candidate
                           [{:id 20 :name "Category" :fk-field-id 21}
                            {:id 20 :name "Category"}]))))
    (testing "metadata grouping and FK target resolution use the extracted helpers"
      (is (some #(= product-id-field-id (:id %))
                (get by-table (meta/id :orders))))
      (is (= product-table-id
             (call-private 'field-target-table-id fields-by-id product-id-field-id)))
      (is (nil? (call-private 'field-target-table-id fields-by-id (meta/id :orders :total)))))
    (testing "lineage helpers expose the path anchors and recursive FK traversal"
      (is (= [product-id-field-id category-id-field-id 999]
             (vec (call-private 'field-path-start-ids
                                {:source-field product-id-field-id
                                 :fk-field-id category-id-field-id
                                 :lib/original-fk-field-id category-id-field-id
                                 :id 999}))))
      (is (= [product-id-field-id]
             (call-private 'fk-path-to-table fields-by-id product-id-field-id product-table-id)))
      (is (= [venues-category-id]
             (call-private 'fk-path-to-table fields-by-id venues-category-id category-table-id)))
      (is (nil? (call-private 'fk-path-to-table fields-by-id product-id-field-id category-table-id))))
    (testing "type compatibility and lineage ranking helpers are independently testable"
      (is (true? (call-private 'numeric-type? :type/Float)))
      (is (false? (call-private 'numeric-type? :type/Text)))
      (is (true? (call-private 'types-compatible?
                               {:effective-type :type/Float}
                               {:effective-type :type/Integer})))
      (is (false? (call-private 'types-compatible?
                                {:effective-type :type/Text}
                                {:effective-type :type/Integer})))
      (is (true? (call-private 'candidate-has-resolution-lineage?
                               {:fk-field-id category-id-field-id})))
      (is (false? (call-private 'candidate-has-resolution-lineage?
                                {:id product-id-field-id}))))
    (testing "source-column accessors and synthesized multi-hop lineage are namespace-level helpers"
      (let [source-column {:lib/source-column-alias      "Category"
                           :name                         "CATEGORY"
                           :fk-field-name                "Category"
                           :fk-join-alias                "Products"
                           :source-field                 category-id-field-id
                           :lib/original-fk-field-id     product-id-field-id
                           :lib/original-fk-field-name   "Product ID"
                           :lib/original-fk-join-alias   nil}
            raw-field     {:id category-id-field-id
                           :name "Category"
                           :table-id category-table-id}
            synthesized   (call-private 'synthesize-chained-related-field
                                        fields-by-id
                                        query-candidates
                                        raw-field
                                        source-column
                                        [product-id-field-id category-id-field-id])]
        (is (= "Category" (call-private 'source-column-field-name source-column)))
        (is (= "Products" (call-private 'source-column-field-join-alias source-column)))
        (is (= product-id-field-id (call-private 'source-column-original-field-id source-column)))
        (is (= "Product ID" (call-private 'source-column-original-field-name source-column)))
        (is (nil? (call-private 'source-column-original-field-join-alias source-column)))
        (is (= "Products"
               (call-private 'candidate-join-alias-for-field-id
                             [{:source-field category-id-field-id
                               :lib/join-alias "Products"}]
                             category-id-field-id)))
        (is (= category-id-field-id (:fk-field-id synthesized)))
        (is (= product-id-field-id (:lib/original-fk-field-id synthesized)))
        (is (= "Products" (:fk-join-alias synthesized)))
        (is (true? (call-private 'multi-hop-lineage-candidate? synthesized)))
        (is (false? (call-private 'multi-hop-lineage-candidate?
                                  {:fk-field-id category-id-field-id
                                   :lib/original-fk-field-id category-id-field-id})))))
    (testing "previous-stage matching is a separate unit from the main resolver"
      (is (= [{:name "Average of Total"
               :source-field (meta/id :orders :total)
               :lib/source :source/previous-stage}]
             (call-private 'previous-stage-lineage-matches
                           {:id (meta/id :orders :total)
                            :name "Total"}
                           [{:name "Average of Total"
                             :source-field (meta/id :orders :total)
                             :lib/source :source/previous-stage}
                            {:name "Count"
                             :lib/source :source/previous-stage}])))
      (let [appended-query         (-> orders-query
                                       (lib/aggregate (lib/avg (meta/field-metadata :orders :total)))
                                       (lib/append-stage))
            previous-stage-columns (->> (mbql/current-query-field-candidates appended-query)
                                        (filter #(= :source/previous-stage (:lib/source %)))
                                        vec)]
        (is (= ["avg"]
               (mapv :name
                     (call-private 'previous-stage-aggregation-matches
                                   appended-query
                                   {:id (meta/id :orders :total)
                                    :name "Total"}
                                   previous-stage-columns)))))
      (is (= [{:name "NET AMOUNT" :lib/source :source/previous-stage}]
             (call-private 'previous-stage-name-matches
                           {:name "Net Amount"}
                           [{:name "NET AMOUNT" :lib/source :source/previous-stage}
                            {:name "Other" :lib/source :source/previous-stage}]))))))

(deftest extracted-orderable-helper-test
  (let [orders-query            (tu/query-for-table :orders)
        breakout-query          (-> orders-query
                                    (lib/expression "__breakout_expression_1"
                                                    (lib/get-hour (meta/field-metadata :orders :created-at)))
                                    (lib/aggregate (lib/count))
                                    (as-> query
                                          (lib/breakout query (lib/expression-ref query "__breakout_expression_1"))))
        aggregation-query       (-> orders-query
                                    (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                                    (lib/aggregate (lib/count)))
        total-field-id          (meta/id :orders :total)
        created-at-field-id     (meta/id :orders :created-at)
        breakout-expression-ref (lib/expression-ref breakout-query "__breakout_expression_1")
        aggregation-column      (current-aggregation-column aggregation-query 0)]
    (testing "aggregation inventory helpers are directly unit-tested"
      (is (= 2 (count (call-private 'aggregation-columns aggregation-query))))
      (is (= [0 1]
             (mapv first (call-private 'aggregation-column-pairs aggregation-query)))))
    (testing "requested field ids and current-stage field matching are separate helpers"
      (is (= #{total-field-id}
             (call-private 'requested-orderable-field-ids (meta/field-metadata :orders :total))))
      (is (= #{created-at-field-id}
             (call-private 'requested-orderable-field-ids (lib/ref (meta/field-metadata :orders :created-at)))))
      (is (= #{}
             (call-private 'requested-orderable-field-ids "not-a-field")))
      (is (some #(= total-field-id (:id %))
                (call-private 'orderable-field-id->query-columns orders-query total-field-id)))
      (is (some #(= total-field-id (:id %))
                (call-private 'orderable-field-ids->query-columns orders-query #{total-field-id}))))
    (testing "breakout and aggregation matching helpers are individually covered"
      (is (= [(comparable-ref breakout-expression-ref)]
             (mapv comparable-ref
                   (call-private 'field-id->breakout-expression-refs breakout-query created-at-field-id))))
      (is (= (comparable-ref breakout-expression-ref)
             (comparable-ref
              (call-private 'field-ids->breakout-expression-ref breakout-query #{created-at-field-id}))))
      (is (= [aggregation-column]
             (call-private 'field-id->aggregation-columns aggregation-query total-field-id)))
      (is (= [aggregation-column]
             (call-private 'field-ids->aggregation-columns aggregation-query #{total-field-id}))))
    (testing "field-like orderable resolution is directly testable after extraction"
      (let [[_ breakout-orderable] (call-private 'resolve-field-like-orderable
                                                 breakout-query
                                                 (meta/field-metadata :orders :created-at))
            [_ aggregation-orderable] (call-private 'resolve-field-like-orderable
                                                    aggregation-query
                                                    (meta/field-metadata :orders :total))]
        (is (= (comparable-ref breakout-expression-ref)
               (comparable-ref breakout-orderable)))
        (is (= aggregation-column aggregation-orderable))))))

(deftest implicitly-resolved-column-helper-test
  (is (true? (call-private 'implicitly-resolved-column?
                           {:table-id 100
                            :fk-field-id 20}
                           100)))
  (is (true? (call-private 'implicitly-resolved-column?
                           {:table-id 200
                            :lib/source :source/previous-stage}
                           100)))
  (is (false? (call-private 'implicitly-resolved-column?
                            {:table-id 100
                             :join-alias "Products"
                             :fk-field-id 20}
                            100))))

(deftest resolve-aggregation-selection-uses-visible-column-match-test
  (let [query     (-> (tu/query-for-table :orders)
                      (lib/aggregate (lib/count)))
        selection (lib/aggregation-ref query 0)]
    (is (= (lib/find-visible-column-for-ref query selection)
           (mbql/resolve-aggregation-selection query selection)))))

(deftest expression-ref-or-current-stage-column-uses-existing-expression-test
  (let [query (-> (tu/query-for-table :orders)
                  (lib/expression "Net Amount"
                                  (lib/- (meta/field-metadata :orders :total)
                                         (meta/field-metadata :orders :discount))))]
    (is (= (comparable-ref (lib/expression-ref query "Net Amount"))
           (comparable-ref (mbql/expression-ref-or-current-stage-column query "Net Amount"))))))

(deftest resolve-orderable-reuses-breakout-expression-test
  (let [query (-> (tu/query-for-table :orders)
                  (lib/expression "__breakout_expression_1"
                                  (lib/get-hour (meta/field-metadata :orders :created-at)))
                  (lib/aggregate (lib/count))
                  (as-> query
                        (lib/breakout query (lib/expression-ref query "__breakout_expression_1"))))
        [_ resolved-orderable] (mbql/resolve-orderable query (meta/field-metadata :orders :created-at))]
    (is (= (comparable-ref (lib/expression-ref query "__breakout_expression_1"))
           (comparable-ref resolved-orderable)))))

(deftest redundant-implicit-join-detects-existing-implicit-join-test
  (let [fields-by-id (:fields-by-id (runtime/build-runtime meta/metadata-provider))
        base-query   (tu/query-for-table :orders)
        query        (lib/with-fields base-query [(current-query-field base-query :products :title)])
        operation    ["join"
                      ["with-join-conditions"
                       ["join-clause" ["table" (meta/id :products)]]
                       [["=" ["field" (meta/id :orders :product-id)]
                         ["field" (meta/id :products :id)]]]]]]
    (testing "implicit join coverage is centralized in mbql-integration"
      (is (true? (mbql/redundant-implicit-join? fields-by-id query operation))))))
