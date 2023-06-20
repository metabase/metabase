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
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models :refer [Card]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel fetch-field-test
  (let [field (#'lib.metadata.jvm/fetch-instance :metadata/column (mt/id :categories :id))]
    (is (not (me/humanize (mc/validate lib.metadata/ColumnMetadata field))))))

(deftest ^:parallel fetch-database-test
  (is (=? {:lib/type :metadata/database}
          (lib.metadata/database (lib.metadata.jvm/application-database-metadata-provider (mt/id)))))
  (testing "Should return nil correctly"
    (is (nil? (lib.metadata.protocols/database (lib.metadata.jvm/application-database-metadata-provider Integer/MAX_VALUE))))))

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
                :source-alias "Orders"}
               {:metabase.lib.field/join-alias "Orders"
                :lib/type :metadata/column
                :base-type :type/Integer
                :name "sum"
                :lib/source :source/joins
                :lib/source-column-alias "sum"
                :effective-type :type/Integer
                :lib/desired-column-alias "Orders__sum"
                :display-name "Sum of Quantity"
                :source-alias "Orders"}]
              (lib.metadata.calculation/metadata mlv2-query))))))

(deftest ^:synchronized with-temp-source-question-metadata-test
  (t2.with-temp/with-temp [Card card {:dataset_query
                                      (mt/mbql-query venues
                                                     {:joins
                                                      [{:source-table $$categories
                                                        :condition    [:= $category_id &c.categories.id]
                                                        :fields       :all
                                                        :alias        "c"}]})}]
    (let [query      {:database (mt/id)
                      :type     :query
                      :query    {:source-table (str "card__" (u/the-id card))}}
          mlv2-query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                (lib.convert/->pMBQL query))
          breakouts  (lib/breakoutable-columns mlv2-query)
          agg-query  (-> mlv2-query
                         (lib/breakout (second breakouts))
                         (lib/breakout (peek breakouts)))]
      (is (=? [{:display-name "ID"
                :long-display-name "ID"
                :effective-type :type/BigInteger
                :semantic-type :type/PK}
               {:display-name "Name"
                :long-display-name "Name"
                :effective-type :type/Text
                :semantic-type :type/Name}
               {:display-name "Category ID"
                :long-display-name "Category ID"
                :effective-type :type/Integer
                :semantic-type :type/FK}
               {:display-name "Latitude"
                :long-display-name "Latitude"
                :effective-type :type/Float
                :semantic-type :type/Latitude}
               {:display-name "Longitude"
                :long-display-name "Longitude"
                :effective-type :type/Float
                :semantic-type :type/Longitude}
               {:display-name "Price"
                :long-display-name "Price"
                :effective-type :type/Integer
                :semantic-type :type/Category}
               {:display-name "c → ID"
                :long-display-name "c → ID"
                :effective-type :type/BigInteger
                :semantic-type :type/PK}
               {:display-name "c → Name"
                :long-display-name "c → Name"
                :effective-type :type/Text
                :semantic-type :type/Name}]
              (map #(lib/display-info mlv2-query %)
                   (lib.metadata.calculation/metadata mlv2-query))))
      (is (=? [{:display-name "Name"
                :long-display-name "Name"
                :effective-type :type/Text
                :semantic-type :type/Name}
               {:display-name "c → Name"
                :long-display-name "c → Name"
                :effective-type :type/Text
                :semantic-type :type/Name}]
              (map #(lib/display-info agg-query %)
                   (lib.metadata.calculation/metadata agg-query)))))))
