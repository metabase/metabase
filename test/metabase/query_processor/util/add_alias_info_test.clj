(ns metabase.query-processor.util.add-alias-info-test
  (:require [clojure.test :refer :all]
            [clojure.walk :as walk]
            [metabase.driver :as driver]
            [metabase.driver.h2 :as h2]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
            [metabase.query-processor.util.add-alias-info :as add]
            [metabase.test :as mt]))

(comment h2/keep-me)

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

;; TODO -- this is duplicated with [[metabase.query-processor.util.nest-query-test/remove-source-metadata]]
(defn- remove-source-metadata [x]
  (walk/postwalk
   (fn [x]
     (if ((every-pred map? :source-metadata) x)
       (dissoc x :source-metadata)
       x))
   x))

(defn- add-alias-info [query]
  (mt/with-everything-store
    (driver/with-driver (or driver/*driver* :h2)
      (-> query qp/query->preprocessed add/add-alias-info remove-source-metadata (dissoc :middleware)))))

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

(deftest duplicate-aggregations-test
  (is (query= (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options [:count] {:name "count"}]
                                               [:aggregation-options [:count] {:name "count_2"}]
                                               [:aggregation-options [:count] {:name "count_3"}]]}
                 :fields       [[:field "count" {:base-type          :type/BigInteger
                                                 ::add/source-table  ::add/source
                                                 ::add/source-alias  "count"
                                                 ::add/desired-alias "count"
                                                 ::add/position      0}]
                                [:field "count_2" {:base-type          :type/BigInteger
                                                   ::add/source-table  ::add/source
                                                   ::add/source-alias  "count_2"
                                                   ::add/desired-alias "count_2"
                                                   ::add/position      1}]
                                [:field "count_3" {:base-type          :type/BigInteger
                                                   ::add/source-table  ::add/source
                                                   ::add/source-alias  "count_3"
                                                   ::add/desired-alias "count_3"
                                                   ::add/position      2}]]
                 :limit        1})
              (add-alias-info
               (mt/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options [:count] {:name "count"}]
                                                [:count]
                                                [:count]]}
                  :limit        1})))))

(deftest multiple-expressions-test
  (mt/with-everything-store
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
                    :limit       1})))))

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
  (with-redefs [fix-bad-refs/fix-bad-references identity]
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
                      :limit  2})))))))

(driver/register! ::custom-prefix-style :parent :h2)

(defmethod add/prefix-field-alias ::custom-prefix-style
  [_driver prefix field-alias]
  (format "%s~~%s" prefix field-alias))

(deftest custom-prefix-style-test
  (let [db (mt/db)]
    (driver/with-driver ::custom-prefix-style
      (mt/with-db db
        (is (query= (mt/$ids venues
                      {:source-table $$venues
                       :fields       [[:field %price {::add/source-table  $$venues
                                                      ::add/source-alias  "PRICE"
                                                      ::add/desired-alias "PRICE"
                                                      ::add/position      0}]
                                      [:field %categories.name {:join-alias         "Cat"
                                                                ::add/source-table  "Cat"
                                                                ::add/source-alias  "NAME"
                                                                ::add/desired-alias "Cat~~NAME"
                                                                ::add/position      1}]]
                       :joins        [{:source-table $$categories
                                       :fields       [[:field %categories.name {:join-alias         "Cat"
                                                                                ::add/source-table  "Cat"
                                                                                ::add/source-alias  "NAME"
                                                                                ::add/desired-alias "Cat~~NAME"
                                                                                ::add/position      1}]]
                                       :alias        "Cat"
                                       :condition    [:=
                                                      [:field %category_id {::add/source-table  $$venues
                                                                            ::add/source-alias  "CATEGORY_ID"}]
                                                      [:field %categories.id {:join-alias         "Cat"
                                                                              ::add/source-table  "Cat"
                                                                              ::add/source-alias  "ID"}]]
                                       :strategy     :left-join}]
                       :limit        1})
                    (-> (mt/mbql-query venues
                          {:fields [$price]
                           :joins  [{:source-table $$categories
                                     :fields       [&Cat.categories.name]
                                     :alias        "Cat"
                                     :condition    [:= $category_id &Cat.categories.id]}]
                           :limit  1})
                        add-alias-info
                        :query)))))))

(driver/register! ::custom-escape :parent :h2)

(defmethod add/escape-alias ::custom-escape
  [_driver field-alias]
  (str "COOL." field-alias))

(deftest custom-escape-alias-test
  (let [db (mt/db)]
    (driver/with-driver ::custom-escape
      (mt/with-db db
        (is (query= (mt/$ids venues
                      (merge
                          {:source-query (let [price [:field %price {::add/source-table  $$venues
                                                                     ::add/source-alias  "PRICE"
                                                                     ::add/desired-alias "COOL.PRICE"
                                                                     ::add/position      0}]]
                                           {:source-table $$venues
                                            :expressions  {:double_price [:* price 2]}
                                            :fields       [price
                                                           [:expression "double_price" {::add/desired-alias "COOL.double_price"
                                                                                        ::add/position      1}]]
                                            :limit        1})}
                          (let [double-price [:field
                                              "double_price"
                                              {:base-type          :type/Integer
                                               ::add/source-table  ::add/source
                                               ;; TODO -- these don't agree with the source query (maybe they should
                                               ;; both be prefixed by another `COOL.` I think) although I'm not sure it
                                               ;; makes sense to try to assume this stuff either. Arguably the field
                                               ;; clause should be `[:field "COOL.double_price" ...]` or something
                                               ::add/source-alias  "double_price"
                                               ::add/desired-alias "COOL.double_price"
                                               ::add/position      0}]]
                            {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                             :breakout    [double-price]
                             :order-by    [[:asc double-price]]})))
                    (-> (mt/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :expressions  {:double_price [:* $price 2]}
                                          :fields       [$price
                                                         [:expression "double_price"]]
                                          :limit        1}
                           :aggregation  [[:count]]
                           :breakout     [[:field "double_price" {:base-type :type/Integer}]]})
                        add-alias-info
                        :query)))))))

(deftest use-source-unique-aliases-test
  (testing "Make sure uniquified aliases in the source query end up getting used for `::add/source-alias`"
    ;; keep track of the IDs so we don't accidentally fetch the wrong ones after we switch the name of `price`
    (let [name-id  (mt/id :venues :name)
          price-id (mt/id :venues :price)]
      ;; create a condition where we'd have duplicate column names for one reason or another to make sure we end up using
      ;; the correct unique alias from the source query
      (mt/with-temp-vals-in-db Field price-id {:name "Name"}
        (is (query= (mt/$ids venues
                      {:source-query {:source-table $$venues
                                      :fields       [[:field name-id {::add/source-table  $$venues
                                                                      ::add/source-alias  "NAME"
                                                                      ::add/desired-alias "NAME"
                                                                      ::add/position      0}]
                                                     [:field price-id {::add/source-table  $$venues
                                                                       ::add/source-alias  "Name"
                                                                       ::add/desired-alias "Name_2"
                                                                       ::add/position      1}]]}
                       :fields       [[:field name-id {::add/source-table  ::add/source
                                                       ::add/source-alias  "NAME"
                                                       ::add/desired-alias "NAME"
                                                       ::add/position      0}]
                                      [:field price-id {::add/source-table  ::add/source
                                                        ::add/source-alias  "Name_2"
                                                        ::add/desired-alias "Name_2"
                                                        ::add/position      1}]]
                       :limit        1})
                    (-> (mt/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :fields       [[:field name-id nil]
                                                         [:field price-id nil]]}
                           :fields       [[:field name-id nil]
                                          [:field price-id nil]]
                           :limit        1})
                        add-alias-info
                        :query)))))))
