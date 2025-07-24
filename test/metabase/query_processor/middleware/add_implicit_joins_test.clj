(ns metabase.query-processor.middleware.add-implicit-joins-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.middleware.add-implicit-joins :as qp.add-implicit-joins]
   [metabase.query-processor.middleware.add-source-metadata :as qp.add-source-metadata]
   [metabase.query-processor.middleware.fetch-source-query]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel distinct-fields-test
  (testing "distinct-fields should consider type information unimportant for determining whether two Fields are the same"
    (is (=? [[:field {:join-alias "X"} 1]
             [:field {:base-type :type/Integer} 1]
             [:field {:base-type :type/Integer} "bird"]]
            (#'qp.add-implicit-joins/distinct-fields
             [[:field {:lib/uuid (str (random-uuid)), :join-alias "X"} 1]
              [:field {:lib/uuid (str (random-uuid)), :join-alias "X", ::whatever true} 1]
              [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} 1]
              [:field {:lib/uuid (str (random-uuid))} 1]
              [:field {:lib/uuid (str (random-uuid)), :effective-type :type/Number} 1]
              [:field {:lib/uuid (str (random-uuid)), :effective-type :type/Integer} 1]
              [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "bird"]
              [:field {:lib/uuid (str (random-uuid)), :base-type :type/Number} "bird"]])))))

(deftest ^:parallel distinct-fields-test-2
  (let [fields [[:field {:lib/uuid       "67cbb4b0-346b-4087-a5b4-2cb0e33879f7"
                         :base-type      :type/BigInteger
                         :effective-type :type/BigInteger}
                 68848]
                [:field {:lib/uuid       "f65fb0e8-2752-4e1b-8341-0c94c1f51957"
                         :base-type      :type/Integer
                         :effective-type :type/Integer}
                 68846]
                [:field {:lib/uuid       "fe4d8fb0-ef9b-4ffe-813a-ae9d4f0ec64a"
                         :base-type      :type/Integer
                         :effective-type :type/Integer}
                 68847]
                [:field {:lib/uuid       "d8af125d-f6b2-480d-9eea-1b60f32a6b5d"
                         :base-type      :type/Float
                         :effective-type :type/Float}
                 68845]
                [:field {:lib/uuid       "8070e6e8-28e2-4fb2-a8e2-7a8142d5b19b"
                         :base-type      :type/Float
                         :effective-type :type/Float}
                 68844]
                [:field {:lib/uuid       "8171d47d-e76e-4dd5-9e01-4368639bfede"
                         :base-type      :type/Float
                         :effective-type :type/Float}
                 68851]
                [:field {:lib/uuid       "e4196c22-5788-4091-8b98-f0f489402eba"
                         :base-type      :type/Float
                         :effective-type :type/Float}
                 68852]
                [:field {:lib/uuid       "945058d5-5669-40cb-9590-58f88d1d9987"
                         :base-type      :type/DateTimeWithLocalTZ
                         :effective-type :type/DateTimeWithLocalTZ}
                 68850]
                [:field {:lib/uuid       "580ac20d-8567-444d-905f-a4f81ded4d53"
                         :base-type      :type/Integer
                         :effective-type :type/Integer}
                 68849]
                [:field {:source-field   68847
                         :join-alias     "PRODUCTS__via__PRODUCT_ID"
                         :lib/uuid       "8f5b747e-bb36-4639-826b-dd40ff394fdf"
                         :base-type      :type/Text
                         :effective-type :type/Text}
                 68861]
                [:field {:source-field   68847
                         :lib/uuid       "615c7a01-e368-430a-a3ab-0b7be86570e4"
                         :base-type      :type/Text
                         :effective-type :type/Text
                         :join-alias     "PRODUCTS__via__PRODUCT_ID"}
                 68867]
                [:field {:source-field   68847
                         :lib/uuid       "01237181-caba-40ae-8c37-a12fdba7400f"
                         :base-type      :type/Text
                         :effective-type :type/Text
                         :join-alias     "PRODUCTS__via__PRODUCT_ID"}
                 68867]]]
    (is (not (me/humanize (mr/explain ::lib.schema/fields (#'qp.add-implicit-joins/distinct-fields fields)))))))

(deftest ^:parallel fk-field-infos->joins-test
  (is (=? [{:lib/type    :mbql/join
            :stages      [{:source-table (meta/id :products)}]
            :alias       "PRODUCTS__via__PRODUCT_ID"
            :fields      :none
            :strategy    :left-join
            :conditions  [[:=
                           {}
                           [:field {} (meta/id :orders :product-id)]
                           [:field {:join-alias "PRODUCTS__via__PRODUCT_ID"} (meta/id :products :id)]]]
            :fk-field-id (meta/id :orders :product-id)}]
          (#'qp.add-implicit-joins/fk-field-infos->joins
           meta/metadata-provider
           [{:fk-field-id (meta/id :orders :id)}
            {:fk-field-id (meta/id :orders :product-id)}]))))

(deftest ^:parallel resolve-implicit-joins-test
  (let [query (lib/query
               meta/metadata-provider
               (mt/nest-query
                (lib.tu.macros/mbql-query orders
                  {:source-table $$orders
                   :fields       [$id
                                  &Products.products.title
                                  $product-id->products.title]
                   :joins        [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product-id &Products.products.id]
                                   :alias        "Products"}]
                   :order-by     [[:asc $id]]
                   :limit        2})
                1))]
    (is (=? (-> (lib.tu.macros/mbql-query orders
                  {:source-query {:source-table $$orders
                                  :fields       [$id
                                                 &Products.products.title
                                                 [:field %products.title {:source-field %product-id, :join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                  :joins        [{:fields       :all
                                                  :source-table $$products
                                                  :condition    [:= $product-id &Products.products.id]
                                                  :alias        "Products"}
                                                 {:fields       :none
                                                  :source-table $$products
                                                  :condition    [:= $product-id &PRODUCTS__via__PRODUCT_ID.products.id]
                                                  :alias        "PRODUCTS__via__PRODUCT_ID"
                                                  :fk-field-id  %product-id
                                                  :strategy     :left-join}]
                                  :order-by     [[:asc $id]]
                                  :limit        2}})
                :query)
            (-> (lib/update-query-stage query 0 (fn [stage]
                                                  (#'qp.add-implicit-joins/resolve-implicit-joins query [:stages 0] stage)))
                lib/->legacy-MBQL
                :query)))))

(mu/defn- add-implicit-joins :- ::mbql.s/Query
  [query :- ::mbql.s/Query]
  (letfn [(add-implicit-joins-legacy [query]
            (-> (lib/query (qp.store/metadata-provider) query)
                qp.add-implicit-joins/add-implicit-joins
                lib/->legacy-MBQL))]
    (if (qp.store/initialized?)
      (add-implicit-joins-legacy query)
      (qp.store/with-metadata-provider meta/metadata-provider
        (add-implicit-joins-legacy query)))))

(deftest ^:parallel basic-test
  (testing "make sure `:joins` get added automatically for `:fk->` clauses"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-table $$venues
               :fields       [$name [:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                              :source-field %category-id}]]
               :joins        [{:source-table $$categories
                               :alias        "CATEGORIES__via__CATEGORY_ID"
                               :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %category-id}]})
            (add-implicit-joins
             (lib.tu.macros/mbql-query venues
               {:source-table $$venues
                :fields       [$name $category-id->categories.name]}))))))

(deftest ^:parallel nested-queries-test
  (testing "For FK clauses inside nested source queries, we should add the `:joins` info to the nested query instead of at the top level (#8972)"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query
               {:source-table $$venues
                :fields       [$name [:field %categories.name {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                               :source-field %category-id}]]
                :joins        [{:source-table $$categories
                                :alias        "CATEGORIES__via__CATEGORY_ID"
                                :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                :strategy     :left-join
                                :fields       :none
                                :fk-field-id  %category-id}]}})
            (add-implicit-joins
             (lib.tu.macros/mbql-query venues
               {:source-query
                {:source-table $$venues
                 :fields       [$name $category-id->categories.name]}}))))))

(deftest ^:parallel source-field-join-alias-test
  (testing "make sure an implicit join can be done via an explicit join"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-table $$orders
               :joins       [{:source-table $$orders
                              :alias        "Orders"
                              :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                              :strategy     :left-join
                              :fields       :none}
                             {:source-table  $$products
                              :alias         "PRODUCTS__via__PRODUCT_ID__via__Orders"
                              :condition     [:= [:field %orders.product-id {:join-alias "Orders"}]
                                              &PRODUCTS__via__PRODUCT_ID__via__Orders.products.id]
                              :fk-field-id   %product-id
                              :fk-join-alias "Orders"}]
               :fields [[:field
                         %products.category
                         {:join-alias "PRODUCTS__via__PRODUCT_ID__via__Orders"
                          :source-field %product-id
                          :source-field-join-alias "Orders"}]]})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:source-table $$orders
                :joins        [{:source-table $$orders
                                :alias        "Orders"
                                :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                :strategy     :left-join
                                :fields       :none}]
                :fields       [[:field %products.category {:source-field %product-id
                                                           :source-field-join-alias "Orders"}]]}))))))

