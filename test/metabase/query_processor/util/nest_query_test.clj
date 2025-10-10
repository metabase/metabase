(ns metabase.query-processor.util.nest-query-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.test :as mt]
   [metabase.util :as u]))

;;; TODO (Cam 7/18/25) -- update all the tests that use `with-temp` to use mock metadata providers instead.

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
        lib/->legacy-MBQL
        :query
        nest-query/nest-expressions
        remove-source-metadata)))

(deftest ^:parallel nest-expressions-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? (lib.tu.macros/$ids venues
                {:source-query {:source-table $$venues
                                :expressions  {"double_price" [:* [:field %price {::add/source-table  $$venues
                                                                                  ::add/source-alias  "PRICE"
                                                                                  ::add/desired-alias "PRICE"}]
                                                               2]}
                                :fields       [[:field %price       {::add/source-table  $$venues
                                                                     ::add/source-alias  "PRICE"
                                                                     ::add/desired-alias "PRICE"}]
                                               [:expression "double_price" {::add/desired-alias "double_price"}]]}
                 :breakout     [[:field %price {::add/source-table  ::add/source
                                                ::add/source-alias  "PRICE"
                                                ::add/desired-alias "PRICE"}]
                                [:field "double_price" {:base-type          :type/Integer
                                                        ::add/source-table  ::add/source
                                                        ::add/source-alias  "double_price"
                                                        ::add/desired-alias "double_price"}]]
                 :aggregation  [[:aggregation-options [:count] {::add/desired-alias "count"}]]
                 :order-by     [[:asc [:field %price {::add/source-table  ::add/source
                                                      ::add/source-alias  "PRICE"
                                                      ::add/desired-alias "PRICE"}]]
                                [:asc [:field "double_price" {::add/source-table  ::add/source
                                                              ::add/source-alias  "double_price"
                                                              ::add/desired-alias "double_price"}]]]})
              (-> (lib.tu.macros/mbql-query venues
                    {:expressions {"double_price" [:* $price 2]}
                     :breakout    [$price
                                   [:expression "double_price"]]
                     :aggregation [[:count]]})
                  qp.preprocess/preprocess
                  add/add-alias-info
                  nest-expressions))))))

(deftest ^:parallel nest-order-by-expressions-test
  (testing "Expressions in an order-by clause result in nesting"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (partial= (lib.tu.macros/$ids venues
                        {:source-query {:source-table $$venues
                                        :expressions  {"double_price" [:* [:field %price {::add/source-table  $$venues
                                                                                          ::add/source-alias  "PRICE"
                                                                                          ::add/desired-alias "PRICE"}]
                                                                       2]}
                                        :fields       [[:field %price       {::add/source-table  $$venues
                                                                             ::add/source-alias  "PRICE"
                                                                             ::add/desired-alias "PRICE"}]
                                                       [:expression "double_price" {::add/desired-alias "double_price"}]]}
                         :order-by     [[:asc *double_price/Integer]]})
                      (-> (lib.tu.macros/mbql-query venues
                            {:expressions {"double_price" [:* $price 2]}
                             :fields      [$price
                                           [:expression "double_price"]]
                             :order-by    [[:asc [:expression "double_price"]]]})
                          qp.preprocess/preprocess
                          add/add-alias-info
                          nest-expressions)))))))

(deftest ^:parallel nest-order-by-literal-expressions-test
  (testing "Literal expressions in an order-by clause result in nesting"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (partial= (lib.tu.macros/$ids venues
                        {:source-query {:source-table $$venues
                                        :expressions  {"favorite" [:value "good venue" {:base_type :type/Text}]}
                                        :fields       [[:field %name       {::add/source-table  $$venues
                                                                            ::add/source-alias  "NAME"
                                                                            ::add/desired-alias "NAME"}]
                                                       [:expression "favorite" {::add/desired-alias "favorite"}]]}
                         :filter       [:= [:field %name {::add/source-table ::add/source
                                                          ::add/source-alias "NAME"
                                                          ::add/desired-alias "NAME"
                                                          :qp/ignore-coercion true}]
                                        [:field "favorite" {:base-type :type/Text
                                                            ::add/source-table ::add/source
                                                            ::add/source-alias "favorite"
                                                            ::add/desired-alias "favorite"}]]
                         :order-by     [[:asc *favorite/Text]]})
                      (-> (lib.tu.macros/mbql-query venues
                            {:expressions {"favorite" [:value "good venue" {:base_type :type/Text}]}
                             :fields      [$name
                                           [:expression "favorite"]]
                             :filter      [:= $name [:expression "favorite"]]
                             :order-by    [[:asc [:expression "favorite"]]]})
                          qp.preprocess/preprocess
                          add/add-alias-info
                          nest-expressions)))))))

