(ns metabase-enterprise.workspaces.mirroring.adjustments-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.mirroring.adjustments :as ws.adjustments]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest adjust-ids-in-mbql-transform-test
  (let [mp (mt/metadata-provider)
        query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total))))
                  (lib/breakout (lib/with-temporal-bucket
                                  (lib.metadata/field mp (mt/id :orders :created_at))
                                  :month)))]
    (mt/with-temp [:model/Transform
                   t1
                   {:source_type :mbql
                    :source {:type :query
                             :query query}}

                   :model/Table mirror-table {}
                   :model/Field mirror-total {:name "TOTAL"
                                              :table_id (:id mirror-table)}
                   :model/Field mirror-created {:name "CREATED_AT"
                                                :table_id (:id mirror-table)}

                   ;; Following to conform asseritons on same number of fields in duplicated table
                   :model/Field _ {:table_id (:id mirror-table)}
                   :model/Field _ {:table_id (:id mirror-table)}
                   :model/Field _ {:table_id (:id mirror-table)}
                   :model/Field _ {:table_id (:id mirror-table)}
                   :model/Field _ {:table_id (:id mirror-table)}
                   :model/Field _ {:table_id (:id mirror-table)}
                   :model/Field _ {:table_id (:id mirror-table)}]
      (testing "source-table and fields in query are correctly remapped in duplicated transform"
        (is (=? {:source {:query {:stages [{:source-table (:id mirror-table)
                                            :aggregation [[:sum {} [:field {} (:id mirror-total)]]]
                                            :breakout [[:field {} (:id mirror-created)]]}]}}}
                (ws.adjustments/rewrite-mappings
                 t1 (@#'ws.adjustments/mappings {(mt/id :orders) (:id mirror-table)}))))))))

(deftest adjust-ids-in-mbql-support-test
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Card c {:dataset_query
                                  (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                   :model/Transform
                   t1
                   {:source_type :mbql
                    :source {:type :query
                             :query (lib/query mp (lib.metadata/card mp (:id c)))}}]
      (testing "Ensure source table only support"
        (is (thrown-with-msg? Throwable #"Supporting only transforms with source table"
                              (ws.adjustments/rewrite-mappings t1 {}))))))
  (mt/with-temp [:model/Transform t1 {:source_type :native}]
    (testing "Ensure mbql only support"
      (is (thrown-with-msg? Throwable #"Supporting only mbql sourced transforms"
                            (ws.adjustments/rewrite-mappings t1 {}))))))

(deftest adjust-ids-in-mbql-transform-joining-tables-test
  (let [mp (mt/metadata-provider)
        query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/join (lib.metadata/table mp (mt/id :products))))]
    (mt/with-temp [:model/Transform
                   t1
                   {:source_type :mbql
                    :source {:type :query
                             :query query}}

                   :model/Table orders-mirror {}
                   :model/Field orders-mirror-product-id {:name "PRODUCT_ID"
                                                          :table_id (:id orders-mirror)}

                   ;; Following to conform asseritons on same number of fields in duplicated ORDERS table
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}
                   :model/Field _ {:table_id (:id orders-mirror)}

                   :model/Table products-mirror {}
                   :model/Field products-mirror-id {:name "ID" :table_id (:id products-mirror)}

                   ;; Following to conform asseritons on same number of fields in duplicated PRODUCTS table
                   :model/Field _ {:table_id (:id products-mirror)}
                   :model/Field _ {:table_id (:id products-mirror)}
                   :model/Field _ {:table_id (:id products-mirror)}
                   :model/Field _ {:table_id (:id products-mirror)}
                   :model/Field _ {:table_id (:id products-mirror)}
                   :model/Field _ {:table_id (:id products-mirror)}
                   :model/Field _ {:table_id (:id products-mirror)}]
      (testing "source-table and fields remapped in transform with joins"
        (is (=? {:source {:query {:stages [{:source-table (:id orders-mirror)
                                            :joins [{:stages [{:source-table (:id products-mirror)}]
                                                     :conditions [[:= {}
                                                                   [:field {} (:id orders-mirror-product-id)]
                                                                   [:field {} (:id products-mirror-id)]]]}]}]}}}
                (ws.adjustments/rewrite-mappings
                 t1 (@#'ws.adjustments/mappings {(mt/id :orders) (:id orders-mirror)
                                                 (mt/id :products) (:id products-mirror)}))))))))
