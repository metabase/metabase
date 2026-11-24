(ns metabase.queries.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.replacement :as queries.replacement]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- orders-query
  "A query of the orders table filtered on its id, with a second stage."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/aggregate (lib/count))
        (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
        lib/append-stage
        (lib/filter (lib/= (lib.metadata/field mp (mt/id :orders :id)) 1)))))

(deftest ^:parallel upgrade-field-refs-test
  (testing "card whose query refers to a column of a previous stage by id gets its query upgraded"
    (is (=? [[:model/Card 1 {:dataset_query {:stages [{:source-table (mt/id :orders)}
                                                      {:filters [[:= {} [:field {} "ID"] 1]]}]}}]]
            (queries.replacement/upgrade-field-refs {:id 1, :dataset_query (orders-query), :replacement/cards {}}))))
  (testing "card without valid query or parameters writes nothing"
    (is (= [] (queries.replacement/upgrade-field-refs {:id 1, :dataset_query {}, :replacement/cards {}})))))

(deftest ^:parallel swap-source-test
  (testing "card on old table moves its query and table id to new table"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (is (=? [[:model/Card 1 {:dataset_query {:stages [{:source-table (mt/id :reviews)}]}
                               :table_id      (mt/id :reviews)}]]
              (queries.replacement/swap-source {:id 1, :dataset_query query, :table_id (mt/id :orders)}
                                               [:table (mt/id :orders)]
                                               [:table (mt/id :reviews)])))))
  (testing "card that does not use old source writes nothing"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
      (is (= [] (queries.replacement/swap-source {:id 1, :dataset_query query, :table_id (mt/id :products)}
                                                 [:table (mt/id :orders)]
                                                 [:table (mt/id :reviews)])))))
  (testing "card without valid query swaps nothing"
    (is (nil? (queries.replacement/swap-source {:id 1, :dataset_query {}}
                                               [:table (mt/id :orders)]
                                               [:table (mt/id :reviews)]))))
  (testing "parameter that takes its values from old card takes them from new card"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
      (is (=? [[:model/Card 1 {:parameters [{:id "p" :values_source_config {:card_id 3}}]}]]
              (queries.replacement/swap-source {:id            1
                                                :dataset_query query
                                                :table_id      (mt/id :products)
                                                :parameters    [{:id                   "p"
                                                                 :type                 :category
                                                                 :values_source_type   :card
                                                                 :values_source_config {:card_id 2}}]}
                                               [:card 2]
                                               [:card 3]))))))
