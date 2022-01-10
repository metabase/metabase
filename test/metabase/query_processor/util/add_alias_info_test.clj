(ns metabase.query-processor.util.add-alias-info-test
  (:require [clojure.test :refer :all]
            [clojure.walk :as walk]
            [metabase.query-processor :as qp]
            [metabase.query-processor.util.add-alias-info :as add]
            [metabase.test :as mt]))

(deftest normalize-clause-test
  (is (= [:expression "wow"]
         (#'add/normalize-clause [:expression "wow"])
         (#'add/normalize-clause [:expression "wow" nil])
         (#'add/normalize-clause [:expression "wow" {}])
         (#'add/normalize-clause [:expression "wow" {::amazing true}])))
  (is (= [:field 1 nil]
         (#'add/normalize-clause [:field 1 nil])
         (#'add/normalize-clause [:field 1 {}])
         (#'add/normalize-clause [:field 1 {::amazing true}]))))

(defn- remove-source-metadata [x]
  (walk/postwalk
   (fn [x]
     (if ((every-pred map? :source-metadata) x)
       (dissoc x :source-metadata)
       x))
   x))

(defn- add-alias-info [query]
  (mt/with-everything-store
    (-> query qp/query->preprocessed add/add-alias-info remove-source-metadata (dissoc :middleware))))

(deftest join-in-source-query-test
  (is (query= (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :joins        [{:strategy     :left-join
                                                :source-table $$categories
                                                :alias        "Cat"
                                                :condition    [:=
                                                               [:field %category_id {::add/source-table  $$venues
                                                                                     ::add/source-alias  "CATEGORY_ID"}]
                                                               [:field %categories.id {:join-alias         "Cat"
                                                                                       ::add/source-table  "Cat"
                                                                                       ::add/source-alias  "ID"}]]}]
                                :fields       [[:field %id {::add/source-table  $$venues
                                                            ::add/source-alias  "ID"
                                                            ::add/desired-alias "ID"
                                                            ::add/position      0}]
                                               [:field %categories.name {:join-alias         "Cat"
                                                                         ::add/source-table  "Cat"
                                                                         ::add/source-alias  "NAME"
                                                                         ::add/desired-alias "Cat__NAME"
                                                                         ::add/position      1}]]}
                 :breakout     [[:field %categories.name {:join-alias         "Cat"
                                                          ::add/source-table  ::add/source
                                                          ::add/source-alias  "Cat__NAME"
                                                          ::add/desired-alias "Cat__NAME"
                                                          ::add/position      0}]]
                 :order-by     [[:asc [:field %categories.name {:join-alias         "Cat"
                                                                ::add/source-table  ::add/source
                                                                ::add/source-alias  "Cat__NAME"
                                                                ::add/desired-alias "Cat__NAME"
                                                                ::add/position      0}]]]
                 :limit        1})
              (add-alias-info
               (mt/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :joins        [{:strategy     :left-join
                                                 :source-table $$categories
                                                 :alias        "Cat"
                                                 :condition    [:= $category_id &Cat.categories.id]}]
                                 :fields       [$id
                                                &Cat.categories.name]}
                  :breakout     [&Cat.categories.name]
                  :limit        1})))))

(deftest multiple-joins-test
  (mt/dataset sample-dataset
    (is (query= (mt/mbql-query orders
                  {:source-query {:source-table $$orders
                                  :joins        [{:source-table $$products
                                                  :alias        "P1"
                                                  :condition    [:=
                                                                 [:field %product_id {::add/source-alias "PRODUCT_ID"
                                                                                      ::add/source-table $$orders}]
                                                                 [:field %products.id {:join-alias        "P1"
                                                                                       ::add/source-alias "ID"
                                                                                       ::add/source-table "P1"}]]
                                                  :strategy     :left-join}]
                                  :fields       [[:field %products.category {:join-alias         "P1"
                                                                             ::add/desired-alias "P1__CATEGORY"
                                                                             ::add/position      0
                                                                             ::add/source-alias  "CATEGORY"
                                                                             ::add/source-table  "P1"}]]}
                   :joins        [{:source-query {:source-table $$reviews
                                                  :joins        [{:source-table $$products
                                                                  :alias        "P2"
                                                                  :condition    [:=
                                                                                 [:field
                                                                                  %reviews.product_id
                                                                                  {::add/source-alias "PRODUCT_ID"
                                                                                   ::add/source-table $$reviews}]
                                                                                 [:field
                                                                                  %products.id
                                                                                  {:join-alias        "P2"
                                                                                   ::add/source-alias "ID"
                                                                                   ::add/source-table "P2"}]]
                                                                  :strategy     :left-join}]
                                                  :fields       [[:field
                                                                  %products.category
                                                                  {:join-alias         "P2"
                                                                   ::add/desired-alias "P2__CATEGORY"
                                                                   ::add/position      0
                                                                   ::add/source-alias  "CATEGORY"
                                                                   ::add/source-table  "P2"}]]}
                                   :alias        "Q2"
                                   :condition    [:=
                                                  [:field %products.category {:join-alias         "P1"
                                                                              ::add/desired-alias "P1__CATEGORY"
                                                                              ::add/position      0
                                                                              ::add/source-alias  "P1__CATEGORY"
                                                                              ::add/source-table  ::add/source}]
                                                  [:field %products.category {:join-alias        "Q2"
                                                                              ::add/source-alias "P2__CATEGORY"
                                                                              ::add/source-table "Q2"}]]
                                   :strategy     :left-join}]
                   :fields       [[:field %products.category {:join-alias         "P1"
                                                              ::add/desired-alias "P1__CATEGORY"
                                                              ::add/position      0
                                                              ::add/source-alias  "P1__CATEGORY"
                                                              ::add/source-table  ::add/source}]]
                   :limit        1})
                (add-alias-info
                 (mt/mbql-query orders
                   {:fields       [&P1.products.category]
                    :source-query {:source-table $$orders
                                   :fields       [&P1.products.category]
                                   :joins        [{:strategy     :left-join
                                                   :source-table $$products
                                                   :condition    [:= $product_id &P1.products.id]
                                                   :alias        "P1"}]}
                    :joins        [{:strategy     :left-join
                                    :condition    [:= &P1.products.category &Q2.products.category]
                                    :alias        "Q2"
                                    :source-query {:source-table $$reviews
                                                   :fields       [&P2.products.category]
                                                   :joins        [{:strategy     :left-join
                                                                   :source-table $$products
                                                                   :condition    [:= $reviews.product_id &P2.products.id]
                                                                   :alias        "P2"}]}}]
                    :limit        1}))))))

(deftest uniquify-aliases-test
  (mt/dataset sample-dataset
    (is (query= (mt/mbql-query products
                  {:source-table $$products
                   :expressions  {:CATEGORY [:concat
                                             [:field %category
                                              {::add/source-table  $$products
                                               ::add/source-alias  "CATEGORY"
                                               ::add/desired-alias "CATEGORY"
                                               ::add/position      0}]
                                             "2"]}
                   :fields       [[:field %category {::add/source-table  $$products
                                                     ::add/source-alias  "CATEGORY"
                                                     ::add/desired-alias "CATEGORY"
                                                     ::add/position      0}]
                                  [:expression "CATEGORY" {::add/desired-alias "CATEGORY_2"
                                                           ::add/position      1}]]
                   :limit        1})
                (add-alias-info
                 (mt/mbql-query products
                   {:expressions {:CATEGORY [:concat [:field %category nil] "2"]}
                    :fields      [[:field %category nil]
                                  [:expression "CATEGORY"]]
                    :limit       1}))))))

(deftest not-null-test
  (is (query= (mt/mbql-query checkins
                {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                 :filter      [:!=
                               [:field %date {:temporal-unit     :default
                                              ::add/source-table $$checkins
                                              ::add/source-alias "DATE"}]
                               [:value nil {:base_type         :type/Date
                                            :effective_type    :type/Date
                                            :coercion_strategy nil
                                            :semantic_type     nil
                                            :database_type     "DATE"
                                            :name              "DATE"
                                            :unit              :default}]]})
              (add-alias-info
               (mt/mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:not-null $date]})))))

(deftest multiple-expressions-test
  (is (query= (mt/$ids venues
                {$price                                     0
                 [:expression "big_price"]                  1
                 [:expression "price_divided_by_big_price"] 2})
              (#'add/selected-clauses
               (mt/$ids venues
                 {:expressions {:big_price                  [:+ $price 2]
                                :price_divided_by_big_price [:/ $price [:expression "big_price"]]}
                  :fields      [$price
                                [:expression "big_price"]
                                [:expression "price_divided_by_big_price"]]
                  :limit       1}))))
  (is (query= (mt/$ids venues
                (let [price                      [:field %price {::add/position      0
                                                                 ::add/source-table  $$venues
                                                                 ::add/source-alias  "PRICE"
                                                                 ::add/desired-alias "PRICE"}]
                      big-price                  [:expression
                                                  "big_price"
                                                  {::add/position      1
                                                   ::add/desired-alias "big_price"}]
                      price-divided-by-big-price [:expression
                                                  "price_divided_by_big_price"
                                                  {::add/position      2
                                                   ::add/desired-alias "price_divided_by_big_price"}]]
                  {:source-table $$venues
                   :expressions  {:big_price                  [:+ price 2]
                                  :price_divided_by_big_price [:/ price big-price]}
                   :fields       [price
                                  big-price
                                  price-divided-by-big-price]
                   :limit        1}))
              (:query
               (add-alias-info
                (mt/mbql-query venues
                  {:expressions {:big_price                  [:+ $price 2]
                                 :price_divided_by_big_price [:/ $price [:expression "big_price"]]}
                   :fields      [$price
                                 [:expression "big_price"]
                                 [:expression "price_divided_by_big_price"]]
                   :limit       1}))))))

(deftest join-source-query-join-test
  (mt/dataset sample-dataset
    (is (query= (mt/mbql-query orders
                  {:joins  [{:source-query {:source-table $$reviews
                                            :aggregation  [[:aggregation-options
                                                            [:avg [:field %reviews.rating {::add/source-table $$reviews
                                                                                           ::add/source-alias "RATING"}]]
                                                            {:name "avg"}]]
                                            :breakout     [[:field %products.category {:join-alias         "P2"
                                                                                       ::add/source-table  "P2"
                                                                                       ::add/source-alias  "CATEGORY"
                                                                                       ::add/desired-alias "P2__CATEGORY"
                                                                                       ::add/position      0}]]
                                            :order-by     [[:asc [:field %products.category {:join-alias         "P2"
                                                                                             ::add/source-table  "P2"
                                                                                             ::add/source-alias  "CATEGORY"
                                                                                             ::add/desired-alias "P2__CATEGORY"
                                                                                             ::add/position      0}]]]
                                            :joins        [{:strategy     :left-join
                                                            :source-table $$products
                                                            :condition    [:=
                                                                           [:field %reviews.product_id {::add/source-table $$reviews
                                                                                                        ::add/source-alias "PRODUCT_ID"}]
                                                                           [:field %products.id {:join-alias        "P2"
                                                                                                 ::add/source-table "P2"
                                                                                                 ::add/source-alias "ID"}]]
                                                            :alias        "P2"}]}
                             :alias        "Q2"
                             :strategy     :left-join
                             :condition    [:=
                                            [:field %products.category {::add/source-table ::add/source
                                                                        ::add/source-alias "CATEGORY"}]
                                            [:field %products.category {:join-alias         "Q2"
                                                                        ::add/source-table  "Q2"
                                                                        ::add/source-alias  "P2__CATEGORY"
                                                                        ::add/desired-alias "Q2__P2__CATEGORY"
                                                                        ::add/position      1}]]}]
                   :fields [[:field "count" {:base-type          :type/BigInteger
                                             ::add/source-table  ::add/source
                                             ::add/source-alias  "count"
                                             ::add/desired-alias "count"
                                             ::add/position      0}]
                            [:field %products.category {:join-alias         "Q2"
                                                        ::add/source-table  "Q2"
                                                        ::add/source-alias  "P2__CATEGORY"
                                                        ::add/desired-alias "Q2__P2__CATEGORY"
                                                        ::add/position      1}]
                            [:field "avg" {:base-type          :type/Integer
                                           :join-alias         "Q2"
                                           ::add/source-table  "Q2"
                                           ::add/source-alias  "avg"
                                           ::add/desired-alias "Q2__avg"
                                           ::add/position      2}]]
                   :limit  2})
                (add-alias-info
                 (mt/mbql-query orders
                   {:fields [[:field "count" {:base-type :type/BigInteger}]
                             &Q2.products.category
                             [:field "avg" {:base-type :type/Integer, :join-alias "Q2"}]]
                    :joins  [{:strategy     :left-join
                              :condition    [:= $products.category &Q2.products.category]
                              :alias        "Q2"
                              :source-query {:source-table $$reviews
                                             :aggregation  [[:aggregation-options [:avg $reviews.rating] {:name "avg"}]]
                                             :breakout     [&P2.products.category]
                                             :joins        [{:strategy     :left-join
                                                             :source-table $$products
                                                             :condition    [:= $reviews.product_id &P2.products.id]
                                                             :alias        "P2"}]}}]
                    :limit  2}))))))
