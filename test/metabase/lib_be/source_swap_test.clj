(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(defn- products->orders-field-id-mapping []
  {(meta/id :products :id) (meta/id :orders :id)})

(deftest ^:parallel swap-source-in-query-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :products))]
    (is (=? {:stages [{:source-table (meta/id :orders)}]}
            (lib-be/swap-source-in-query query
                                         {:type :table, :id (meta/id :products)}
                                         {:type :table, :id (meta/id :orders)}
                                         (products->orders-field-id-mapping))))))

(deftest ^:parallel swap-source-in-parameter-target-test
  (is (= [:dimension [:field (meta/id :orders :id) nil]]
         (lib-be/swap-source-in-parameter-target [:dimension [:field (meta/id :products :id) nil]]
                                                 (products->orders-field-id-mapping)))))
