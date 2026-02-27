(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel swap-source-in-query-source-table-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields [(meta/field-metadata :orders :id)
                                    (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query (lib-be/swap-source-in-query upgraded-query
                                                   {:type :table, :id (meta/id :orders)}
                                                   {:type :table, :id (meta/id :products)})]
    (testing "should upgrade field refs"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} "ID"]
                                        [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should swap source"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :fields       [[:field {} (meta/id :products :id)]
                                        [:field {} (meta/id :products :created-at)]]}]}
              swapped-query)))))
