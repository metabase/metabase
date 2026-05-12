(ns metabase-enterprise.transform-optimizer.index-introspection-test
  "Pure tests for the parts of index-introspection that don't need a live
  Postgres. Catalog-query integration tests live under
  `transform-optimizer.context-test` against `mt/test-driver :postgres`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.index-introspection :as iix]))

(set! *warn-on-reflection* true)

(deftest group-by-table-normalises-case-test
  (testing "indexes are bucketed by [schema table] with lowercase keys"
    (let [grouped
          (iix/group-by-table
           [{:schema "Shop" :table "Orders" :name "idx_a"}
            {:schema "shop" :table "orders" :name "idx_b"}
            {:schema "SHOP" :table "REVIEWS" :name "idx_c"}])]
      (is (= 2 (count grouped))
          "the three case-different shop.orders rows collapse to one bucket")
      (is (= #{["shop" "orders"] ["shop" "reviews"]} (set (keys grouped)))
          "keys are lowercased")
      (is (= 2 (count (get grouped ["shop" "orders"]))))
      (is (= 1 (count (get grouped ["shop" "reviews"])))))))

(deftest group-by-table-handles-nil-test
  (testing "nil schema or table is preserved through normalisation (so we don't crash)"
    (is (= {[nil "x"] [{:schema nil :table "x"}]}
           (iix/group-by-table [{:schema nil :table "x"}])))))

(deftest group-by-table-empty-test
  (is (= {} (iix/group-by-table []))))
