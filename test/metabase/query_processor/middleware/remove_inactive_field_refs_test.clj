(ns metabase.query-processor.middleware.remove-inactive-field-refs-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.remove-inactive-field-refs :as remove-inactive-field-refs]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(deftest ^:parallel do-not-remove-fields-from-aggregations-test
  (testing "Do not remove fields introduced by aggregations in a previous stage"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :joins        [{:source-table $$products
                                                   :alias        "T"
                                                   :condition    [:=
                                                                  $product-id
                                                                  [:field %products.id {:join-alias "T"}]]
                                                   :fields       :all}]
                                   :breakout     [[:field %products.category {:join-alias "T"}]]
                                   :aggregation  [[:count]]}
                    :filter       [:= *count/Integer 3976]}))]
      (is (=? {:stages [{}
                        {:fields [[:field {} (meta/id :products :category)]
                                  [:field {} "count"]]}]}
              (lib/query meta/metadata-provider (qp.preprocess/preprocess query)))))))

(def ^:private metadata-provider
  (delay
    (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
     (lib.metadata.jvm/application-database-metadata-provider (mt/id))
     [(mt/mbql-query orders
        {:joins [{:source-table $$products
                  :alias        "Product"
                  :condition    [:=
                                 $orders.product_id
                                 [:field %products.id {:join-alias "Product"}]]
                  :fields       :all}]})
      (mt/mbql-query orders
        {:fields [$id $subtotal $tax $total $created_at $quantity]
         :joins  [{:source-table $$products
                   :alias        "Product"
                   :condition    [:=
                                  $orders.product_id
                                  [:field %products.id {:join-alias "Product"}]]
                   :fields       :all}]})
      (mt/mbql-query orders
        {:fields [$id $subtotal $tax $total $created_at $quantity]
         :joins  [{:source-table $$products
                   :alias        "Product"
                   :condition    [:=
                                  $orders.product_id
                                  [:field %products.id {:join-alias "Product"}]]
                   :fields       [[:field %products.id {:join-alias "Product"}]
                                  [:field %products.title {:join-alias "Product"}]
                                  [:field %products.vendor {:join-alias "Product"}]
                                  [:field %products.price {:join-alias "Product"}]
                                  [:field %products.rating {:join-alias "Product"}]]}]})
      (mt/mbql-query orders
        {:source-table "card__3"
         :fields       [[:field "ID" {:base-type :type/BigInteger}]
                        [:field "TAX" {:base-type :type/Float}]
                        [:field "TOTAL" {:base-type :type/Float}]
                        [:field "ID_2" {:base-type :type/BigInteger}]
                        [:field "RATING" {:base-type :type/Float}]]
         :filter       [:> [:field "TOTAL" {:base-type :type/Float}] 3]})])))

(defn- summary-query []
  (mt/mbql-query orders
    {:source-table "card__4"
     :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
     :breakout [[:field "RATING" {:base-type :type/Float}]]}))

(defn- join-query []
  (mt/mbql-query orders
    {:source-table (mt/id :products)
     :joins [{:source-table "card__3"
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
                                 :base-type :type/Text}]]}]}))

(deftest ^:parallel deleted-columns-before-test
  (qp.store/with-metadata-provider @metadata-provider
    ;; running these questions before fields get removed from the database
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (doseq [[card-id fields] {1 ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX" "TOTAL" "DISCOUNT"
                                   "CREATED_AT" "QUANTITY"
                                   "ID_2" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE"
                                   "RATING" "CREATED_AT_2"]
                                2 ["ID" "SUBTOTAL" "TAX" "TOTAL" "CREATED_AT" "QUANTITY"
                                   "ID_2" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE"
                                   "RATING" "CREATED_AT_2"]
                                3 ["ID" "SUBTOTAL" "TAX" "TOTAL" "CREATED_AT" "QUANTITY"
                                   "ID_2" "TITLE" "VENDOR" "PRICE" "RATING"]
                                4 ["ID" "TAX" "TOTAL" "ID_2" "RATING"]}]
        (let [query (mt/mbql-query orders
                      {:source-table (str "card__" card-id)})
              results (qp/process-query query)]
          (is (=? fields
                  (map :name (mt/cols results)))))))))

