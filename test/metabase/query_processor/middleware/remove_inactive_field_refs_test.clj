(ns metabase.query-processor.middleware.remove-inactive-field-refs-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ^:synchronized deleted-columns-test
  ;; It doesn't really matter which DB we test with. The test uses H2 column names.
  (qp.store/with-metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
    (mt/with-temp [:model/Card card0 {:dataset_query
                                      (mt/mbql-query orders
                                        {:joins [{:source-table $$products
                                                  :alias "Product"
                                                  :condition
                                                  [:= $orders.product_id
                                                   [:field %products.id {:join-alias "Product"}]]
                                                  :fields :all}]})}
                   :model/Card card1 {:dataset_query
                                      (mt/mbql-query orders
                                        {:fields [$id $subtotal $tax $total $created_at $quantity]
                                         :joins [{:source-table $$products
                                                  :alias "Product"
                                                  :condition
                                                  [:= $orders.product_id
                                                   [:field %products.id {:join-alias "Product"}]]
                                                  :fields :all}]})}
                   :model/Card card2 {:dataset_query
                                      (mt/mbql-query orders
                                        {:fields [$id $subtotal $tax $total $created_at $quantity]
                                         :joins [{:source-table $$products
                                                  :alias "Product"
                                                  :condition
                                                  [:= $orders.product_id
                                                   [:field %products.id {:join-alias "Product"}]]
                                                  :fields
                                                  [[:field %products.id {:join-alias "Product"}]
                                                   [:field %products.title {:join-alias "Product"}]
                                                   [:field %products.vendor {:join-alias "Product"}]
                                                   [:field %products.price {:join-alias "Product"}]
                                                   [:field %products.rating {:join-alias "Product"}]]}]})}
                   :model/Card card3 {:dataset_query
                                      (mt/mbql-query orders
                                        {:source-table (str "card__" (u/the-id card2))
                                         :fields [[:field "ID" {:base-type :type/BigInteger}]
                                                  [:field "TAX" {:base-type :type/Float}]
                                                  [:field "TOTAL" {:base-type :type/Float}]
                                                  [:field "ID_2" {:base-type :type/BigInteger}]
                                                  [:field "RATING" {:base-type :type/Float}]]
                                         :filter [:> [:field "TOTAL" {:base-type :type/Float}] 3]})}]
      (let [summary-query (mt/mbql-query orders
                            {:source-table (str "card__" (u/the-id card3))
                             :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                             :breakout [[:field "RATING" {:base-type :type/Float}]]})
            join-query (mt/mbql-query orders
                         {:source-table (mt/id :products)
                          :joins [{:source-table (str "card__" (u/the-id card2))
                                   :alias "Card"
                                   :condition
                                   [:= $products.id
                                    [:field "ID_2" {:join-alias "Card"
                                                    :base-type :type/BigInteger}]]
                                   :fields
                                   [[:field "ID_2" {:join-alias "Card"
                                                    :base-type :type/BigInteger}]
                                    [:field "TOTAL" {:join-alias "Card"
                                                     :base-type :type/Float}]
                                    [:field "TAX" {:join-alias "Card"
                                                   :base-type :type/Float}]
                                    [:field "VENDOR" {:join-alias "Card"
                                                      :base-type :type/Text}]]}]})]
        ;; running these questions before fields get removed from the database
        (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
          (doseq [[card fields] {card0 ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX" "TOTAL" "DISCOUNT"
                                        "CREATED_AT" "QUANTITY"
                                        "ID_2" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE"
                                        "RATING" "CREATED_AT_2"]
                                 card1 ["ID" "SUBTOTAL" "TAX" "TOTAL" "CREATED_AT" "QUANTITY"
                                        "ID_2" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE"
                                        "RATING" "CREATED_AT_2"]
                                 card2 ["ID" "SUBTOTAL" "TAX" "TOTAL" "CREATED_AT" "QUANTITY"
                                        "ID_2" "TITLE" "VENDOR" "PRICE" "RATING"]
                                 card3 ["ID" "TAX" "TOTAL" "ID_2" "RATING"]}]
            (let [query (mt/mbql-query orders
                          {:source-table (str "card__" (u/the-id card))})]
              (let [results (qp/process-query query)]
                (is (=? fields
                        (map :name (mt/cols results)))))))
          (is (= ["Product → Rating" "Sum of Total"]
                 (->> (mt/process-query summary-query)
                      mt/cols
                      (map :display_name))))
          (is (= ["ID" "Ean" "Title" "Category" "Vendor" "Price" "Rating" "Created At"
                  "Card → ID 2" "Card → Total" "Card → Tax" "Card → Vendor"]
                 (->> (mt/process-query join-query)
                      mt/cols
                      (map :display_name)))))

        ;; simulate the deletion of some fields and sync marking them inactive
        (let [inactive-ids [(mt/id :orders :tax) (mt/id :products :ean) (mt/id :products :vendor)]]
          (t2/update! :model/Field :id [:in inactive-ids] {:active false})

          ;; running the actual tests
          (try
            (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
              (binding [qp.store/*TESTS-ONLY-allow-replacing-metadata-provider* true]
                (qp.store/with-metadata-provider mp
                  ;; running these questions after fields have been removed from the database
                  ;; and the change has been detected by syncing
                  (testing "Questions return the same columns except the ones deleted"
                    (doseq [[card fields] {card0 ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TOTAL" "DISCOUNT"
                                                  "CREATED_AT" "QUANTITY"
                                                  "ID_2" "TITLE" "CATEGORY" "PRICE"
                                                  "RATING" "CREATED_AT_2"]
                                           card1 ["ID" "SUBTOTAL" "TOTAL" "CREATED_AT" "QUANTITY"
                                                  "ID_2" "TITLE" "CATEGORY" "PRICE"
                                                  "RATING" "CREATED_AT_2"]
                                           card2 ["ID" "SUBTOTAL" "TOTAL" "CREATED_AT" "QUANTITY"
                                                  "ID_2" "TITLE" "PRICE" "RATING"]
                                           card3 ["ID" "TOTAL" "ID_2" "RATING"]}]
                      (let [query (mt/mbql-query orders
                                    {:source-table (str "card__" (u/the-id card))})]
                        (let [results (qp/process-query query)]
                          (is (=? fields
                                  (map :name (mt/cols results))))))))
                  (testing "Active columns can be used"
                    (is (= ["Product → Rating" "Sum of Total"]
                           (->> (mt/run-mbql-query orders
                                  {:source-table (str "card__" (u/the-id card2))
                                   :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                                   :breakout [[:field "RATING" {:base-type :type/Integer}]]})
                                mt/cols
                                (map :display_name)))))
                  (testing "Using deleted columns results in an error"
                    (is (thrown? clojure.lang.ExceptionInfo
                                 (mt/run-mbql-query orders
                                   {:source-table (str "card__" (u/the-id card2))
                                    :aggregation [[:sum [:field "TAX" {:base-type :type/Float}]]]
                                    :breakout [[:field "RATING" {:base-type :type/Integer}]]}))))
                  (testing "Additional level of nesting is OK"
                    (is (= ["Product → Rating" "Sum of Total"]
                           (->> (mt/process-query summary-query)
                                mt/cols
                                (map :display_name))))
                    (testing "in joins too"
                      (is (= ["ID" "Title" "Category" "Price" "Rating" "Created At"
                              "Card → ID 2" "Card → Total"]
                             (->> (qp/process-query join-query)
                                  mt/cols
                                  (map :display_name)))))))))
            (finally
              (t2/update! :model/Field :id [:in inactive-ids] {:active true}))))))))
