(ns metabase.query-processor.middleware.resolve-joined-fields-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.resolve-fields :as resolve-fields]
            [metabase.query-processor.middleware.resolve-joined-fields :as resolve-joined-fields]
            [metabase.query-processor.store :as qp.store]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]
            [schema.core :as s]))

(defn- wrap-joined-fields [query]
  (driver/with-driver (tx/driver)
    (qp.store/with-store
      (qp.store/fetch-and-store-database! (mt/id))
      (-> query
          ((var resolve-fields/resolve-fields*)) ; load fields into the QP store
          (update :query #'resolve-joined-fields/wrap-fields-in-joined-field-if-needed)))))

(deftest wrap-fields-in-joined-field-test
  (is (= (mt/mbql-query checkins
           {:filter [:!= [:joined-field "u" [:field-id (mt/id :users :name)]] nil]
            :joins  [{:source-table $$users
                      :alias        "u"
                      :condition    [:= $user_id &u.users.id]}]})
         (wrap-joined-fields
          (mt/mbql-query checkins
            {:filter [:!= [:field-id (mt/id :users :name)] nil]
             :joins  [{:source-table $$users
                       :alias        "u"
                       :condition    [:= $user_id &u.users.id]}]}))))
  (testing "Do we correctly recurse into `:source-query`"
    (is (= (mt/mbql-query checkins
             {:source-query {:filter [:!= [:joined-field "u" [:field-id (mt/id :users :name)]] nil]
                             :joins  [{:source-table $$users
                                       :alias        "u"
                                       :condition    [:= $user_id &u.users.id]}]}})
           (wrap-joined-fields
            (mt/mbql-query checkins
              {:source-query {:filter [:!= [:field-id (mt/id :users :name)] nil]
                              :joins  [{:source-table $$users
                                        :alias        "u"
                                        :condition    [:= $user_id &u.users.id]}]}}))))))

(deftest deduplicate-fields-test
  (testing "resolve-joined-fields should deduplicate :fields after resolving stuff"
    (is (= (mt/mbql-query checkins
             {:fields [[:joined-field "u" [:field-id (mt/id :users :name)]]]
              :filter [:!= [:joined-field "u" [:field-id (mt/id :users :name)]] nil]
              :joins  [{:source-table $$users
                        :alias        "u"
                        :condition    [:= $user_id &u.users.id]}]})
           (wrap-joined-fields
            (mt/mbql-query checkins
              {:fields [[:field-id (mt/id :users :name)]
                        [:joined-field "u" [:field-id (mt/id :users :name)]]]
               :filter [:!= [:field-id (mt/id :users :name)] nil]
               :joins  [{:source-table $$users
                         :alias        "u"
                         :condition    [:= $user_id &u.users.id]}]}))))))

(deftest resolve-joined-fields-in-source-queries-test
  (testing "Should be able to resolve joined fields at any level of the query (#13642)"
    (mt/dataset sample-dataset
      (testing "simple query"
        (let [query (mt/mbql-query nil
                      {:source-query {:source-table $$orders
                                      :filter       [:= $orders.user_id 1]}
                       :filter       [:= $products.category "Widget"]
                       :joins        [{:strategy     :left-join
                                       :source-query {:source-table $$products}
                                       :condition    [:= $orders.product_id [:joined-field "products" $products.id]]
                                       :alias        "products"}]})]
          (testing (str "\n" (u/pprint-to-str query))
            (is (= (assoc-in query [:query :filter] (mt/$ids [:= [:joined-field "products" $products.category] "Widget"]))
                   (wrap-joined-fields query))))))

      (testing "nested query"
        (let [nested-query (mt/mbql-query nil
                             {:source-query {:source-query {:source-table $$orders
                                                            :filter       [:= $orders.user_id 1]}
                                             :filter       [:= $products.category "Widget"]
                                             :joins        [{:strategy     :left-join
                                                             :source-query {:source-table $$products}
                                                             :condition    [:= $orders.product_id [:joined-field "products" $products.id]]
                                                             :alias        "products"}]}})]
          (testing (str "\n" (u/pprint-to-str nested-query))
            (is (= (assoc-in nested-query
                             [:query :source-query :filter]
                             (mt/$ids [:= [:joined-field "products" $products.category] "Widget"]))
                   (wrap-joined-fields nested-query))))))

      (testing "joins in joins query"
        (let [joins-in-joins-query
              (mt/mbql-query nil
                {:source-table $$products
                 :joins        [{:strategy     :left-join
                                 :source-query {:source-table $$orders
                                                :filter       [:= $products.category "Widget"]
                                                :joins        [{:strategy     :left-join
                                                                :source-table $$products
                                                                :condition    [:=
                                                                               $orders.product_id
                                                                               [:joined-field "products" $products.id]]
                                                                :alias        "products"}]}
                                 :alias        "orders"
                                 :condition    [:= $products.id [:joined-field "orders" $orders.product_id]]}]})]
          (testing (str "\n" (u/pprint-to-str joins-in-joins-query))
            (is (= (assoc-in joins-in-joins-query
                             [:query :joins 0 :source-query :filter]
                             (mt/$ids [:= [:joined-field "products" $products.category] "Widget"]))
                   (wrap-joined-fields joins-in-joins-query)))
            (testing "Can we actually run the join-in-joins query?"
              (is (schema= {:status    (s/eq :completed)
                            :row_count (s/eq 1)
                            s/Keyword  s/Any}
                           (qp/process-query (assoc-in joins-in-joins-query [:query :limit] 1))))))))

      (testing "multiple joins in joins query"
        (let [joins-in-joins-query
              (mt/mbql-query nil
                {:source-table $$products
                 :joins        [{:strategy     :left-join
                                 :source-query {:source-table $$orders
                                                :filter       [:= $products.category "Widget"]
                                                :joins        [{:strategy     :left-join
                                                                :source-table $$products
                                                                :condition    [:=
                                                                               $orders.product_id
                                                                               [:joined-field "products" $products.id]]
                                                                :alias        "products"}]}
                                 :alias        "orders"
                                 :condition    [:= $products.id [:joined-field "orders" $orders.product_id]]}
                                {:strategy     :left-join
                                 :source-query {:source-table $$orders
                                                :filter       [:= $products.category "Widget"]
                                                :joins        [{:strategy     :left-join
                                                                :source-table $$products
                                                                :condition    [:=
                                                                               $orders.product_id
                                                                               [:joined-field "products-2" $products.id]]
                                                                :alias        "products-2"}]}
                                 :alias        "orders-2"
                                 :condition    [:= $products.id [:joined-field "orders-2" $orders.product_id]]}]})]
          (testing (str "\n" (u/pprint-to-str joins-in-joins-query))
            (is (= (-> joins-in-joins-query
                       (assoc-in [:query :joins 0 :source-query :filter]
                                 (mt/$ids [:= [:joined-field "products" $products.category] "Widget"]))
                       (assoc-in [:query :joins 1 :source-query :filter]
                                 (mt/$ids [:= [:joined-field "products-2" $products.category] "Widget"])))
                   (wrap-joined-fields joins-in-joins-query)))))))))
