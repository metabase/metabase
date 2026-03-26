(ns metabase.agent-lib.runtime.lookup-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.runtime.bindings :as runtime.bindings]
   [metabase.agent-lib.runtime.fields :as runtime.fields]
   [metabase.agent-lib.runtime.lookup :as runtime.lookup]
   [metabase.agent-lib.test-util :as agent-lib.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(defn- lookup-env
  []
  (let [metadata-provider meta/metadata-provider
        tables-by-name    (runtime.fields/build-table-lookup metadata-provider)
        fields-by-table   (runtime.fields/build-field-lookup metadata-provider tables-by-name)
        fields-by-id      (runtime.fields/build-field-id-lookup metadata-provider tables-by-name)]
    {:metadata-provider metadata-provider
     :tables-by-name    tables-by-name
     :fields-by-table   fields-by-table
     :fields-by-id      fields-by-id}))

(deftest ^:parallel lookup-table-resolves-by-id-and-name-test
  (let [{:keys [metadata-provider tables-by-name]} (lookup-env)
        by-name (runtime.lookup/lookup-table metadata-provider tables-by-name "ORDERS")
        by-id   (runtime.lookup/lookup-table metadata-provider tables-by-name (:id by-name))]
    (is (= (:id by-name) (:id by-id)))
    (is (= (meta/id :orders) (:id by-name)))))

(deftest ^:parallel lookup-field-rejects-ambiguous-name-test
  (let [{:keys [metadata-provider tables-by-name fields-by-table fields-by-id]} (lookup-env)]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Ambiguous field"
         (runtime.lookup/lookup-field metadata-provider
                                      tables-by-name
                                      fields-by-table
                                      fields-by-id
                                      "id")))))

(deftest ^:parallel query-relative-field-prefers-current-query-columns-test
  (let [{:keys [metadata-provider tables-by-name fields-by-table fields-by-id]} (lookup-env)
        query      (-> (agent-lib.tu/query-for-table :orders)
                       (lib/breakout (meta/field-metadata :orders :product-id)))
        raw-field  (meta/field-metadata :orders :product-id)
        resolved   (runtime.lookup/query-relative-field metadata-provider
                                                        tables-by-name
                                                        fields-by-table
                                                        fields-by-id
                                                        query
                                                        "orders"
                                                        "PRODUCT_ID")]
    (is (= (:id raw-field) (:id resolved)))
    (is (:lib/source resolved))))

(deftest ^:parallel make-context-bindings-composes-lookup-and-transform-helpers-test
  (let [{:keys [metadata-provider tables-by-name fields-by-table fields-by-id]} (lookup-env)
        bindings (runtime.bindings/make-context-bindings metadata-provider
                                                         tables-by-name
                                                         fields-by-table
                                                         fields-by-id)]
    (testing "lookup bindings"
      (is (= (meta/id :orders)
             (:id ((get bindings 'table) "orders"))))
      (is (= (meta/id :orders :id)
             (:id ((get bindings 'field) "orders" "id")))))
    (testing "transform bindings"
      (is (contains? bindings 'breakout))
      (is (contains? bindings 'order-by))
      (is (contains? bindings 'query)))))
