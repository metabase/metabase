(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(defn- orders-source []
  {:type :table, :id (meta/id :orders)})

(defn- products-source []
  {:type :table, :id (meta/id :products)})

(defn- products->orders-field-id-mapping []
  {(meta/id :products :id) (meta/id :orders :id)
   (meta/id :products :created-at) (meta/id :orders :created-at)})

(deftest ^:parallel swap-source-in-query-table-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :products))]
    (is (=? {:stages [{:source-table (meta/id :orders)}]}
            (lib-be/swap-source-in-query query
                                         (products-source)
                                         (orders-source)
                                         (products->orders-field-id-mapping))))))

(deftest ^:parallel swap-source-in-query-fields-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                  (lib/with-fields [(meta/field-metadata :products :id)
                                    (meta/field-metadata :products :created-at)]))]
    (is (=? {:stages [{:source-table (meta/id :orders)
                       :fields [[:field {} (meta/id :orders :id)]
                                [:field {} (meta/id :orders :created-at)]]}]}
            (lib-be/swap-source-in-query query
                                         (products-source)
                                         (orders-source)
                                         (products->orders-field-id-mapping))))))

(deftest ^:parallel swap-source-in-parameter-target-field-id-test
  (is (= [:dimension [:field (meta/id :orders :id) nil]]
         (lib-be/swap-source-in-parameter-target [:dimension [:field (meta/id :products :id) nil]]
                                                 (products->orders-field-id-mapping)))))