(deftest ^:parallel deleted-columns-before-test-2
  (qp.store/with-metadata-provider @metadata-provider
    ;; running these questions before fields get removed from the database
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (is (= ["Product → Rating" "Sum of Total"]
             (->> (mt/process-query (summary-query))
                  mt/cols
                  (map :display_name)))))))

(deftest ^:parallel deleted-columns-before-test-3
  (qp.store/with-metadata-provider @metadata-provider
    ;; running these questions before fields get removed from the database
    (testing "Behavior before the deletion (if this changes, the other cases have to change accordingly)"
      (is (= ["ID" "Ean" "Title" "Category" "Vendor" "Price" "Rating" "Created At"
              "Card → ID" "Card → Total" "Card → Tax" "Card → Vendor"]
             (->> (mt/process-query (join-query))
                  mt/cols
                  (map :display_name)))))))

(def ^:private deleted-columns-metadata-provider
  "Simulate the deletion of some fields and sync marking them inactive."
  (delay
    (lib.tu/merged-mock-metadata-provider
     @metadata-provider
     {:fields (for [field-id [(mt/id :orders :tax) (mt/id :products :ean) (mt/id :products :vendor)]]
                {:id field-id, :active false})})))

(defn- basic-query []
  (-> (lib/query @deleted-columns-metadata-provider (lib.metadata/table @metadata-provider (mt/id :orders)))
      (lib/with-fields [(lib.metadata/field @metadata-provider (mt/id :orders :id))
                        (lib.metadata/field @metadata-provider (mt/id :orders :tax))])
      (lib.util/update-query-stage 0 assoc :lib/stage-metadata {:lib/type :metadata/results
                                                                :columns  [(lib.metadata/field @metadata-provider (mt/id :orders :id))
                                                                           (lib.metadata/field @metadata-provider (mt/id :orders :tax))]})))

(deftest ^:parallel basic-deleted-columns-test
  (testing "should remove field in query with 1 stage"
    (let [query (basic-query)]
      (is (=? {:stages [{:fields [[:field {} (mt/id :orders :id)]
                                  [:field {} (mt/id :orders :tax)]]}]}
              query))
      (is (=? {:stages [{:fields [[:field {} (mt/id :orders :id)]]}]}
              (remove-inactive-field-refs/remove-inactive-field-refs query))))))

(deftest ^:parallel basic-deleted-columns-test-2
  (testing "should remove field in query with 2 stages"
    (let [query (-> (basic-query)
                    lib/append-stage
                    (lib/with-fields [[:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "ID"]
                                      [:field {:lib/uuid (str (random-uuid)), :base-type :type/Float} "TAX"]]))]
      (is (=? {:stages [{:fields [[:field {} (mt/id :orders :id)]
                                  [:field {} (mt/id :orders :tax)]]}
                        {:fields [[:field {} "ID"]
                                  [:field {} "TAX"]]}]}
              query))
      (is (=? {:stages [{:fields [[:field {} (mt/id :orders :id)]]}
                        {:fields [[:field {} "ID"]]}]}
              (remove-inactive-field-refs/remove-inactive-field-refs query))))))

