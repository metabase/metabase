(ns metabase.lib.metadata.calculation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel basic-isa-test
  (testing "effective type passes"
    (is (lib.metadata.calculation/isa
         {:effective_type :type/Text, :semantic_type :type/Address}
         :type/Text)))
  (testing "semantic type passes"
    (is (lib.metadata.calculation/isa
         {:effective_type :type/Number, :semantic_type :type/ZipCode}
         :type/Text)))
  (testing "both effective type and semantic type pass"
    (is (lib.metadata.calculation/isa
         {:effective_type :type/Text, :semantic_type :type/City}
         :type/Text)))
  (testing "none of effective type and semantic type passes"
    (is (not (lib.metadata.calculation/isa
              {:effective_type :type/Number, :semantic_type :type/IPAddress}
              :type/Text)))))

(deftest ^:parallel column-isa-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
        orderable-columns (lib/orderable-columns query)
        columns-of-type (fn [typ] (filter #(lib.metadata.calculation/isa % typ)
                                         orderable-columns))]
      (testing "effective type"
        (is (=? [{:name "NAME"
                  :lib/desired-column-alias "NAME"
                  :semantic_type :type/Name
                  :effective_type :type/Text}
                 {:name "NAME"
                  :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__NAME"
                  :semantic_type :type/Name
                  :effective_type :type/Text}]
                (columns-of-type :type/Text))))
      (testing "semantic type"
        (is (=? [{:name "ID"
                  :lib/desired-column-alias "ID"
                  :semantic_type :type/PK
                  :effective_type :type/BigInteger}
                 {:name "CATEGORY_ID"
                  :lib/desired-column-alias "CATEGORY_ID"
                  :semantic_type :type/FK
                  :effective_type :type/Integer}
                 {:name "ID"
                  :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__ID"
                  :semantic_type :type/PK
                  :effective_type :type/BigInteger}]
                (columns-of-type :Relation/*))))))

(deftest ^:parallel calculate-names-even-without-metadata-test
  (testing "Even if metadata is missing, we should still be able to calculate reasonable display names"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/order-by [:field
                                   {:lib/uuid  (str (random-uuid))
                                    :base-type :type/Text}
                                   "TOTAL"]))]
      (is (= "Venues, Sorted by Total ascending"
             (lib.metadata.calculation/suggested-name query))))))