(deftest ^:parallel source-field-join-alias-multiple-joins-test
  (testing "make sure that implicit joins are properly deduplicated when done via `:source-table` and different `:joins`"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-table $$orders
               :joins       [{:source-table $$orders
                              :alias        "Orders"
                              :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                              :strategy     :left-join
                              :fields       :none}
                             {:source-table $$orders
                              :alias        "Orders_2"
                              :condition    [:= $product-id  [:field %product-id {:join-alias "Orders_2"}]]
                              :strategy     :left-join
                              :fields       :none}
                             {:source-table  $$products
                              :alias         "PRODUCTS__via__PRODUCT_ID"
                              :condition     [:=
                                              $product-id
                                              &PRODUCTS__via__PRODUCT_ID.products.id]
                              :fk-field-id   %product-id}
                             {:source-table  $$products
                              :alias         "PRODUCTS__via__PRODUCT_ID__via__Orders"
                              :condition     [:=
                                              [:field %orders.product-id {:join-alias "Orders"}]
                                              &PRODUCTS__via__PRODUCT_ID__via__Orders.products.id]
                              :fk-field-id   %product-id
                              :fk-join-alias "Orders"}
                             {:source-table  $$products
                              :alias         "PRODUCTS__via__PRODUCT_ID__via__Orders_2"
                              :condition     [:=
                                              [:field %orders.product-id {:join-alias "Orders_2"}]
                                              &PRODUCTS__via__PRODUCT_ID__via__Orders_2.products.id]
                              :fk-field-id   %product-id
                              :fk-join-alias "Orders_2"}]
               :fields [[:field
                         %products.category
                         {:join-alias "PRODUCTS__via__PRODUCT_ID"
                          :source-field %product-id}]
                        [:field
                         %products.category
                         {:join-alias "PRODUCTS__via__PRODUCT_ID__via__Orders"
                          :source-field %product-id
                          :source-field-join-alias "Orders"}]
                        [:field
                         %products.category
                         {:join-alias "PRODUCTS__via__PRODUCT_ID__via__Orders_2"
                          :source-field %product-id
                          :source-field-join-alias "Orders_2"}]]})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:source-table $$orders
                :joins        [{:source-table $$orders
                                :alias        "Orders"
                                :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                :strategy     :left-join
                                :fields       :none}
                               {:source-table $$orders
                                :alias        "Orders_2"
                                :condition    [:= $product-id  [:field %product-id {:join-alias "Orders_2"}]]
                                :strategy     :left-join
                                :fields       :none}]
                :fields       [[:field %products.category {:source-field %product-id}]
                               [:field %products.category {:source-field %product-id
                                                           :source-field-join-alias "Orders"}]
                               [:field %products.category {:source-field %product-id
                                                           :source-field-join-alias "Orders_2"}]]}))))))

