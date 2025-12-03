(ns metabase.query-processor.util.nest-query-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.places-cam-likes-metadata-provider :as lib.tu.places-cam-likes-metadata-provider]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.test :as mt]))

(defn- nest-expressions-mbql5 [query]
  (driver/with-driver (or driver/*driver* :h2)
    (-> query
        qp.preprocess/preprocess
        nest-query/nest-expressions)))

(defn- nest-expressions [query]
  (-> query
      nest-expressions-mbql5
      lib/->legacy-MBQL
      :query))

(deftest ^:parallel nest-expressions-test
  (is (=? (lib.tu.macros/$ids venues
            {:source-query {:source-table $$venues
                            :expressions  {"double_price" [:* [:field %price nil]
                                                           2]}
                            :fields       [[:field %price nil]
                                           [:expression "double_price" {}]]}
             :breakout     [[:field "PRICE" {}]
                            [:field "double_price" {}]]
             :aggregation  [[:count]]
             :order-by     [[:asc [:field "PRICE" {}]]
                            [:asc [:field "double_price" {}]]]})
          (-> (lib/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query venues
                 {:expressions {"double_price" [:* $price 2]}
                  :breakout    [$price
                                [:expression "double_price"]]
                  :aggregation [[:count]]}))
              qp.preprocess/preprocess
              nest-expressions))))

(deftest ^:parallel nest-order-by-expressions-test
  (testing "Expressions in an order-by clause result in nesting"
    (is (=? (lib.tu.macros/$ids venues
              {:source-query {:source-table $$venues
                              :expressions  {"double_price" [:* [:field %price nil]
                                                             2]}
                              :fields       [[:field %price nil]
                                             [:expression "double_price" {}]]}
               :order-by     [[:asc *double_price/Integer]]})
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:expressions {"double_price" [:* $price 2]}
                    :fields      [$price
                                  [:expression "double_price"]]
                    :order-by    [[:asc [:expression "double_price"]]]}))
                qp.preprocess/preprocess
                nest-expressions)))))

(deftest ^:parallel nest-order-by-literal-expressions-test
  (testing "Literal expressions in an order-by clause result in nesting"
    (is (=? (lib.tu.macros/$ids venues
              {:source-query {:source-table $$venues
                              :expressions  {"favorite" [:value "good venue" {:base_type :type/Text}]}
                              :fields       [[:field %name nil]
                                             [:expression "favorite" {}]]
                              :filter       [:=
                                             [:field %name nil]
                                             [:expression "favorite" {:base-type :type/Text}]]}
               :order-by     [[:asc *favorite/Text]]})
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:expressions {"favorite" [:value "good venue" {:base_type :type/Text}]}
                    :fields      [$name
                                  [:expression "favorite"]]
                    :filter      [:= $name [:expression "favorite"]]
                    :order-by    [[:asc [:expression "favorite"]]]}))
                qp.preprocess/preprocess
                nest-expressions)))))

(deftest ^:parallel multiple-expressions-test
  (testing "Make sure the nested version of the query doesn't mix up expressions if we have ones that reference others"
    (is (=? (lib.tu.macros/$ids venues
              {:source-query {:source-table $$venues
                              :expressions  {"big_price"
                                             [:+
                                              [:field %price nil]
                                              2]

                                             "my_cool_new_field"
                                             [:/
                                              [:field %price nil]
                                              [:expression "big_price" {}]]}
                              :fields [[:expression "my_cool_new_field" {}]
                                       [:field %id nil]]}
               :breakout [[:field "my_cool_new_field" {:base-type :type/Float}]]
               ;; uh... not sure ordering by ID is legal here??? Since it doesn't appear in the query results??
               :order-by [[:asc [:field "ID" {}]]
                          [:asc [:field "my_cool_new_field" {:base-type :type/Float}]]]
               :limit    3})
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:expressions {"big_price"         [:+ $price 2]
                                  "my_cool_new_field" [:/ $price [:expression "big_price"]]}
                    :breakout    [[:expression "my_cool_new_field"]]
                    :order-by    [[:asc $id]]
                    :limit       3}))
                nest-expressions)))))

(deftest ^:parallel nest-expressions-ignore-source-queries-test
  (testing (str "When 'raising' :expression clauses, only raise ones in the current level. Handle duplicate expression "
                "names correctly.")
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:source-query {:source-table $$venues
                                   :expressions  {"x" [:* $price 2]}
                                   :breakout     [$id [:expression "x"]]}
                    :expressions  {"x" [:* $price 4]}
                    :breakout     [$id [:expression "x"]]
                    :limit        1}))]
      (mt/with-native-query-testing-context query
        (is (=? (lib.tu.macros/$ids venues
                  {:source-query {:source-query {:source-query {:source-table $$venues
                                                                :expressions {"x" [:*
                                                                                   [:field %price nil]
                                                                                   2]}
                                                                :fields [[:field %id nil]
                                                                         #_[:field %price nil]
                                                                         [:expression "x" {}]]}
                                                 :breakout [[:field "ID" {}]
                                                            [:field "x" {:base-type :type/Integer}]]}
                                  :expressions {"x" [:*
                                                     [:field %price nil]
                                                     4]}
                                  :fields [[:field %id nil]
                                           [:expression "x" {}]]}
                   :breakout [[:field "ID" {}]
                              [:field "x" {:base-type :type/Integer}]]
                   :limit 1})
                (nest-expressions query)))))))

(deftest ^:parallel idempotence-test
  (testing "A nested query should return the same set of columns as the original"
    (let [mp      (lib.tu/mock-metadata-provider
                   meta/metadata-provider
                   {:cards [{:id            1
                             :dataset-query (lib.tu.macros/mbql-query reviews
                                              {:breakout    [$product-id]
                                               :aggregation [[:count]]
                                               ;; filter on an implicit join
                                               :filter      [:= $product-id->products.category "Doohickey"]})}]})
          query   (lib/query
                   mp
                   (lib.tu.macros/mbql-query orders
                     {:joins       [{:source-table "card__1"
                                     :alias        "Question 1"
                                     :condition    [:=
                                                    $product-id
                                                    [:field
                                                     %reviews.product-id
                                                     {:join-alias "Question 1"}]]
                                     :fields       :all}]
                      :expressions {"CC" [:+ 1 1]}
                      :limit       2}))
          nested  (assoc query :query (nest-expressions query))
          query*  (lib/query mp query)
          nested* (lib/query mp nested)]
      (is (= (map :lib/desired-column-alias (lib/returned-columns query*))
             (map :lib/desired-column-alias (lib/returned-columns nested*)))))))

(deftest ^:parallel nest-expressions-ignore-source-queries-from-joins-test-e2e-test
  (testing "Ignores source-query from joins (#20809)"
    (let [mp (lib.tu/mock-metadata-provider
              (mt/metadata-provider)
              {:cards [{:id            1
                        :dataset-query (mt/mbql-query
                                         reviews
                                         {:breakout    [$product_id]
                                          :aggregation [[:count]]
                                          ;; filter on an implicit join
                                          :filter      [:= $product_id->products.category "Doohickey"]})}]})]
      ;; the result returned is not important, just important that the query is valid and completes
      (is (seq
           (mt/rows
            (qp/process-query
             (lib/query
              mp
              (mt/mbql-query orders
                {:joins       [{:source-table "card__1"
                                :alias        "Question 1"
                                :condition    [:=
                                               $product_id
                                               [:field
                                                %reviews.product_id
                                                {:join-alias "Question 1"}]]
                                :fields       :all}]
                 :expressions {"CC" [:+ 1 1]}
                 :limit       2})))))))))

(deftest ^:parallel nest-expressions-with-joins-test
  (testing "If there are any `:joins`, those need to be nested into the `:source-query` as well."
    (is (=? (lib.tu.macros/$ids venues
              {:source-query {:source-table $$venues
                              :joins        [{:strategy     :left-join
                                              :condition    [:=
                                                             [:field %category-id nil]
                                                             [:field %category-id {:join-alias "CategoriesStats"}]]
                                              :source-query {:source-table $$venues
                                                             :aggregation  [[:aggregation-options
                                                                             [:max [:field %price nil]]
                                                                             {:name "MaxPrice"}]
                                                                            [:aggregation-options
                                                                             [:avg
                                                                              [:field %price nil]]
                                                                             {:name "AvgPrice"}]
                                                                            [:aggregation-options
                                                                             [:min [:field %price nil]]
                                                                             {:name "MinPrice"}]]
                                                             :breakout     [[:field %category-id nil]]
                                                             :order-by     [[:asc [:field %category-id nil]]]}
                                              :alias        "CategoriesStats"
                                              :fields       [[:field %category-id {:join-alias "CategoriesStats"}]
                                                             [:field "MaxPrice" {:join-alias "CategoriesStats"}]
                                                             [:field "AvgPrice" {:join-alias "CategoriesStats"}]
                                                             [:field "MinPrice" {:join-alias "CategoriesStats"}]]}]
                              :expressions  {"RelativePrice" [:/
                                                              [:field %price nil]
                                                              [:field "AvgPrice" {:join-alias "CategoriesStats"}]]}
                              :fields       [[:field %id nil]
                                             [:field %name nil]
                                             [:field %category-id nil]
                                             [:field %latitude nil]
                                             [:field %longitude nil]
                                             [:field %price nil]
                                             [:expression "RelativePrice" {}]
                                             [:field %category-id {:join-alias "CategoriesStats"}]
                                             [:field "MaxPrice" {:join-alias "CategoriesStats"}]
                                             [:field "AvgPrice" {:join-alias "CategoriesStats"}]
                                             [:field "MinPrice" {:join-alias "CategoriesStats"}]]}
               :breakout     [[:field "ID" {}]
                              [:field "NAME" {}]
                              [:field "CATEGORY_ID" {}]
                              [:field "LATITUDE" {}]
                              [:field "LONGITUDE" {}]
                              [:field "PRICE" {}]
                              [:field "RelativePrice" {}]
                              [:field "CategoriesStats__CATEGORY_ID" {}]
                              [:field "CategoriesStats__MaxPrice" {}]
                              [:field "CategoriesStats__AvgPrice" {}]
                              [:field "CategoriesStats__MinPrice" {}]]
               :limit        3})
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:breakout    [$id
                                  $name
                                  $category-id
                                  $latitude
                                  $longitude
                                  $price
                                  [:expression "RelativePrice"]
                                  &CategoriesStats.category-id
                                  &CategoriesStats.*MaxPrice/Integer
                                  &CategoriesStats.*AvgPrice/Integer
                                  &CategoriesStats.*MinPrice/Integer]
                    :expressions {"RelativePrice" [:/ $price &CategoriesStats.*AvgPrice/Integer]}
                    :joins       [{:strategy     :left-join
                                   :condition    [:= $category-id &CategoriesStats.category-id]
                                   :source-query {:source-table $$venues
                                                  :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                                 [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                                 [:aggregation-options [:min $price] {:name "MinPrice"}]]
                                                  :breakout     [$category-id]}
                                   :alias        "CategoriesStats"
                                   :fields       :all}]
                    :limit       3}))
                qp.preprocess/preprocess
                nest-expressions)))))

(deftest ^:parallel nest-expressions-eliminate-duplicate-coercion-test
  (testing "If coercion happens in the source query, don't do it a second time in the parent query (#12430)"
    (let [mp (lib.tu/merged-mock-metadata-provider
              meta/metadata-provider
              {:fields [{:id                (meta/id :venues :price)
                         :coercion-strategy :Coercion/UNIXSeconds->DateTime
                         :effective-type    :type/DateTime}]})]
      (is (=? (lib.tu.macros/$ids venues
                {:source-query {:source-table $$venues
                                :expressions  {"test" [:* 1 1]}
                                :fields       [[:field %price {:temporal-unit (symbol "nil #_\"key is not present.\"")}]
                                               [:expression "test" {}]]}
                 :breakout     [[:field "PRICE" {:temporal-unit :day}]
                                [:field "test" {}]]
                 :limit        1})
              (-> (lib/query
                   mp
                   (lib.tu.macros/mbql-query venues
                     {:expressions {"test" [:* 1 1]}
                      :breakout    [$price
                                    [:expression "test"]]
                      :limit       1}))
                  nest-expressions))))))

(deftest ^:parallel multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (is (=? (:query (merge (let [products-category (lib.tu.macros/$ids orders
                                                     [:field %products.category {:join-alias "PRODUCTS__via__PRODUCT_ID"}])
                                 created-at        (lib.tu.macros/$ids orders
                                                     [:field %created-at {:temporal-unit      :year
                                                                          :qp/ignore-coercion true}])
                                 pivot-grouping    [:field "pivot-grouping" {:base-type :type/Float}]]
                             (lib.tu.macros/mbql-query orders
                               {:breakout    [products-category
                                              created-at
                                              pivot-grouping]
                                :aggregation [[:aggregation-options [:count] {:name "count"}]]
                                :order-by    [[:asc products-category]
                                              [:asc created-at]
                                              [:asc pivot-grouping]]}))
                           (lib.tu.macros/mbql-query orders
                             ;; TODO: The order here is not deterministic! It's coming
                             ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
                             ;; or [[metabase.query-processor.util.nest-query]], which walks the query looking for
                             ;; refs in an arbitrary order, and returns `m/distinct-by` over that random order.
                             ;; Changing the map keys on the inner query can perturb this order; if you cause this
                             ;; test to fail based on shuffling the order of these joined fields, just edit the
                             ;; expectation to match the new order. Tech debt issue: #39396
                             {:source-query {:source-table $$orders
                                             :joins        [{:source-query {:source-table $$products}
                                                             :alias        "PRODUCTS__via__PRODUCT_ID"
                                                             :condition    [:=
                                                                            [:field %product-id nil]
                                                                            [:field %products.id {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                             :strategy     :left-join
                                                             :fk-field-id  %product-id}]
                                             :expressions  {"pivot-grouping" [:abs 0]}
                                             :fields       [[:field %products.category {:join-alias "PRODUCTS__via__PRODUCT_ID"}]
                                                            [:field %orders.created-at nil]
                                                            [:expression "pivot-grouping" {:base-type :type/Integer}]]}})))
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                    :breakout    [&PRODUCTS__via__PRODUCT_ID.products.category
                                  !year.created-at
                                  [:expression "pivot-grouping"]]
                    :expressions {"pivot-grouping" [:abs 0]}
                    :order-by    [[:asc &PRODUCTS__via__PRODUCT_ID.products.category]
                                  [:asc !year.created-at]
                                  [:asc [:expression "pivot-grouping"]]]
                    :joins       [{:source-table $$products
                                   :strategy     :left-join
                                   :alias        "PRODUCTS__via__PRODUCT_ID"
                                   :fk-field-id  %product-id
                                   :condition    [:= $product-id &PRODUCTS__via__PRODUCT_ID.products.id]}]}))
                nest-expressions)))))

(deftest ^:parallel uniquify-aliases-test
  (is (=? (lib.tu.macros/$ids products
            {:source-query {:source-table $$products
                            :expressions  {"CATEGORY" [:concat
                                                       [:field %category nil]
                                                       "2"]}
                            :fields       [[:expression "CATEGORY" {}]]}
             :breakout     [[:field "CATEGORY" {:base-type :type/Text}]]
             :aggregation  [[:count]]
             :order-by     [[:asc [:field "CATEGORY" {:base-type :type/Text}]]]
             :limit        1})
          (-> (lib/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query products
                 {:expressions {"CATEGORY" [:concat $category "2"]}
                  :breakout    [:expression "CATEGORY"]
                  :aggregation [[:count]]
                  :order-by    [[:asc [:expression "CATEGORY"]]]
                  :limit       1}))
              nest-expressions))))

(deftest ^:parallel uniquify-aliases-test-2
  (testing "multi-stage query with an expression name that matches a table column (#39059)"
    (is (=? (-> (lib.tu.macros/mbql-query orders
                  {:source-query {:breakout     [[:field "ID" {}]
                                                 [:field "SUBTOTAL" {}]
                                                 [:field "DISCOUNT" {}]]
                                  :source-query {:expressions  {"DISCOUNT" [:coalesce [:field %discount nil] 0]}
                                                 :fields       [[:field %id nil]
                                                                [:field %subtotal nil]
                                                                [:expression "DISCOUNT" {}]]
                                                 :source-table $$orders}}
                   :breakout     [[:field "ID"       {}]
                                  [:field "SUBTOTAL" {}]
                                  [:field "DISCOUNT" {:base-type :type/Float}]]})
                :query)
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query        {:expressions  {"DISCOUNT" [:coalesce $discount 0]}
                                          :breakout     [$id
                                                         $subtotal
                                                         [:expression "DISCOUNT"]]
                                          :source-table $$orders}
                    :source-query/model? true
                    :breakout            [[:field "ID"       {:base-type :type/Integer}]
                                          [:field "SUBTOTAL" {:base-type :type/Float}]
                                          [:field "DISCOUNT" {:base-type :type/Float}]]}))
                nest-expressions)))))

(deftest ^:parallel do-not-remove-fields-when-referred-to-with-nominal-refs-test
  (testing "Don't remove fields if they are used in the next stage with a nominal field literal ref"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query products
                   {:source-query {:source-table $$products
                                   :fields       [[:field %id nil]
                                                  [:field %ean nil]
                                                  [:field %title nil]
                                                  [:field %category nil]
                                                  [:field %vendor nil]
                                                  [:field %price nil]
                                                  [:field %rating nil]
                                                  [:field %created-at {:temporal-unit :default}]]}
                    :expressions  {"pivot-grouping" [:abs 0]}
                    :breakout     [[:field "CATEGORY" {:base-type :type/Text}]
                                   [:field "CREATED_AT" {:base-type :type/DateTime, :temporal-unit :month}]
                                   [:expression "pivot-grouping"]]
                    :aggregation  [[:aggregation-options [:count] {:name "count"}]]}))]
      (is (=? (lib.tu.macros/$ids products
                {:source-query {:source-query {:fields [[:field %id nil]
                                                        [:field %ean nil]
                                                        [:field %title nil]
                                                        [:field %category nil]
                                                        [:field %vendor nil]
                                                        [:field %price nil]
                                                        [:field %rating nil]
                                                        [:field %created-at {:temporal-unit :default}]]}
                                :expressions  {"pivot-grouping" [:abs 0]}
                                :fields       [[:field "CATEGORY" {}]
                                               [:field "CREATED_AT" {}]
                                               [:expression "pivot-grouping" {}]]}
                 :breakout     [[:field "CATEGORY" {}]
                                [:field "CREATED_AT" {}]
                                [:field "pivot-grouping" {}]]
                 :aggregation  [[:aggregation-options [:count] {}]]})
              (nest-expressions query))))))

(deftest ^:parallel nest-expressions-ignores-temporal-units-from-joined-fields
  (testing "clear temporal units from joined fields #48058"
    ;; TODO: The order here is not deterministic! It's coming
    ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
    ;; or [[metabase.query-processor.util.nest-query]], which walks the query looking for refs in an arbitrary order
    ;; and returns `m/distinct-by` over that random order. Changing the map keys on the inner query can perturb this
    ;; order; if you cause this test to fail based on shuffling the order of these joined fields, just edit the
    ;; expectation to match the new order. Tech debt issue: #39396
    (is (=? {:source-query {:fields [[:field (meta/id :people :created-at) {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                                                            :join-alias    "p"}]
                                     [:expression "double_total" {}]]}}
            (-> (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:expressions {"double_total" [:* $total 2]}
                    ;; this is a broken field ref! It should use the join alias `p`. Luckily
                    ;; the [[metabase.query-processor.middleware.fix-bad-field-id-refs]] middleware should fix it
                    ;; for us.
                    :breakout    [!hour-of-day.people.created-at
                                  [:expression "double_total"]]
                    :aggregation [[:count]]
                    :joins       [{:source-table $$people
                                   :alias        "p"
                                   :condition    [:= $user-id &p.people.id]}]}))
                nest-expressions)))))

(deftest ^:parallel wonky-breakout-test
  (let [mp    (lib.tu/mock-metadata-provider
               meta/metadata-provider
               {:cards [{:id            1
                         :type          :model
                         :name          "Model A"
                         :dataset-query (lib.tu.macros/mbql-query products
                                          {:source-table $$products
                                           :expressions  {"Rating Bucket" [:floor $products.rating]}})}
                        {:id            2
                         :type          :model
                         :dataset-query (lib.tu.macros/mbql-query orders
                                          {:source-table $$orders
                                           :joins        [{:source-table "card__1"
                                                           :alias        "model A - Product"
                                                           :fields       :all
                                                           :condition    [:=
                                                                          $orders.product-id
                                                                          [:field %products.id
                                                                           {:join-alias "model A - Product"}]]}]})}]})
        query (lib/query
               mp
               (lib/query
                mp
                {:database (meta/id)
                 :stages   [{:lib/type    :mbql.stage/mbql
                             :source-card 2
                             :expressions [[:abs {:lib/expression-name "pivot-grouping"} 0]]
                             :aggregation [[:sum {} [:field {:base-type :type/Number} "SUBTOTAL"]]]
                             :breakout    [[:field {:base-type :type/Number, :join-alias "model A - Product"}
                                            "Rating Bucket"]
                                           [:expression {:base-type :type/Integer, :effective-type :type/Integer}
                                            "pivot-grouping"]]}]
                 :lib/type :mbql/query}))
        stages (-> query
                   nest-expressions-mbql5
                   (as-> $query (driver/with-driver :h2
                                  (add/add-alias-info $query)))
                   :stages
                   (->> (map (fn [stage]
                               (into []
                                     (comp (mapcat stage)
                                           (map lib/options)
                                           (map ::add/desired-alias))
                                     [:breakout :aggregation :fields])))))]
    (is (= 3
           (count stages)))
    (testing "first stage (Card 1)"
      (is (= ["ID"
              "USER_ID"
              "PRODUCT_ID"
              "SUBTOTAL"
              "TAX"
              "TOTAL"
              "DISCOUNT"
              "CREATED_AT"
              "QUANTITY"
              "model A - Product__ID"
              "model A - Product__EAN"
              "model A - Product__TITLE"
              "model A - Product__CATEGORY"
              "model A - Product__VENDOR"
              "model A - Product__PRICE"
              "model A - Product__RATING"
              "model A - Product__CREATED_AT"
              "model A - Product__Rating Bucket"]
             (nth stages 0))))
    (testing "second stage (Card 2)"
      (is (= ["SUBTOTAL"
              "model A - Product__Rating Bucket"
              "pivot-grouping"]
             (nth stages 1))))
    (testing "third stage (original query)"
      (is (= ["model A - Product__Rating Bucket"
              "pivot-grouping"
              "sum"]
             (nth stages 2))))))

(deftest ^:parallel literal-boolean-expressions-and-fields-in-conditions-test
  (testing "mixing Field ID refs and Field Name refs to the same column should not result in broken queries"
    (let [true-value  [:value true  {:base_type :type/Boolean}]
          false-value [:value false {:base_type :type/Boolean}]
          mp          lib.tu.places-cam-likes-metadata-provider/metadata-provider
          query       (lib/query
                       mp
                       {:database 1
                        :type     :query
                        :query    {:expressions  {"T" true-value, "F" false-value}
                                   :source-query {:source-table 1
                                                  :fields       [[:field 2 nil]]}
                                   :aggregation  [[:count-where [:expression "T"]]
                                                  [:count-where [:expression "F"]]
                                                  ;; only a true psycho would do this
                                                  [:count-where [:field "LIKED" {:base-type :type/Boolean}]]
                                                  [:count-where [:field 2 nil]]]
                                   :filter       [:or
                                                  [:field 2 nil]
                                                  [:field "LIKED" {:base-type :type/Boolean}]
                                                  [:expression "T"]]}})]
      (is (= {:aggregation  [[:count-where [:field "T" {:base-type :type/Boolean}]]
                             [:count-where [:field "F" {:base-type :type/Boolean}]]
                             [:count-where [:field "LIKED" {:base-type :type/Boolean}]]
                             [:count-where [:field "LIKED" {:base-type :type/Boolean}]]]
              :source-query {:source-query {:fields [[:field 2 nil]], :source-table 1}
                             :expressions  {"F" [:value false {:base_type :type/Boolean}]
                                            "T" [:value true {:base_type :type/Boolean}]}
                             :fields       [[:expression "T" {:base-type :type/Boolean}]
                                            [:expression "F" {:base-type :type/Boolean}]
                                            ;; make sure we do not include duplicate entries for `LIKED`/Field 2
                                            [:field "LIKED" {:base-type :type/Boolean}]]
                             :filter       [:or
                                            [:field 2 nil]
                                            [:field "LIKED" {:base-type :type/Boolean}]
                                            [:expression "T" {:base-type :type/Boolean}]]}}
             (nest-expressions query))))))
