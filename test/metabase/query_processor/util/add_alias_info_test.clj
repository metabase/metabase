(ns metabase.query-processor.util.add-alias-info-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.test :as mt]))

(comment h2/keep-me)

(deftest ^:parallel normalize-clause-test
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
  (mt/with-metadata-provider (if (qp.store/initialized?)
                               (qp.store/metadata-provider)
                               meta/metadata-provider)
    (driver/with-driver (or driver/*driver* :h2)
      (-> query qp.preprocess/preprocess add/add-alias-info remove-source-metadata (dissoc :middleware)))))

(deftest ^:parallel join-in-source-query-test
  (is (query= (lib.tu.macros/mbql-query venues
                {:source-query {:source-table $$venues
                                :joins        [{:strategy     :left-join
                                                :source-table $$categories
                                                :alias        "Cat"
                                                :condition    [:=
                                                               [:field %category-id {::add/source-table $$venues
                                                                                     ::add/source-alias "CATEGORY_ID"}]
                                                               [:field %categories.id {:join-alias        "Cat"
                                                                                       ::add/source-table "Cat"
                                                                                       ::add/source-alias "ID"}]]}]
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
               (lib.tu.macros/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :joins        [{:strategy     :left-join
                                                 :source-table $$categories
                                                 :alias        "Cat"
                                                 :condition    [:= $category-id &Cat.categories.id]}]
                                 :fields       [$id
                                                &Cat.categories.name]}
                  :breakout     [&Cat.categories.name]
                  :limit        1})))))

(deftest ^:parallel multiple-joins-test
  (is (query= (lib.tu.macros/mbql-query orders
                {:source-query {:source-table $$orders
                                :joins        [{:source-table $$products
                                                :alias        "P1"
                                                :condition    [:=
                                                               [:field %product-id {::add/source-alias "PRODUCT_ID"
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
                                                                                %reviews.product-id
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
               (lib.tu.macros/mbql-query orders
                 {:fields       [&P1.products.category]
                  :source-query {:source-table $$orders
                                 :fields       [&P1.products.category]
                                 :joins        [{:strategy     :left-join
                                                 :source-table $$products
                                                 :condition    [:= $product-id &P1.products.id]
                                                 :alias        "P1"}]}
                  :joins        [{:strategy     :left-join
                                  :condition    [:= &P1.products.category &Q2.products.category]
                                  :alias        "Q2"
                                  :source-query {:source-table $$reviews
                                                 :fields       [&P2.products.category]
                                                 :joins        [{:strategy     :left-join
                                                                 :source-table $$products
                                                                 :condition    [:= $reviews.product-id &P2.products.id]
                                                                 :alias        "P2"}]}}]
                  :limit        1})))))

(deftest ^:parallel uniquify-aliases-test
  (is (query= (lib.tu.macros/mbql-query products
                {:source-table $$products
                 :expressions  {"CATEGORY" [:concat
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
               (lib.tu.macros/mbql-query products
                 {:expressions {"CATEGORY" [:concat [:field %category nil] "2"]}
                  :fields      [[:field %category nil]
                                [:expression "CATEGORY"]]
                  :limit       1})))))

(deftest ^:parallel not-null-test
  (is (query= (lib.tu.macros/mbql-query checkins
                {:aggregation [[:aggregation-options
                                [:count]
                                {:name               "count"
                                 ::add/source-alias  "count"
                                 ::add/desired-alias "count"
                                 ::add/position      0}]]
                 :filter      [:!=
                               [:field %date {::add/source-table $$checkins
                                              ::add/source-alias "DATE"}]
                               [:value nil {:base_type         :type/Date
                                            :effective_type    :type/Date
                                            :coercion_strategy nil
                                            :semantic_type     nil
                                            :database_type     "DATE"
                                            :name              "DATE"}]]})
              (add-alias-info
               (lib.tu.macros/mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:not-null $date]})))))

(deftest ^:parallel duplicate-aggregations-test
  (is (query= (lib.tu.macros/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options
                                                [:count]
                                                {:name               "count"
                                                 ::add/source-alias  "count"
                                                 ::add/desired-alias "count"
                                                 ::add/position      0}]
                                               [:aggregation-options
                                                [:count]
                                                {:name               "count_2"
                                                 ::add/source-alias  "count_2"
                                                 ::add/desired-alias "count_2"
                                                 ::add/position      1}]
                                               [:aggregation-options
                                                [:count]
                                                {:name               "count_3"
                                                 ::add/source-alias  "count_3"
                                                 ::add/desired-alias "count_3"
                                                 ::add/position      2}]]}
                 :fields       [[:field "count" {:base-type          :type/Integer
                                                 ::add/source-table  ::add/source
                                                 ::add/source-alias  "count"
                                                 ::add/desired-alias "count"
                                                 ::add/position      0}]
                                [:field "count_2" {:base-type          :type/Integer
                                                   ::add/source-table  ::add/source
                                                   ::add/source-alias  "count_2"
                                                   ::add/desired-alias "count_2"
                                                   ::add/position      1}]
                                [:field "count_3" {:base-type          :type/Integer
                                                   ::add/source-table  ::add/source
                                                   ::add/source-alias  "count_3"
                                                   ::add/desired-alias "count_3"
                                                   ::add/position      2}]]
                 :limit        1})
              (add-alias-info
               (lib.tu.macros/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options
                                                 [:count]
                                                 {:name               "count"
                                                  ::add/position      0
                                                  ::add/desired-alias "count"}]
                                                [:count]
                                                [:count]]}
                  :limit        1})))))

(deftest ^:parallel multiple-expressions-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (is (query= (lib.tu.macros/$ids venues
                  {$price                                     0
                   [:expression "big_price"]                  1
                   [:expression "price_divided_by_big_price"] 2})
                (#'add/selected-clauses
                 (lib.tu.macros/$ids venues
                   {:expressions {"big_price"                  [:+ $price 2]
                                  "price_divided_by_big_price" [:/ $price [:expression "big_price"]]}
                    :fields      [$price
                                  [:expression "big_price"]
                                  [:expression "price_divided_by_big_price"]]
                    :limit       1}))))))

(deftest ^:parallel multiple-expressions-test-2
  (is (query= (lib.tu.macros/$ids venues
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
                   :expressions  {"big_price"                  [:+ price 2]
                                  "price_divided_by_big_price" [:/ price big-price]}
                   :fields       [price
                                  big-price
                                  price-divided-by-big-price]
                   :limit        1}))
              (:query
               (add-alias-info
                (lib.tu.macros/mbql-query venues
                  {:expressions {"big_price"                  [:+ $price 2]
                                 "price_divided_by_big_price" [:/ $price [:expression "big_price"]]}
                   :fields      [$price
                                 [:expression "big_price"]
                                 [:expression "price_divided_by_big_price"]]
                   :limit       1}))))))

(deftest join-source-query-join-test
  (with-redefs [fix-bad-refs/fix-bad-references identity]
    (is (query= (lib.tu.macros/mbql-query orders
                  {:joins  [{:source-query {:source-table $$reviews
                                            :aggregation  [[:aggregation-options
                                                            [:avg [:field %reviews.rating {::add/source-table $$reviews
                                                                                           ::add/source-alias "RATING"}]]
                                                            {:name               "avg"
                                                             ::add/source-alias  "avg"
                                                             ::add/desired-alias "avg"
                                                             ::add/position      1}]]
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
                                                                           [:field %reviews.product-id {::add/source-table $$reviews
                                                                                                        ::add/source-alias "PRODUCT_ID"}]
                                                                           [:field %products.id {:join-alias        "P2"
                                                                                                 ::add/source-table "P2"
                                                                                                 ::add/source-alias "ID"}]]
                                                            :alias        "P2"}]}
                             :alias        "Q2"
                             :strategy     :left-join
                             :condition    [:=
                                            [:field %products.category {:join-alias         "Q2"
                                                                        ::add/source-table  "Q2"
                                                                        ::add/source-alias  "P2__CATEGORY"
                                                                        ::add/desired-alias "Q2__P2__CATEGORY"
                                                                        ::add/position      0}]
                                            [:value 1 {:base_type         :type/Text
                                                       :coercion_strategy nil
                                                       :database_type     "CHARACTER VARYING"
                                                       :effective_type    :type/Text
                                                       :name              "CATEGORY"
                                                       :semantic_type     :type/Category}]]}]
                   :fields [[:field %products.category {:join-alias         "Q2"
                                                        ::add/source-table  "Q2"
                                                        ::add/source-alias  "P2__CATEGORY"
                                                        ::add/desired-alias "Q2__P2__CATEGORY"
                                                        ::add/position      0}]
                            [:field "avg" {:base-type          :type/Integer
                                           :join-alias         "Q2"
                                           ::add/source-table  "Q2"
                                           ::add/source-alias  "avg"
                                           ::add/desired-alias "Q2__avg"
                                           ::add/position      1}]]
                   :limit  2})
                (add-alias-info
                 (lib.tu.macros/mbql-query orders
                   {:fields [&Q2.products.category
                             [:field "avg" {:base-type :type/Integer, :join-alias "Q2"}]]
                    :joins  [{:strategy     :left-join
                              :condition    [:= &Q2.products.category 1]
                              :alias        "Q2"
                              :source-query {:source-table $$reviews
                                             :aggregation  [[:aggregation-options [:avg $reviews.rating] {:name "avg"}]]
                                             :breakout     [&P2.products.category]
                                             :joins        [{:strategy     :left-join
                                                             :source-table $$products
                                                             :condition    [:= $reviews.product-id &P2.products.id]
                                                             :alias        "P2"}]}}]
                    :limit  2}))))))

(driver/register! ::custom-escape :parent :h2)

(defn- prefix-alias [alias]
  (str "COOL." alias))

(defmethod driver/escape-alias ::custom-escape
  [_driver field-alias]
  (prefix-alias field-alias))

(deftest ^:parallel custom-escape-alias-test
  (let [db (mt/db)]
    (driver/with-driver ::custom-escape
      (mt/with-db db
        (is (query= (lib.tu.macros/$ids venues
                      (merge
                       {:source-query (let [price [:field %price {::add/source-table  $$venues
                                                                  ::add/source-alias  "PRICE"
                                                                  ::add/desired-alias "COOL.PRICE"
                                                                  ::add/position      0}]]
                                        {:source-table $$venues
                                         :expressions  {"double_price" [:* price 2]}
                                         :fields       [price
                                                        [:expression "double_price" {::add/desired-alias "COOL.double_price"
                                                                                     ::add/position      1}]]
                                         :limit        1})}
                       (let [double-price [:field
                                           "double_price"
                                           {:base-type          :type/Integer
                                            ::add/source-table  ::add/source
                                            ::add/source-alias  "COOL.double_price"
                                            ::add/desired-alias "COOL.COOL.double_price"
                                            ::add/position      0}]]
                         ;; this is escaped once during preprocessing by
                         ;; the [[metabase.query-processor.middleware.pre-alias-aggregations]] middleware and then once
                         ;; more when we call [[metabase.query-processor.util.add-alias-info/add-alias-info]]
                         {:aggregation [[:aggregation-options [:count] {:name               "COOL.COOL.count"
                                                                        ::add/position      1
                                                                        ::add/source-alias  "COOL.count"
                                                                        ::add/desired-alias "COOL.COOL.count"}]]
                          :breakout    [double-price]
                          :order-by    [[:asc double-price]]})))
                    (-> (lib.tu.macros/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :expressions  {"double_price" [:* $price 2]}
                                          :fields       [$price
                                                         [:expression "double_price"]]
                                          :limit        1}
                           :aggregation  [[:count]]
                           :breakout     [[:field "double_price" {:base-type :type/Integer}]]})
                        add-alias-info
                        :query)))))))

(deftest ^:parallel custom-escape-alias-filtering-aggregation-test
  (let [db (mt/db)]
    (driver/with-driver ::custom-escape
      (mt/with-db db
        (is (query= (lib.tu.macros/$ids venues
                      (let [price [:field %price {::add/source-table  $$venues
                                                  ::add/source-alias  "PRICE"
                                                  ::add/desired-alias "COOL.PRICE"
                                                  ::add/position      0}]
                            outer-price (-> price
                                            (assoc-in [2 ::add/source-table] ::add/source)
                                            (update-in [2 ::add/source-alias] prefix-alias)
                                            (update-in [2 ::add/desired-alias] prefix-alias))
                            count-opts {:name "COOL.strange count"
                                        ::add/source-alias "strange count"
                                        ::add/desired-alias "COOL.strange count"
                                        ::add/position 1}
                            outer-count-opts (-> count-opts
                                                 (dissoc :name)
                                                 (assoc :base-type :type/Integer
                                                        ::add/source-table ::add/source)
                                                 (update ::add/source-alias prefix-alias)
                                                 (update ::add/desired-alias prefix-alias))]
                        {:source-query
                         {:source-table $$venues
                          :breakout     [price]
                          :aggregation  [[:aggregation-options [:count] count-opts]]
                          :order-by     [[:asc price]]}
                         :fields [outer-price
                                  [:field
                                   "strange count"
                                   outer-count-opts]]
                         :filter [:<
                                  [:field
                                   "strange count"
                                   outer-count-opts]
                                  [:value 10 {:base_type :type/Integer}]]
                         :limit 1}))
                    (-> (lib.tu.macros/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :aggregation  [[:aggregation-options
                                                          [:count]
                                                          {:name "strange count"}]]
                                          :breakout     [$price]}
                           :filter       [:< [:field "strange count" {:base-type :type/Integer}] 10]
                           :limit        1})
                        add-alias-info
                        :query)))))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest ^:parallel use-correct-alias-for-joined-field-test
  (testing "Make sure we call `driver/escape-alias` for the `:source-alias` for Fields coming from joins (#20413)"
    (driver/with-driver ::custom-escape-spaces-to-underscores
      (is (query= (lib.tu.macros/$ids nil
                    {:source-query {:source-table $$orders
                                    :joins        [{:source-table $$products
                                                    :alias        "Products_Renamed"
                                                    :condition
                                                    [:=
                                                     [:field
                                                      %orders.product-id
                                                      {::add/source-alias "PRODUCT_ID"
                                                       ::add/source-table $$orders}]
                                                     [:field
                                                      %products.id
                                                      {::add/desired-alias "Products_Renamed__ID"
                                                       ::add/position      0
                                                       ::add/source-alias  "ID"
                                                       ::add/source-table  "Products_Renamed"
                                                       :join-alias         "Products_Renamed"}]]
                                                    :fields
                                                    [[:field
                                                      %products.id
                                                      {::add/desired-alias "Products_Renamed__ID"
                                                       ::add/position      0
                                                       ::add/source-alias  "ID"
                                                       ::add/source-table  "Products_Renamed"
                                                       :join-alias         "Products_Renamed"}]]
                                                    :strategy     :left-join}]
                                    :expressions  {"CC" [:+ 1 1]}
                                    :fields
                                    [[:field
                                      %products.id
                                      {::add/desired-alias "Products_Renamed__ID"
                                       ::add/position      0
                                       ::add/source-alias  "ID"
                                       ::add/source-table  "Products_Renamed"
                                       :join-alias         "Products_Renamed"}]
                                     [:expression "CC" {::add/desired-alias "CC", ::add/position 1}]]
                                    :filter
                                    [:=
                                     [:field
                                      %products.category
                                      {::add/source-alias "CATEGORY"
                                       ::add/source-table  "Products_Renamed"
                                       :join-alias        "Products_Renamed"}]
                                     [:value
                                      "Doohickey"
                                      {:base_type         :type/Text
                                       :coercion_strategy nil
                                       :database_type     "CHARACTER VARYING"
                                       :effective_type    :type/Text
                                       :name              "CATEGORY"
                                       :semantic_type     :type/Category}]]}
                     :fields       [[:field
                                     %products.id
                                     {::add/desired-alias "Products_Renamed__ID"
                                      ::add/position      0
                                      ::add/source-alias  "Products_Renamed__ID"
                                      ::add/source-table  ::add/source
                                      :join-alias         "Products_Renamed"}]
                                    [:field
                                     "CC"
                                     {::add/desired-alias "CC"
                                      ::add/position      1
                                      ::add/source-alias  "CC"
                                      ::add/source-table  ::add/source
                                      :base-type          :type/Float}]]
                     :limit        1})
                  (-> (lib.tu.macros/mbql-query orders
                        {:source-query {:source-table $$orders
                                        :joins        [{:source-table $$products
                                                        :alias        "Products Renamed"
                                                        :condition    [:=
                                                                       $product-id
                                                                       [:field %products.id {:join-alias "Products Renamed"}]]
                                                        :fields       [[:field %products.id {:join-alias "Products Renamed"}]]}]
                                        :expressions  {"CC" [:+ 1 1]}
                                        :fields       [[:field %products.id {:join-alias "Products Renamed"}]
                                                       [:expression "CC"]]
                                        :filter       [:=
                                                       [:field %products.category {:join-alias "Products Renamed"}]
                                                       "Doohickey"]}
                         :limit        1})
                      add-alias-info
                      :query))))))

(deftest ^:parallel query->expected-cols-test
  (testing "field_refs in expected columns have the original join aliases (#30648)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (binding [driver/*driver* ::custom-escape-spaces-to-underscores]
        (let [query
              (lib.tu.macros/mbql-query
                products
                {:joins
                 [{:source-query
                   {:source-table $$orders
                    :joins
                    [{:source-table $$people
                      :alias        "People"
                      :condition    [:= $orders.user-id &People.people.id]
                      :fields       [&People.people.address]
                      :strategy     :left-join}]
                    :fields       [$orders.id &People.people.address]}
                   :alias     "Question 54"
                   :condition [:= $id [:field %orders.id {:join-alias "Question 54"}]]
                   :fields    [[:field %orders.id {:join-alias "Question 54"}]
                               [:field %people.address {:join-alias "Question 54"}]]
                   :strategy  :left-join}]
                 :fields
                 [!default.created-at
                  [:field %orders.id {:join-alias "Question 54"}]
                  [:field %people.address {:join-alias "Question 54"}]]})]
          (is (=? [{:name         "CREATED_AT"
                    :field_ref    [:field (meta/id :products :created-at) {:temporal-unit :default}]
                    :display_name "Created At"}
                   {:name         "ID"
                    :field_ref    [:field (meta/id :orders :id) {:join-alias "Question 54"}]
                    :display_name "Question 54 → ID"
                    :source_alias "Question 54"}
                   {:name         "ADDRESS"
                    :field_ref    [:field (meta/id :people :address) {:join-alias "Question 54"}]
                    :display_name "Question 54 → Address"
                    :source_alias "Question 54"}]
                  (qp.preprocess/query->expected-cols query))))))))

(deftest ^:parallel use-source-unique-aliases-test
  (testing "Make sure uniquified aliases in the source query end up getting used for `::add/source-alias`"
    ;; keep track of the IDs so we don't accidentally fetch the wrong ones after we switch the name of `price`
    (let [name-id  (meta/id :venues :name)
          price-id (meta/id :venues :price)]
      ;; create a condition where we'd have duplicate column names for one reason or another to make sure we end up using
      ;; the correct unique alias from the source query
      (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                        meta/metadata-provider
                                        {:fields [{:id   price-id
                                                   :name "Name"}]})
        (is (query= (lib.tu.macros/$ids venues
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
                    (-> (lib.tu.macros/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :fields       [[:field name-id nil]
                                                         [:field price-id nil]]}
                           :fields       [[:field name-id nil]
                                          [:field price-id nil]]
                           :limit        1})
                        add-alias-info
                        :query)))))))

(deftest ^:parallel aggregation-reference-test
  (testing "Make sure we add info to `:aggregation` reference clauses correctly"
    (is (query= (lib.tu.macros/mbql-query checkins
                  {:aggregation [[:aggregation-options
                                  [:sum [:field %user-id {::add/source-table $$checkins
                                                          ::add/source-alias "USER_ID"}]]
                                  {:name               "sum"
                                   ::add/position      0
                                   ::add/source-alias  "sum"
                                   ::add/desired-alias "sum"}]]
                   :order-by    [[:asc [:aggregation 0 {::add/desired-alias "sum"
                                                        ::add/position      0}]]]})
                (add-alias-info
                 (lib.tu.macros/mbql-query checkins
                   {:aggregation [[:sum $user-id]]
                    :order-by    [[:asc [:aggregation 0]]]}))))))

(deftest ^:parallel uniquify-aggregation-names-text
  (is (query= (lib.tu.macros/mbql-query checkins
                {:expressions {"count" [:+ 1 1]}
                 :breakout    [[:expression "count" {::add/desired-alias "count"
                                                     ::add/position      0}]]
                 :aggregation [[:aggregation-options [:count] {:name               "count_2"
                                                               ::add/source-alias  "count"
                                                               ::add/desired-alias "count_2"
                                                               ::add/position      1}]]
                 :order-by    [[:asc [:expression "count" {::add/desired-alias "count"
                                                           ::add/position      0}]]]
                 :limit       1})
              (add-alias-info
               (lib.tu.macros/mbql-query checkins
                 {:expressions {"count" [:+ 1 1]}
                  :breakout    [[:expression "count"]]
                  :aggregation [[:count]]
                  :limit       1})))))

(deftest ^:parallel fuzzy-field-info-test
  (testing "[[add/alias-from-join]] should match Fields in the Join source query even if they have temporal units"
    (qp.store/with-metadata-provider meta/metadata-provider
      (mt/with-driver :h2
        (is (= {:field-name              "CREATED_AT"
                :join-is-this-level?     "Q2"
                :alias-from-join         "Products__CREATED_AT"
                :alias-from-source-query nil
                :override-alias?         false}
               (#'add/expensive-field-info
                (lib.tu.macros/$ids nil
                  {:source-table $$reviews
                   :joins        [{:source-query {:source-table $$reviews
                                                  :breakout     [[:field %products.created-at
                                                                  {::add/desired-alias "Products__CREATED_AT"
                                                                   ::add/position      0
                                                                   ::add/source-alias  "CREATED_AT"
                                                                   ::add/source-table  "Products"
                                                                   :join-alias         "Products"
                                                                   :temporal-unit      :month}]]}
                                   :alias        "Q2"}]})
                [:field (meta/id :products :created-at) {:join-alias "Q2"}])))))))

(deftest ^:parallel expression-from-source-query-alias-test
  (testing "Make sure we use the exported alias from the source query for expressions (#21131)"
    (let [source-query {:source-table 3
                        :expressions  {"PRICE" [:+
                                                [:field 2 {::add/source-table  3
                                                           ::add/source-alias  "price"
                                                           ::add/desired-alias "price"
                                                           ::add/position      1}]
                                                2]}
                        :fields       [[:field 2 {::add/source-table  3
                                                  ::add/source-alias  "price"
                                                  ::add/desired-alias "price"
                                                  ::add/position      1}]
                                       [:expression "PRICE" {::add/desired-alias "PRICE_2"
                                                             ::add/position      2}]]}]
      (testing `add/exports
        (is (= #{[:field 2 {::add/source-table  3
                            ::add/source-alias  "price"
                            ::add/desired-alias "price"
                            ::add/position      1}]
                 [:expression "PRICE" {::add/desired-alias "PRICE_2"
                                       ::add/position      2}]}
               (#'add/exports source-query))))
      (testing `add/matching-field-in-source-query
        (is (= [:expression "PRICE" {::add/desired-alias "PRICE_2"
                                     ::add/position      2}]
               (#'add/matching-field-in-source-query
                {:source-query source-query}
                [:field "PRICE" {:base-type :type/Float}]))))
      (testing `add/field-alias-in-source-query
        (is (= "PRICE_2"
               (#'add/field-alias-in-source-query
                {:source-query source-query}
                [:field "PRICE" {:base-type :type/Float}])))))))

(deftest ^:parallel find-matching-field-ignore-MLv2-extra-type-info-in-field-opts-test
  (testing "MLv2 refs can include extra info like `:base-type`; make sure we ignore that when finding matching refs (#33083)"
    (let [source-query {:joins [{:alias        "Card_2"
                                 :source-query {:breakout    [[:field 78 {:join-alias         "Products"
                                                                          :temporal-unit      :month
                                                                          ::add/source-table  "Products"
                                                                          ::add/source-alias  "CREATED_AT"
                                                                          ::add/desired-alias "Products__CREATED_AT"
                                                                          ::add/position      0}]]
                                                :aggregation [[:aggregation-options
                                                               [:distinct [:field 76 {:join-alias        "Products"
                                                                                      ::add/source-table "Products"
                                                                                      ::add/source-alias "ID"}]]
                                                               {:name               "count"
                                                                ::add/source-alias  "count"
                                                                ::add/position      1
                                                                ::add/desired-alias "count"}]]}}]}
          field-clause [:field 78 {:base-type :type/DateTime, :temporal-unit :month, :join-alias "Card_2"}]]
      (is (=? [:field
               78
               {:join-alias         "Products"
                :temporal-unit      :month
                ::add/source-table  "Products"
                ::add/source-alias  "CREATED_AT"
                ::add/desired-alias "Products__CREATED_AT"}]
              (#'add/matching-field-in-join-at-this-level source-query field-clause))))))

(defn- metadata-provider-with-two-models []
  (let [result-metadata-for (fn [column-name]
                              {:display_name   column-name
                               :field_ref      [:field column-name {:base-type :type/Integer}]
                               :name           column-name
                               :base_type      :type/Integer
                               :effective_type :type/Integer
                               :semantic_type  nil
                               :fingerprint
                               {:global {:distinct-count 1, :nil% 0}
                                :type   #:type{:Number {:min 1, :q1 1, :q3 1, :max 1, :sd nil, :avg 1}}}})]
    (lib/composed-metadata-provider
     meta/metadata-provider
     (providers.mock/mock-metadata-provider
      {:cards [{:name            "Model A"
                :id              1
                :database-id     (meta/id)
                :type            :model
                :dataset-query   {:database (mt/id)
                                  :type     :native
                                  :native   {:template-tags {} :query "select 1 as a1, 2 as a2;"}}
                :result-metadata [(result-metadata-for "A1")
                                  (result-metadata-for "A2")]}
               {:name            "Model B"
                :id              2
                :database-id     (meta/id)
                :type            :model
                :dataset-query   {:database (mt/id)
                                  :type     :native
                                  :native   {:template-tags {} :query "select 1 as b1, 2 as b2;"}}
                :result-metadata [(result-metadata-for "B1")
                                  (result-metadata-for "B2")]}
               {:name            "Joined"
                :id              3
                :database-id     (meta/id)
                :type            :model
                :dataset-query   {:database (meta/id)
                                  :type     :query
                                  :query    {:joins
                                             [{:fields :all,
                                               :alias "Model B - A1",
                                               :strategy :inner-join,
                                               :condition
                                               [:=
                                                [:field "A1" {:base-type :type/Integer}]
                                                [:field "B1" {:base-type :type/Integer, :join-alias "Model B - A1"}]],
                                               :source-table "card__2"}],
                                             :source-table "card__1"}}}]}))))

(deftest ^:parallel models-with-joins-and-renamed-columns-test
  (testing "an MBQL model with an explicit join and customized field names generate correct SQL (#40252)"
    (qp.store/with-metadata-provider (metadata-provider-with-two-models)
      (is (=? {:query {:fields [[:field "A1" {::add/source-table ::add/source
                                              ::add/source-alias "A1"}]
                                [:field "A2" {::add/source-table ::add/source
                                              ::add/source-alias "A2"}]
                                [:field "B1" {::add/source-table ::add/source
                                              ::add/source-alias "Model B - A1__B1"}]
                                [:field "B2" {::add/source-table ::add/source
                                              ::add/source-alias "Model B - A1__B2"}]]}}
              (add-alias-info {:type     :query
                               :database (meta/id)
                               :query    {:source-table "card__3"}}))))))

(deftest ^:parallel handle-multiple-orders-bys-on-same-field-correctly-test
  (testing "#40993"
    (let [query (lib.tu.macros/mbql-query orders
                  {:aggregation [[:count]]
                   :breakout    [[:field %created-at {:temporal-unit :month}]
                                 [:field %created-at {:temporal-unit :day}]]})]
      (qp.store/with-metadata-provider meta/metadata-provider
        (driver/with-driver :h2
          (is (=? {:query {:source-table (meta/id :orders)
                           :breakout     [[:field
                                           (meta/id :orders :created-at)
                                           {:temporal-unit      :month
                                            ::add/source-alias  "CREATED_AT"
                                            ::add/desired-alias "CREATED_AT"
                                            ::add/position      0}]
                                          [:field
                                           (meta/id :orders :created-at)
                                           {:temporal-unit      :day
                                            ::add/source-alias  "CREATED_AT"
                                            ::add/desired-alias "CREATED_AT_2"
                                            ::add/position      1}]]
                           :aggregation  [[:aggregation-options
                                           [:count]
                                           {::add/source-alias  "count"
                                            ::add/position      2
                                            ::add/desired-alias "count"}]]
                           :order-by     [[:asc
                                           [:field
                                            (meta/id :orders :created-at)
                                            {:temporal-unit      :month
                                             ::add/source-alias  "CREATED_AT"
                                             ::add/desired-alias "CREATED_AT"
                                             ::add/position      0}]]
                                          [:asc
                                           [:field
                                            (meta/id :orders :created-at)
                                            {:temporal-unit      :day
                                             ::add/source-alias  "CREATED_AT"
                                             ::add/desired-alias "CREATED_AT_2"
                                             ::add/position      1}]]]}}
                  (add/add-alias-info (qp.preprocess/preprocess query)))))))))

(deftest ^:parallel preserve-field-options-name-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (driver/with-driver :h2
      (is (=? {:source-query {:source-table (meta/id :orders)
                              :breakout     [[:field (meta/id :orders :id) {}]]
                              :aggregation  [[:aggregation-options
                                              [:cum-sum [:field (meta/id :orders :id) {}]]
                                              {:name "sum"}]]}
               :breakout     [[:field "id" {:base-type :type/Integer, ::add/desired-alias "id"}]
                              [:field "sum" {:base-type :type/Integer, ::add/desired-alias "__cumulative_sum"}]]
               :aggregation  [[:aggregation-options
                               [:cum-sum [:field "sum" {:base-type :type/Integer}]]
                               {::add/desired-alias "sum"}]]}
              (add/add-alias-info
               {:source-query {:source-table (meta/id :orders)
                               :breakout     [[:field (meta/id :orders :id) nil]]
                               :aggregation  [[:aggregation-options
                                               [:cum-sum [:field (meta/id :orders :id) nil]]
                                               {:name "sum"}]]}
                :breakout     [[:field "id" {:base-type :type/Integer}]
                               [:field "sum" {:base-type :type/Integer, :name "__cumulative_sum"}]],
                :aggregation  [[:aggregation-options
                                [:cum-sum [:field "sum" {:base-type :type/Integer}]]
                                {:name "sum"}]]}))))))

(deftest ^:parallel nested-query-field-literals-test
  (testing "Correctly handle similar column names in nominal field literal refs (#41325)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (driver/with-driver :h2
        (is (=? {:source-query {:fields [[:field (meta/id :orders :created-at)
                                          {::add/source-alias "CREATED_AT"
                                           ::add/desired-alias "CREATED_AT"}]
                                         [:field (meta/id :orders :created-at)
                                          {::add/source-alias "CREATED_AT"
                                           ::add/desired-alias "CREATED_AT_2"}]
                                         [:field (meta/id :orders :total)
                                          {::add/source-alias "TOTAL"
                                           ::add/desired-alias "TOTAL"}]]}
                 :aggregation [[:aggregation-options
                                [:cum-sum
                                 [:field "TOTAL" {::add/source-table ::add/source
                                                  ::add/source-alias "TOTAL"}]]
                                {:name "sum"
                                 ::add/source-alias "sum" ; FIXME This key shouldn't be here, this doesn't come from the source query.
                                 ::add/desired-alias "sum"}]]
                 :breakout [[:field "CREATED_AT" {::add/source-alias "CREATED_AT"
                                                  ::add/desired-alias "CREATED_AT"}]
                            [:field "CREATED_AT_2" {::add/source-alias "CREATED_AT_2"
                                                    ::add/desired-alias "CREATED_AT_2"}]]}
                (-> (lib.tu.macros/mbql-query orders
                      {:source-query {:source-table $$orders
                                      :fields [!year.created-at
                                               !month.created-at
                                               $total]}
                       :aggregation [[:cum-sum [:field "TOTAL" {:base-type :type/Integer}]]]
                       :breakout    [[:field "CREATED_AT" {:base-type :type/Date, :temporal-unit :default}]
                                     [:field "CREATED_AT_2" {:base-type :type/Date, :temporal-unit :default}]]})
                    qp.preprocess/preprocess
                    add/add-alias-info
                    :query)))))))