(deftest ^:parallel source-field-name-test
  (testing "make sure that implicit joins work with an explicit `:source-field-name`"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :joins        [{:source-table $$orders
                                              :alias        "Orders"
                                              :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                              :strategy     :left-join
                                              :fields       :none}]
                              :breakout    [$product-id &Orders.orders.product-id]}
               :joins        [{:source-table $$products
                               :alias        "PRODUCTS__via__PRODUCT_ID"
                               :condition    [:=
                                              $product-id
                                              &PRODUCTS__via__PRODUCT_ID.products.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id %product-id}
                              {:source-table $$products
                               :alias        "PRODUCTS__via__Orders__Product_ID"
                               :condition    [:=
                                              [:field "Orders__Product_ID" {:base-type :type/Integer}]
                                              &PRODUCTS__via__Orders__Product_ID.products.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id %product-id}]
               :fields       [[:field %products.category {:join-alias        "PRODUCTS__via__PRODUCT_ID"
                                                          :source-field      %product-id
                                                          :source-field-name "PRODUCT_ID"}]
                              [:field %products.category {:join-alias        "PRODUCTS__via__Orders__Product_ID"
                                                          :source-field      %product-id
                                                          :source-field-name "Orders__Product_ID"}]]})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:source-query {:source-table $$orders
                               :joins        [{:source-table $$orders
                                               :alias        "Orders"
                                               :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                               :strategy     :left-join
                                               :fields       :none}]
                               :breakout    [$product-id &Orders.orders.product-id]}
                :fields       [[:field %products.category {:source-field %product-id :source-field-name "PRODUCT_ID"}]
                               [:field %products.category {:source-field %product-id :source-field-name "Orders__Product_ID"}]]}))))))

(deftest ^:parallel source-field-name-join-alias-test
  (testing "make sure that implicit joins work with an explicit `:source-field-name` and `source-field-join-alias`"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :joins        [{:source-table $$orders
                                              :alias        "Orders"
                                              :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                              :strategy     :left-join}]}
               :joins        [{:source-query {:joins [{:source-table $$orders
                                                       :alias        "Orders"
                                                       :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                                       :strategy     :left-join
                                                       :fields       :none}]}
                               :alias        "Card"
                               :condition    [:= $product-id  &Card.orders.product-id]
                               :strategy     :left-join}
                              {:source-table $$products
                               :alias        "PRODUCTS__via__PRODUCT_ID"
                               :condition    [:=
                                              $product-id
                                              &PRODUCTS__via__PRODUCT_ID.products.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %product-id}
                              {:source-table $$products
                               :alias        "PRODUCTS__via__Orders__PRODUCT_ID"
                               :condition    [:=
                                              [:field "Orders__PRODUCT_ID" {:base-type :type/Integer}]
                                              &PRODUCTS__via__Orders__PRODUCT_ID.products.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %product-id}
                              {:source-table $$products
                               :alias        "PRODUCTS__via__PRODUCT_ID__via__Card"
                               :condition    [:= &Card.orders.product-id
                                              &PRODUCTS__via__PRODUCT_ID__via__Card.products.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %product-id}
                              {:source-table $$products
                               :alias        "PRODUCTS__via__Orders__PRODUCT_ID__via__Card"
                               :condition    [:= [:field "Orders__PRODUCT_ID" {:base-type  :type/Integer
                                                                               :join-alias "Card"}]
                                              &PRODUCTS__via__Orders__PRODUCT_ID__via__Card.products.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %product-id}]
               :fields       [[:field %products.category {:join-alias        "PRODUCTS__via__PRODUCT_ID"
                                                          :source-field      %product-id
                                                          :source-field-name "PRODUCT_ID"}]
                              [:field %products.category {:join-alias        "PRODUCTS__via__Orders__PRODUCT_ID"
                                                          :source-field      %product-id
                                                          :source-field-name "Orders__PRODUCT_ID"}]
                              [:field %products.category {:join-alias        "PRODUCTS__via__PRODUCT_ID__via__Card"
                                                          :source-field      %product-id
                                                          :source-field-name "PRODUCT_ID"}]
                              [:field %products.category {:join-alias        "PRODUCTS__via__Orders__PRODUCT_ID__via__Card"
                                                          :source-field      %product-id
                                                          :source-field-name "Orders__PRODUCT_ID"}]]})
            (qp.store/with-metadata-provider meta/metadata-provider
              (add-implicit-joins
               (-> (lib.tu.macros/mbql-query orders
                     {:source-query {:source-table $$orders
                                     :joins        [{:source-table $$orders
                                                     :alias        "Orders"
                                                     :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                                     :strategy     :left-join}]}
                      :joins        [{:source-query {:source-table $$orders
                                                     :joins        [{:source-table $$orders
                                                                     :alias        "Orders"
                                                                     :condition    [:= $product-id  [:field %product-id {:join-alias "Orders"}]]
                                                                     :strategy     :left-join
                                                                     :fields       :none}]}
                                      :alias        "Card"
                                      :condition    [:= $product-id  &Card.orders.product-id]
                                      :strategy     :left-join}]
                      :fields       [[:field %products.category {:source-field      %product-id
                                                                 :source-field-name "PRODUCT_ID"}]
                                     [:field %products.category {:source-field      %product-id
                                                                 :source-field-name "Orders__PRODUCT_ID"}]
                                     [:field %products.category {:source-field            %product-id
                                                                 :source-field-name       "PRODUCT_ID"
                                                                 :source-field-join-alias "Card"}]
                                     [:field %products.category {:source-field            %product-id
                                                                 :source-field-name       "Orders__PRODUCT_ID"
                                                                 :source-field-join-alias "Card"}]]})
                   qp.add-source-metadata/add-source-metadata-for-source-queries
                   qp.add-implicit-clauses/add-implicit-clauses)))))))