(deftest ^:parallel basic-deleted-columns-test-3
  (testing "should remove field in joins"
    (let [preprocessed (qp.preprocess/preprocess (lib/query @deleted-columns-metadata-provider (join-query)))]
      (testing ":query => :joins => first => :source-query => :fields"
        (is (=? [[:field (mt/id :orders :id) nil]
                 [:field (mt/id :orders :subtotal) nil]
                 [:field (mt/id :orders :total) nil]
                 [:field (mt/id :orders :created_at) nil]
                 [:field (mt/id :orders :quantity) nil]
                 [:field (mt/id :products :id) {:join-alias "Product"}]
                 [:field (mt/id :products :title) {:join-alias "Product"}]
                 [:field (mt/id :products :price) {:join-alias "Product"}]
                 [:field (mt/id :products :rating) {:join-alias "Product"}]]
                (-> preprocessed :query :joins first :source-query :fields))))
      (testing ":query => :fields"
        (is (=? [[:field (mt/id :products :id) nil]
                 [:field (mt/id :products :title) nil]
                 [:field (mt/id :products :category) nil]
                 [:field (mt/id :products :price) nil]
                 [:field (mt/id :products :rating) nil]
                 [:field (mt/id :products :created_at) nil]
                 [:field "ID_2" {:join-alias "Card", :base-type :type/BigInteger}]
                 [:field "TOTAL" {:join-alias "Card", :base-type :type/Float}]]
                (-> preprocessed :query :fields)))))))

(deftest ^:parallel deleted-columns-test
  (qp.store/with-metadata-provider @deleted-columns-metadata-provider
    ;; running these questions after fields have been removed from the database and the change has been detected by
    ;; syncing
    (testing "Questions return the same columns except the ones deleted"
      (doseq [[card-id fields] {1 ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TOTAL" "DISCOUNT"
                                   "CREATED_AT" "QUANTITY"
                                   "ID_2" "TITLE" "CATEGORY" "PRICE"
                                   "RATING" "CREATED_AT_2"]
                                2 ["ID" "SUBTOTAL" "TOTAL" "CREATED_AT" "QUANTITY"
                                   "ID_2" "TITLE" "CATEGORY" "PRICE"
                                   "RATING" "CREATED_AT_2"]
                                3 ["ID" "SUBTOTAL" "TOTAL" "CREATED_AT" "QUANTITY"
                                   "ID_2" "TITLE" "PRICE" "RATING"]
                                4 ["ID" "TOTAL" "ID_2" "RATING"]}]
        (let [query (mt/mbql-query orders
                      {:source-table (str "card__" card-id)})
              results (qp/process-query query)]
          (is (=? fields
                  (map :name (mt/cols results)))))))))

(deftest ^:parallel deleted-columns-test-2
  (qp.store/with-metadata-provider @deleted-columns-metadata-provider
    (testing "Active columns can be used"
      (is (= ["Product → Rating" "Sum of Total"]
             (->> (mt/run-mbql-query orders
                    {:source-table "card__3"
                     :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                     :breakout [[:field "RATING" {:base-type :type/Integer}]]})
                  mt/cols
                  (map :display_name)))))))

(deftest ^:parallel deleted-columns-test-3
  (qp.store/with-metadata-provider @deleted-columns-metadata-provider
    (testing "Using deleted columns results in an error"
      (is (thrown?
           clojure.lang.ExceptionInfo
           (mt/run-mbql-query orders
             {:source-table "card__3"
              :aggregation [[:sum [:field "TAX" {:base-type :type/Float}]]]
              :breakout [[:field "RATING" {:base-type :type/Integer}]]}))))))

(deftest ^:parallel deleted-columns-test-4
  (qp.store/with-metadata-provider @deleted-columns-metadata-provider
    (testing "Additional level of nesting is OK"
      (is (= ["Product → Rating" "Sum of Total"]
             (->> (mt/process-query (summary-query))
                  mt/cols
                  (map :display_name)))))))

(deftest ^:parallel deleted-columns-test-5
  (qp.store/with-metadata-provider @deleted-columns-metadata-provider
    (testing "Additional level of nesting is OK"
      (testing "in joins too"
        (is (= ["ID" "Title" "Category" "Price" "Rating" "Created At"
                "Card → ID" "Card → Total"]
               (->> (qp/process-query (join-query))
                    mt/cols
                    (map :display_name))))))))
