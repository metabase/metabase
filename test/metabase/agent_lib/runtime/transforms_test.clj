(ns metabase.agent-lib.runtime.transforms-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.runtime.transforms :as runtime.transforms]
   [metabase.agent-lib.test-util :as agent-lib.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]))

(deftest ^:parallel order-wrapper-helpers-test
  (is (runtime.transforms/order-wrapper? (runtime.transforms/asc-orderable :x)))
  (is (runtime.transforms/order-wrapper? (runtime.transforms/desc-orderable :x)))
  (is (not (runtime.transforms/order-wrapper? :x))))

(deftest ^:parallel apply-breakout-materializes-expression-ref-test
  (let [query    (agent-lib.tu/query-for-table :orders)
        expr     (lib/get-hour (meta/field-metadata :orders :created-at))
        expected (-> query
                     (lib/expression "__breakout_expression_1" expr)
                     ((fn [query']
                        (lib/breakout query' (lib/expression-ref query' "__breakout_expression_1")))))
        actual   (runtime.transforms/apply-breakout query expr)]
    (is (= (agent-lib.tu/comparable-query expected)
           (agent-lib.tu/comparable-query actual)))))

(deftest ^:parallel apply-with-fields-breaks-out-raw-fields-on-aggregated-query-test
  (let [query     (-> (agent-lib.tu/query-for-table :orders)
                      (lib/aggregate (lib/count)))
        selection (meta/field-metadata :orders :id)
        expected  (lib/breakout query selection)
        actual    (runtime.transforms/apply-with-fields query [selection])]
    (is (= (agent-lib.tu/comparable-query expected)
           (agent-lib.tu/comparable-query actual)))))

(deftest ^:parallel apply-order-by-supports-direction-wrappers-test
  (let [query    (agent-lib.tu/query-for-table :orders)
        field    (meta/field-metadata :orders :created-at)
        expected (lib/order-by query (lib.util/fresh-uuids field) :desc)
        actual   (runtime.transforms/apply-order-by query
                                                    (runtime.transforms/desc-orderable field))]
    (is (= (agent-lib.tu/comparable-query expected)
           (agent-lib.tu/comparable-query actual)))))

(deftest ^:parallel query-transform-bindings-expose-all-transform-helpers-test
  (let [bindings (runtime.transforms/query-transform-bindings)]
    (testing "all extracted transform helpers are reachable through the binding map"
      (is (contains? bindings 'asc))
      (is (contains? bindings 'desc))
      (is (contains? bindings 'breakout))
      (is (contains? bindings 'filter))
      (is (contains? bindings 'with-fields))
      (is (contains? bindings 'order-by)))))