(deftest ^:parallel reuse-existing-joins-test
  (testing "Should reuse existing joins rather than creating new ones"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query
               {:source-table $$venues
                :fields       [$name [:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                               :source-field %category-id}]]
                :joins        [{:source-table $$categories
                                :alias        "CATEGORIES__via__CATEGORY_ID"
                                :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                :strategy     :left-join
                                :fields       [[:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                                         :source-field %category-id}]]
                                :fk-field-id  %category-id}]}})
            (add-implicit-joins
             (lib.tu.macros/mbql-query venues
               {:source-query
                {:source-table $$venues
                 :fields       [$name $category-id->categories.name]
                 :joins        [{:source-table $$categories
                                 :alias        "CATEGORIES__via__CATEGORY_ID"
                                 :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                 :strategy     :left-join
                                 :fields       [[:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                                          :source-field %category-id}]]
                                 :fk-field-id  %category-id}]}}))))))

(deftest ^:parallel reuse-existing-joins-e2e-test
  (testing "Should work at arbitrary levels of nesting"
    (qp.store/with-metadata-provider (mt/id)
      (doseq [level (range 4)]
        (testing (format "(%d levels of nesting)" level)
          (let [query (-> (mt/mbql-query orders
                            {:source-table $$orders
                             :fields       [$id
                                            &Products.products.title
                                            $product_id->products.title]
                             :joins        [{:fields       :all
                                             :source-table $$products
                                             :condition    [:= $product_id [:field %products.id {:join-alias "Products"}]]
                                             :alias        "Products"}]
                             :order-by     [[:asc $id]]
                             :limit        2})
                          (mt/nest-query level))]
            (testing (format "\nquery =\n%s" (u/pprint-to-str query))
              (testing "sanity check: we should actually be able to run this query"
                (is (=? {:status :completed}
                        (qp/process-query query)))
                (when (pos? level)
                  (testing "if it has source metadata"
                    (let [query-with-metadata (assoc-in query
                                                        (concat [:query]
                                                                (repeat (dec level) :source-query)
                                                                [:source-metadata])
                                                        (mt/$ids orders
                                                          [{:name         "ID"
                                                            :display_name "ID"
                                                            :base_type    :type/Integer
                                                            :id           %id
                                                            :field_ref    $id}
                                                           {:name         "TITLE"
                                                            :display_name "Title"
                                                            :base_type    :type/Text
                                                            :id           %products.title
                                                            :field_ref    &Products.products.title}
                                                           {:name         "TITLE"
                                                            :display_name "Title"
                                                            :base_type    :type/Text
                                                            :id           %products.title
                                                            :field_ref    $product_id->products.title}]))]
                      (is (=? {:status :completed}
                              (qp/process-query query-with-metadata)))))))
              (is (=? (-> (mt/mbql-query orders
                            {:source-table $$orders
                             :fields       [$id
                                            &Products.products.title
                                            [:field %products.title {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                                     :source-field %product_id}]]
                             :joins        [{:source-table $$products
                                             :alias        "Products"
                                             :fields       :all
                                             :condition    [:=
                                                            $product_id
                                                            &Products.products.id]}
                                            {:source-table $$products
                                             :alias        "PRODUCTS__via__PRODUCT_ID"
                                             :strategy     :left-join
                                             :fields       :none
                                             :fk-field-id  %product_id
                                             :condition    [:=
                                                            $product_id
                                                            &PRODUCTS__via__PRODUCT_ID.products.id]}]
                             :order-by     [[:asc $id]]
                             :limit        2})
                          (mt/nest-query level))
                      (-> (add-implicit-joins query)
                          (m/dissoc-in [:query :source-metadata])))))))))))

(deftest ^:parallel reuse-existing-joins-test-3
  (testing "We DEFINITELY need to reuse joins if adding them again would break the query."
    (is (=? (lib.tu.macros/mbql-query orders
              {:filter       [:> *count/Integer 5]
               :fields       [$created-at
                              [:field %products.created-at {:source-field %product-id
                                                            :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                              *count/Integer]
               :source-query {:source-table $$orders
                              :aggregation  [[:count]]
                              :breakout     [!month.created-at
                                             [:field %products.created-at {:source-field  %product-id
                                                                           :temporal-unit :month
                                                                           :join-alias    "PRODUCTS__via__PRODUCT_ID"}]]
                              :joins        [{:fields       :none
                                              :alias        "PRODUCTS__via__PRODUCT_ID"
                                              :strategy     :left-join
                                              :condition    [:=
                                                             $product-id
                                                             &PRODUCTS__via__PRODUCT_ID.products.id]
                                              :source-table $$products
                                              :fk-field-id  %product-id}]}
               :limit        5})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:filter       [:> *count/Integer 5]
                :fields       [$created-at $product-id->products.created-at *count/Integer]
                :source-query {:source-table $$orders
                               :aggregation  [[:count]]
                               :breakout     [!month.created-at !month.product-id->products.created-at]}
                :limit        5}))))))

(deftest ^:parallel add-fields-for-reused-joins-test
  (testing "If we reuse a join, make sure we add Fields to `:fields` to the source query so we can reference them in the parent level"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :fields       [$id
                                             $user-id
                                             $product-id
                                             $subtotal
                                             $tax
                                             $total
                                             $discount
                                             $created-at
                                             $quantity
                                             [:field %products.category {:source-field %product-id
                                                                         :join-alias   "PRODUCTS__via__PRODUCT_ID"}]]
                              :filter       [:and
                                             [:= $user-id 1]
                                             [:=
                                              [:field %products.category {:source-field %product-id
                                                                          :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                                              "Doohickey"]]
                              :joins        [{:source-table $$products
                                              :alias        "PRODUCTS__via__PRODUCT_ID"
                                              :fields       :none
                                              :strategy     :left-join
                                              :fk-field-id  %product-id
                                              :condition    [:=
                                                             $product-id
                                                             &PRODUCTS__via__PRODUCT_ID.products.id]}]}
               :filter       [:=
                              [:field %products.category {:source-field %product-id
                                                          :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                              "Doohickey"]
               :order-by     [[:asc [:field %products.category {:source-field %product-id
                                                                :join-alias   "PRODUCTS__via__PRODUCT_ID"}]]]
               :limit        5})
            (qp.store/with-metadata-provider meta/metadata-provider
              (-> (lib.tu.macros/mbql-query orders
                    {:source-query {:source-table $$orders
                                    :filter       [:and
                                                   [:= $user-id 1]
                                                   [:= $product-id->products.category "Doohickey"]]}
                     :filter       [:= $product-id->products.category "Doohickey"]
                     :order-by     [[:asc $product-id->products.category]]
                     :limit        5})
                  qp.add-implicit-clauses/add-implicit-clauses
                  add-implicit-joins))))))

