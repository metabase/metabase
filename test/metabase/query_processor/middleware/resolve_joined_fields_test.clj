(ns metabase.query-processor.middleware.resolve-joined-fields-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.resolve-joined-fields :as resolve-joined-fields]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- wrap-joined-fields
  ([query]
   (wrap-joined-fields meta/metadata-provider query))

  ([metadata-provider query]
   (-> (lib/query metadata-provider query)
       resolve-joined-fields/resolve-joined-fields
       lib/->legacy-MBQL)))

(deftest ^:parallel wrap-fields-in-joined-field-test
  (is (=? (lib.tu.macros/mbql-query checkins
            {:filter [:!= [:field %users.name {:join-alias "u"}] nil]
             :joins  [{:source-table $$users
                       :alias        "u"
                       :condition    [:= $user-id &u.users.id]}]})
          (wrap-joined-fields
           (lib.tu.macros/mbql-query checkins
             {:filter [:!= [:field %users.name nil] nil]
              :joins  [{:source-table $$users
                        :alias        "u"
                        :condition    [:= $user-id &u.users.id]}]})))))

(deftest ^:parallel wrap-fields-in-joined-field-test-2
  (testing "Do we correctly recurse into `:source-query`"
    (is (=? (lib.tu.macros/mbql-query checkins
              {:source-query {:filter [:!= [:field %users.name {:join-alias "u"}] nil]
                              :joins  [{:source-table $$users
                                        :alias        "u"
                                        :condition    [:= $user-id &u.users.id]}]}})
            (wrap-joined-fields
             (lib.tu.macros/mbql-query checkins
               {:source-query {:source-table $$checkins
                               :filter       [:!= [:field %users.name nil] nil]
                               :joins        [{:source-table $$users
                                               :alias        "u"
                                               :condition    [:= $user-id &u.users.id]}]}}))))))

(deftest ^:parallel deduplicate-fields-test
  (testing "resolve-joined-fields should deduplicate :fields after resolving stuff"
    (is (=? (lib.tu.macros/mbql-query checkins
              {:fields [[:field %users.name {:join-alias "u"}]]
               :filter [:!= [:field %users.name {:join-alias "u"}] nil]
               :joins  [{:source-table $$users
                         :alias        "u"
                         :condition    [:= $user-id &u.users.id]}]})
            (wrap-joined-fields
             (lib.tu.macros/mbql-query checkins
               {:fields [[:field %users.name nil]
                         [:field %users.name {:join-alias "u"}]]
                :filter [:!= [:field %users.name nil] nil]
                :joins  [{:source-table $$users
                          :alias        "u"
                          :condition    [:= $user-id &u.users.id]}]}))))))

(deftest ^:parallel resolve-joined-fields-in-source-queries-test
  (testing "Should be able to resolve joined fields at any level of the query (#13642)"
    (testing "simple query"
      (let [query (lib.tu.macros/mbql-query nil
                    {:source-query {:source-table $$orders
                                    :filter       [:= $orders.user-id 1]}
                     :filter       [:= $products.category "Widget"]
                     :joins        [{:strategy     :left-join
                                     :source-query {:source-table $$products}
                                     :condition    [:= $orders.product-id [:field %products.id {:join-alias "products"}]]
                                     :alias        "products"
                                     :fields       :all}]})]
        (testing (str "\n" (u/pprint-to-str query))
          (is (=? {:query {:filter (lib.tu.macros/$ids [:= [:field %products.category {:join-alias "products"}] "Widget"])}}
                  (wrap-joined-fields query))))))))

