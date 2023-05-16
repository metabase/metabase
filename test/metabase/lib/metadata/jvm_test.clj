(ns metabase.lib.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test :as mt]))

(deftest ^:parallel fetch-field-test
  (let [field (#'lib.metadata.jvm/fetch-instance :metadata/field (mt/id :categories :id))]
    (is (not (me/humanize (mc/validate lib.metadata/ColumnMetadata field))))))

(deftest ^:parallel saved-question-metadata-test
  (let [card  {:dataset-query {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :venues)
                                          :joins        [{:fields       :all
                                                          :source-table (mt/id :categories)
                                                          :condition    [:=
                                                                         [:field (mt/id :venues :category_id) nil]
                                                                         [:field (mt/id :categories :id) {:join-alias "Cat"}]]
                                                          :alias        "Cat"}]}}}
        query (lib/saved-question-query
               (lib.metadata.jvm/application-database-metadata-provider (mt/id))
               card)]
    (is (=? [{:lib/desired-column-alias "ID"}
             {:lib/desired-column-alias "NAME"}
             {:lib/desired-column-alias "CATEGORY_ID"}
             {:lib/desired-column-alias "LATITUDE"}
             {:lib/desired-column-alias "LONGITUDE"}
             {:lib/desired-column-alias "PRICE"}
             {:lib/desired-column-alias "Cat__ID"}
             {:lib/desired-column-alias "Cat__NAME"}]
            (lib.metadata.calculation/metadata query)))))

(deftest ^:parallel join-with-aggregation-reference-in-fields-metadata-test
  (mt/dataset sample-dataset
    (let [query (mt/mbql-query products
                  {:joins [{:source-query {:source-table $$orders
                                           :breakout     [$orders.product_id]
                                           :aggregation  [[:sum $orders.quantity]]}
                            :alias        "Orders"
                            :condition    [:= $id &Orders.orders.product_id]
                            :fields       [&Orders.orders.product_id
                                           &Orders.*sum/Integer]}]
                   :fields [$id]})
          mlv2-query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                (lib.convert/->pMBQL query))]
      (is (=? [{:base-type :type/BigInteger
                :semantic-type :type/PK
                :table-id (mt/id :products)
                :name "ID"
                :lib/source :source/fields
                :lib/source-column-alias "ID"
                :effective-type :type/BigInteger
                :id (mt/id :products :id)
                :lib/desired-column-alias "ID"
                :display-name "ID"}
               {:metabase.lib.field/join-alias "Orders"
                :base-type :type/Integer
                :semantic-type :type/FK
                :table-id (mt/id :orders)
                :name "PRODUCT_ID"
                :lib/source :source/joins
                :lib/source-column-alias "PRODUCT_ID"
                :effective-type :type/Integer
                :id (mt/id :orders :product_id)
                :lib/desired-column-alias "Orders__PRODUCT_ID"
                :display-name "Product ID"
                :source_alias "Orders"}
               {:metabase.lib.field/join-alias "Orders"
                :lib/type :metadata/field
                :base-type :type/Integer
                :name "sum"
                :lib/source :source/joins
                :lib/source-column-alias "sum"
                :effective-type :type/Integer
                :lib/desired-column-alias "Orders__sum"
                :display-name "Sum"
                :source_alias "Orders"}]
              (lib.metadata.calculation/metadata mlv2-query))))))

(deftest ^:parallel temporal-bucketing-options-test
  (mt/dataset sample-dataset
    (let [query {:lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :fields       [[:field
                                             {:lib/uuid (str (random-uuid))}
                                             (mt/id :products :created_at)]]
                             :source-table (mt/id :products)}]
                 :database (mt/id)}
          query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                  query)]
      (is (= [{:unit :minute}
              {:unit :hour}
              {:unit :day}
              {:unit :week}
              {:unit :month, :default true}
              {:unit :quarter}
              {:unit :year}
              {:unit :minute-of-hour}
              {:unit :hour-of-day}
              {:unit :day-of-week}
              {:unit :day-of-month}
              {:unit :day-of-year}
              {:unit :week-of-year}
              {:unit :month-of-year}
              {:unit :quarter-of-year}]
             (->> (lib.metadata.calculation/metadata query)
                  first
                  (lib/available-temporal-buckets query)
                  (mapv #(select-keys % [:unit :default]))))))))
