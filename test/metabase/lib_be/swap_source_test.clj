(ns metabase.lib-be.swap-source-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.swap-source :as swap-source]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli :as mu]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel swap-table-source-test
  (testing "swapping source-table from orders to products"
    (mu/disable-enforcement
      (let [mp     (mt/metadata-provider)
            query  (lib/query mp (lib.metadata/table mp (mt/id :orders)))
            result (swap-source/swap-source-in-query
                    query
                    {:source-type :table
                     :source-id   (mt/id :orders)
                     :target-type :table
                     :target-id   (mt/id :products)})]
        (is (=? {:stages [{:source-table (mt/id :products)}]}
                result))))))