(deftest ^:parallel multiple-expressions-test
  (testing "Make sure the nested version of the query doesn't mix up expressions if we have ones that reference others"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (partial= (lib.tu.macros/$ids venues
                        {:source-query {:source-table $$venues
                                        :expressions  {"big_price"
                                                       [:+
                                                        [:field %price {::add/source-table  $$venues
                                                                        ::add/source-alias  "PRICE"
                                                                        ::add/desired-alias "PRICE"}]
                                                        2]

                                                       "my_cool_new_field"
                                                       [:/
                                                        [:field %price {::add/source-table  $$venues
                                                                        ::add/source-alias  "PRICE"
                                                                        ::add/desired-alias "PRICE"}]
                                                        [:expression "big_price" {::add/desired-alias "big_price"}]]}
                                        :fields [[:field %id {::add/source-table  $$venues
                                                              ::add/source-alias  "ID"
                                                              ::add/desired-alias "ID"}]
                                                 [:field %price {::add/source-table  $$venues
                                                                 ::add/source-alias  "PRICE"
                                                                 ::add/desired-alias "PRICE"}]
                                                 [:expression "big_price" {::add/desired-alias "big_price"}]
                                                 [:expression "my_cool_new_field" {::add/desired-alias "my_cool_new_field"}]]}
                         :breakout [[:field "my_cool_new_field" {:base-type          :type/Float
                                                                 ::add/source-table  ::add/source
                                                                 ::add/source-alias  "my_cool_new_field"
                                                                 ::add/desired-alias "my_cool_new_field"}]]
                         :order-by [[:asc [:field %id {::add/source-table ::add/source
                                                       ::add/source-alias "ID"}]]]
                         :limit    3})
                      (-> (lib.tu.macros/mbql-query venues
                            {:expressions {"big_price"         [:+ $price 2]
                                           "my_cool_new_field" [:/ $price [:expression "big_price"]]}
                             :breakout    [[:expression "my_cool_new_field"]]
                             :order-by    [[:asc $id]]
                             :limit       3})
                          add/add-alias-info
                          nest-expressions)))))))

(deftest ^:parallel nest-expressions-ignore-source-queries-test
  (testing (str "When 'raising' :expression clauses, only raise ones in the current level. Handle duplicate expression "
                "names correctly.")
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (let [query (lib.tu.macros/mbql-query venues
                      {:source-query {:source-table $$venues
                                      :expressions  {"x" [:* $price 2]}
                                      :breakout     [$id [:expression "x"]]}
                       :expressions  {"x" [:* $price 4]}
                       :breakout     [$id [:expression "x"]]
                       :limit        1})]
          (mt/with-native-query-testing-context query
            (is (partial= (lib.tu.macros/$ids venues
                            {:source-query {:source-query {:source-query {:source-table $$venues
                                                                          :expressions {"x" [:*
                                                                                             [:field %price #::add{:source-table  $$venues
                                                                                                                   :source-alias  "PRICE"
                                                                                                                   :desired-alias "PRICE"}]
                                                                                             2]}
                                                                          :fields [[:field %id #::add{:source-table  $$venues
                                                                                                      :source-alias  "ID"
                                                                                                      :desired-alias "ID"}]
                                                                                   [:field %price #::add{:source-table  $$venues
                                                                                                         :source-alias  "PRICE"
                                                                                                         :desired-alias "PRICE"}]
                                                                                   [:expression "x" #::add{:desired-alias "x"}]]}
                                                           :breakout [[:field %id #::add{:source-table  ::add/source
                                                                                         :source-alias  "ID"
                                                                                         :desired-alias "ID"}]
                                                                      [:field "x" {:base-type          :type/Integer
                                                                                   ::add/source-table  ::add/source
                                                                                   ::add/source-alias  "x"
                                                                                   ::add/desired-alias "x"}]]}
                                            :expressions {"x" [:*
                                                               [:field %price #::add{:source-table ::add/source
                                                                                     :source-alias "PRICE"}]
                                                               4]}
                                            :fields [[:field "ID" #::add{:source-table ::add/source
                                                                         :source-alias  "ID"
                                                                         :desired-alias "ID"}]
                                                     [:field "x" {:base-type          :type/Integer
                                                                  ::add/source-table  ::add/source
                                                                  ::add/source-alias  "x"
                                                                  ::add/desired-alias "x"}]
                                                     [:expression "x" #::add{:desired-alias "x_2"}]]}
                             :breakout [[:field %id #::add{:source-table  ::add/source
                                                           :source-alias  "ID"
                                                           :desired-alias "ID"}]
                                        [:field "x_2" {:base-type          :type/Integer
                                                       ::add/source-table  ::add/source
                                                       ::add/source-alias  "x_2"
                                                       ::add/desired-alias "x_2"}]]
                             :limit 1})
                          (-> query add/add-alias-info nest-expressions)))))))))

