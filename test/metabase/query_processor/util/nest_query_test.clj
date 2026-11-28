(ns metabase.query-processor.util.nest-query-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.util.nest-query-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.places-cam-likes-metadata-provider :as lib.tu.places-cam-likes-metadata-provider]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- nest-expressions
  "Preprocess `query`, then nest its expressions with [[nest-query/nest-expressions]]."
  [query]
  (driver/with-driver (or driver/*driver* :h2)
    (-> query
        qp.preprocess/preprocess
        nest-query/nest-expressions)))

(deftest ^:parallel nest-expressions-test
  (is (=? (lib.tu.macros/$ids venues
            {:stages [{:source-table $$venues
                       :expressions  [[:* {:lib/expression-name "double_price"} [:field {} %price] 2]]
                       :fields       [[:field {} %price]
                                      [:expression {} "double_price"]]}
                      {:breakout    [[:field {} "PRICE"]
                                     [:field {} "double_price"]]
                       :aggregation [[:count {}]]
                       :order-by    [[:asc {} [:field {} "PRICE"]]
                                     [:asc {} [:field {} "double_price"]]]}]})
          (-> (lib/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query venues
                 {:expressions {"double_price" [:* $price 2]}
                  :breakout    [$price
                                [:expression "double_price"]]
                  :aggregation [[:count]]}))
              qp.preprocess/preprocess
              nest-expressions))))

(deftest ^:parallel nest-expressions-preserves-breakout-uuids-test
  (let [q           (as-> (lib/query meta/metadata-provider (meta/table-metadata :venues)) q
                      (lib/expression q "double_price" (lib/* (meta/field-metadata :venues :price) 2))
                      (lib/breakout   q (meta/field-metadata :venues :category-id))
                      (lib/breakout   q (lib/expression-ref q "double_price"))
                      (lib/aggregate  q (lib/count)))
        orig-uuids  (mapv lib.options/uuid (lib/breakouts q))
        nested      (nest-expressions q)
        outer-uuids (mapv lib.options/uuid (lib/breakouts nested))]
    (is (= orig-uuids outer-uuids))))

(deftest ^:parallel nest-order-by-expressions-test
  (testing "Expressions in an order-by clause result in nesting"
    (is (=? (lib.tu.macros/$ids venues
              {:stages [{:source-table $$venues
                         :expressions  [[:* {:lib/expression-name "double_price"} [:field {} %price] 2]]
                         :fields       [[:field {} %price]
                                        [:expression {} "double_price"]]}
                        {:order-by [[:asc {} [:field {:base-type :type/Integer} "double_price"]]]}]})
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
              {:stages [{:source-table $$venues
                         :expressions  [[:value {:base-type :type/Text, :lib/expression-name "favorite"} "good venue"]]
                         :fields       [[:field {} %name]
                                        [:expression {} "favorite"]]
                         :filters      [[:= {}
                                         [:field {} %name]
                                         [:expression {:base-type :type/Text} "favorite"]]]}
                        {:order-by [[:asc {} [:field {:base-type :type/Text} "favorite"]]]}]})
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
              {:stages [{:source-table $$venues
                         :expressions  [[:+
                                         {:lib/expression-name "big_price"}
                                         [:field {} %price]
                                         2]
                                        [:/
                                         {:lib/expression-name "my_cool_new_field"}
                                         [:field {} %price]
                                         [:expression {} "big_price"]]]
                         :fields       [[:expression {} "my_cool_new_field"]
                                        [:field {} %id]]}
                        {:breakout [[:field {:base-type :type/Float} "my_cool_new_field"]]
                         ;; uh... not sure ordering by ID is legal here??? Since it doesn't appear in the query results??
                         :order-by [[:asc {} [:field {} "ID"]]
                                    [:asc {} [:field {:base-type :type/Float} "my_cool_new_field"]]]
                         :limit    3}]})
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
                  {:stages [{:source-table $$venues
                             :expressions  [[:* {:lib/expression-name "x"} [:field {} %price] 2]]
                             :fields       [[:field {} %id]
                                            #_[:field {} %price]
                                            [:expression {} "x"]]}
                            {:breakout [[:field {} "ID"]
                                        [:field {:base-type :type/Integer} "x"]]}
                            {:expressions [[:* {:lib/expression-name "x"} [:field {} %price] 4]]
                             :fields      [[:field {} %id]
                                           [:expression {} "x"]]}
                            {:breakout [[:field {} "ID"]
                                        [:field {:base-type :type/Integer} "x"]]
                             :limit    1}]})
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
          nested  (nest-expressions query)]
      (is (= (map :lib/desired-column-alias (lib/returned-columns query))
             (map :lib/desired-column-alias (lib/returned-columns nested)))))))

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
              {:stages [{:source-table $$venues
                         :joins        [{:strategy   :left-join
                                         :conditions [[:= {}
                                                       [:field {:join-alias (symbol "nil #_\"key is not present.\"")} %category-id]
                                                       [:field {:join-alias "CategoriesStats"} %category-id]]]
                                         :stages     [{:source-table $$venues
                                                       :aggregation  [[:max {:name "MaxPrice"} [:field {} %price]]
                                                                      [:avg {:name "AvgPrice"} [:field {} %price]]
                                                                      [:min {:name "MinPrice"} [:field {} %price]]]
                                                       :breakout     [[:field {} %category-id]]
                                                       :order-by     [[:asc {} [:field {} %category-id]]]}]
                                         :alias      "CategoriesStats"
                                         :fields     [[:field {:join-alias "CategoriesStats"} %category-id]
                                                      [:field {:join-alias "CategoriesStats"} "MaxPrice"]
                                                      [:field {:join-alias "CategoriesStats"} "AvgPrice"]
                                                      [:field {:join-alias "CategoriesStats"} "MinPrice"]]}]
                         :expressions  [[:/
                                         {:lib/expression-name "RelativePrice"}
                                         [:field {} %price]
                                         [:field {:join-alias "CategoriesStats"} "AvgPrice"]]]
                         :fields       [[:field {} %id]
                                        [:field {} %name]
                                        [:field {:join-alias (symbol "nil #_\"key is not present.\"")} %category-id]
                                        [:field {} %latitude]
                                        [:field {} %longitude]
                                        [:field {} %price]
                                        [:expression {} "RelativePrice"]
                                        [:field {:join-alias "CategoriesStats"} %category-id]
                                        [:field {:join-alias "CategoriesStats"} "MaxPrice"]
                                        [:field {:join-alias "CategoriesStats"} "AvgPrice"]
                                        [:field {:join-alias "CategoriesStats"} "MinPrice"]]}
                        {:breakout [[:field {} "ID"]
                                    [:field {} "NAME"]
                                    [:field {} "CATEGORY_ID"]
                                    [:field {} "LATITUDE"]
                                    [:field {} "LONGITUDE"]
                                    [:field {} "PRICE"]
                                    [:field {} "RelativePrice"]
                                    [:field {} "CategoriesStats__CATEGORY_ID"]
                                    [:field {} "CategoriesStats__MaxPrice"]
                                    [:field {} "CategoriesStats__AvgPrice"]
                                    [:field {} "CategoriesStats__MinPrice"]]
                         :limit    3}]})
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
                {:stages [{:source-table $$venues
                           :expressions  [[:* {:lib/expression-name "test"} 1 1]]
                           :fields       [[:field {:temporal-unit (symbol "nil #_\"key is not present.\"")} %price]
                                          [:expression {} "test"]]}
                          {:breakout [[:field {:temporal-unit :day} "PRICE"]
                                      [:field {} "test"]]
                           :limit    1}]})
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
    (is (=? (lib.tu.macros/$ids orders
              ;; TODO: The order here is not deterministic! It's coming
              ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
              ;; or [[metabase.query-processor.util.nest-query]], which walks the query looking for
              ;; refs in an arbitrary order, and returns `m/distinct-by` over that random order.
              ;; Changing the map keys on the first stage can perturb this order; if you cause this
              ;; test to fail based on shuffling the order of these joined fields, just edit the
              ;; expectation to match the new order. Tech debt issue: #39396
              {:stages [{:source-table $$orders
                         :joins        [{:stages      [{:source-table $$products}]
                                         :alias       "PRODUCTS__via__PRODUCT_ID"
                                         :conditions  [[:= {}
                                                        [:field {} %product-id]
                                                        [:field {:join-alias "PRODUCTS__via__PRODUCT_ID"} %products.id]]]
                                         :strategy    :left-join
                                         :fk-field-id %product-id}]
                         :expressions  [[:abs {:lib/expression-name "pivot-grouping"} 0]]
                         :fields       [[:field {:join-alias "PRODUCTS__via__PRODUCT_ID"} %products.category]
                                        [:field {:temporal-unit (symbol "nil #_\"key is not present.\"")} %orders.created-at]
                                        [:expression {:base-type :type/Integer} "pivot-grouping"]]}
                        {}]})
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
            {:stages [{:source-table $$products
                       :expressions  [[:concat {:lib/expression-name "CATEGORY"} [:field {} %category] "2"]]
                       :fields       [[:expression {} "CATEGORY"]]}
                      {:breakout    [[:field {:base-type :type/Text} "CATEGORY"]]
                       :aggregation [[:count {}]]
                       :order-by    [[:asc {} [:field {:base-type :type/Text} "CATEGORY"]]]
                       :limit       1}]})
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
    (is (=? (lib.tu.macros/$ids orders
              {:stages [{:expressions  [[:coalesce {:lib/expression-name "DISCOUNT"} [:field {} %discount] 0]]
                         :fields       [[:field {} %id]
                                        [:field {} %subtotal]
                                        [:expression {} "DISCOUNT"]]
                         :source-table $$orders}
                        {:breakout [[:field {} "ID"]
                                    [:field {} "SUBTOTAL"]
                                    [:field {} "DISCOUNT"]]}
                        {:breakout [[:field {} "ID"]
                                    [:field {} "SUBTOTAL"]
                                    [:field {:base-type :type/Float} "DISCOUNT"]]}]})
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
                {:stages [{:fields [[:field {} %id]
                                    [:field {} %ean]
                                    [:field {} %title]
                                    [:field {} %category]
                                    [:field {} %vendor]
                                    [:field {} %price]
                                    [:field {} %rating]
                                    [:field {:temporal-unit :default} %created-at]]}
                          {:expressions [[:abs {:lib/expression-name "pivot-grouping"} 0]]
                           :fields      [[:field {} "CATEGORY"]
                                         [:field {} "CREATED_AT"]
                                         [:expression {} "pivot-grouping"]]}
                          {:breakout    [[:field {} "CATEGORY"]
                                         [:field {} "CREATED_AT"]
                                         [:field {} "pivot-grouping"]]
                           :aggregation [[:count {}]]}]})
              (nest-expressions query))))))

(deftest ^:parallel nest-expressions-ignores-temporal-units-from-joined-fields
  (testing "clear temporal units from joined fields #48058"
    ;; TODO: The order here is not deterministic! It's coming
    ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
    ;; or [[metabase.query-processor.util.nest-query]], which walks the query looking for refs in an arbitrary order
    ;; and returns `m/distinct-by` over that random order. Changing the map keys on the inner query can perturb this
    ;; order; if you cause this test to fail based on shuffling the order of these joined fields, just edit the
    ;; expectation to match the new order. Tech debt issue: #39396
    (is (=? {:stages [{:fields [[:field
                                 {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                  :join-alias    "p"}
                                 (meta/id :people :created-at)]
                                [:expression {} "double_total"]]}
                      {}]}
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
                   nest-expressions
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
      (is (=? {:stages [{:fields       [[:field {} 2]]
                         :source-table 1}
                        {:expressions [[:value {:base-type :type/Boolean, :lib/expression-name "T"} true]
                                       [:value {:base-type :type/Boolean, :lib/expression-name "F"} false]]
                         :fields      [[:expression {:base-type :type/Boolean} "T"]
                                       [:expression {:base-type :type/Boolean} "F"]
                                       ;; make sure we do not include duplicate entries for `LIKED`/Field 2
                                       [:field {:base-type :type/Boolean} "LIKED"]]
                         :filters     [[:or {}
                                        [:field {} 2]
                                        [:field {:base-type :type/Boolean} "LIKED"]
                                        [:expression {:base-type :type/Boolean} "T"]]]
                         :aggregation (symbol "nil #_\"key is not present.\"")}
                        {:aggregation [[:count-where {} [:field {:base-type :type/Boolean} "T"]]
                                       [:count-where {} [:field {:base-type :type/Boolean} "F"]]
                                       [:count-where {} [:field {:base-type :type/Boolean} "LIKED"]]
                                       [:count-where {} [:field {:base-type :type/Boolean} "LIKED"]]]
                         :expressions (symbol "nil #_\"key is not present.\"")
                         :fields      (symbol "nil #_\"key is not present.\"")
                         :filters     (symbol "nil #_\"key is not present.\"")}]}
              (nest-expressions query))))))
