(ns metabase.query-processor.util.add-alias-info-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.models.field :refer [Field]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.fix-bad-references
    :as fix-bad-refs]
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
  (mt/with-everything-store
    (driver/with-driver (or driver/*driver* :h2)
      (-> query qp/preprocess add/add-alias-info remove-source-metadata (dissoc :middleware)))))

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
                 (mt/mbql-query products
                   {:expressions {"CATEGORY" [:concat [:field %category nil] "2"]}
                    :fields      [[:field %category nil]
                                  [:expression "CATEGORY"]]
                    :limit       1}))))))

(deftest not-null-test
  (is (query= (mt/mbql-query checkins
                {:aggregation [[:aggregation-options
                                [:count]
                                {:name               "count"
                                 ::add/source-alias  "count"
                                 ::add/desired-alias "count"
                                 ::add/position      0}]]
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
                                 :aggregation  [[:aggregation-options
                                                 [:count]
                                                 {:name               "count"
                                                  ::add/position      0
                                                  ::add/desired-alias "count"}]
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
                   {:expressions {"big_price"                  [:+ $price 2]
                                  "price_divided_by_big_price" [:/ $price [:expression "big_price"]]}
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
                   :expressions  {"big_price"                  [:+ price 2]
                                  "price_divided_by_big_price" [:/ price big-price]}
                   :fields       [price
                                  big-price
                                  price-divided-by-big-price]
                   :limit        1}))
              (:query
               (add-alias-info
                (mt/mbql-query venues
                  {:expressions {"big_price"                  [:+ $price 2]
                                 "price_divided_by_big_price" [:/ $price [:expression "big_price"]]}
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
                                                                             [:field %reviews.product_id {::add/source-table $$reviews
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
                   (mt/mbql-query orders
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
                                                               :condition    [:= $reviews.product_id &P2.products.id]
                                                               :alias        "P2"}]}}]
                      :limit  2})))))))

(driver/register! ::custom-escape :parent :h2)

(defn- prefix-alias [alias]
  (str "COOL." alias))

(defmethod driver/escape-alias ::custom-escape
  [_driver field-alias]
  (prefix-alias field-alias))

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
                            {:aggregation [[:aggregation-options [:count] {:name               "COOL.count"
                                                                           ::add/position      1
                                                                           ::add/source-alias  "count"
                                                                           ::add/desired-alias "COOL.count"}]]
                             :breakout    [double-price]
                             :order-by    [[:asc double-price]]})))
                    (-> (mt/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :expressions  {"double_price" [:* $price 2]}
                                          :fields       [$price
                                                         [:expression "double_price"]]
                                          :limit        1}
                           :aggregation  [[:count]]
                           :breakout     [[:field "double_price" {:base-type :type/Integer}]]})
                        add-alias-info
                        :query)))))))

(deftest custom-escape-alias-filtering-aggregation-test
  (let [db (mt/db)]
    (driver/with-driver ::custom-escape
      (mt/with-db db
        (is (query= (mt/$ids venues
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
                                                 (assoc :base-type :type/BigInteger
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
                                  [:value 10 {:base_type :type/BigInteger}]]
                         :limit 1}))
                    (-> (mt/mbql-query venues
                          {:source-query {:source-table $$venues
                                          :aggregation  [[:aggregation-options
                                                          [:count]
                                                          {:name "strange count"}]]
                                          :breakout     [$price]}
                           :filter       [:< [:field "strange count" {:base-type :type/BigInteger}] 10]
                           :limit        1})
                        add-alias-info
                        :query)))))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest use-correct-alias-for-joined-field-test
  (testing "Make sure we call `driver/escape-alias` for the `:source-alias` for Fields coming from joins (#20413)"
    (mt/dataset sample-dataset
      (let [db (mt/db)]
        (driver/with-driver ::custom-escape-spaces-to-underscores
          (mt/with-db db
            (is (query= (mt/$ids nil
                          {:source-query {:source-table $$orders
                                          :joins        [{:source-table $$products
                                                          :alias        "Products Renamed"
                                                          :condition
                                                          [:=
                                                           [:field
                                                            %orders.product_id
                                                            {::add/source-alias "PRODUCT_ID"
                                                             ::add/source-table $$orders}]
                                                           [:field
                                                            %products.id
                                                            {::add/desired-alias "Products_Renamed__ID"
                                                             ::add/position      0
                                                             ::add/source-alias  "ID"
                                                             ::add/source-table  "Products Renamed"
                                                             :join-alias         "Products Renamed"}]]
                                                          :fields
                                                          [[:field
                                                            %products.id
                                                            {::add/desired-alias "Products_Renamed__ID"
                                                             ::add/position      0
                                                             ::add/source-alias  "ID"
                                                             ::add/source-table  "Products Renamed"
                                                             :join-alias         "Products Renamed"}]]
                                                          :strategy     :left-join}]
                                          :expressions  {"CC" [:+ 1 1]}
                                          :fields
                                          [[:field
                                            %products.id
                                            {::add/desired-alias "Products_Renamed__ID"
                                             ::add/position      0
                                             ::add/source-alias  "ID"
                                             ::add/source-table  "Products Renamed"
                                             :join-alias         "Products Renamed"}]
                                           [:expression "CC" {::add/desired-alias "CC", ::add/position 1}]]
                                          :filter
                                          [:=
                                           [:field
                                            %products.category
                                            {::add/source-alias "CATEGORY"
                                             ::add/source-table  "Products Renamed"
                                             :join-alias        "Products Renamed"}]
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
                                            :join-alias         "Products Renamed"}]
                                          [:field
                                           "CC"
                                           {::add/desired-alias "CC"
                                            ::add/position      1
                                            ::add/source-alias  "CC"
                                            ::add/source-table  ::add/source
                                            :base-type          :type/Float}]]
                           :limit        1})
                        (-> (mt/mbql-query orders
                              {:source-query {:source-table $$orders
                                              :joins        [{:source-table $$products
                                                              :alias        "Products Renamed"
                                                              :condition    [:=
                                                                             $product_id
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
                            :query)))))))))

(deftest query->expected-cols-test
  (testing "field_refs in expected columns have the original join aliases (#30648)"
    (mt/dataset sample-dataset
      (binding [driver/*driver* ::custom-escape-spaces-to-underscores]
        (let [query
              (mt/mbql-query
               products
                {:joins
                 [{:source-query
                   {:source-table $$orders
                    :joins
                    [{:source-table $$people
                      :alias "People"
                      :condition [:= $orders.user_id &People.people.id]
                      :fields [&People.people.address]
                      :strategy :left-join}]
                    :fields [$orders.id &People.people.address]}
                   :alias "Question 54"
                   :condition [:= $id [:field %orders.id {:join-alias "Question 54"}]]
                   :fields [[:field %orders.id {:join-alias "Question 54"}]
                            [:field %people.address {:join-alias "Question 54"}]]
                   :strategy :left-join}]
                 :fields
                 [!default.created_at
                  [:field %orders.id {:join-alias "Question 54"}]
                  [:field %people.address {:join-alias "Question 54"}]]})]
          (is (=? [{:name "CREATED_AT"
                    :field_ref [:field (mt/id :products :created_at) {:temporal-unit :default}]
                    :display_name "Created At"}
                   {:name "ID"
                    :field_ref [:field (mt/id :orders :id) {:join-alias "Question 54"}]
                    :display_name "Question 54 → ID"
                    :source_alias "Question 54"}
                   {:name "ADDRESS"
                    :field_ref [:field (mt/id :people :address) {:join-alias "Question 54"}]
                    :display_name "Question 54 → Address"
                    :source_alias "Question 54"}]
                  (qp/query->expected-cols query))))))))

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

(deftest aggregation-reference-test
  (testing "Make sure we add info to `:aggregation` reference clauses correctly"
    (is (query= (mt/mbql-query checkins
                  {:aggregation [[:aggregation-options
                                  [:sum [:field %user_id {::add/source-table $$checkins
                                                          ::add/source-alias "USER_ID"}]]
                                  {:name               "sum"
                                   ::add/position      0
                                   ::add/source-alias  "sum"
                                   ::add/desired-alias "sum"}]]
                   :order-by    [[:asc [:aggregation 0 {::add/desired-alias "sum"
                                                        ::add/position      0}]]]})
                (add-alias-info
                 (mt/mbql-query checkins
                   {:aggregation [[:sum $user_id]]
                    :order-by    [[:asc [:aggregation 0]]]}))))))

(deftest uniquify-aggregation-names-text
  (is (query= (mt/mbql-query checkins
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
               (mt/mbql-query checkins
                 {:expressions {"count" [:+ 1 1]}
                  :breakout    [[:expression "count"]]
                  :aggregation [[:count]]
                  :limit       1})))))

(deftest fuzzy-field-info-test
  (testing "[[add/alias-from-join]] should match Fields in the Join source query even if they have temporal units"
    (mt/with-driver :h2
      (mt/dataset sample-dataset
        (mt/with-everything-store
          (is (= {:field-name              "CREATED_AT"
                  :join-is-this-level?     "Q2"
                  :alias-from-join         "Products__CREATED_AT"
                  :alias-from-source-query nil}
                 (#'add/expensive-field-info
                  (mt/$ids nil
                    {:source-table $$reviews
                     :joins        [{:source-query {:source-table $$reviews
                                                    :breakout     [[:field %products.created_at
                                                                    {::add/desired-alias "Products__CREATED_AT"
                                                                     ::add/position      0
                                                                     ::add/source-alias  "CREATED_AT"
                                                                     ::add/source-table  "Products"
                                                                     :join-alias         "Products"
                                                                     :temporal-unit      :month}]]}
                                     :alias        "Q2"}]})
                  [:field (mt/id :products :created_at) {:join-alias "Q2"}]))))))))

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