(deftest ^:parallel add-fields-for-reused-joins-test-2
  (testing "don't add fields for a native source query."
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:native "SELECT * FROM my_table"}
               :filter       [:= [:field %products.category {:source-field %product-id
                                                             :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                              "Doohickey"]
               :order-by     [[:asc [:field %products.category {:source-field %product-id
                                                                :join-alias   "PRODUCTS__via__PRODUCT_ID"}]]]
               :joins        [{:source-table $$products
                               :alias        "PRODUCTS__via__PRODUCT_ID"
                               :fields       :none
                               :strategy     :left-join
                               :fk-field-id  %product-id
                               :condition    [:=
                                              $product-id
                                              &PRODUCTS__via__PRODUCT_ID.products.id]}]
               :limit        5})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:source-query {:native "SELECT * FROM my_table"}
                :filter       [:= $product-id->products.category "Doohickey"]
                :order-by     [[:asc $product-id->products.category]]
                :limit        5}))))))

(deftest ^:parallel reuse-joins-sanity-check-e2e-test
  (testing "Reusing existing joins shouldn't break access to columns we're referencing at the top level"
    (let [query (mt/mbql-query orders
                  {:source-query {:source-table $$orders
                                  :filter       [:and
                                                 [:= $user_id 1]
                                                 [:= $product_id->products.category "Doohickey"]]}
                   :filter       [:= $product_id->products.category "Doohickey"]
                   :order-by     [[:asc $product_id->products.category]]
                   :limit        5})]
      (testing "Sanity check: should be able to run the query"
        (is (=? {:status :completed}
                (qp/process-query query)))))))

(deftest ^:parallel nested-nested-queries-test
  (testing "we should handle nested-nested queries correctly as well"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query
               {:source-query
                {:source-table $$venues
                 :fields       [$name [:field %categories.name {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                                :source-field %category-id}]]
                 :joins        [{:source-table $$categories
                                 :alias        "CATEGORIES__via__CATEGORY_ID"
                                 :condition    [:=
                                                $category-id
                                                &CATEGORIES__via__CATEGORY_ID.categories.id]
                                 :strategy     :left-join
                                 :fields       :none
                                 :fk-field-id  %category-id}]}}})
            (add-implicit-joins
             (lib.tu.macros/mbql-query venues
               {:source-query
                {:source-query
                 {:source-table $$venues
                  :fields       [$name $category-id->categories.name]}}}))))))