(deftest ^:parallel nest-expressions-ignore-source-queries-from-joins-test
  (testing "Ignores source-query from joins (#20809)"
    (let [query {:source-table 2
                 :expressions  {"CC" [:+ 1 1]}
                 :fields       [[:field 33 {:join-alias "Question 4918"}]
                                [:field "count" {:join-alias "Question 4918"}]]
                 :joins        [{:alias           "Question 4918"
                                 :strategy        :left-join
                                 :fields          [[:field 33 {:join-alias "Question 4918"}]
                                                   [:field
                                                    "count"
                                                    {:join-alias "Question 4918"}]]
                                 :condition       [:=
                                                   [:field 5 nil]
                                                   [:field 33 {:join-alias "Question 4918"}]]
                                 :source-card-id  4918
                                 :source-query    {:source-table 4
                                                   ;; nested query has filter values with join-alias that should not
                                                   ;; be selected
                                                   :filter       [:=
                                                                  [:field 26 {:join-alias "PRODUCTS__via__PRODUCT_ID"}]
                                                                  [:value "Doohickey" {}]]
                                                   :aggregation  [[:aggregation-options
                                                                   [:count]
                                                                   {:name "count"}]]
                                                   :breakout     [[:field 33 nil]]
                                                   :limit        2
                                                   :order-by     [[:asc
                                                                   [:field 33 nil]]]
                                                   ;; nested query has an implicit join with conditions that should
                                                   ;; not be selected
                                                   :joins        [{:alias        "PRODUCTS__via__PRODUCT_ID"
                                                                   :strategy     :left-join
                                                                   :condition    [:=
                                                                                  [:field 33 nil]
                                                                                  [:field
                                                                                   30
                                                                                   {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                                   :source-table 1
                                                                   :fk-field-id  33}]}
                                 :source-metadata [{:field_ref [:field 33 nil]}
                                                   {:field_ref [:aggregation 0]}]}]}]
      (is (= [[:field 33 {:join-alias "Question 4918"}]
              [:field "count" {:join-alias "Question 4918"}]]
             (#'nest-query/joined-fields query))))))

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
          query   (lib.tu.macros/mbql-query orders
                    {:joins       [{:source-table "card__1"
                                    :alias        "Question 1"
                                    :condition    [:=
                                                   $product-id
                                                   [:field
                                                    %reviews.product-id
                                                    {:join-alias "Question 1"}]]
                                    :fields       :all}]
                     :expressions {"CC" [:+ 1 1]}
                     :limit       2})
          nested  (assoc query :query (qp.store/with-metadata-provider mp (nest-expressions query)))
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
      (is (vector?
           (mt/rows
            (qp/process-query
             (lib/query
              mp
              (mt/mbql-query
                orders
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

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel nest-expressions-with-joins-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (testing "If there are any `:joins`, those need to be nested into the `:source-query` as well."
        (is (partial= (lib.tu.macros/$ids venues
                        {:source-query {:source-table $$venues
                                        :joins        [{:strategy     :left-join
                                                        :condition    [:=
                                                                       [:field %category-id {::add/source-table $$venues
                                                                                             ::add/source-alias "CATEGORY_ID"}]
                                                                       [:field %category-id {:join-alias        "CategoriesStats"
                                                                                             ::add/source-table "CategoriesStats"
                                                                                             ::add/source-alias "CATEGORY_ID"}]]
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
                                                        :fields       [[:field %category-id {:join-alias "CategoriesStats"}]
                                                                       [:field "MaxPrice" {:join-alias "CategoriesStats"}]
                                                                       [:field "AvgPrice" {:join-alias "CategoriesStats"}]
                                                                       [:field "MinPrice" {:join-alias "CategoriesStats"}]]}]
                                        :expressions  {"RelativePrice" [:/
                                                                        [:field %price {::add/source-table  $$venues
                                                                                        ::add/source-alias  "PRICE"
                                                                                        ::add/desired-alias "PRICE"}]
                                                                        [:field "AvgPrice" {:base-type          :type/Integer
                                                                                            :join-alias         "CategoriesStats"
                                                                                            ::add/source-table  "CategoriesStats"
                                                                                            ::add/source-alias  "AvgPrice"
                                                                                            ::add/desired-alias "CategoriesStats__AvgPrice"}]]}
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
                         :breakout     [[:field %id {::add/source-table  ::add/source
                                                     ::add/source-alias  "ID"
                                                     ::add/desired-alias "ID"}]
                                        [:field %name {::add/source-table  ::add/source
                                                       ::add/source-alias  "NAME"
                                                       ::add/desired-alias "NAME"}]
                                        [:field %category-id {::add/source-table  ::add/source
                                                              ::add/source-alias  "CATEGORY_ID"
                                                              ::add/desired-alias "CATEGORY_ID"}]
                                        [:field %latitude {::add/source-table  ::add/source
                                                           ::add/source-alias  "LATITUDE"
                                                           ::add/desired-alias "LATITUDE"}]
                                        [:field %longitude {::add/source-table  ::add/source
                                                            ::add/source-alias  "LONGITUDE"
                                                            ::add/desired-alias "LONGITUDE"}]
                                        [:field %price {::add/source-table  ::add/source
                                                        ::add/source-alias  "PRICE"
                                                        ::add/desired-alias "PRICE"}]
                                        [:field "RelativePrice" {:base-type          :type/Float
                                                                 ::add/source-table  ::add/source
                                                                 ::add/source-alias  "RelativePrice"
                                                                 ::add/desired-alias "RelativePrice"}]
                                        [:field %category-id {:join-alias         "CategoriesStats"
                                                              ::add/source-alias  "CategoriesStats__CATEGORY_ID"
                                                              ::add/desired-alias "CategoriesStats__CATEGORY_ID"
                                                              ::add/source-table  ::add/source}]
                                        [:field "MaxPrice" {:base-type          :type/Integer
                                                            :join-alias         "CategoriesStats"
                                                            ::add/source-alias  "CategoriesStats__MaxPrice"
                                                            ::add/desired-alias "CategoriesStats__MaxPrice"
                                                            ::add/source-table  ::add/source}]
                                        [:field "AvgPrice" {:base-type          :type/Integer
                                                            :join-alias         "CategoriesStats"
                                                            ::add/source-alias  "CategoriesStats__AvgPrice"
                                                            ::add/desired-alias "CategoriesStats__AvgPrice"
                                                            ::add/source-table  ::add/source}]
                                        [:field "MinPrice" {:base-type          :type/Integer
                                                            :join-alias         "CategoriesStats"
                                                            ::add/source-alias  "CategoriesStats__MinPrice"
                                                            ::add/desired-alias "CategoriesStats__MinPrice"
                                                            ::add/source-table  ::add/source}]]
                         :limit        3})
                      (-> (lib.tu.macros/mbql-query venues
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
                             :limit       3})
                          qp.preprocess/preprocess
                          add/add-alias-info
                          nest-expressions)))))))

(deftest ^:parallel nest-expressions-eliminate-duplicate-coercion-test
  (testing "If coercion happens in the source query, don't do it a second time in the parent query (#12430)"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                        meta/metadata-provider
                                        {:fields [{:id                (meta/id :venues :price)
                                                   :coercion-strategy :Coercion/UNIXSeconds->DateTime
                                                   :effective-type    :type/DateTime}]})
        (is (=? (lib.tu.macros/$ids venues
                  {:source-query {:source-table $$venues
                                  :expressions  {"test" [:* 1 1]}
                                  :fields       [[:field %price {::add/source-table  $$venues
                                                                 ::add/source-alias  "PRICE"
                                                                 ::add/desired-alias "PRICE"}]
                                                 [:expression "test" {::add/desired-alias "test"}]]}
                   :breakout     [[:field %price {:temporal-unit            :day
                                                  :qp/ignore-coercion       true
                                                  ::add/source-table        ::add/source
                                                  ::add/source-alias        "PRICE"
                                                  ::add/desired-alias       "PRICE"}]
                                  [:field "test" {:base-type          :type/Integer
                                                  ::add/source-table  ::add/source
                                                  ::add/source-alias  "test"
                                                  ::add/desired-alias "test"}]]
                   :limit        1})
                (-> (lib.tu.macros/mbql-query venues
                      {:expressions {"test" [:* 1 1]}
                       :breakout    [$price
                                     [:expression "test"]]
                       :limit       1})
                    add/add-alias-info
                    nest-expressions)))))))

(deftest ^:parallel multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (driver/with-driver :h2
      (mt/dataset test-data
        (qp.store/with-metadata-provider meta/metadata-provider
          (is (=? (:query (merge (let [products-category (lib.tu.macros/$ids orders
                                                           [:field %products.category {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                                       ::add/source-table  ::add/source
                                                                                       ::add/source-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                                                                       ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"}])
                                       created-at        (lib.tu.macros/$ids orders
                                                           [:field %created-at {:temporal-unit            :year
                                                                                :qp/ignore-coercion       true
                                                                                ::add/source-table        ::add/source
                                                                                ::add/source-alias        "CREATED_AT"
                                                                                ::add/desired-alias       "CREATED_AT"}])
                                       pivot-grouping    [:field "pivot-grouping" {:base-type          :type/Float
                                                                                   ::add/source-table  ::add/source
                                                                                   ::add/source-alias  "pivot-grouping"
                                                                                   ::add/desired-alias "pivot-grouping"}]]
                                   (lib.tu.macros/mbql-query orders
                                     {:breakout    [products-category created-at pivot-grouping]
                                      :aggregation [[:aggregation-options [:count] {:name               "count"
                                                                                    ::add/desired-alias "count"}]]
                                      :order-by    [[:asc products-category]
                                                    [:asc created-at]
                                                    [:asc pivot-grouping]]}))
                                 (lib.tu.macros/mbql-query orders
                                   {:source-query (let [product-id        [:field %product-id {::add/source-table  $$orders
                                                                                               ::add/source-alias  "PRODUCT_ID"
                                                                                               ::add/desired-alias "PRODUCT_ID"}]
                                                        created-at        [:field %created-at {::add/source-table  $$orders
                                                                                               ::add/source-alias  "CREATED_AT"
                                                                                               ::add/desired-alias "CREATED_AT"}]
                                                        pivot-grouping    [:expression "pivot-grouping" {::add/desired-alias "pivot-grouping"}]
                                                        ;; TODO: The order here is not deterministic! It's coming
                                                        ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
                                                        ;; or [[metabase.query-processor.util.nest-query]], which walks
                                                        ;; the query looking for refs in an arbitrary order, and returns
                                                        ;; `m/distinct-by` over that random order. Changing the map keys
                                                        ;; on the inner query can perturb this order; if you cause this
                                                        ;; test to fail based on shuffling the order of these joined
                                                        ;; fields, just edit the expectation to match the new order.
                                                        ;; Tech debt issue: #39396
                                                        products-id       [:field %products.id {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                                                ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                                                ::add/source-alias  "ID"
                                                                                                ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__ID"}]
                                                        products-category [:field %products.category {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                                                      ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                                                      ::add/source-alias  "CATEGORY"
                                                                                                      ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"}]]
                                                    {:source-table $$orders
                                                     :joins        [{:source-query {:source-table $$products}
                                                                     :alias        "PRODUCTS__via__PRODUCT_ID"
                                                                     :condition    [:=
                                                                                    [:field %product-id {::add/source-table  $$orders
                                                                                                         ::add/source-alias  "PRODUCT_ID"}]
                                                                                    [:field %products.id {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                                                          ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                                                          ::add/source-alias  "ID"}]]
                                                                     :strategy     :left-join
                                                                     :fk-field-id  %product-id}]
                                                     :expressions  {"pivot-grouping" [:abs 0]}
                                                     :fields       [product-id
                                                                    created-at
                                                                    pivot-grouping
                                                                    products-id
                                                                    products-category]})})))
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
                      add/add-alias-info
                      nest-expressions
                      ;; I'm tired of dealing with the nondeterministic order mentioned above, so just sort them by ID
                      ;; and call it a day for now.
                      (update-in [:source-query :fields] (fn [fields]
                                                           (concat
                                                            (take 3 fields)
                                                            (sort-by second (drop 3 fields)))))))))))))

(deftest ^:parallel uniquify-aliases-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? (lib.tu.macros/$ids products
                {:source-query {:source-table $$products
                                :expressions  {"CATEGORY" [:concat
                                                           [:field %category {::add/source-table  $$products
                                                                              ::add/source-alias  "CATEGORY"
                                                                              ::add/desired-alias "CATEGORY"}]
                                                           "2"]}
                                :fields       [[:field %category {::add/source-table  $$products
                                                                  ::add/source-alias  "CATEGORY"
                                                                  ::add/desired-alias "CATEGORY"}]
                                               [:expression "CATEGORY" {::add/desired-alias "CATEGORY_2"}]]}
                 :breakout     [[:field "CATEGORY_2" {:base-type          :type/Text
                                                      ::add/source-table  ::add/source
                                                      ::add/source-alias  "CATEGORY_2"
                                                      ::add/desired-alias "CATEGORY_2"}]]
                 :aggregation  [[:aggregation-options [:count] {::add/desired-alias "count"}]]
                 :order-by     [[:asc [:field "CATEGORY_2" {:base-type          :type/Text
                                                            ::add/source-table  ::add/source
                                                            ::add/source-alias  "CATEGORY_2"
                                                            ::add/desired-alias "CATEGORY_2"}]]]
                 :limit        1})
              (-> (lib.tu.macros/mbql-query products
                    {:expressions {"CATEGORY" [:concat $category "2"]}
                     :breakout    [:expression "CATEGORY"]
                     :aggregation [[:count]]
                     :order-by    [[:asc [:expression "CATEGORY"]]]
                     :limit       1})
                  qp.preprocess/preprocess
                  add/add-alias-info
                  lib/->legacy-MBQL
                  :query
                  nest-query/nest-expressions))))))

(deftest ^:parallel uniquify-aliases-test-2
  (driver/with-driver :h2
    (mt/dataset test-data
      (qp.store/with-metadata-provider meta/metadata-provider
        (testing "multi-stage query with an expression name that matches a table column (#39059)"
          (is (=? (lib.tu.macros/mbql-query orders
                    {:source-query {:breakout     [[:field %id          {}]
                                                   [:field %subtotal    {}]
                                                   ;; Then exported as DISCOUNT from the middle layer.
                                                   [:field "DISCOUNT_2" {:base-type          :type/Float
                                                                         ::add/source-alias  "DISCOUNT_2"
                                                                         ::add/desired-alias "DISCOUNT_2"}]]
                                    :source-query {:expressions  {"DISCOUNT" [:coalesce [:field %discount {}] 0]}
                                                   :fields       [[:field %id {::add/desired-alias "ID"}]
                                                                  [:field %subtotal {::add/desired-alias "SUBTOTAL"}]
                                                                  [:field %discount {::add/desired-alias "DISCOUNT"}]
                                                                  ;; Exported as DISCOUNT_2 from this inner query.
                                                                  [:expression "DISCOUNT"
                                                                   {::add/desired-alias "DISCOUNT_2"}]]
                                                   :source-table $$orders}}
                     :source-query/model? true
                     :breakout            [[:field "ID"       {}]
                                           [:field "SUBTOTAL" {}]
                                           [:field "DISCOUNT" {:base-type          :type/Float
                                                               ::add/source-alias  "DISCOUNT"
                                                               ::add/desired-alias "DISCOUNT"}]]})
                  (-> (lib.tu.macros/mbql-query orders
                        {:source-query {:expressions  {"DISCOUNT" [:coalesce $discount 0]}
                                        :breakout     [$id
                                                       $subtotal
                                                       [:expression "DISCOUNT"]]
                                        :source-table $$orders}
                         :source-query/model? true
                         :breakout            [[:field "ID"       {:base-type :type/Integer}]
                                               [:field "SUBTOTAL" {:base-type :type/Float}]
                                               [:field "DISCOUNT" {:base-type :type/Float}]]})
                      qp.preprocess/preprocess
                      add/add-alias-info
                      lib/->legacy-MBQL
                      :query
                      nest-query/nest-expressions
                      (->> (assoc {:database (meta/id)
                                   :type     :query}
                                  :query))))))))))

(defn- readable-query
  "Attempt to make the results of [[add/add-alias-info]] and [[nest-query/nest-expressions]] a little less noisy so
  they're actually readable/debuggable."
  [query]
  (letfn [(inner-query? [form]
            (and (map? form)
                 ((some-fn :source-query :source-table) form)))
          (inner-query [form]
            (select-keys form [:source-query
                               :expressions
                               :breakout
                               :aggregation
                               :fields]))
          (ref-options-map? [form]
            (and (map? form)
                 (::add/desired-alias form)))
          (table-symbol [table-id]
            (let [table-name (:name (lib.metadata/table
                                     (qp.store/metadata-provider)
                                     table-id))]
              (symbol (str "$$" (u/lower-case-en table-name)))))
          (ref-options-map [form]
            (-> (select-keys form [::add/source-table ::add/source-alias ::add/desired-alias :temporal-unit :bucketing :join-alias])
                (set/rename-keys {::add/source-table :table, ::add/source-alias :source, ::add/desired-alias :desired})
                (update :table (fn [table]
                                 (if (integer? table)
                                   (table-symbol table)
                                   (if (= table ::add/source)
                                     :source
                                     table))))))
          (field-ref? [form]
            (and (vector? form)
                 (= (first form) :field)))
          (field-symbol [field-id]
            (let [field-name (:name (lib.metadata/field (qp.store/metadata-provider) field-id))]
              (symbol (str \% (u/->kebab-case-en field-name)))))
          (field-ref [form]
            (let [[_tag id-or-name opts] form]
              [:field
               (cond-> id-or-name (pos-int? id-or-name) field-symbol)
               opts]))]
    (walk/postwalk
     (fn [form]
       (cond-> form
         (inner-query? form)     inner-query
         (field-ref? form)       field-ref
         (ref-options-map? form) ref-options-map))
     query)))

(deftest ^:parallel do-not-remove-fields-when-referred-to-with-nominal-refs-test
  (testing "Don't remove fields if they are used in the next stage with a nominal field literal ref"
    (qp.store/with-metadata-provider meta/metadata-provider
      (driver/with-driver :h2
        (let [query (lib.tu.macros/$ids products
                      {:source-query {:source-table $$products
                                      :fields       [[:field %id nil]
                                                     [:field %ean nil]
                                                     [:field %title nil]
                                                     [:field %category nil]
                                                     [:field %vendor nil]
                                                     [:field %price nil]
                                                     [:field %rating nil]
                                                     [:field %created-at {:temporal-unit :default}]]}
                       :expressions {"pivot-grouping" [:abs 0]}
                       :breakout    [[:field "CATEGORY" {:base-type :type/Text}]
                                     [:field "CREATED_AT" {:base-type :type/DateTime, :temporal-unit :month}]
                                     [:expression "pivot-grouping"]]
                       :aggregation [[:aggregation-options [:count] {:name "count"}]]})
              query' (add/add-alias-info query)]
          (testing (str "with alias info:\n" (u/pprint-to-str (readable-query query')))
            (is (=? '{:source-query {:source-query {:fields [[:field %id {}]
                                                             [:field %ean {}]
                                                             [:field %title {}]
                                                             [:field %category {}]
                                                             [:field %vendor {}]
                                                             [:field %price {}]
                                                             [:field %rating {}]
                                                             [:field %created-at {}]]}
                                     :expressions {"pivot-grouping" [:abs 0]}
                                     :fields [[:field "CATEGORY" {}]
                                              [:field "CREATED_AT" {}]
                                              [:expression "pivot-grouping" {}]]}
                      :breakout    [[:field "CATEGORY" {}]
                                    [:field "CREATED_AT" {}]
                                    [:field "pivot-grouping" {}]]
                      :aggregation [[:aggregation-options [:count] {}]]}
                    (-> query'
                        nest-query/nest-expressions
                        readable-query)))))))))

(deftest ^:parallel nest-expressions-ignores-temporal-units-from-joined-fields
  (testing "clear temporal units from joined fields #48058"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (=? {:source-query
                 {:fields
                  [[:field
                    (meta/id :orders :user-id)
                    {::add/source-table (meta/id :orders)
                     ::add/source-alias "USER_ID"
                     ::add/desired-alias "USER_ID"}]
                   [:field
                    (meta/id :orders :total)
                    {::add/source-table (meta/id :orders)
                     ::add/source-alias "TOTAL"
                     ::add/desired-alias "TOTAL"}]
                   [:expression
                    "double_total"
                    {::add/desired-alias "double_total"}]
                   ;; TODO: The order here is not deterministic! It's coming
                   ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
                   ;; or [[metabase.query-processor.util.nest-query]], which walks the query looking for refs in an
                   ;; arbitrary order, and returns `m/distinct-by` over that random order. Changing the map keys on the
                   ;; inner query can perturb this order; if you cause this test to fail based on shuffling the order of
                   ;; these joined fields, just edit the expectation to match the new order. Tech debt issue: #39396
                   [:field
                    (meta/id :people :id)
                    {:join-alias "p"
                     ::add/source-table "p"
                     ::add/source-alias "ID"
                     ::add/desired-alias "p__ID"}]
                   [:field
                    (meta/id :people :created-at)
                    {:temporal-unit (symbol "nil #_\"key is not present.\"")
                     ::add/source-alias "CREATED_AT"
                     :join-alias "p"
                     ::add/desired-alias "p__CREATED_AT"
                     ::add/source-table "p"}]]}}
                (-> (lib.tu.macros/mbql-query orders
                      {:expressions {"double_total" [:* $total 2]}
                       ;; this is a broken field ref! It should use the join alias `p`. Luckily
                       ;; the [[metabase.query-processor.middleware.fix-bad-field-id-refs]] middleware should fix it
                       ;; for us.
                       :breakout    [!hour-of-day.people.created-at
                                     [:expression "double_total"]]
                       :aggregation [[:count]]
                       :joins [{:source-table $$people
                                :alias        "p"
                                :condition    [:= $user-id &p.people.id]}]})
                    qp.preprocess/preprocess
                    add/add-alias-info
                    nest-expressions
                    ;; I'm tired of dealing with the nondeterministic order mentioned above, so just sort them by ID and
                    ;; call it a day for now.
                    (update-in [:source-query :fields] (fn [fields]
                                                         (concat
                                                          (take 3 fields)
                                                          (sort-by second (drop 3 fields))))))))))))

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
               {:database (meta/id)
                :stages   [{:lib/type    :mbql.stage/mbql
                            :source-card 2
                            :expressions [[:abs {:lib/expression-name "pivot-grouping"} 0]]
                            :aggregation [[:sum {} [:field {:base-type :type/Number} "SUBTOTAL"]]]
                            :breakout    [[:field {:base-type :type/Number, :join-alias "model A - Product"}
                                           "Rating Bucket"]
                                          [:expression {:base-type :type/Integer, :effective-type :type/Integer}
                                           "pivot-grouping"]]}]
                :lib/type :mbql/query})]
    (qp.store/with-metadata-provider mp
      (driver/with-driver :h2
        (let [stages (-> query
                         qp.preprocess/preprocess
                         add/add-alias-info
                         lib/->legacy-MBQL
                         :query
                         nest-query/nest-expressions
                         (->> (lib/query-from-legacy-inner-query mp (meta/id)))
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
            (is (= ["ID"
                    "SUBTOTAL"
                    "CREATED_AT"
                    "model A - Product__Rating Bucket"
                    "pivot-grouping"]
                   (nth stages 1))))
          (testing "third stage (original query)"
            (is (= ["model A - Product__Rating Bucket"
                    "pivot-grouping"
                    "sum"]
                   (nth stages 2)))))))))
