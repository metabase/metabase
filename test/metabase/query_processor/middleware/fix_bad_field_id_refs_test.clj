(ns metabase.query-processor.middleware.fix-bad-field-id-refs-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.fix-bad-field-id-refs :as fix-bad-field-id-refs]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- wrap-joined-fields
  ([query]
   (wrap-joined-fields meta/metadata-provider query))

  ([metadata-provider query]
   (-> (lib/query metadata-provider query)
       fix-bad-field-id-refs/fix-bad-field-id-refs
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
  (testing "fix-bad-field-id-refs should deduplicate :fields after resolving stuff"
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

(deftest ^:parallel fix-bad-field-id-refs-in-source-queries-test
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

(deftest ^:parallel fix-bad-field-id-refs-in-source-queries-test-2
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

(deftest ^:parallel fix-bad-field-id-refs-in-source-queries-e2e-test
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
                 (wrap-joined-fields (mt/metadata-provider) joins-in-joins-query)))
          (testing "Can we actually run the join-in-joins query?"
            (is (=? {:status :completed, :row_count 1}
                    (qp/process-query (assoc-in joins-in-joins-query [:query :limit] 1))))))))))

(deftest ^:parallel fix-bad-field-id-refs-in-source-queries-test-4
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
        (is (some? (wrap-joined-fields (mt/metadata-provider) query))))
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

(deftest ^:parallel resolve-join-conditions-test
  (testing "Resolve fields in join :conditions"
    (let [mp           (lib.tu/mock-metadata-provider
                        {:database meta/database
                         :tables   [{:id 1, :name "table_a"}
                                    {:id 2, :name "table_b"}
                                    {:id 3, :name "table_c"}]
                         :fields   [{:id            1
                                     :name          "a_id"
                                     :base-type     :type/Text
                                     :semantic-type :type/PK
                                     :table-id      1}
                                    {:id            2
                                     :name          "b_id"
                                     :base-type     :type/Text
                                     :semantic-type :type/FK
                                     :table-id      1}
                                    {:id            3
                                     :name          "b_id"
                                     :base-type     :type/Text
                                     :semantic-type :type/PK
                                     :table-id      2}
                                    {:id            4
                                     :name          "c_id"
                                     :base-type     :type/Text
                                     :semantic-type :type/FK
                                     :table-id      2}
                                    {:id            5
                                     :name          "c_id"
                                     :base-type     :type/Text
                                     :semantic-type :type/PK
                                     :table-id      3}]})
          table-a      (lib.metadata/table mp 1)
          table-b      (lib.metadata/table mp 2)
          table-c      (lib.metadata/table mp 3)
          table-a-b-id (lib.metadata/field mp 2)
          table-b-b-id (lib.metadata/field mp 3)
          table-b-c-id (lib.metadata/field mp 4)
          table-c-c-id (lib.metadata/field mp 5)
          query        (-> (lib/query mp table-a)
                           (lib/join (-> (lib/join-clause table-b [(lib/= table-a-b-id  table-b-b-id)])
                                         (lib/with-join-alias "B")))
                           (lib/join (-> (lib/join-clause table-c [(lib/= table-b-c-id table-c-c-id)])
                                         (lib/with-join-alias "C"))))]
      (is (=? {:stages [{:joins [{:alias     "B"
                                  :stages     [{:source-table 2}]
                                  :conditions [[:= {}
                                                [:field {} 2]
                                                [:field {:join-alias "B"} 3]]]}
                                 {:alias      "C"
                                  :stages     [{:source-table 3}]
                                  :conditions [[:=
                                                {}
                                                [:field {:join-alias "B"} 4] ; join alias should get added here
                                                [:field {:join-alias "C"}
                                                 5]]]}]}]}
              (fix-bad-field-id-refs/fix-bad-field-id-refs query))))))
