(ns metabase.query-processor.middleware.remove-inactive-field-refs-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(defn- test-metadata-provider []
  (lib.tu/metadata-provider-with-cards-for-queries
   (lib.metadata.jvm/application-database-metadata-provider (mt/id))
   [;; Card 1
    (mt/mbql-query orders
      {:joins [{:source-table $$products
                :alias "Product"
                :condition
                [:= $orders.product_id
                 [:field %products.id {:join-alias "Product"}]]
                :fields :all}]})
    ;; Card 2
    (mt/mbql-query orders
      {:fields [$id $subtotal $tax $total $created_at $quantity]
       :joins [{:source-table $$products
                :alias "Product"
                :condition
                [:= $orders.product_id
                 [:field %products.id {:join-alias "Product"}]]
                :fields :all}]})
    ;; Card 3
    ;; 11 columns: 6 from ORDERS and 5 from PRODUCTS
    (mt/mbql-query orders
      {:fields [$id $subtotal $tax $total $created_at $quantity]
       :joins [{:source-table $$products
                :alias "Product"
                :condition
                [:= $orders.product_id
                 [:field %products.id {:join-alias "Product"}]]
                :fields
                [[:field %products.id {:join-alias "Product"}] ; AKA ID_2
                 [:field %products.title {:join-alias "Product"}]
                 [:field %products.vendor {:join-alias "Product"}]
                 [:field %products.price {:join-alias "Product"}]
                 [:field %products.rating {:join-alias "Product"}]]}]})
    ;; Card 4
    (mt/mbql-query orders
      {:source-table "card__3"
       :fields [[:field "ID" {:base-type :type/BigInteger}]
                [:field "TAX" {:base-type :type/Float}]
                [:field "TOTAL" {:base-type :type/Float}]
                [:field "ID_2" {:base-type :type/BigInteger}]
                [:field "RATING" {:base-type :type/Float}]]
       :filter [:> [:field "TOTAL" {:base-type :type/Float}] 3]})]))

(defn- summary-query []
  (mt/mbql-query orders
    {:source-table "card__4"
     :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
     :breakout [[:field "RATING" {:base-type :type/Float}]]}))

(defn- join-query
  "Should return 12 columns -- 8 columns from PRODUCTS, 4 from the join against Card 3."
  []
  (mt/mbql-query products
    {:joins [{:source-table "card__3"
              :alias "Card"
              :condition
              [:= $products.id
               [:field "ID_2" {:join-alias "Card"
                               :base-type :type/BigInteger}]]
              :fields
              [[:field "ID_2" {:join-alias "Card"
                               :base-type :type/BigInteger}] ; PRODUCTS.ID -- (mt/id :products :id)
               [:field "TOTAL" {:join-alias "Card"
                                :base-type :type/Float}]
               [:field "TAX" {:join-alias "Card"
                              :base-type :type/Float}]
               [:field "VENDOR" {:join-alias "Card"
                                 :base-type :type/Text}]]}]}))

(deftest ^:parallel deleted-columns-before-deletion-test-1a
  (qp.store/with-metadata-provider (test-metadata-provider)
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (let [query (mt/mbql-query orders
                    {:source-table "card__1"})
            results (qp/process-query query)]
        (is (=? ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX" "TOTAL" "DISCOUNT"
                 "CREATED_AT" "QUANTITY"
                 "ID_2" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE"
                 "RATING" "CREATED_AT_2"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-before-deletion-test-1b
  (qp.store/with-metadata-provider (test-metadata-provider)
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (let [query (mt/mbql-query orders
                    {:source-table "card__2"})
            results (qp/process-query query)]
        (is (=? ["ID" "SUBTOTAL" "TAX" "TOTAL" "CREATED_AT" "QUANTITY"
                 "ID_2" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE"
                 "RATING" "CREATED_AT_2"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-before-deletion-test-1c
  (qp.store/with-metadata-provider (test-metadata-provider)
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (let [query (mt/mbql-query orders
                    {:source-table "card__3"})
            results (qp/process-query query)]
        (is (=? ["ID" "SUBTOTAL" "TAX" "TOTAL" "CREATED_AT" "QUANTITY"
                 "ID_2" "TITLE" "VENDOR" "PRICE" "RATING"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-before-deletion-test-1d
  (qp.store/with-metadata-provider (test-metadata-provider)
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (let [query (mt/mbql-query orders
                    {:source-table "card__4"})
            results (qp/process-query query)]
        (is (=? ["ID" "TAX" "TOTAL" "ID_2" "RATING"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-before-deletion-test-2
  (qp.store/with-metadata-provider (test-metadata-provider)
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (is (= ["Product → Rating" "Sum of Total"]
             (->> (mt/process-query (summary-query))
                  mt/cols
                  (map :display_name)))))))

;;; see
;;; also [[metabase.lib.stage-test/add-correct-fields-for-join-test]], [[metabase.lib.field-test/resolve-deduplicated-field-ref-test]],
;;; and [[metabase.lib.join-test/returned-columns-with-deduplicated-name-refs-test]]
(deftest ^:parallel deleted-columns-before-deletion-test-3
  (qp.store/with-metadata-provider (test-metadata-provider)
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (is (= ["ID" "Ean" "Title" "Category" "Vendor" "Price" "Rating" "Created At"
              "Card → ID 2" "Card → Total" "Card → Tax" "Card → Vendor"]
             (->> (mt/process-query (join-query))
                  mt/cols
                  (map :display_name)))))))

(defn- inactive-columns-test-metadata-provider []
  (lib.tu/merged-mock-metadata-provider
   (test-metadata-provider)
   {:fields (for [id [(mt/id :orders :tax)
                      (mt/id :products :ean)
                      (mt/id :products :vendor)]]
              {:id id, :active false})}))

(deftest ^:parallel deleted-columns-test-1a
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    ;; running these questions after fields have been removed from the database
    ;; and the change has been detected by syncing
    (testing "Questions return the same columns except the ones deleted"
      (let [query (mt/mbql-query orders
                    {:source-table "card__1"})
            results (qp/process-query query)]
        (is (=? ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TOTAL" "DISCOUNT"
                 "CREATED_AT" "QUANTITY"
                 "ID_2" "TITLE" "CATEGORY" "PRICE"
                 "RATING" "CREATED_AT_2"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-test-1b
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    ;; running these questions after fields have been removed from the database
    ;; and the change has been detected by syncing
    (testing "Questions return the same columns except the ones deleted"
      (let [query (mt/mbql-query orders
                    {:source-table "card__2"})
            results (qp/process-query query)]
        (is (=? ["ID" "SUBTOTAL" "TOTAL" "CREATED_AT" "QUANTITY"
                 "ID_2" "TITLE" "CATEGORY" "PRICE"
                 "RATING" "CREATED_AT_2"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-test-1c
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    ;; running these questions after fields have been removed from the database
    ;; and the change has been detected by syncing
    (testing "Questions return the same columns except the ones deleted"
      (let [query (mt/mbql-query orders
                    {:source-table "card__3"})
            results (qp/process-query query)]
        (is (=? ["ID" "SUBTOTAL" "TOTAL" "CREATED_AT" "QUANTITY"
                 "ID_2" "TITLE" "PRICE" "RATING"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-test-1d
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    ;; running these questions after fields have been removed from the database
    ;; and the change has been detected by syncing
    (testing "Questions return the same columns except the ones deleted"
      (let [query (mt/mbql-query orders
                    {:source-table "card__4"})
            results (qp/process-query query)]
        (is (=? ["ID" "TOTAL" "ID_2" "RATING"]
                (map :name (mt/cols results))))))))

(deftest ^:parallel deleted-columns-test-2
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    (testing "Active columns can be used"
      (is (= ["Product → Rating" "Sum of Total"]
             (->> (mt/run-mbql-query orders
                    {:source-table "card__3"
                     :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                     :breakout [[:field "RATING" {:base-type :type/Integer}]]})
                  mt/cols
                  (map :display_name)))))))

(deftest ^:parallel deleted-columns-test-3
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    (testing "Using deleted columns results in an error"
      (is (thrown? clojure.lang.ExceptionInfo
                   (mt/run-mbql-query orders
                     {:source-table "card__3"
                      :aggregation [[:sum [:field "TAX" {:base-type :type/Float}]]]
                      :breakout [[:field "RATING" {:base-type :type/Integer}]]}))))))

(deftest ^:parallel deleted-columns-test-4
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    (testing "Additional level of nesting is OK"
      (is (= ["Product → Rating" "Sum of Total"]
             (->> (mt/process-query (summary-query))
                  mt/cols
                  (map :display_name)))))))

(deftest ^:parallel deleted-columns-test-5
  (qp.store/with-metadata-provider (inactive-columns-test-metadata-provider)
    (testing "Additional level of nesting is OK"
      (testing "in joins too"
        (is (= ["ID" "Title" "Category" "Price" "Rating" "Created At"
                "Card → ID 2" "Card → Total"]
               (->> (qp/process-query (join-query))
                    mt/cols
                    (map :display_name))))))))
