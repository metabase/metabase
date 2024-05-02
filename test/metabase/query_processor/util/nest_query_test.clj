(ns metabase.query-processor.util.nest-query-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

;; TODO -- this is duplicated with [[metabase.query-processor.util.add-alias-info-test/remove-source-metadata]]
(defn- remove-source-metadata [x]
  (walk/postwalk
   (fn [x]
     (if ((every-pred map? :source-metadata) x)
       (dissoc x :source-metadata)
       x))
   x))

(defn- nest-expressions [query]
  (driver/with-driver (or driver/*driver* :h2)
    (-> query
        qp.preprocess/preprocess
        :query
        nest-query/nest-expressions
        remove-source-metadata)))

(deftest ^:parallel nest-expressions-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (partial= (lib.tu.macros/$ids venues
                      {:source-query {:source-table $$venues
                                      :expressions  {"double_price" [:* [:field %price {::add/source-table  $$venues
                                                                                        ::add/source-alias  "PRICE"
                                                                                        ::add/desired-alias "PRICE"
                                                                                        ::add/position      0}]
                                                                     2]}
                                      :fields       [[:field %price       {::add/source-table  $$venues
                                                                           ::add/source-alias  "PRICE"
                                                                           ::add/desired-alias "PRICE"
                                                                           ::add/position      0}]
                                                     [:expression "double_price" {::add/desired-alias "double_price"
                                                                                  ::add/position      1}]]}
                       :breakout     [[:field "PRICE" {::add/source-table  ::add/source
                                                       ::add/source-alias  "PRICE"
                                                       ::add/desired-alias "PRICE"
                                                       ::add/position      0}]]
                       :aggregation  [[:aggregation-options [:count] {:name               "count"
                                                                      ::add/desired-alias "count"
                                                                      ::add/position      1}]]
                       :fields       [[:field "double_price" {::add/source-table  ::add/source
                                                              ::add/source-alias  "double_price"
                                                              ::add/desired-alias "double_price"
                                                              ::add/position      2}]]
                       :order-by     [[:asc [:field "PRICE" {::add/source-table ::add/source
                                                             ::add/source-alias  "PRICE"
                                                             ::add/desired-alias "PRICE"
                                                             ::add/position      0}]]]})
                    (-> (lib.tu.macros/mbql-query venues
                          {:expressions {"double_price" [:* $price 2]}
                           :breakout    [$price]
                           :aggregation [[:count]]
                           :fields      [[:expression "double_price"]]})
                        qp.preprocess/preprocess
                        nest-expressions
                        add/add-alias-info))))))

(deftest ^:parallel nest-expressions-test-2
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      ;; source query returns created_at, arg_299986, arg_299987
      (let [source-query    {:native "SELECT *"}
            source-metadata [{:name         "created_at"
                              :display_name "created_at"
                              :base_type    :type/DateTimeWithLocalTZ}
                             {:name         "arg_299986"
                              :display_name "arg_299986"
                              :base_type    :type/Number}
                             {:name         "arg_299987"
                              :display_name "arg_299987"
                              :base_type    :type/Number}]
            ;; inner returns created_at, expression
            inner           {:source-query    source-query
                             :source-metadata source-metadata
                             :fields          [[:field "created_at" {:base-type :type/DateTimeWithLocalTZ, :temporal-unit :default}]
                                               [:expression "expression" {:base-type :type/Number}]]
                             :expressions     {"expression" [:/
                                                             [:field "arg_299986" {:base-type :type/Number}]
                                                             [:field "arg_299987" {:base-type :type/Number}]]}}
            query           {:database 1
                             :type     :query
                             :query    inner}]
        (is (=? {:source-query {:source-query {:native "SELECT *"}
                                :expressions  {"expression" [:/
                                                             [:field "arg_299986" {}]
                                                             [:field "arg_299987" {}]]}
                                :fields       [[:field "created_at" {:base-type :type/DateTimeWithLocalTZ}]
                                               [:expression "expression" {}]]}
                 :fields       [[:field "created_at" {}]
                                [:field "expression" {}]]}
                (-> query
                    qp.preprocess/preprocess
                    :query
                    nest-query/nest-expressions)))))))

(deftest ^:parallel nest-expressions-with-existing-non-expression-fields-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (testing "Other `:fields` besides the `:expressions` should be preserved in the top level"
        (is (=? (lib.tu.macros/$ids checkins
                  {:source-query {:source-table $$checkins
                                  :expressions  {"double_id" [:*
                                                              [:field %checkins.id {::add/source-table $$checkins
                                                                                    ::add/source-alias "ID"}]
                                                              2]}
                                  :fields       [[:field %date {:temporal-unit      :default
                                                                ::add/source-table  $$checkins
                                                                ::add/source-alias  "DATE"
                                                                ::add/desired-alias "DATE"}]
                                                 [:expression "double_id" {::add/desired-alias "double_id"}]]}
                   :fields       [[:field "double_id" {::add/source-table  ::add/source
                                                       ::add/source-alias  "double_id"
                                                       ::add/desired-alias "double_id"}]
                                  [:field "DATE" {:temporal-unit      :day
                                                  ::add/source-table  ::add/source
                                                  ::add/source-alias  "DATE"
                                                  ::add/desired-alias "DATE"}]
                                  [:field "DATE" {:temporal-unit      :month
                                                  ::add/source-table  ::add/source
                                                  ::add/source-alias  "DATE"
                                                  ::add/desired-alias "DATE_2"}]]
                   :limit        1})
                (-> (lib.tu.macros/mbql-query checkins
                      {:expressions {"double_id" [:* $id 2]}
                       :fields      [[:expression "double_id"]
                                     !day.date
                                     !month.date]
                       :limit       1})
                    qp.preprocess/preprocess
                    nest-expressions
                    add/add-alias-info)))))))

(deftest ^:parallel multiple-expressions-test
  (testing "Make sure the nested version of the query doesn't mix up expressions if we have ones that reference others"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (=? (lib.tu.macros/$ids venues
                  {:source-query {:source-table $$venues
                                  :expressions  {"big_price"
                                                 [:+
                                                  [:field %price {::add/source-table $$venues
                                                                  ::add/source-alias "PRICE"}]
                                                  2]

                                                 "my_cool_new_field"
                                                 [:/
                                                  [:field %price {::add/source-table $$venues
                                                                  ::add/source-alias "PRICE"}]
                                                  [:expression "big_price" {}]]}
                                  :fields [[:field %id {::add/source-table  $$venues
                                                        ::add/source-alias  "ID"
                                                        ::add/desired-alias "ID"}]
                                           [:expression "my_cool_new_field" {}]]}
                   :fields   [[:field "my_cool_new_field" {::add/source-table  ::add/source
                                                           ::add/source-alias  "my_cool_new_field"
                                                           ::add/desired-alias "my_cool_new_field"}]]
                   :order-by [[:asc [:field "ID" {::add/source-table ::add/source
                                                  ::add/source-alias "ID"}]]]
                   :limit    3})
                (-> (lib.tu.macros/mbql-query venues
                      {:expressions {"big_price"         [:+ $price 2]
                                     "my_cool_new_field" [:/ $price [:expression "big_price"]]}
                       :fields      [[:expression "my_cool_new_field"]]
                       :order-by    [[:asc $id]]
                       :limit       3})
                    nest-expressions
                    add/add-alias-info)))))))

(deftest ^:parallel nest-expressions-ignore-source-queries-test
  (testing (str "When 'raising' :expression clauses, only raise ones in the current level. Handle duplicate expression "
                "names correctly.")
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (let [query (lib.tu.macros/mbql-query venues
                      {:source-query {:source-table $$venues
                                      :expressions  {"x" [:* $price 2]}
                                      :fields       [$id [:expression "x"]]}
                       :expressions  {"x" [:* $price 4]}
                       :fields       [$id [:expression "x"]]
                       :limit        1})]
          (mt/with-native-query-testing-context query
            (is (=? (lib.tu.macros/$ids venues
                      {:source-query {:source-query {:source-query {:source-table $$venues
                                                                    :expressions  {"x" [:*
                                                                                        [:field %price {::add/source-table $$venues
                                                                                                        ::add/source-alias "PRICE"}]
                                                                                        2]}
                                                                    :fields       [[:field %id {::add/source-table  $$venues
                                                                                                ::add/source-alias  "ID"
                                                                                                ::add/desired-alias "ID"}]
                                                                                   [:expression "x" {::add/desired-alias "x"}]]}
                                                     :fields       [[:field "ID" {::add/source-table  ::add/source
                                                                                  ::add/source-alias  "ID"
                                                                                  ::add/desired-alias "ID"}]
                                                                    [:field "x" {::add/source-table  ::add/source
                                                                                 ::add/source-alias  "x"
                                                                                 ::add/desired-alias "x"}]]}
                                      :expressions  {"x" [:*
                                                          [:field %price {::add/source-table ::add/source
                                                                          ::add/source-alias "PRICE"}]
                                                          4]}
                                      :fields       [[:field "ID" {::add/source-table ::add/source
                                                                   ::add/source-alias  "ID"
                                                                   ::add/desired-alias "ID"}]
                                                     [:expression "x" {::add/desired-alias "x"}]]}
                       :fields [[:field "ID" {::add/source-table ::add/source
                                              ::add/source-alias  "ID"
                                              ::add/desired-alias "ID"}]
                                [:field "x" {::add/source-table ::add/source
                                             ::add/source-alias "x"
                                             ::add/desired-alias "x"}]]

                       :limit 1})
                    (-> query nest-expressions add/add-alias-info)))))))))

(deftest ^:parallel nest-expressions-ignore-source-queries-from-joins-e2e-test
  (testing "Ignores source-query from joins (#20809)"
    (mt/dataset test-data
      (t2.with-temp/with-temp [:model/Card base {:dataset_query
                                                 (mt/mbql-query
                                                   reviews
                                                   {:breakout [$product_id]
                                                    :aggregation [[:count]]
                                                    ;; filter on an implicit join
                                                    :filter [:= $product_id->products.category "Doohickey"]})}]
        ;; the result returned is not important, just important that the query is valid and completes
        (is (=? {:status :completed}
                (qp/process-query
                 (mt/mbql-query orders
                   {:joins [{:source-table (str "card__" (:id base))
                             :alias (str "Question " (:id base))
                             :condition [:=
                                         $product_id
                                         [:field
                                          %reviews.product_id
                                          {:join-alias (str "Question " (:id base))}]]
                             :fields :all}]
                    :expressions {"CC" [:+ 1 1]}
                    :limit 2}))))))))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel nest-expressions-with-joins-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (testing "If there are any `:joins`, those need to be nested into the `:source-query` as well."
        (is (partial= (lib.tu.macros/$ids venues
                        {:source-query {:source-table $$venues
                                        :joins        [{:strategy     :left-join
                                                        :condition    [:=
                                                                       [:field %category-id {::add/source-table  $$venues
                                                                                             ::add/source-alias  "CATEGORY_ID"
                                                                                             ::add/desired-alias "CATEGORY_ID"}]
                                                                       [:field %category-id {:join-alias         "CategoriesStats"
                                                                                             ::add/source-table  "CategoriesStats"
                                                                                             ::add/source-alias  "CATEGORY_ID"
                                                                                             ::add/desired-alias "CategoriesStats__CATEGORY_ID"}]]
                                                        :source-query {:source-table $$venues
                                                                       :aggregation  [[:aggregation-options
                                                                                       [:max [:field %price {::add/source-table $$venues
                                                                                                             ::add/source-alias "PRICE"}]]
                                                                                       {:name               "MaxPrice"
                                                                                        ::add/desired-alias "MaxPrice"}]
                                                                                      [:aggregation-options
                                                                                       [:avg
                                                                                        [:field
                                                                                         %price
                                                                                         {::add/source-table $$venues
                                                                                          ::add/source-alias "PRICE"}]]
                                                                                       {:name               "AvgPrice"
                                                                                        ::add/desired-alias "AvgPrice"}]
                                                                                      [:aggregation-options
                                                                                       [:min [:field %price {::add/source-table $$venues
                                                                                                             ::add/source-alias "PRICE"}]]
                                                                                       {:name               "MinPrice"
                                                                                        ::add/desired-alias "MinPrice"}]]
                                                                       :breakout     [[:field %category-id {::add/source-table  $$venues
                                                                                                            ::add/source-alias  "CATEGORY_ID"
                                                                                                            ::add/desired-alias "CATEGORY_ID"}]]
                                                                       :order-by     [[:asc [:field %category-id {::add/source-table  $$venues
                                                                                                                  ::add/source-alias  "CATEGORY_ID"
                                                                                                                  ::add/desired-alias "CATEGORY_ID"}]]]}
                                                        :alias        "CategoriesStats"
                                                        :fields       [[:field %category-id {:join-alias         "CategoriesStats"
                                                                                             ::add/source-table  "CategoriesStats"
                                                                                             ::add/source-alias  "CATEGORY_ID"
                                                                                             ::add/desired-alias "CategoriesStats__CATEGORY_ID"}]
                                                                       [:field "MaxPrice" {:base-type          :type/Integer
                                                                                           :join-alias         "CategoriesStats"
                                                                                           ::add/source-table  "CategoriesStats"
                                                                                           ::add/source-alias  "MaxPrice"
                                                                                           ::add/desired-alias "CategoriesStats__MaxPrice"}]
                                                                       [:field "AvgPrice" {:base-type          :type/Float
                                                                                           :join-alias         "CategoriesStats"
                                                                                           ::add/source-table  "CategoriesStats"
                                                                                           ::add/source-alias  "AvgPrice"
                                                                                           ::add/desired-alias "CategoriesStats__AvgPrice"}]
                                                                       [:field "MinPrice" {:base-type          :type/Integer
                                                                                           :join-alias         "CategoriesStats"
                                                                                           ::add/source-table  "CategoriesStats"
                                                                                           ::add/source-alias  "MinPrice"
                                                                                           ::add/desired-alias "CategoriesStats__MinPrice"}]]}]
                                        :expressions  {"RelativePrice" [:/
                                                                        [:field %price {::add/source-table  $$venues
                                                                                        ::add/source-alias  "PRICE"
                                                                                        ::add/desired-alias "PRICE"}]
                                                                        [:field "AvgPrice" {:base-type          :type/Integer
                                                                                            :join-alias         "CategoriesStats"
                                                                                            ::add/source-table  "CategoriesStats"
                                                                                            ::add/source-alias  "AvgPrice"}]]}
                                        :fields       [[:field %id {::add/source-table  $$venues
                                                                    ::add/source-alias  "ID"
                                                                    ::add/desired-alias "ID"}]
                                                       [:field %name {::add/source-table  $$venues
                                                                      ::add/source-alias  "NAME"
                                                                      ::add/desired-alias "NAME"}]
                                                       [:field %category-id {::add/source-table  $$venues
                                                                             ::add/source-alias  "CATEGORY_ID"
                                                                             ::add/desired-alias "CATEGORY_ID"}]
                                                       [:field %latitude {::add/source-table  $$venues
                                                                          ::add/source-alias  "LATITUDE"
                                                                          ::add/desired-alias "LATITUDE"}]
                                                       [:field %longitude {::add/source-table  $$venues
                                                                           ::add/source-alias  "LONGITUDE"
                                                                           ::add/desired-alias "LONGITUDE"}]
                                                       [:field %price {::add/source-table  $$venues
                                                                       ::add/source-alias  "PRICE"
                                                                       ::add/desired-alias "PRICE"}]
                                                       [:expression "RelativePrice" {::add/desired-alias "RelativePrice"}]
                                                       [:field %category-id {:join-alias         "CategoriesStats"
                                                                             ::add/source-table  "CategoriesStats"
                                                                             ::add/source-alias  "CATEGORY_ID"
                                                                             ::add/desired-alias "CategoriesStats__CATEGORY_ID"}]
                                                       [:field "MaxPrice" {:base-type          :type/Integer
                                                                           :join-alias         "CategoriesStats"
                                                                           ::add/source-table  "CategoriesStats"
                                                                           ::add/source-alias  "MaxPrice"
                                                                           ::add/desired-alias "CategoriesStats__MaxPrice"}]
                                                       [:field "AvgPrice" {:base-type          :type/Float
                                                                           :join-alias         "CategoriesStats"
                                                                           ::add/source-table  "CategoriesStats"
                                                                           ::add/source-alias  "AvgPrice"
                                                                           ::add/desired-alias "CategoriesStats__AvgPrice"}]
                                                       [:field "MinPrice" {:base-type          :type/Integer
                                                                           :join-alias         "CategoriesStats"
                                                                           ::add/source-table  "CategoriesStats"
                                                                           ::add/source-alias  "MinPrice"
                                                                           ::add/desired-alias "CategoriesStats__MinPrice"}]]}
                         :fields       [[:field "ID" {::add/source-table  ::add/source
                                                      ::add/source-alias  "ID"
                                                      ::add/desired-alias "ID"}]
                                        [:field "NAME" {::add/source-table ::add/source
                                                        ::add/source-alias  "NAME"
                                                        ::add/desired-alias "NAME"}]
                                        [:field "CATEGORY_ID" {::add/source-table  ::add/source
                                                               ::add/source-alias  "CATEGORY_ID"
                                                               ::add/desired-alias "CATEGORY_ID"}]
                                        [:field "LATITUDE" {::add/source-table  ::add/source
                                                            ::add/source-alias  "LATITUDE"
                                                            ::add/desired-alias "LATITUDE"}]
                                        [:field "LONGITUDE" {::add/source-table ::add/source
                                                             ::add/source-alias  "LONGITUDE"
                                                             ::add/desired-alias "LONGITUDE"}]
                                        [:field "PRICE" {::add/source-table ::add/source
                                                         ::add/source-alias  "PRICE"
                                                         ::add/desired-alias "PRICE"}]
                                        [:field "RelativePrice" {:base-type          :type/Float
                                                                 ::add/source-table  ::add/source
                                                                 ::add/source-alias  "RelativePrice"
                                                                 ::add/desired-alias "RelativePrice"}]
                                        [:field "CategoriesStats__CATEGORY_ID" {::add/source-alias  "CategoriesStats__CATEGORY_ID"
                                                                                ::add/desired-alias "CategoriesStats__CATEGORY_ID"
                                                                                ::add/source-table  ::add/source}]
                                        [:field "CategoriesStats__MaxPrice" {:base-type          :type/Integer
                                                                             ::add/source-alias  "CategoriesStats__MaxPrice"
                                                                             ::add/desired-alias "CategoriesStats__MaxPrice"
                                                                             ::add/source-table  ::add/source}]
                                        [:field "CategoriesStats__AvgPrice" {:base-type          :type/Integer
                                                                             ::add/source-alias  "CategoriesStats__AvgPrice"
                                                                             ::add/desired-alias "CategoriesStats__AvgPrice"
                                                                             ::add/source-table  ::add/source}]
                                        [:field "CategoriesStats__MinPrice" {:base-type          :type/Integer
                                                                             ::add/source-alias  "CategoriesStats__MinPrice"
                                                                             ::add/desired-alias "CategoriesStats__MinPrice"
                                                                             ::add/source-table  ::add/source}]]
                         :limit        3})
                      (-> (lib.tu.macros/mbql-query venues
                            {:fields      [$id
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
                             :limit       3})
                          qp.preprocess/preprocess
                          nest-expressions
                          add/add-alias-info)))))))

(deftest ^:parallel nest-expressions-eliminate-duplicate-coercion-test
  (testing "If coercion happens in the source query, don't do it a second time in the parent query (#12430)"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                        meta/metadata-provider
                                        {:fields [{:id                (meta/id :venues :price)
                                                   :coercion-strategy :Coercion/UNIXSeconds->DateTime
                                                   :effective-type    :type/DateTime}]})
        (is (partial= (lib.tu.macros/$ids venues
                        {:source-query {:source-table $$venues
                                        :expressions  {"test" [:* 1 1]}
                                        :fields       [[:field %price {::add/source-table  $$venues
                                                                       ::add/source-alias  "PRICE"
                                                                       ::add/desired-alias "PRICE"}]
                                                       [:expression "test" {::add/desired-alias "test"}]]}
                         :fields       [[:field "PRICE" {:temporal-unit      :default
                                                         ::add/source-table  ::add/source
                                                         ::add/source-alias  "PRICE"
                                                         ::add/desired-alias "PRICE"}]
                                        [:field "test" {::add/source-table  ::add/source
                                                        ::add/source-alias  "test"
                                                        ::add/desired-alias "test"}]]
                         :limit        1})
                      (-> (lib.tu.macros/mbql-query venues
                            {:expressions {"test" ["*" 1 1]}
                             :fields      [$price
                                           [:expression "test"]]
                             :limit       1})
                          nest-expressions
                          add/add-alias-info)))))))

(deftest ^:parallel multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (let [q1 (lib.tu.macros/$ids orders
                   (let [product-id        [:field %product-id {::add/source-table  $$orders
                                                                ::add/source-alias  "PRODUCT_ID"}]
                         created-at        [:field %created-at {::add/source-table  $$orders
                                                                ::add/source-alias  "CREATED_AT"
                                                                ::add/desired-alias "CREATED_AT"}]
                         pivot-grouping    [:expression "pivot-grouping" {::add/desired-alias "pivot-grouping"}]
                         products-category [:field %products.category {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                       ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                       ::add/source-alias  "CATEGORY"
                                                                       ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"}]
                         products-id       [:field %products.id {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                 ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                 ::add/source-alias  "ID"}]]
                     {:source-table $$orders
                      :joins        [{:source-table $$products
                                      :alias        "PRODUCTS__via__PRODUCT_ID"
                                      :condition    [:= product-id products-id]
                                      :strategy     :left-join
                                      :fk-field-id  %product-id}]
                      :expressions  {"pivot-grouping" [:abs 0]}
                      :fields       [created-at
                                     pivot-grouping
                                     products-category]}))
              q2 (let [products-category [:field
                                          "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                          {::add/source-table  ::add/source
                                           ::add/source-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                           ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                           }]
                       created-at        [:field "CREATED_AT" {:temporal-unit      :default
                                                               ::add/source-table  ::add/source
                                                               ::add/source-alias  "CREATED_AT"
                                                               ::add/desired-alias "CREATED_AT"}]
                       pivot-grouping    [:field "pivot-grouping" {::add/source-table  ::add/source
                                                                   ::add/source-alias  "pivot-grouping"
                                                                   ::add/desired-alias "pivot-grouping"}]]
                   {:source-query q1
                    :breakout     [products-category created-at pivot-grouping]
                    :aggregation  [[:aggregation-options [:count] {:name               "count"
                                                                   ::add/desired-alias "count"}]]
                    :order-by     [[:asc products-category]
                                   [:asc created-at]
                                   [:asc pivot-grouping]]})]
          (is (=? (:source-query q2)
                  (-> (lib.tu.macros/mbql-query orders
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
                                        :condition    [:= $product-id &PRODUCTS__via__PRODUCT_ID.products.id]}]})
                      qp.preprocess/preprocess
                      nest-expressions
                      add/add-alias-info
                      :source-query))))))))

(deftest ^:parallel uniquify-aliases-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? (lib.tu.macros/$ids products
                {:source-query {:source-table $$products
                                :expressions  {"CATEGORY" [:concat
                                                           [:field %category {::add/source-table $$products
                                                                              ::add/source-alias "CATEGORY"}]
                                                           "2"]}
                                :fields       [[:expression "CATEGORY" {::add/desired-alias "CATEGORY"}]]}
                 :breakout     [[:field "CATEGORY" {:base-type          :type/Text
                                                    ::add/source-table  ::add/source
                                                    ::add/source-alias  "CATEGORY"
                                                    ::add/desired-alias "CATEGORY"}]]
                 :aggregation  [[:aggregation-options [:count] {:name               "count"
                                                                ::add/desired-alias "count"}]]
                 :order-by     [[:asc [:field "CATEGORY" {:base-type          :type/Text
                                                          ::add/source-table  ::add/source
                                                          ::add/source-alias  "CATEGORY"
                                                          ::add/desired-alias "CATEGORY"}]]]
                 :limit        1})
              (-> (lib.tu.macros/mbql-query products
                    {:expressions {"CATEGORY" [:concat $category "2"]}
                     :breakout    [:expression "CATEGORY"]
                     :aggregation [[:count]]
                     :order-by    [[:asc [:expression "CATEGORY"]]]
                     :limit       1})
                  qp.preprocess/preprocess
                  :query
                  nest-query/nest-expressions
                  add/add-alias-info))))))

(deftest ^:parallel uniquify-aliases-test-2
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (testing "multi-stage query with an expression name that matches a table column (#39059)"
        (is (=? (lib.tu.macros/$ids orders
                  {:source-query {:source-query {:expressions  {"DISCOUNT" [:coalesce [:field %discount {}] 0]}
                                                 :fields       [[:field %id {::add/desired-alias "ID"}]
                                                                [:field %subtotal {::add/desired-alias "SUBTOTAL"}]
                                                                ;; Exported as DISCOUNT_2 from this inner query.
                                                                [:expression "DISCOUNT" {::add/desired-alias "DISCOUNT"}]]
                                                 :source-table $$orders}
                                  :fields       [[:field "ID"         {}]
                                                 [:field "SUBTOTAL"   {}]
                                                 ;; Then exported as DISCOUNT from the middle layer.
                                                 [:field "DISCOUNT" {:base-type :type/Float
                                                                     ::add/source-alias  "DISCOUNT"
                                                                     ::add/desired-alias "DISCOUNT"}]]}
                   :source-query/model? true
                   :fields              [[:field %id        {}]
                                         [:field %subtotal  {}]
                                         [:field "DISCOUNT" {:base-type :type/Float
                                                             ::add/source-alias "DISCOUNT"
                                                             ::add/desired-alias "DISCOUNT"}]]})
                (-> (lib.tu.macros/$ids orders
                      {:type     :query
                       :database (meta/id)
                       :query    {:source-query {:expressions  {"DISCOUNT" [:coalesce $discount 0]}
                                                 :fields       [$id
                                                                $subtotal
                                                                [:expression "DISCOUNT"]]
                                                 :source-table $$orders}
                                  :source-query/model? true
                                  ;; uh, DISCOUNT is wrong here, since the column name is supposed to be DISCOUNT_2...
                                  :fields              [[:field "ID"       {:base-type :type/Integer}]
                                                        [:field "SUBTOTAL" {:base-type :type/Float}]
                                                        [:field "DISCOUNT" {:base-type :type/Float}]]}})
                    qp.preprocess/preprocess
                    :query
                    nest-query/nest-expressions
                    add/add-alias-info
                    remove-source-metadata)))))))