(deftest ^:parallel wtf-test
  (testing (str "ok, so apparently if you specify a source table at a deeper level of nesting we should still "
                "add JOINs as appropriate for that Table if you specify an `fk->` clause in an a higher level. "
                "Does this make any sense at all?")
    ;; TODO - I'm not sure I understand why we add the JOIN to the outer level in this case. Does it make sense?
    (is (=? (lib.tu.macros/mbql-query checkins
              {:source-query {:source-table $$checkins
                              :fields       [$id
                                             $date
                                             $user-id
                                             $venue-id]
                              :filter       [:> $date "2014-01-01"]}
               :aggregation  [[:count]]
               :breakout     [[:field %venues.price {:source-field %venue-id, :join-alias "VENUES__via__VENUE_ID"}]]
               :order-by     [[:asc [:field %venues.price {:source-field %venue-id, :join-alias "VENUES__via__VENUE_ID"}]]]
               :joins        [{:source-table $$venues
                               :alias        "VENUES__via__VENUE_ID"
                               :condition    [:=
                                              $venue-id
                                              &VENUES__via__VENUE_ID.venues.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %venue-id}]})
            (qp.store/with-metadata-provider meta/metadata-provider
              (-> (lib.tu.macros/mbql-query checkins
                    {:source-query {:source-table $$checkins
                                    :filter       [:> $date "2014-01-01"]}
                     :aggregation  [[:count]]
                     :breakout     [$venue-id->venues.price]
                     :order-by     [[:asc $venue-id->venues.price]]})
                  qp.add-implicit-clauses/add-implicit-clauses
                  add-implicit-joins))))))

(deftest ^:parallel topologically-sort-joins-test
  (let [parent        (lib/normalize
                       ::lib.schema.join/join
                       {:alias      "Parent"
                        :stages     [{:lib/type :mbql.stage/mbql, :source-table 1}]
                        :conditions [[:=
                                      [:field {} 2]
                                      [:field {:join-alias "Parent"} 1]]]})
        child-1       (lib/normalize
                       ::lib.schema.join/join
                       {:alias      "Child 1"
                        :stages     [{:lib/type :mbql.stage/mbql, :source-table 1}]
                        :conditions [[:=
                                      [:field {:join-alias "Parent"} 1]
                                      [:field {:join-alias "Child 1"} 1]]]})
        child-2       (lib/normalize
                       ::lib.schema.join/join
                       {:alias      "Child 2"
                        :stages     [{:lib/type :mbql.stage/mbql, :source-table 1}]
                        :conditions [[:=
                                      [:field {:join-alias "Parent"} 1]
                                      [:field {:join-alias "Child 2"} 1]]]})
        child-1-child (lib/normalize
                       ::lib.schema.join/join
                       {:alias      "Child 1 Child"
                        :stages     [{:lib/type :mbql.stage/mbql, :source-table 1}]
                        :conditions [[:=
                                      [:field {:join-alias "Child 1"} 1]
                                      [:field {:join-alias "Child 1 Child"} 1]]]})]
    (testing "Join dependencies"
      (is (= #{}
             (#'qp.add-implicit-joins/join-dependencies parent)))
      (is (= #{"Parent"}
             (#'qp.add-implicit-joins/join-dependencies child-1)
             (#'qp.add-implicit-joins/join-dependencies child-2)))
      (is (= #{"Child 1"}
             (#'qp.add-implicit-joins/join-dependencies child-1-child))))
    (testing "Sort by dependency order"
      (let [alias->join (m/index-by :alias [parent child-1 child-2 child-1-child])]
        (doseq [[original expected] {["Parent" "Child 1" "Child 2"]                 ["Parent" "Child 1" "Child 2"]
                                     ["Child 1" "Parent" "Child 2"]                 ["Parent" "Child 1" "Child 2"]
                                     ["Child 1" "Child 2" "Parent"]                 ["Parent" "Child 1" "Child 2"]
                                     ;; should preserve order if there are no dependencies.
                                     ["Child 1" "Child 2"]                          ["Child 1" "Child 2"]
                                     ["Child 2" "Child 1"]                          ["Child 2" "Child 1"]
                                     ["Parent" "Child 2" "Child 1"]                 ["Parent" "Child 2" "Child 1"]
                                     ["Child 2" "Parent" "Child 1"]                 ["Parent" "Child 2" "Child 1"]
                                     ["Child 2" "Child 1" "Parent"]                 ["Parent" "Child 2" "Child 1"]
                                     ;; should handle dependencies of dependencies
                                     ["Parent" "Child 1" "Child 2" "Child 1 Child"] ["Parent" "Child 1" "Child 2" "Child 1 Child"]
                                     ["Parent" "Child 1" "Child 1 Child" "Child 2"] ["Parent" "Child 1" "Child 1 Child" "Child 2"]
                                     ["Parent" "Child 1 Child" "Child 1" "Child 2"] ["Parent" "Child 1" "Child 1 Child" "Child 2"]
                                     ["Child 1 Child" "Parent" "Child 1" "Child 2"] ["Parent" "Child 1" "Child 1 Child" "Child 2"]}]
          (testing (format "Sort %s" original)
            (is (= expected
                   (mapv :alias (#'qp.add-implicit-joins/topologically-sort-joins (mapv alias->join original)))))))))))

(deftest ^:parallel mix-implicit-and-explicit-joins-test
  (testing "Test that adding implicit joins still works correctly if the query also contains explicit joins"
    (is (=? (lib.tu.macros/mbql-query checkins
              {:source-table $$checkins
               :aggregation  [[:sum [:field %users.id {:join-alias   "USERS__via__USER_ID"
                                                       :source-field %user-id}]]]
               :breakout     [$id]
               :joins        [{:alias        "u"
                               :source-table $$users
                               :condition    [:= *user-id &u.users.id]}
                              {:source-table $$users
                               :alias        "USERS__via__USER_ID"
                               :strategy     :left-join
                               :condition    [:=
                                              $user-id
                                              &USERS__via__USER_ID.users.id]
                               :fk-field-id  %checkins.user-id
                               :fields       :none}]
               :limit        10})
            (add-implicit-joins
             (lib.tu.macros/mbql-query checkins
               {:source-table $$checkins
                :aggregation  [[:sum $user-id->users.id]]
                :breakout     [$id]
                :joins        [{:alias        "u"
                                :source-table $$users
                                :condition    [:= *user-id &u.users.id]}]
                :limit        10}))))))

(deftest ^:parallel mix-implicit-and-explicit-joins-test-2
  (testing "Test that adding implicit joins still works correctly if the query also contains explicit joins"
    (testing "in nested source queries"
      (is (=? (lib.tu.macros/mbql-query checkins
                {:source-query {:source-table $$checkins
                                :aggregation  [[:sum [:field %users.id {:join-alias   "USERS__via__USER_ID"
                                                                        :source-field %user-id}]]]
                                :breakout     [$id]
                                :joins        [{:source-table $$users
                                                :alias        "USERS__via__USER_ID"
                                                :strategy     :left-join
                                                :condition    [:=
                                                               $user-id
                                                               &USERS__via__USER_ID.users.id]
                                                :fk-field-id  %checkins.user-id
                                                :fields       :none}]}
                 :joins        [{:alias        "u"
                                 :source-table $$users
                                 :condition    [:= *user-id &u.users.id]}]
                 :limit        10})
              (add-implicit-joins
               (lib.tu.macros/mbql-query checkins
                 {:source-query {:source-table $$checkins
                                 :aggregation  [[:sum $user-id->users.id]]
                                 :breakout     [$id]}
                  :joins        [{:alias        "u"
                                  :source-table $$users
                                  :condition    [:= *user-id &u.users.id]}]
                  :limit        10})))))))

(deftest ^:parallel dont-add-duplicate-fields-test
  (testing "Don't add duplicate `:fields` to parent query if they are only different because of namespaced options"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :joins        [{:source-table $$products
                                              :alias        "PRODUCTS__via__PRODUCT_ID"
                                              :condition    [:=
                                                             $product-id
                                                             &PRODUCTS__via__PRODUCT_ID.products.id]
                                              :fields       :none
                                              :strategy     :left-join
                                              :fk-field-id  %product-id}]
                              :fields       [[:field
                                              %product-id
                                              {::namespaced true}]
                                             [:field
                                              %products.title
                                              {:source-field %product-id
                                               :join-alias   "PRODUCTS__via__PRODUCT_ID"
                                               ::namespaced  true}]]}
               :fields       [[:field %product-id {::namespaced true}]
                              [:field
                               %products.title
                               {:source-field %product-id
                                :join-alias   "PRODUCTS__via__PRODUCT_ID"
                                ::namespaced  true}]]})
            (-> (lib.tu.macros/mbql-query orders
                  {:source-query    {:source-table $$orders
                                     :fields       [[:field
                                                     %product-id
                                                     {::namespaced true}]
                                                    [:field
                                                     %products.title
                                                     {:source-field %product-id, ::namespaced true}]]}
                   :source-metadata [{:base_type         :type/Text
                                      :coercion_strategy nil
                                      :display_name      "Product → Title"
                                      :effective_type    :type/Text
                                      :field_ref         $product-id->products.title
                                      :fingerprint       nil
                                      :id                93899
                                      :name              "TITLE"
                                      :parent_id         nil
                                      :semantic_type     nil
                                      :settings          nil
                                      :table_id          $$products}]
                   :fields          [[:field %product-id {::namespaced true}]
                                     [:field
                                      %products.title
                                      {:source-field %product-id, ::namespaced true}]]})
                add-implicit-joins
                (m/dissoc-in [:query :source-metadata]))))))

(deftest ^:parallel resolve-implicit-joins-in-join-conditions-test
  (testing "Should be able to resolve implicit joins inside a join `:condition`"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :fields       [$product-id]}
               :joins        [{:source-table $$products
                               :alias        "PRODUCTS__via__PRODUCT_ID"
                               :condition    [:=
                                              $product-id
                                              [:field
                                               %products.id
                                               {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                               :fields       :none
                               :strategy     :left-join
                               :fk-field-id  %product-id}
                              {:source-table $$products
                               :alias        "Products"
                               :condition    [:=
                                              [:field
                                               %products.category
                                               {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                :source-field %product-id}]
                                              &Products.products.category]
                               :fields       :none}]})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:source-query {:source-table $$orders
                               :fields       [$product-id]}
                :joins        [{:source-table $$products
                                :alias        "Products"
                                :condition    [:=
                                               $product-id->products.category
                                               &Products.products.category]
                                :fields       :none}]}))))))

(deftest ^:parallel use-source-query-implicit-joins-for-join-conditions-test
  (testing "Implicit join inside a join `:condition` should use implicit join from source query if available (#20519)"
    (is (=? (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :joins        [{:source-table $$products
                                              :alias        "PRODUCTS__via__PRODUCT_ID"
                                              :condition    [:=
                                                             $product-id
                                                             [:field
                                                              %products.id
                                                              {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                              :fields       :none
                                              :strategy     :left-join
                                              :fk-field-id  %product-id}]
                              :breakout     [[:field
                                              %products.category
                                              {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                               :source-field %product-id}]]
                              :aggregation  [[:count]]}
               :joins        [{:source-table $$products
                               :alias        "Products"
                               :condition    [:=
                                              [:field
                                               %products.category
                                               {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                :source-field %product-id}]
                                              &Products.products.category]
                               :fields       :none}]
               :fields       [[:field
                               %products.category
                               {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                :source-field %product-id}]]})
            (add-implicit-joins
             (lib.tu.macros/mbql-query orders
               {:source-query {:source-table $$orders
                               :breakout     [$product-id->products.category]
                               :aggregation  [[:count]]}
                :joins        [{:source-table $$products
                                :alias        "Products"
                                :condition    [:=
                                               $product-id->products.category
                                               &Products.products.category]
                                :fields       :none}]
                :fields       [$product-id->products.category]}))))))

(deftest ^:parallel metadata-join-alias-test
  ;; With remapping, metadata may contain field with `:source-field` which is not used in corresponding query.
  ;;   See [[metabase.parameters.custom-values-test/with-mbql-card-test]].
  (testing "`:join-alias` is correctly updated in metadata fields containing `:source-field`"
    ;; Used metadata are simplified (invalid) for testing purposes. To the best of my knowledge only `:field_ref`
    ;;   could contain field with `:source-field` option that should be updated.
    (testing "With `:source-field` field in the `:source-metadata` and not in the`:source-query`, query should be left intact"
      (let [query (lib.tu.macros/mbql-query products
                    {:source-query    {:source-table $$orders
                                       :fields       [$id]}
                     :source-metadata [{:name         "CATEGORY"
                                        :display_name "Category"
                                        :base_type    :type/Number
                                        :id           %category
                                        :field_ref    $orders.product-id->category}]})]
        (is (=? query (add-implicit-joins query)))))))

(deftest ^:parallel metadata-join-alias-test-1b
  (is (=? (lib.tu.macros/mbql-query products
            {:source-query {:source-table $$orders
                            :joins        [{:alias "PRODUCTS__via__PRODUCT_ID"}]
                            :aggregation  [[:count]]
                            :breakout     [$orders.product-id->category]}
             :joins        [{:source-query {:source-table $$reviews
                                            :aggregation  [[:count]]
                                            :breakout     [$reviews.product-id->category]}
                             :alias        "Q2"
                             :condition    [:= $orders.product-id->category &Q2.$reviews.product-id->category]
                             :strategy     :left-join}]})
          (add-implicit-joins
           (lib.tu.macros/mbql-query products
             {:source-query {:source-table $$orders
                             :aggregation  [[:count]]
                             :breakout     [$orders.product-id->category]}
              :joins        [{:source-query {:source-table $$reviews
                                             :aggregation  [[:count]]
                                             :breakout     [$reviews.product-id->category]}
                              :alias        "Q2"
                              :condition    [:= $orders.product-id->category &Q2.$reviews.product-id->category]
                              :strategy     :left-join}]})))))

(deftest ^:parallel metadata-join-alias-test-2
  ;; With remapping, metadata may contain field with `:source-field` which is not used in corresponding query.
  ;;   See [[metabase.parameters.custom-values-test/with-mbql-card-test]].
  (testing "`:join-alias` is correctly updated in metadata fields containing `:source-field`"
    (testing "#26631 Case 2: Join query with implicit join into a query with a table as source"
      (is (=? (lib.tu.macros/mbql-query products
                {:source-table $$products
                 :joins        [{:join-alias      "Q2"
                                 :fields          :all
                                 :condition       [:= $category &Q2.$orders.product-id->category]
                                 :strategy        :left-join
                                 :source-query    {:source-table $$orders
                                                   :aggregation  [[:count]]
                                                   :breakout     [&PRODUCTS__via__PRODUCT_ID.$orders.product-id->category]
                                                   :joins        [{:alias        "PRODUCTS__via__PRODUCT_ID"
                                                                   :fields       :none
                                                                   :strategy     :left-join
                                                                   :condition    [:= $orders.product-id &PRODUCTS__via__PRODUCT_ID.$id]
                                                                   :source-table $$products
                                                                   :fk-field-id  %orders.product-id}]}
                                 :source-metadata [{:field_ref &PRODUCTS__via__PRODUCT_ID.$orders.product-id->category}]}]})
              (add-implicit-joins
               (lib.tu.macros/mbql-query products
                 {:source-table $$products
                  :joins        [{:join-alias      "Q2"
                                  :fields          :all
                                  :condition       [:= $category &Q2.$orders.product-id->category]
                                  :strategy        :left-join
                                  :source-query    {:source-table $$orders
                                                    :aggregation  [[:count]]
                                                    :breakout     [$orders.product-id->category]}
                                  :source-metadata [{:name         "CATEGORY"
                                                     :display_name "Category"
                                                     :base_type    :type/Number
                                                     :field_ref    $orders.product-id->category}]}]})))))))

(deftest ^:parallel test-59695
  (testing "Resolving an implicit join should not add field refs to incorrect places (#59695)"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query (lib.tu.macros/mbql-query orders)}]})
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query nil
                   {:source-table "card__1"
                    :joins        [{:source-table (meta/id :checkins)
                                    :fields       :all
                                    :strategy     :left-join
                                    :alias        "CH"
                                    :condition    [:=
                                                   [:field
                                                    "ID"
                                                    {:base-type :type/BigInteger}]
                                                   [:field
                                                    (meta/id :checkins :id)
                                                    {:base-type :type/BigInteger, :join-alias "CH"}]]}]
                    :filter       [:=
                                   [:field (meta/id :venues :price) {:base-type               :type/Text
                                                                     :source-field            (meta/id :checkins :venue-id)
                                                                     :source-field-join-alias "CH"}]
                                   "Basic"]}))]
      (qp.store/with-metadata-provider mp
        (let [query' (-> query
                         metabase.query-processor.middleware.fetch-source-query/resolve-source-cards
                         lib/->legacy-MBQL
                         qp.add-implicit-clauses/add-implicit-clauses)]
          (testing "sanity check: before add-implicit-joins"
            (is (=? {:source-table (meta/id :orders)
                     :fields       [[:field (meta/id :orders :id)         nil]
                                    [:field (meta/id :orders :user-id)    nil]
                                    [:field (meta/id :orders :product-id) nil]
                                    [:field (meta/id :orders :subtotal)   nil]
                                    [:field (meta/id :orders :tax)        nil]
                                    [:field (meta/id :orders :total)      nil]
                                    [:field (meta/id :orders :discount)   nil]
                                    [:field (meta/id :orders :created-at) nil]
                                    [:field (meta/id :orders :quantity)   nil]]}
                    (-> query' :query :source-query))))
          (testing "after add-implicit-joins"
            (let [query'' (lib/->legacy-MBQL (qp.add-implicit-joins/add-implicit-joins (lib/query mp query')))]
              (is (=? {:source-table (meta/id :orders)
                       :fields       [[:field (meta/id :orders :id)         nil]
                                      [:field (meta/id :orders :user-id)    nil]
                                      [:field (meta/id :orders :product-id) nil]
                                      [:field (meta/id :orders :subtotal)   nil]
                                      [:field (meta/id :orders :tax)        nil]
                                      [:field (meta/id :orders :total)      nil]
                                      [:field (meta/id :orders :discount)   nil]
                                      [:field (meta/id :orders :created-at) nil]
                                      [:field (meta/id :orders :quantity)   nil]]}
                      (-> query'' :query :source-query))))))))))

(deftest ^:parallel join-against-implicit-join-test
  (testing "Should be able to explicitly join against an implicit join (#20519)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :breakout     [$product-id->products.category]
                                   :aggregation  [[:count]]}
                    :joins        [{:source-table $$products
                                    :alias        "Products"
                                    :condition    [:= *products.category &Products.products.category]
                                    :fields       [&Products.products.id
                                                   &Products.products.title]}]
                    :expressions  {"CC" [:+ 1 1]}
                    :order-by     [[:asc &Products.products.id]]
                    :limit        2}))]
      (is (=? {:stages [{:joins       [{:qp/is-implicit-join true
                                        :stages              [{:source-table (meta/id :products)}]
                                        :fields              :none
                                        :alias               "PRODUCTS__via__PRODUCT_ID"
                                        :strategy            :left-join
                                        :conditions          [[:=
                                                               {}
                                                               [:field {} (meta/id :orders :product-id)]
                                                               [:field {:join-alias "PRODUCTS__via__PRODUCT_ID"} (meta/id :products :id)]]]
                                        :fk-field-id         (meta/id :orders :product-id)}]
                         :breakout    [[:field {:source-field (meta/id :orders :product-id), :join-alias "PRODUCTS__via__PRODUCT_ID"}
                                        (meta/id :products :category)]]
                         :aggregation [[:count {}]]}
                        {:joins       [{:alias      "Products"
                                        :fields     [[:field {:join-alias "Products"} (meta/id :products :id)]
                                                     [:field {:join-alias "Products"} (meta/id :products :title)]]
                                        :conditions [[:=
                                                      {}
                                                      ;; this ref is wrong, it should be
                                                      ;; `PRODUCTS__via__PRODUCT_ID__CATEGORY` but it came in wrong and
                                                      ;; this middleware doesn't fix wrong refs.
                                                      [:field {} "CATEGORY"]
                                                      [:field {:join-alias "Products"} (meta/id :products :category)]]]
                                        :lib/type   :mbql/join
                                        :stages     [{:source-table (meta/id :products)}]}]
                         :expressions [[:+ {:lib/expression-name "CC"} 1 1]]
                         :order-by    [[:asc {} [:field {:join-alias "Products"} (meta/id :products :id)]]]}]}
              (qp.add-implicit-joins/add-implicit-joins query))))))