(deftest ^:parallel resolve-joined-fields-in-source-queries-test-2
  (testing "Should be able to resolve joined fields at any level of the query (#13642)"
    (testing "nested query"
      (let [nested-query (lib.tu.macros/mbql-query nil
                           {:source-query {:source-query {:source-table $$orders
                                                          :filter       [:= $orders.user-id 1]}
                                           :filter       [:= $products.category "Widget"]
                                           :joins        [{:strategy     :left-join
                                                           :source-query {:source-table $$products}
                                                           :condition    [:= $orders.product-id [:field %products.id {:join-alias "products"}]]
                                                           :alias        "products"
                                                           :fields       :all}]}})]
        (testing (str "\n" (u/pprint-to-str nested-query))
          (is (=? {:query {:source-query {:filter (lib.tu.macros/$ids
                                                    [:= [:field %products.category {:join-alias "products"}] "Widget"])}}}
                 (wrap-joined-fields nested-query))))))))

(deftest ^:parallel resolve-joined-fields-in-source-queries-e2e-test
  (testing "Should be able to resolve joined fields at any level of the query (#13642)"
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
                                                                             [:field %products.id {:join-alias "products"}]]
                                                              :alias        "products"
                                                              :fields       :all}]}
                               :alias        "orders"
                               :condition    [:= $products.id [:field %orders.product_id {:join-alias "orders"}]]}]})]
        (testing (str "\n" (u/pprint-to-str joins-in-joins-query))
          (is (= (assoc-in joins-in-joins-query
                           [:query :joins 0 :source-query :filter]
                           (mt/$ids [:= [:field %products.category {:join-alias "products"}] "Widget"]))
                 (wrap-joined-fields (mt/application-database-metadata-provider (mt/id)) joins-in-joins-query)))
          (testing "Can we actually run the join-in-joins query?"
            (is (=? {:status :completed, :row_count 1}
                    (qp/process-query (assoc-in joins-in-joins-query [:query :limit] 1))))))))))

(deftest ^:parallel resolve-joined-fields-in-source-queries-test-4
  (testing "Should be able to resolve joined fields at any level of the query (#13642)"
    (testing "multiple joins in joins query"
      (let [joins-in-joins-query
            (lib.tu.macros/mbql-query nil
              {:source-table $$products
               :joins        [{:strategy     :left-join
                               :source-query {:source-table $$orders
                                              :filter       [:= $products.category "Widget"]
                                              :joins        [{:strategy     :left-join
                                                              :source-table $$products
                                                              :condition    [:=
                                                                             $orders.product-id
                                                                             [:field %products.id {:join-alias "products"}]]
                                                              :alias        "products"}]}
                               :alias        "orders"
                               :condition    [:= $products.id [:field %orders.product-id {:join-alias "orders"}]]}
                              {:strategy     :left-join
                               :source-query {:source-table $$orders
                                              :filter       [:= $products.category "Widget"]
                                              :joins        [{:strategy     :left-join
                                                              :source-table $$products
                                                              :condition    [:=
                                                                             $orders.product-id
                                                                             [:field %products.id {:join-alias "products-2"}]]
                                                              :alias        "products-2"}]}
                               :alias        "orders-2"
                               :condition    [:= $products.id [:field %orders.product-id {:join-alias "orders-2"}]]}]})]
        (testing (str "\n" (u/pprint-to-str joins-in-joins-query))
          (is (= (-> joins-in-joins-query
                     (assoc-in [:query :joins 0 :source-query :filter]
                               (lib.tu.macros/$ids [:= [:field %products.category {:join-alias "products"}] "Widget"]))
                     (assoc-in [:query :joins 1 :source-query :filter]
                               (lib.tu.macros/$ids [:= [:field %products.category {:join-alias "products-2"}] "Widget"])))
                 (wrap-joined-fields joins-in-joins-query))))))))

