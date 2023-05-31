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
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel fetch-field-test
  (let [field (#'lib.metadata.jvm/fetch-instance :metadata/field (mt/id :categories :id))]
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

(deftest ^:parallel long-display-name-test-3 []
  (mt/dataset sample-dataset
    (let [query             (mt/mbql-query orders {:joins [{:source-table $$products
                                                            :condition    [:= $product_id &O.products.id]
                                                            :alias        "O"}]
                                                   :limit 1})
          results           (qp/process-query query)
          result-metadata   (for [col (get-in results [:data :results_metadata :columns])]
                              (update-keys col u/->kebab-case-en))
          metadata-provider (lib.tu/composed-metadata-provider
                             (lib.tu/mock-metadata-provider
                              {:cards [{:id              1
                                        :name            "Card 1"
                                        :dataset-query   query
                                        :result-metadata result-metadata}]})
                             (lib.metadata.jvm/application-database-metadata-provider (mt/id)))
          query             (lib/query metadata-provider {:database (mt/id)
                                                          :type     :query
                                                          :query    {:source-table "card__1"}})
          cols              (lib/breakoutable-columns query)]
      (testing (str "metadata = \n" (u/pprint-to-str result-metadata))
        (is (= ["ID"
                "User ID"
                "Product ID"
                "Subtotal"
                "Tax"
                "Total"
                "Discount"
                "Created At"
                "Quantity"
                "User → ID"
                "User → Address"
                "User → Email"
                "User → Password"
                "User → Name"
                "User → City"
                "User → Longitude"
                "User → State"
                "User → Source"
                "User → Birth Date"
                "User → Zip"
                "User → Latitude"
                "User → Created At"
                "Product → ID"
                "Product → Ean"
                "Product → Title"
                "Product → Category"
                "Product → Vendor"
                "Product → Price"
                "Product → Rating"
                "Product → Created At"]
               (for [col cols]
                 (:long-display-name (lib/display-info query col)))))))))
