(ns metabase.source-swap.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.source-swap.core :as source-swap]))

(set! *warn-on-reflection* true)

(deftest ^:parallel check-column-mappings-test
  (testing "should match columns by :lib/desired-column-alias (column-match-key)"
    (let [mp (lib.tu/mock-metadata-provider
              {:database {:id 1 :name "db" :engine :h2}
               :cards [{:id 1 :name "old_card" :database-id 1
                        :result-metadata
                        [{:name "ID" :lib/desired-column-alias "ID"
                          :base-type :type/Integer :effective-type :type/Integer}
                         {:name "OLD_NAME" :lib/desired-column-alias "T2__ID"
                          :base-type :type/Integer :effective-type :type/Integer}
                         {:name "SOURCE_ONLY" :lib/desired-column-alias "SOURCE_ONLY"
                          :base-type :type/Text :effective-type :type/Text}]}
                       {:id 2 :name "new_card" :database-id 1
                        :result-metadata
                        [{:name "ID" :lib/desired-column-alias "ID"
                          :base-type :type/Integer :effective-type :type/Integer}
                         {:name "NEW_NAME" :lib/desired-column-alias "T2__ID"
                          :base-type :type/Integer :effective-type :type/Integer}
                         {:name "TARGET_ONLY" :lib/desired-column-alias "TARGET_ONLY"
                          :base-type :type/Text :effective-type :type/Text}]}]})]
      (is (=? [{:source {:name "ID"},       :target {:name "ID"}}
               {:source {:name "OLD_NAME"}, :target {:name "NEW_NAME"}}
               {:source {:name "SOURCE_ONLY"}}
               {:target {:name "TARGET_ONLY"}}]
              (source-swap/check-column-mappings mp [:card 1] [:card 2]))))))

(deftest ^:parallel upgrade-field-ref-mbql-test
  (testing "should upgrade id-based field ref to name-based ref for a card source"
    (let [orders-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          mp           (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
          query        (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/with-fields [(meta/field-metadata :orders :id)]))]
      (is (=? [:field {} "ID"]
              (source-swap/upgrade-field-ref query 0
                                             (lib/ensure-uuid [:field {:base-type :type/BigInteger} (meta/id :orders :id)])))))))

(deftest ^:parallel upgrade-field-ref-native-test
  (testing "should return field ref unchanged for native-only queries"
    (let [query     (lib/native-query meta/metadata-provider "SELECT 1")
          field-ref (lib/ensure-uuid [:field {:base-type :type/Integer} 1])]
      (is (= field-ref (source-swap/upgrade-field-ref query 0 field-ref))))))

(deftest ^:parallel upgrade-field-refs-in-query-mbql-test
  (testing "should upgrade all id-based field refs to name-based refs for a card source"
    (let [orders-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          mp           (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
          query        (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/with-fields [(meta/field-metadata :orders :id)]))]
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]]}]}
              (source-swap/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-native-test
  (testing "should return query unchanged for native-only queries"
    (let [query (lib/native-query meta/metadata-provider "SELECT 1")]
      (is (= query (source-swap/upgrade-field-refs-in-query query))))))

(deftest ^:parallel swap-source-in-query-mbql-test
  (testing "should swap source table and update field refs to new table"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)]))]
      (is (=? {:stages [{:source-table (meta/id :products)
                         :fields       [[:field {} (meta/id :products :id)]]}]}
              (source-swap/swap-source-in-query query
                                                [:table (meta/id :orders)]
                                                [:table (meta/id :products)]))))))

(deftest ^:parallel swap-source-in-query-native-test
  (testing "should replace card reference in native SQL query text and template tags"
    (let [mp    (lib.tu/mock-metadata-provider meta/metadata-provider
                                               {:cards [{:id 1 :name "Card 1" :database-id (meta/id)}
                                                        {:id 2 :name "Card 2" :database-id (meta/id)}]})
          query (-> (lib/native-query mp "SELECT * FROM {{#1}}")
                    (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}}))]
      (is (= "SELECT * FROM {{#2}}"
             (lib/raw-native-query (source-swap/swap-source-in-query query [:card 1] [:card 2])))))))
