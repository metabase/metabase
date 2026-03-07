(ns metabase-enterprise.replacement.source-swap.mbql-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.source-swap.mbql :as source-swap.mbql]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel swap-mbql-stages-source-table-test
  (testing "swap-mbql-stages swaps :source-table from orders to reviews"
    (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
          result (source-swap.mbql/swap-mbql-stages query
                                                    [:table (meta/id :orders)]
                                                    [:table (meta/id :reviews)])]
      (is (= (meta/id :reviews)
             (get-in result [:stages 0 :source-table]))))))