(deftest ^:parallel no-op-test
  (testing "Make sure a query that doesn't need anything wrapped is returned as-is"
    (let [query (lib.tu.macros/mbql-query venues
                  {:source-query {:source-table $$venues
                                  :aggregation  [[:count]]
                                  :breakout     [$name [:field %categories.name {:join-alias "c"}]]
                                  :joins        [{:source-table $$categories
                                                  :alias        "c"
                                                  :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]}
                   :filter       [:> [:field "count" {:base-type :type/Number}] 0]
                   :limit        3})]
      (is (= query
             (wrap-joined-fields query))))))

(deftest ^:parallel multiple-joins-to-same-table-e2e-test
  (testing "Should prefer EXPLICIT joins when resolving joined fields and both implicit/explicit joins are present"
    (let [query (mt/mbql-query orders
                  {:filter [:= $products.category "Widget"]
                   :joins  [{:source-table $$products
                             :fields       :all
                             :condition    [:= $product_id [:field %products.id {:join-alias "products"}]]
                             :alias        "products"}
                            {:source-table $$products
                             :alias        "PRODUCTS__via__PRODUCT_ID"
                             :fields       :none
                             :strategy     :left-join
                             :fk-field-id  %product_id
                             :condition    [:=
                                            $product_id
                                            [:field %products.id {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]}]
                   :limit  10
                   :fields [$id
                            $user_id
                            $product_id
                            $subtotal
                            $tax
                            $total
                            $discount
                            $created_at
                            $quantity
                            $products.title
                            [:field %products.title {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]})]
      (testing "Middleware should handle the query"
        (is (some? (wrap-joined-fields (mt/application-database-metadata-provider (mt/id)) query))))
      (testing "Should be able tor run query end-to-end"
        (is (=? {:status    :completed
                 :row_count 10}
                (qp/process-query query)))))))

(deftest ^:parallel handle-unwrapped-joined-fields-correctly-test
  (testing "References to joined fields in a join in a source query should be resolved correctly #(14766)"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :joins        [{:source-table $$products
                                              :condition    [:= $product-id &Products.products.id]
                                              :alias        "Products"}]}
               :aggregation  [[:count]]
               :breakout     [[:field "Products__ID" {}]]
               :limit        5})
            (wrap-joined-fields
             (lib.tu.macros/mbql-query orders
               {:source-query {:source-table $$orders
                               :joins        [{:source-table $$products
                                               :condition    [:= $product-id &Products.products.id]
                                               :alias        "Products"
                                               :fields       :all}]}
                :aggregation  [[:count]]
                :breakout     [$products.id]
                :limit        5}))))))

(deftest ^:parallel do-not-rewrite-top-level-clauses-if-field-is-from-source-table-or-query
  (testing (str "Do not add `:join-alias` to top-level `:field` clauses if the Field could come from the "
                "`:source-table` or `:source-query` (#18502)")
    (is (=? (lib.tu.macros/mbql-query people
              {:source-query {:source-table $$people
                              :breakout     [!month.created-at]
                              :aggregation  [[:count]]
                              :order-by     [[:asc !month.created-at]]}
               :joins        [{:source-query {:source-table $$people
                                              :breakout     [!month.birth-date]
                                              :aggregation  [[:count]]
                                              :order-by     [[:asc !month.birth-date]]}
                               :alias        "Q2"
                               :condition    [:= !month.created-at !month.&Q2.birth-date]
                               :fields       [&Q2.birth-date &Q2.*count/BigInteger]
                               :strategy     :left-join}]
               :fields       [!default.created-at
                              *count/BigInteger
                              &Q2.birth-date
                              &Q2.*count/BigInteger]
               :limit        3})
            (wrap-joined-fields
             (lib.tu.macros/mbql-query people
               {:source-query {:source-table $$people
                               :breakout     [!month.created-at]
                               :aggregation  [[:count]]
                               :order-by     [[:asc !month.created-at]]}
                :joins        [{:source-query {:source-table $$people
                                               :breakout     [!month.birth-date]
                                               :aggregation  [[:count]]
                                               :order-by     [[:asc !month.birth-date]]}
                                :alias        "Q2"
                                :condition    [:= !month.created-at !month.&Q2.birth-date]
                                :fields       [&Q2.birth-date &Q2.*count/BigInteger]
                                :strategy     :left-join}]
                :fields       [!default.created-at
                               *count/BigInteger
                               &Q2.birth-date
                               &Q2.*count/BigInteger]
                :limit        3}))))))
