(ns metabase.query-processor.util.add-alias-info-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.lib.core :as lib]
   [metabase.lib.field-test]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.lib.test-util.uuid-dogs-metadata-provider :as lib.tu.uuid-dogs-metadata-provider]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.test :as mt]))

(comment h2/keep-me)

(defn- remove-source-metadata
  "This is mostly to make the test failure diffs sane."
  [x]
  (walk/postwalk
   (fn [x]
     (cond-> x
       (map? x) (dissoc :source-metadata :lib/stage-metadata)))
   x))

(defn- add-alias-info [query]
  (if-not (:lib/type query)
    (-> (lib/query
         (if (qp.store/initialized?)
           (qp.store/metadata-provider)
           meta/metadata-provider)
         query)
        add-alias-info
        lib/->legacy-MBQL)
    (driver/with-driver (or driver/*driver* :h2)
      (->> query
           qp.preprocess/preprocess
           add/add-alias-info
           remove-source-metadata))))

(deftest ^:parallel join-in-source-query-test
  (is (=? (lib.tu.macros/mbql-query venues
            {:source-query {:source-table $$venues
                            :joins        [{:strategy     :left-join
                                            :source-query {:source-table $$categories}
                                            :alias        "Cat"
                                            :condition    [:=
                                                           [:field %category-id {::add/source-table $$venues
                                                                                 ::add/source-alias "CATEGORY_ID"}]
                                                           [:field %categories.id {:join-alias        "Cat"
                                                                                   ::add/source-table "Cat"
                                                                                   ::add/source-alias "ID"}]]}]
                            :fields       [[:field %id {}]
                                           [:field %categories.name {}]]}
             :breakout     [[:field %categories.name {:join-alias         "Cat"
                                                      ::add/source-table  ::add/source
                                                      ::add/source-alias  "Cat__NAME"
                                                      ::add/desired-alias "Cat__NAME"}]]
             :order-by     [[:asc [:field %categories.name {:join-alias         "Cat"
                                                            ::add/source-table  ::add/source
                                                            ::add/source-alias  "Cat__NAME"
                                                            ::add/desired-alias "Cat__NAME"}]]]
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
  (is (=? (lib.tu.macros/mbql-query orders
            {:source-query {:source-table $$orders
                            :joins        [{:source-query {:source-table $$products}
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
                                                                       ::add/source-alias  "CATEGORY"
                                                                       ::add/source-table  "P1"}]]}
             :joins        [{:source-query {:source-table $$reviews
                                            :joins        [{:source-query {:source-table $$products}
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
                                                             ::add/source-alias  "CATEGORY"
                                                             ::add/source-table  "P2"}]]}
                             :alias        "Q2"
                             :condition    [:=
                                            [:field %products.category {::add/source-alias  "P1__CATEGORY"
                                                                        ::add/source-table  ::add/source}]
                                            [:field %products.category {:join-alias        "Q2"
                                                                        ::add/source-alias "P2__CATEGORY"
                                                                        ::add/source-table "Q2"}]]
                             :strategy     :left-join}]
             :fields       [[:field any? {::add/desired-alias "P1__CATEGORY"
                                          ::add/source-alias  "P1__CATEGORY"
                                          ::add/source-table  ::add/source}]]})
          (add-alias-info
           (lib.tu.macros/mbql-query orders
             {:source-query {:source-table $$orders
                             :fields       [&P1.products.category]
                             :joins        [{:strategy     :left-join
                                             :source-table $$products
                                             :condition    [:= $product-id &P1.products.id]
                                             :alias        "P1"
                                             :fields       [&P1.products.category]}]}
              :joins        [{:strategy     :left-join
                              ;; `&P1.products.category` is an INCORRECT REF because the join is at a previous stage
                              ;; of the query. However, we should try to 'do the right thing'.
                              :condition    [:= &P1.products.category &Q2.products.category]
                              :alias        "Q2"
                              :source-query {:source-table $$reviews
                                             :fields       [&P2.products.category]
                                             :joins        [{:strategy     :left-join
                                                             :source-table $$products
                                                             :condition    [:= $reviews.product-id &P2.products.id]
                                                             :alias        "P2"
                                                             :fields       [&P2.products.category]}]}}]
              :fields       [&P1.products.category]})))))

(deftest ^:parallel uniquify-aliases-test
  (is (=? (lib.tu.macros/mbql-query products
            {:source-table $$products
             :expressions  {"CATEGORY" [:concat
                                        [:field %category
                                         {::add/source-table  $$products
                                          ::add/source-alias  "CATEGORY"
                                          ::add/desired-alias "CATEGORY"}]
                                        "2"]}
             :fields       [[:field %category {::add/source-table  $$products
                                               ::add/source-alias  "CATEGORY"
                                               ::add/desired-alias "CATEGORY"}]
                            [:expression "CATEGORY" {::add/desired-alias "CATEGORY_2"}]]
             :limit        1})
          (add-alias-info
           (lib.tu.macros/mbql-query products
             {:expressions {"CATEGORY" [:concat [:field %category nil] "2"]}
              :fields      [[:field %category nil]
                            [:expression "CATEGORY"]]
              :limit       1})))))

(deftest ^:parallel not-null-test
  (is (=? (lib.tu.macros/mbql-query checkins
            {:aggregation [[:aggregation-options
                            [:count]
                            {::add/source-alias  "count"
                             ::add/desired-alias "count"}]]
             :filter      [:!=
                           [:field %date {::add/source-table $$checkins
                                          ::add/source-alias "DATE"}]
                           [:value nil {:base_type     :type/Date
                                        :database_type "DATE"}]]})
          (add-alias-info
           (lib.tu.macros/mbql-query checkins
             {:aggregation [[:count]]
              :filter      [:not-null $date]})))))

(deftest ^:parallel duplicate-aggregations-test
  (is (=? (lib.tu.macros/mbql-query venues
            {:source-query {:source-table $$venues
                            :aggregation  [[:aggregation-options
                                            [:count]
                                            {::add/source-alias  "count"
                                             ::add/desired-alias "count"}]
                                           [:aggregation-options
                                            [:count]
                                            {::add/source-alias  "count_2"
                                             ::add/desired-alias "count_2"}]
                                           [:aggregation-options
                                            [:count]
                                            {::add/source-alias  "count_3"
                                             ::add/desired-alias "count_3"}]]}
             :fields       [[:field "count" {:base-type          :type/Integer
                                             ::add/source-table  ::add/source
                                             ::add/source-alias  "count"
                                             ::add/desired-alias "count"}]
                            [:field "count_2" {:base-type          :type/Integer
                                               ::add/source-table  ::add/source
                                               ::add/source-alias  "count_2"
                                               ::add/desired-alias "count_2"}]
                            [:field "count_3" {:base-type          :type/Integer
                                               ::add/source-table  ::add/source
                                               ::add/source-alias  "count_3"
                                               ::add/desired-alias "count_3"}]]
             :limit        1})
          (add-alias-info
           (lib.tu.macros/mbql-query venues
             {:source-query {:source-table $$venues
                             :aggregation  [[:aggregation-options
                                             [:count]
                                             {:name               "count"
                                              ::add/desired-alias "count"}]
                                            [:count]
                                            [:count]]}
              :limit        1})))))

(deftest ^:parallel multiple-expressions-test-2
  (is (=? (lib.tu.macros/$ids venues
            (let [price                      [:field %price {::add/source-table  $$venues
                                                             ::add/source-alias  "PRICE"
                                                             ::add/desired-alias "PRICE"}]
                  big-price                  [:expression
                                              "big_price"
                                              {::add/desired-alias "big_price"}]
                  price-divided-by-big-price [:expression
                                              "price_divided_by_big_price"
                                              {::add/desired-alias "price_divided_by_big_price"}]]
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

(deftest ^:parallel join-source-query-join-test
  (is (=? (lib.tu.macros/mbql-query orders
            {:joins  [{:source-query {:source-table $$reviews
                                      :aggregation  [[:aggregation-options
                                                      [:avg [:field %reviews.rating {::add/source-table $$reviews
                                                                                     ::add/source-alias "RATING"}]]
                                                      {:name               "avg"
                                                       ::add/source-alias  "avg"
                                                       ::add/desired-alias "avg"}]]
                                      :breakout     [[:field %products.category {:join-alias         "P2"
                                                                                 ::add/source-table  "P2"
                                                                                 ::add/source-alias  "CATEGORY"
                                                                                 ::add/desired-alias "P2__CATEGORY"}]]
                                      :order-by     [[:asc [:field %products.category {:join-alias         "P2"
                                                                                       ::add/source-table  "P2"
                                                                                       ::add/source-alias  "CATEGORY"
                                                                                       ::add/desired-alias "P2__CATEGORY"}]]]
                                      :joins        [{:strategy     :left-join
                                                      :source-query {:source-table $$products}
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
                                      [:field %products.category {:join-alias        "Q2"
                                                                  ::add/source-table "Q2"
                                                                  ::add/source-alias "P2__CATEGORY"}]
                                      [:value 1 {:base_type     :type/Text
                                                 :database_type "CHARACTER VARYING"
                                                 :semantic_type :type/Category}]]}]
             :fields [[:field %products.category {:join-alias         "Q2"
                                                  ::add/source-table  "Q2"
                                                  ::add/source-alias  "P2__CATEGORY"
                                                  ::add/desired-alias "Q2__P2__CATEGORY"}]
                      [:field "avg" {:base-type          :type/Integer
                                     :join-alias         "Q2"
                                     ::add/source-table  "Q2"
                                     ::add/source-alias  "avg"
                                     ::add/desired-alias "Q2__avg"}]]
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
              :limit  2})))))

(driver/register! ::custom-escape :parent :h2)

(defn- prefix-alias [alias]
  (str "COOL." alias))

(defmethod driver/escape-alias ::custom-escape
  [_driver field-alias]
  (prefix-alias field-alias))

(deftest ^:parallel custom-escape-alias-test
  (driver/with-driver ::custom-escape
    (is (=? (lib.tu.macros/$ids venues
              (merge
               {:source-query (let [price [:field %price {::add/source-table  $$venues
                                                          ::add/source-alias  "PRICE"
                                                          ::add/desired-alias "COOL.PRICE"}]]
                                {:source-table $$venues
                                 :expressions  {"double_price" [:* price 2]}
                                 :fields       [price
                                                [:expression "double_price" {::add/desired-alias "COOL.double_price"}]]
                                 :limit        1})}
               (let [double-price [:field
                                   "double_price"
                                   {:base-type          :type/Integer
                                    ::add/source-table  ::add/source
                                    ::add/source-alias  "COOL.double_price"
                                    ::add/desired-alias "COOL.double_price"}]]
                 {:aggregation [[:aggregation-options [:count] {::add/desired-alias "COOL.count"}]]
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
                :query)))))

(deftest ^:parallel custom-escape-alias-filtering-aggregation-test
  (driver/with-driver ::custom-escape
    (is (=? (lib.tu.macros/$ids venues
              (let [price         [:field %price {::add/source-table  $$venues
                                                  ::add/source-alias  "PRICE"
                                                  ::add/desired-alias "COOL.PRICE"}]
                    source-query  {:source-table $$venues
                                   :breakout     [price]
                                   :aggregation  [[:aggregation-options
                                                   [:count]
                                                   ;; TODO (Cam 8/7/25) -- doesn't even really make sense for an aggregation to have a source alias
                                                   {::add/source-alias  "strange count"
                                                    ::add/desired-alias "COOL.strange count"}]]
                                   :order-by     [[:asc price]]}
                    strange-count [:field
                                   "strange count"
                                   {:base-type         :type/Integer
                                    ::add/source-table ::add/source
                                    ::add/source-alias "COOL.strange count"}]]
                {:source-query source-query
                 :fields       [[:field
                                 any?
                                 {::add/source-table ::add/source
                                  ::add/source-alias "COOL.PRICE"}]
                                strange-count]
                 :filter       [:<
                                strange-count
                                [:value 10 {:base_type :type/Integer}]]}))
            (-> (lib.tu.macros/mbql-query venues
                  {:source-query {:source-table $$venues
                                  :aggregation  [[:aggregation-options
                                                  [:count]
                                                  {:name "strange count"}]]
                                  :breakout     [$price]}
                   :filter       [:< [:field "strange count" {:base-type :type/Integer}] 10]})
                add-alias-info
                :query)))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest ^:parallel use-correct-alias-for-joined-field-test
  (testing "Make sure we call `driver/escape-alias` for the `:source-alias` for Fields coming from joins (#20413)"
    (driver/with-driver ::custom-escape-spaces-to-underscores
      (is (=? (lib.tu.macros/$ids nil
                {:source-query {:source-table $$orders
                                :joins        [{:source-query {:source-table $$products}
                                                ::add/alias   "Products_Renamed"
                                                :alias        "Products Renamed"
                                                :condition
                                                [:=
                                                 [:field
                                                  any?
                                                  {::add/source-alias "PRODUCT_ID"
                                                   ::add/source-table $$orders}]
                                                 [:field
                                                  any?
                                                  {::add/source-alias "ID"
                                                   ::add/source-table "Products_Renamed"
                                                   :join-alias        "Products Renamed"}]]
                                                :strategy     :left-join}]
                                :expressions  {"CC" [:+ 1 1]}
                                :fields
                                [[:field
                                  any?
                                  {::add/desired-alias "Products_Renamed__ID"
                                   ::add/source-alias  "ID"
                                   ::add/source-table  "Products_Renamed"}]
                                 [:expression "CC" {::add/desired-alias "CC"}]]
                                :filter
                                [:=
                                 [:field
                                  any?
                                  {::add/source-alias "CATEGORY"
                                   ::add/source-table "Products_Renamed"}]
                                 [:value
                                  "Doohickey"
                                  {:base_type     :type/Text
                                   :database_type "CHARACTER VARYING"
                                   :semantic_type :type/Category}]]}
                 :fields       [[:field
                                 any?
                                 {::add/desired-alias "Products_Renamed__ID"
                                  ::add/source-alias  "Products_Renamed__ID"
                                  ::add/source-table  ::add/source}]
                                [:field
                                 "CC"
                                 {::add/desired-alias "CC"
                                  ::add/source-alias  "CC"
                                  ::add/source-table  ::add/source
                                  :base-type          :type/Integer}]]
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
                    :display_name "Question 54 → ID"}
                   {:name         "ADDRESS"
                    :field_ref    [:field (meta/id :people :address) {:join-alias "Question 54"}]
                    :display_name "Question 54 → Address"}]
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
        (is (=? (lib.tu.macros/$ids venues
                  {:source-query {:source-table $$venues
                                  :fields       [[:field name-id {::add/source-table  $$venues
                                                                  ::add/source-alias  "NAME"
                                                                  ::add/desired-alias "NAME"}]
                                                 [:field price-id {::add/source-table  $$venues
                                                                   ::add/source-alias  "Name"
                                                                   ::add/desired-alias "Name_2"}]]}
                   :fields       [[:field name-id {::add/source-table  ::add/source
                                                   ::add/source-alias  "NAME"
                                                   ::add/desired-alias "NAME"}]
                                  [:field price-id {::add/source-table  ::add/source
                                                    ::add/source-alias  "Name_2"
                                                    ::add/desired-alias "Name_2"}]]
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
    (is (=? (lib.tu.macros/$ids checkins
              {:stages [{:aggregation [[:sum
                                        {::add/desired-alias "sum"}
                                        [:field {::add/source-table $$checkins
                                                 ::add/source-alias "USER_ID"}
                                         %user-id]]]
                         :order-by    [[:asc
                                        {}
                                        [:aggregation {::add/desired-alias "sum"} string?]]]}]})
            (add-alias-info
             (lib.tu.macros/mbql-5-query checkins
               {:stages [{:aggregation [[:sum {:lib/uuid "00000000-0000-0000-0000-000000000001"} $user-id]]
                          :order-by    [[:asc {} [:aggregation {} "00000000-0000-0000-0000-000000000001"]]]}]}))))))

(deftest ^:parallel uniquify-aggregation-names-text
  (is (=? (lib.tu.macros/mbql-query checkins
            {:expressions {"count" [:+ 1 1]}
             :breakout    [[:expression "count" {::add/desired-alias "count"}]]
             :aggregation [[:aggregation-options [:count] {::add/desired-alias "count_2"}]]
             :order-by    [[:asc [:expression "count" {::add/desired-alias "count"}]]]
             :limit       1})
          (add-alias-info
           (lib.tu.macros/mbql-query checkins
             {:expressions {"count" [:+ 1 1]}
              :breakout    [[:expression "count"]]
              :aggregation [[:count]]
              :limit       1})))))

(deftest ^:parallel expression-from-source-query-alias-test
  (testing "Make sure we use the exported alias from the source query for expressions (#21131)"
    (let [source-query (lib.tu.macros/mbql-query venues
                         {:source-query {:source-table $$venues
                                         :expressions  {"PRICE" [:+ $price 2]}
                                         :fields       [$price
                                                        [:expression "PRICE"]]}})]
      (is (=? {:query {:fields [[:field any? {::add/source-alias  "PRICE"
                                              ::add/desired-alias "PRICE"
                                              ::add/source-table  ::add/source}]
                                [:field any? {::add/source-alias  "PRICE_2"
                                              ::add/desired-alias "PRICE_2"
                                              ::add/source-table  ::add/source}]]}}
              (add-alias-info source-query))))))

(defn- metadata-provider-with-two-models []
  (let [result-metadata-for (fn [column-name]
                              {:display_name   column-name
                               :field_ref      [:field column-name {:base-type :type/Integer}]
                               :name           column-name
                               :base_type      :type/Integer
                               :effective_type :type/Integer
                               :semantic_type  nil
                               :fingerprint    {:global {:distinct-count 1, :nil% 0}
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
               {:name          "Joined"
                :id            3
                :database-id   (meta/id)
                :type          :model
                :dataset-query {:database (meta/id)
                                :type     :query
                                :query    {:joins
                                           [{:fields       :all
                                             :alias        "Model B - A1"
                                             :strategy     :inner-join
                                             :condition
                                             [:=
                                              [:field "A1" {:base-type :type/Integer}]
                                              [:field "B1" {:base-type :type/Integer, :join-alias "Model B - A1"}]]
                                             :source-table "card__2"}]
                                           :source-table "card__1"}}}]}))))

(deftest ^:parallel models-with-joins-and-renamed-columns-test
  (testing "an MBQL model with an explicit join and customized field names generate correct SQL (#40252)"
    (qp.store/with-metadata-provider (metadata-provider-with-two-models)
      (is (=? {:query {:fields [[:field any? {::add/source-table ::add/source
                                              ::add/source-alias "A1"}]
                                [:field any? {::add/source-table ::add/source
                                              ::add/source-alias "A2"}]
                                [:field any? {::add/source-table ::add/source
                                              ::add/source-alias "Model B - A1__B1"}]
                                [:field any? {::add/source-table ::add/source
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
                                            ::add/desired-alias "CREATED_AT"}]
                                          [:field
                                           (meta/id :orders :created-at)
                                           {:temporal-unit      :day
                                            ::add/source-alias  "CREATED_AT"
                                            ::add/desired-alias "CREATED_AT_2"}]]
                           :aggregation  [[:aggregation-options
                                           [:count]
                                           {::add/source-alias  "count"

                                            ::add/desired-alias "count"}]]
                           :order-by     [[:asc
                                           [:field
                                            (meta/id :orders :created-at)
                                            {:temporal-unit      :month
                                             ::add/source-alias  "CREATED_AT"
                                             ::add/desired-alias "CREATED_AT"}]]
                                          [:asc
                                           [:field
                                            (meta/id :orders :created-at)
                                            {:temporal-unit      :day
                                             ::add/source-alias  "CREATED_AT"
                                             ::add/desired-alias "CREATED_AT_2"}]]]}}
                  (-> query
                      qp.preprocess/preprocess
                      add/add-alias-info
                      lib/->legacy-MBQL))))))))

;;; see also [[metabase.lib.join.util-test/desired-alias-should-respect-ref-name-test]]
(deftest ^:parallel preserve-field-options-name-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (driver/with-driver :h2
      (is (=? {:source-query {:source-table (meta/id :orders)
                              :breakout     [[:field (meta/id :orders :id) {}]]
                              :aggregation  [[:aggregation-options
                                              [:cum-sum [:field (meta/id :orders :id) {}]]
                                              {:name "sum", ::add/desired-alias "sum"}]]}
               :breakout     [[:field "ID" {:base-type :type/Integer, ::add/desired-alias "ID"}]
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
                :breakout     [[:field "ID" {:base-type :type/Integer}]
                               [:field "sum" {:base-type :type/Integer, :name "__cumulative_sum"}]]
                :aggregation  [[:aggregation-options
                                [:cum-sum [:field "sum" {:base-type :type/Integer}]]
                                {:name "sum"}]]}))))))

(deftest ^:parallel field-literals-test
  (testing "Correctly handle similar column names in nominal field literal refs (#41325)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (driver/with-driver :h2
        (is (=? {:fields [[:field (meta/id :orders :created-at)
                           {::add/source-alias "CREATED_AT"
                            ::add/desired-alias "CREATED_AT"}]
                          [:field (meta/id :orders :created-at)
                           {::add/source-alias "CREATED_AT"
                            ::add/desired-alias "CREATED_AT_2"}]
                          [:field (meta/id :orders :total)
                           {::add/source-alias "TOTAL"
                            ::add/desired-alias "TOTAL"}]]}
                (-> (lib.tu.macros/mbql-query orders
                      {:source-table $$orders
                       :fields [!year.created-at
                                !month.created-at
                                $total]})
                    qp.preprocess/preprocess
                    add/add-alias-info
                    lib/->legacy-MBQL
                    :query)))))))

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
                                {::add/source-alias "sum" ; FIXME This key shouldn't be here, this doesn't come from the source query.
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
                    lib/->legacy-MBQL
                    :query)))))))

(deftest ^:parallel globally-unique-join-aliases-test
  (testing "support generating globally unique join aliases for drivers that need it (e.g. MongoDB)"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (let [query (lib.tu.macros/mbql-query reviews
                      {:source-query {:source-table $$reviews
                                      :joins        [{:source-table $$products
                                                      :alias        "Products"
                                                      :condition    [:= $product-id &Products.products.id]
                                                      :fields       :all}]
                                      :breakout     [!month.&Products.products.created-at]
                                      :aggregation  [[:distinct &Products.products.id]]
                                      :filter       [:= &Products.products.category "Doohickey"]}
                       :joins        [{:source-query {:source-table $$reviews
                                                      :joins        [{:source-table $$products
                                                                      :alias        "Products"
                                                                      :condition    [:= $product-id &Products.products.id]
                                                                      :fields       :all}]
                                                      :breakout     [!month.&Products.products.created-at]
                                                      :aggregation  [[:distinct &Products.products.id]]
                                                      :filter       [:= &Products.products.category "Gizmo"]}
                                       :alias        "Q2"
                                       ;; yes, `!month.products.created-at` is a so-called 'bad reference' (should
                                       ;; include the `:join-alias`) but this test is also testing that we detect this
                                       ;; situation and handle it appropriately.
                                       :condition    [:= !month.products.created-at !month.&Q2.products.created-at]}]})]
          ;; [[metabase.lib.walk]] is depth-first so the innermost queries should get first pick of aliases I guess
          (is (=? {:source-query {:joins [{::add/alias "Products"}]}
                   :joins        [{:source-query {:joins [{::add/alias "Products_2"}]}}]}
                  (-> query
                      qp.preprocess/preprocess
                      (add/add-alias-info {:globally-unique-join-aliases? true})
                      lib/->legacy-MBQL
                      :query))))))))

;;; adapted from [[metabase.query-processor-test.model-test/model-self-join-test]]
(deftest ^:parallel model-duplicate-joins-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp    meta/metadata-provider
          mp    (lib.tu/mock-metadata-provider
                 mp
                 {:cards [{:id          1
                           :dataset-query
                           (-> (lib/query mp (lib.metadata/table mp (meta/id :products)))
                               (lib/join (-> (lib/join-clause (lib.metadata/table mp (meta/id :reviews))
                                                              [(lib/=
                                                                (lib.metadata/field mp (meta/id :products :id))
                                                                (lib.metadata/field mp (meta/id :reviews :product-id)))])
                                             (lib/with-join-fields :all)))
                               lib/->legacy-MBQL)
                           :database-id (meta/id)
                           :name        "Products+Reviews"
                           :type        :model}]})
          mp    (lib.tu/mock-metadata-provider
                 mp
                 {:cards [{:id          2
                           :dataset-query
                           (binding [lib.metadata.calculation/*display-name-style* :long]
                             (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                               (lib/aggregate $q (lib/sum (->> $q
                                                               lib/available-aggregation-operators
                                                               (m/find-first (comp #{:sum} :short))
                                                               :columns
                                                               (m/find-first (comp #{"Price"} :display-name)))))
                               (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                                  (lib/breakoutable-columns $q))
                                                    (lib/with-temporal-bucket :month)))
                               (lib/->legacy-MBQL $q)))
                           :database-id (meta/id)
                           :name        "Products+Reviews Summary"
                           :type        :model}]})
          query (binding [lib.metadata.calculation/*display-name-style* :long]
                  (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                    (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                       (lib/breakoutable-columns $q))
                                         (lib/with-temporal-bucket :month)))
                    (lib/aggregate $q (lib/avg (->> $q
                                                    lib/available-aggregation-operators
                                                    (m/find-first (comp #{:avg} :short))
                                                    :columns
                                                    (m/find-first (comp #{"Rating"} :display-name)))))
                    (lib/append-stage $q)
                    (letfn [(find-col [query display-name]
                              (or (m/find-first #(= (:display-name %) display-name)
                                                (lib/breakoutable-columns query))
                                  (throw (ex-info "Failed to find column with display name"
                                                  {:display-name display-name
                                                   :found        (map :display-name (lib/breakoutable-columns query))}))))]
                      (lib/join $q (-> (lib/join-clause (lib.metadata/card mp 2)
                                                        [(lib/=
                                                          (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                            :month)
                                                          (lib/with-temporal-bucket (find-col
                                                                                     (lib/query mp (lib.metadata/card mp 2))
                                                                                     "Reviews → Created At: Month")
                                                            :month))])
                                       (lib/with-join-fields :all))))))]
      (qp.store/with-metadata-provider mp
        (driver/with-driver :h2
          (let [preprocessed (-> query qp.preprocess/preprocess)
                expected     (-> preprocessed
                                 add/add-alias-info
                                 lib/->legacy-MBQL)]
            (testing ":source-query -> :source-query -> :joins"
              (is (=? [{:alias     "Reviews"
                        :condition [:=
                                    [:field (meta/id :products :id)
                                     {::add/source-alias "ID"}]
                                    [:field (meta/id :reviews :product-id)
                                     {:join-alias "Reviews", ::add/source-alias "PRODUCT_ID"}]]}]
                      (-> expected :query :source-query :source-query :joins))))
            (testing ":source-query -> :source-query"
              ;; we should be using `Reviews__` here for names
              (is (=? {:fields [[:field (meta/id :products :id)
                                 {::add/source-alias "ID", ::add/desired-alias "ID"}]
                                [:field (meta/id :products :ean)
                                 {::add/source-alias "EAN", ::add/desired-alias "EAN"}]
                                [:field (meta/id :products :title)
                                 {::add/source-alias "TITLE", ::add/desired-alias "TITLE"}]
                                [:field (meta/id :products :category)
                                 {::add/source-alias "CATEGORY", ::add/desired-alias "CATEGORY"}]
                                [:field (meta/id :products :vendor)
                                 {::add/source-alias "VENDOR", ::add/desired-alias "VENDOR"}]
                                [:field (meta/id :products :price)
                                 {::add/source-alias "PRICE", ::add/desired-alias "PRICE"}]
                                [:field (meta/id :products :rating)
                                 {::add/source-alias "RATING", ::add/desired-alias "RATING"}]
                                [:field (meta/id :products :created-at)
                                 {::add/source-alias "CREATED_AT", ::add/desired-alias "CREATED_AT"}]
                                [:field (meta/id :reviews :id)
                                 {:join-alias        "Reviews"
                                  ::add/source-alias "ID", ::add/desired-alias "Reviews__ID"}]
                                [:field (meta/id :reviews :product-id)
                                 {:join-alias "Reviews", ::add/source-alias "PRODUCT_ID", ::add/desired-alias "Reviews__PRODUCT_ID"}]
                                [:field (meta/id :reviews :reviewer)
                                 {:join-alias "Reviews", ::add/source-alias "REVIEWER", ::add/desired-alias "Reviews__REVIEWER"}]
                                [:field (meta/id :reviews :rating)
                                 {:join-alias "Reviews", ::add/source-alias "RATING", ::add/desired-alias "Reviews__RATING"}]
                                [:field (meta/id :reviews :body)
                                 {:join-alias "Reviews", ::add/source-alias "BODY", ::add/desired-alias "Reviews__BODY"}]
                                [:field (meta/id :reviews :created-at)
                                 {:join-alias "Reviews", ::add/source-alias "CREATED_AT", ::add/desired-alias "Reviews__CREATED_AT"}]]}
                      (-> expected :query :source-query :source-query (dissoc :joins)))))
            (testing ":source-query"
              ;; we should be using `Reviews__` here for names
              (is (=? {:source-query/model? true
                       :breakout            [[:field
                                              "Reviews__CREATED_AT"
                                              {::add/source-alias "Reviews__CREATED_AT", ::add/desired-alias "Reviews__CREATED_AT"}]]
                       :aggregation         [[:aggregation-options
                                              [:avg [:field "RATING" {::add/source-alias "RATING"}]]
                                              {::add/desired-alias "avg"}]]
                       :order-by            [[:asc
                                              [:field
                                               "Reviews__CREATED_AT"
                                               {::add/source-alias "Reviews__CREATED_AT", ::add/desired-alias "Reviews__CREATED_AT"}]]]}
                      (-> expected :query :source-query (dissoc :source-query)))))))))))

;;; adapted from [[metabase.query-processor-test.uuid-test/joined-uuid-query-test]]
(deftest ^:parallel resolve-field-missing-join-alias-test
  (testing "should resolve broken refs missing join-alias correctly"
    (let [mp      lib.tu.uuid-dogs-metadata-provider/metadata-provider
          query   {:database 1
                   :type     :query
                   :query    {:source-table 1                 ; people
                              :joins        [{:source-table 2 ; dogs
                                              :condition    [:=
                                                             [:field #_dogs.person-id 5 {:join-alias "d"}]
                                                             [:field #_people.id 1 nil]]
                                              :alias        "d"
                                              :fields       :all}]
                              :filter [:=
                                       ;; incorrect field ref! Should have the join alias `d`. But we should be able to
                                       ;; figure it out anyway.
                                       [:field #_dogs.id 4 nil]
                                       "00000000-0000-0000-0000-000000000000"]}}]
      (qp.store/with-metadata-provider mp
        (driver/with-driver :h2
          (is (=? {:filter [:=
                            [:field
                             4
                             {::add/source-table "d", ::add/source-alias "name"}]
                            [:value "00000000-0000-0000-0000-000000000000" {}]]}
                  (-> query
                      qp.preprocess/preprocess
                      add/add-alias-info
                      lib/->legacy-MBQL
                      :query))))))))

(deftest ^:parallel nested-literal-boolean-expression-with-name-collisions-test
  (testing "nested literal boolean expression references with name collisions in filter and case clauses"
    ;; Test boolean->comparison conversion for drivers that need it. See boolean_to_comparison.clj. Other drivers
    ;; should support these queries without rewriting top-level booleans in conditions.
    (let [true-value  [:value {:base-type :type/Boolean, :effective-type :type/Boolean, :lib/expression-name "T"} true]
          false-value [:value {:base-type :type/Boolean, :effective-type :type/Boolean, :lib/expression-name "F"} false]
          query       (lib.tu.macros/mbql-5-query nil
                        {:stages [{:source-table $$orders
                                   :expressions  [true-value
                                                  false-value]
                                   :fields       [[:expression {} "T"]
                                                  [:expression {} "F"]]}
                                  {:expressions [true-value
                                                 false-value]
                                   :fields      [[:expression {} "T"]
                                                 [:expression {} "F"]
                                                 [:field {:base-type :type/Boolean} "T"]
                                                 [:field {:base-type :type/Boolean} "F"]]}
                                  {:expressions [true-value
                                                 false-value]
                                   :aggregation [[:count-where {} *T/Boolean]
                                                 [:count-where {} *F/Boolean]]
                                   :filters     [[:or {}
                                                  [:expression {} "T"]
                                                  [:expression {} "F"]]
                                                 [:or {}
                                                  [:field {:base-type :type/Boolean} "T"]
                                                  [:field {:base-type :type/Boolean} "F"]]]}]})]
      (testing "Sanity check: Lib should return deduplicated desired aliases for the second stage"
        (is (=? [{:lib/source-column-alias  "T"
                  :lib/desired-column-alias "T"
                  :lib/source               :source/expressions}
                 {:lib/source-column-alias  "F"
                  :lib/desired-column-alias "F"
                  :lib/source               :source/expressions}
                 {:lib/source-column-alias  "T"
                  :lib/desired-column-alias "T_2"
                  :lib/source               :source/previous-stage}
                 {:lib/source-column-alias  "F"
                  :lib/desired-column-alias "F_2"
                  :lib/source               :source/previous-stage}]
                (lib/returned-columns
                 (lib/query meta/metadata-provider query)
                 1))))
      (is (=? {:stages [{}
                        {:fields [[:expression
                                   {::add/source-table  ::add/none
                                    ::add/desired-alias "T"}
                                   "T"]
                                  [:expression
                                   {::add/source-table  ::add/none
                                    ::add/desired-alias "F"}
                                   "F"]
                                  [:field
                                   {::add/source-table  ::add/source
                                    ::add/source-alias  "T"
                                    ::add/desired-alias "T_2"}
                                   "T"]
                                  [:field
                                   {::add/source-table  ::add/source
                                    ::add/source-alias  "F"
                                    ::add/desired-alias "F_2"}
                                   "F"]]}
                        {:filters [[:or {}
                                    [:expression
                                     {::add/source-table ::add/none}
                                     "T"]
                                    [:expression
                                     {::add/source-table ::add/none}
                                     "F"]]
                                   [:or {}
                                    [:field
                                     {::add/source-table ::add/source, ::add/source-alias "T"}
                                     "T"]
                                    [:field
                                     {::add/source-table ::add/source, ::add/source-alias "F"}
                                     "F"]]]}]}
              (add-alias-info query))))))

(deftest ^:parallel respect-crazy-long-native-identifiers-test
  (testing "respect crazy-long identifiers returned by native stages (#47584)"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id              1
                           :dataset-query   {:type     :native
                                             :database (meta/id)
                                             :native   {:query "SELECT *"}}
                           :result-metadata [{:base_type      :type/Text
                                              :database_type  "CHARACTER VARYING"
                                              :display_name   "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                              :effective_type :type/Text
                                              :name           "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                              :lib/source     :source/native}]}]})
          query (-> (lib/query mp (lib.metadata/card mp 1))
                    lib/append-stage)]
      (is (=? {:stages [{:native "SELECT *"}
                        {:fields [[:field
                                   {::add/desired-alias "Total_number_of_people_from_each_state_separated_by_00028d48"
                                    ::add/source-alias  "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                    ::add/source-table  ::add/source}
                                   "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"]]}
                        {:fields [[:field
                                   {::add/desired-alias "Total_number_of_people_from_each_state_separated_by_00028d48"
                                    ::add/source-alias  "Total_number_of_people_from_each_state_separated_by_00028d48"
                                    ::add/source-table  ::add/source}
                                   "Total_number_of_people_from_each_state_separated_by_00028d48"]]}]}
              (add-alias-info query))))))

;;; in the future when we remove all the roundtripping that happens inside of the QP then we can remove this test
;;; entirely.
(deftest ^:parallel additional-keys-should-survive-preprocessing-test
  (driver/with-driver :h2
    (let [query (lib/query
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
                                   :condition    [:= $product-id &PRODUCTS__via__PRODUCT_ID.products.id]}]}))]
      (is (=? [[:expression {::add/source-table ::add/none, ::add/desired-alias "pivot-grouping"} "pivot-grouping"]
               [:expression {::add/source-table ::add/none, ::add/desired-alias "pivot-grouping"} "pivot-grouping"]]
              (lib.util.match/match (-> query
                                        add/add-alias-info
                                        qp.preprocess/preprocess)
                :expression))))))

(deftest ^:parallel remapped-columns-in-joined-source-queries-test
  (testing "Make sure remapped columns are given correct aliases and escaped correctly for drivers like Oracle"
    (let [mp                    (-> meta/metadata-provider
                                    (lib.tu/remap-metadata-provider (meta/id :orders :product-id) (meta/id :products :title)))
          query                 (lib/query
                                 mp
                                 (lib.tu.macros/mbql-query products
                                   {:joins    [{:source-query {:source-table $$orders
                                                               :breakout     [$orders.product-id]
                                                               :aggregation  [[:sum $orders.quantity]]}
                                                :alias        "Orders"
                                                :condition    [:= $id &Orders.orders.product-id]
                                                ;; we can get title since product_id is remapped to title.
                                                ;;
                                                ;; TODO (Cam 9/16/25) -- says who? This is not something we support in
                                                ;; the FE.
                                                :fields       [[:field %products.title {:join-alias   "Orders"
                                                                                        :source-field (meta/id :orders :product-id)}]
                                                               &Orders.*sum/Integer]}]
                                    :fields   [$title $category]
                                    :order-by [[:asc $id]]
                                    :limit    3}))
          ;; this is a basically the same as Oracle's behavior for truncating aliases
          query                 (binding [add/*escape-alias-fn* (fn [_driver s]
                                                                  (let [s (str/replace s #"[\"\u0000]" "_")]
                                                                    (lib/truncate-alias s 30)))]
                                  (add-alias-info query))
          stage                 (-> query :stages first)
          stage-join            (-> stage :joins first)
          stage-join-stage      (-> stage-join :stages first)
          stage-join-stage-join (-> stage-join-stage :joins first)]
      (testing ":stages -> first -> :joins -> first -> :stages -> first -> :joins -> first"
        (is (=? {:stages              [{:source-table (meta/id :products)}]
                 ::add/original-alias "PRODUCTS__via__PRODUCT_ID"
                 ::add/alias          "PRODUCTS__via__PRODUCT_ID"
                 :alias               "PRODUCTS__via__PRODUCT_ID"
                 :conditions          [[:= {}
                                        [:field {::add/source-table (meta/id :orders)
                                                 ::add/source-alias "PRODUCT_ID"}
                                         any?]
                                        [:field {:join-alias        "PRODUCTS__via__PRODUCT_ID"
                                                 ::add/source-alias "ID"
                                                 ::add/source-table "PRODUCTS__via__PRODUCT_ID"}
                                         any?]]]}
                stage-join-stage-join)))
      (testing ":stages -> first -> :joins -> first -> :stages -> first"
        (is (=? {:breakout    [[:field {::add/source-alias  "TITLE"
                                        :join-alias         "PRODUCTS__via__PRODUCT_ID"
                                        ::add/desired-alias "PRODUCTS__via__PRODUC_8b0b9fea"
                                        ::add/source-table  "PRODUCTS__via__PRODUCT_ID"}
                                any?]
                               [:field {::add/source-alias  "PRODUCT_ID"
                                        ::add/desired-alias "PRODUCT_ID"
                                        ::add/source-table  (meta/id :orders)}
                                any?]]
                 :order-by    [[:asc {}
                                [:field {::add/source-alias  "TITLE"
                                         :join-alias         "PRODUCTS__via__PRODUCT_ID"
                                         ::add/desired-alias "PRODUCTS__via__PRODUC_8b0b9fea"
                                         ::add/source-table  "PRODUCTS__via__PRODUCT_ID"}
                                 any?]]
                               [:asc {}
                                [:field
                                 {::add/source-alias "PRODUCT_ID",
                                  ::add/desired-alias "PRODUCT_ID",
                                  ::add/source-table (meta/id :orders)}
                                 any?]]]
                 :aggregation [[:sum {::add/source-table  ::add/none
                                      ::add/source-alias  "sum"
                                      ::add/desired-alias "sum"}
                                [:field {::add/source-table  (meta/id :orders)
                                         ::add/source-alias  "QUANTITY"
                                         ::add/desired-alias nil}
                                 any?]]]}
                (dissoc stage-join-stage :joins))))
      (testing ":stages -> first -> :joins -> first"
        (is (=? {:conditions [[:= {}
                               [:field {::add/source-table (meta/id :products)
                                        ::add/source-alias "ID"}
                                any?]
                               [:field {:join-alias        "Orders"
                                        ::add/source-alias "PRODUCT_ID"
                                        ::add/source-table "Orders"}
                                any?]]]}
                (dissoc stage-join :stages))))
      (testing ":stages -> first"
        (is (=? {:fields [[:field {::add/desired-alias "TITLE"
                                   ::add/source-alias  "TITLE"
                                   ::add/source-table  (meta/id :products)}
                           any?]
                          [:field {::add/desired-alias "CATEGORY"
                                   ::add/source-alias  "CATEGORY"
                                   ::add/source-table  (meta/id :products)}
                           any?]
                          [:field {:join-alias         "Orders"
                                   ::add/desired-alias "Orders__PRODUCTS__via_6256d0ed"
                                   ::add/source-alias  "PRODUCTS__via__PRODUC_8b0b9fea"
                                   ::add/source-table  "Orders"}
                           any?]
                          [:field {:join-alias         "Orders"
                                   ::add/desired-alias "Orders__sum"
                                   ::add/source-alias  "sum"
                                   ::add/source-table  "Orders"}
                           "sum"]]}
                (dissoc stage :joins)))))))

(deftest ^:parallel nested-fields-test
  (let [mp    metabase.lib.field-test/grandparent-parent-child-metadata-provider
        query (lib/query
               mp
               (lib.tu.macros/mbql-query venues
                 {:order-by [[:asc [:field (metabase.lib.field-test/grandparent-parent-child-id :grandparent) nil]]
                             [:asc [:field (metabase.lib.field-test/grandparent-parent-child-id :parent) nil]]
                             [:asc [:field (metabase.lib.field-test/grandparent-parent-child-id :child) nil]]]}))]
    (is (=? {:order-by [[:asc {}
                         [:field {::add/source-table  (meta/id :venues)
                                  ::add/source-alias  "grandparent"
                                  ::add/desired-alias "grandparent"}
                          any?]]
                        [:asc {}
                         [:field {::add/source-table  (meta/id :venues)
                                  ::add/nfc-path      ["grandparent"]
                                  ::add/source-alias  "parent"
                                  ::add/desired-alias "parent"}
                          any?]]
                        [:asc {}
                         [:field {::add/source-table  (meta/id :venues)
                                  ::add/nfc-path      ["grandparent" "parent"]
                                  ::add/source-alias  "child"
                                  ::add/desired-alias "child"}
                          any?]]]}
            (-> (add-alias-info query)
                :stages
                first)))))

(deftest ^:parallel multiple-breakouts-on-same-column-test
  (let [query (lib/query
               meta/metadata-provider
               {:database (meta/id)
                :type     :query
                :query    {:source-table (meta/id :orders)
                           :aggregation  [[:count]]
                           :breakout     [[:field
                                           (meta/id :orders :total)
                                           {:base-type :type/Float, :binning {:strategy :num-bins, :num-bins 10}}]
                                          [:field
                                           (meta/id :orders :total)
                                           {:base-type :type/Float, :binning {:strategy :num-bins, :num-bins 50}}]]}})]
    (is (=? {:aggregation [[:count
                            {::add/source-table  ::add/none
                             ::add/source-alias  "count"
                             ::add/desired-alias "count"}]]
             :breakout    [[:field
                            {:binning            {:strategy :num-bins, :num-bins 10}
                             ::add/source-table  (meta/id :orders)
                             ::add/source-alias  "TOTAL"
                             ::add/desired-alias "TOTAL"}
                            any?]
                           [:field
                            {:binning            {:strategy :num-bins, :num-bins 50}
                             ::add/source-table  (meta/id :orders)
                             ::add/source-alias  "TOTAL"
                             ::add/desired-alias "TOTAL_2"}
                            any?]]}
            (-> (add-alias-info query)
                :stages
                first)))))

;;; see also [[metabase.driver.sql.query-processor-test/evil-field-ref-for-an-expression-test]]
;;; and [[metabase-enterprise.sandbox.query-processor.middleware.sandboxing-test/evil-field-ref-for-an-expression-test]]
(deftest ^:parallel resolve-incorrect-field-ref-for-expression-test
  (testing "resolve the incorrect use of a :field ref for an expression correctly"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:fields      [[:expression "my_numberLiteral"]]
                    :expressions {"my_numberLiteral" [:value 1 {:base_type :type/Integer}]}
                    :filter      [:=
                                  [:field "my_numberLiteral" {:base-type :type/Integer}]
                                  [:value 1 {:base_type :type/Integer}]]}))]
      (is (=? [:=
               {}
               ;; convert the ref to an `:expression` ref so it can get compiled correctly.
               [:expression
                {::add/desired-alias "my_numberLiteral"
                 ::add/source-alias  "my_numberLiteral"
                 ::add/source-table  ::add/none}
                "my_numberLiteral"]
               [:value {} 1]]
              (-> (add-alias-info query)
                  :stages
                  first
                  :filters
                  first))))))

(deftest ^:parallel field-name-ref-in-first-stage-test
  (testing "Should add correct alias info if we use a field name ref in the first stage of a query"
    (let [query (lib/query
                 meta/metadata-provider
                 {:type       :query
                  :database   (meta/id)
                  :query      {:source-table (meta/id :products)}
                  :parameters [{:type   :id
                                :value  [144]
                                :id     "92eb69ea"
                                :target [:dimension [:field "ID" {:base-type :type/BigInteger}]]}]})]
      (is (=? [:=
               {}
               [:field
                {::add/source-alias "ID"
                 ::add/source-table (meta/id :products)}
                "ID"]
               [:value {} 144]]
              (-> (add-alias-info query)
                  :stages
                  first
                  :filters
                  first))))))

(deftest ^:parallel fallback-resolve-in-later-stage-with-join-alias-test
  (testing "when generating fallback metadata from an earlier stage, include its :join-alias (#66464)"
    (let [mp    (-> (lib.tu/metadata-provider-with-mock-card
                     {:id            1
                      :name          "Orders Model"
                      :type          :model
                      :dataset-query (lib/query meta/metadata-provider (meta/table-metadata :orders))})
                    (lib.tu/metadata-provider-with-mock-card
                     {:id            2
                      :name          "Products Model"
                      :type          :model
                      :dataset-query (lib/query meta/metadata-provider (meta/table-metadata :products))}))
          query (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/join (lib/join-clause (lib.metadata/card mp 2)))
                    ;; Deliberately using field IDs rather than names here, and to tables that are not otherwise part
                    ;; of this query. Some Metrics v2 queries in the wild look like this and we're trying not to break
                    ;; them; see #66464.
                    (lib/aggregate (lib// (lib/distinct-where (meta/field-metadata :orders :user-id)
                                                              (-> (meta/field-metadata :people :name)
                                                                  lib/ref
                                                                  (lib/with-join-alias "Products Model - Product")
                                                                  lib/not-null))
                                          (lib/distinct (meta/field-metadata :orders :user-id)))))]
      (is (=? [:/ {}
               ;; numerator
               [:distinct-where {}
                vector?
                [:!= {}
                 [:field {:join-alias         "Products Model - Product"
                          ::add/source-table  "Products Model - Product"
                          ::add/source-alias  "NAME"
                          ::add/desired-alias nil}
                  (meta/id :people :name)]
                 [:value {} nil]]]
               ;; denominator
               [:distinct {} vector?]]
              (-> (add-alias-info query)
                  lib/aggregations
                  first))))))
