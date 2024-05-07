(ns metabase.query-processor.util.nest-query-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.test :as mt]
   [metabase.util :as u]))

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
      (is (=? (lib.tu.macros/$ids venues
                {:source-query {:source-table $$venues
                                :expressions  {"double_price" [:* [:field %price {}] 2]}
                                :fields       [[:field %price {}]
                                               [:expression "double_price" {}]]}
                 :breakout     [[:field "PRICE" {}]
                                [:field "double_price" {:base-type :type/Integer}]]
                 :aggregation  [[:aggregation-options [:count] {:name "count"}]]
                 :order-by     [[:asc [:field "PRICE" {}]]
                                [:asc [:field "double_price" {}]]]})
              (-> (lib.tu.macros/mbql-query venues
                    {:expressions {"double_price" [:* $price 2]}
                     :breakout    [$price
                                   [:expression "double_price"]]
                     :aggregation [[:count]]})
                  qp.preprocess/preprocess
                  nest-expressions))))))

(deftest ^:parallel multiple-expressions-test
  (testing "Make sure the nested version of the query doesn't mix up expressions if we have ones that reference others"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (=? (lib.tu.macros/$ids venues
                  {:source-query {:source-table $$venues
                                  :expressions  {"big_price"
                                                 [:+
                                                  [:field %price {}]
                                                  2]

                                                 "my_cool_new_field"
                                                 [:/
                                                  [:field %price {}]
                                                  [:expression "big_price" {}]]}
                                  :fields [[:field %id {}]
                                           [:expression "my_cool_new_field" {}]]}
                   :breakout [[:field "my_cool_new_field" {:base-type :type/Float}]]
                   :order-by [[:asc [:field "ID" {}]]
                              [:asc [:field "my_cool_new_field" {}]]]
                   :limit    3})
                (-> (lib.tu.macros/mbql-query venues
                      {:expressions {"big_price"         [:+ $price 2]
                                     "my_cool_new_field" [:/ $price [:expression "big_price"]]}
                       :breakout    [[:expression "my_cool_new_field"]]
                       :order-by    [[:asc $id]]
                       :limit       3})
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
            (is (=? (lib.tu.macros/$ids venues
                      {:source-query {:source-query {:source-query {:source-table $$venues
                                                                    :expressions {"x" [:*
                                                                                       [:field %price {}]
                                                                                       2]}
                                                                    :fields [[:field %id {}]
                                                                             [:expression "x" {}]]}
                                                     :breakout [[:field "ID" {}]
                                                                [:field "x" {:base-type :type/Integer}]]}
                                      :expressions {"x" [:*
                                                         [:field %price {}]
                                                         4]}
                                      :fields [[:field "ID" {}]
                                               [:expression "x" {}]]}
                       :breakout [[:field "ID" {}]
                                  [:field "x" {:base-type :type/Integer}]]
                       :limit 1})
                    (nest-expressions query)))))))))

(deftest ^:parallel nest-expressions-ignore-source-queries-from-joins-test-e2e-test
  (testing "Ignores source-query from joins (#20809)"
    (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                             [(mt/mbql-query reviews
                                {:breakout [$product_id]
                                 :aggregation [[:count]]
                                 ;; filter on an implicit join
                                 :filter [:= $product_id->products.category "Doohickey"]})])]
      ;; the result returned is not important, just important that the query is valid and completes
      (is (vector?
           (mt/rows
            (qp/process-query
             (lib/query
              metadata-provider
              (mt/mbql-query orders
                {:joins [{:source-table "card__1"
                          :alias "Question 1"
                          :condition [:=
                                      $product_id
                                      [:field
                                       %reviews.product_id
                                       {:join-alias "Question 1"}]]
                          :fields :all}]
                 :expressions {"CC" [:+ 1 1]}
                 :limit 2})))))))))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel nest-expressions-with-joins-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (testing "If there are any `:joins`, those need to be nested into the `:source-query` as well."
        (is (=? (lib.tu.macros/$ids venues
                  {:source-query {:source-table $$venues
                                  :joins        [{:strategy     :left-join
                                                  :condition    [:=
                                                                 [:field %category-id {}]
                                                                 [:field %category-id {}]]
                                                  :source-query {:source-table $$venues
                                                                 :aggregation  [[:aggregation-options
                                                                                 [:max [:field %price {}]]
                                                                                 {:name "MaxPrice"}]
                                                                                [:aggregation-options
                                                                                 [:avg
                                                                                  [:field %price {}]]
                                                                                 {:name "AvgPrice"}]
                                                                                [:aggregation-options
                                                                                 [:min [:field %price {}]]
                                                                                 {:name "MinPrice"}]]
                                                                 :breakout     [[:field %category-id {}]]
                                                                 :order-by     [[:asc [:field %category-id {}]]]}
                                                  :alias        "CategoriesStats"
                                                  :fields       [[:field %category-id {:join-alias "CategoriesStats"}]
                                                                 [:field "MaxPrice" {:join-alias "CategoriesStats"}]
                                                                 [:field "AvgPrice" {:join-alias "CategoriesStats"}]
                                                                 [:field "MinPrice" {:join-alias "CategoriesStats"}]]}]
                                  :expressions  {"RelativePrice" [:/
                                                                  [:field %price {}]
                                                                  [:field "AvgPrice" {:join-alias "CategoriesStats"}]]}
                                  :fields       [[:field %id {}]
                                                 [:field %name {}]
                                                 [:field %category-id {}]
                                                 [:field %latitude {}]
                                                 [:field %longitude {}]
                                                 [:field %price {}]
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
                                  [:field "RelativePrice" {:base-type :type/Float}]
                                  [:field "CategoriesStats__CATEGORY_ID" {}]
                                  [:field "CategoriesStats__MaxPrice" {}]
                                  [:field "CategoriesStats__AvgPrice" {}]
                                  [:field "CategoriesStats__MinPrice" {}]]
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
                                  :fields       [[:field %price {:temporal-unit :default}]
                                                 [:expression "test" {}]]}
                   :breakout     [[:field "PRICE" {:temporal-unit :day}]
                                  [:field "test" {}]]
                   :limit        1})
                (-> (lib.tu.macros/mbql-query venues
                      {:expressions {"test" ["*" 1 1]}
                       :breakout    [$price
                                     [:expression "test"]]
                       :limit       1})
                    nest-expressions)))))))

(deftest ^:parallel multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (driver/with-driver :h2
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (=? (lib.tu.macros/$ids orders
                  {:source-query {:source-table $$orders
                                  :joins        [{:source-table $$products
                                                  :alias        "PRODUCTS__via__PRODUCT_ID"
                                                  :condition    [:=
                                                                 [:field %product-id {}]
                                                                 [:field %products.id {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                  :strategy     :left-join
                                                  :fk-field-id  %product-id}]
                                  :expressions  {"pivot-grouping" [:abs 0]}
                                  :fields       [[:field %created-at {:temporal-unit :default}]
                                                 [:expression "pivot-grouping" {}]
                                                 [:field %products.category {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]}
                   :breakout    [[:field "PRODUCTS__via__PRODUCT_ID__CATEGORY" {}]
                                 [:field "CREATED_AT" {:temporal-unit :year}]
                                 [:field "pivot-grouping" {}]]
                   :aggregation [[:aggregation-options [:count] {:name "count"}]]
                   :order-by    [[:asc [:field "PRODUCTS__via__PRODUCT_ID__CATEGORY" {}]]
                                 [:asc [:field "CREATED_AT" {:temporal-unit :year}]]
                                 [:asc [:field "pivot-grouping" {}]]]})
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
                    nest-expressions)))))))

(deftest ^:parallel uniquify-aliases-test
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? (lib.tu.macros/$ids products
                {:source-query       {:source-table $$products
                                      :expressions  {"CATEGORY" [:concat
                                                                 [:field %category {}]
                                                                 "2"]}
                                      :fields       [[:field %category {}]
                                                     [:expression "CATEGORY" {}]]}
                 :breakout           [[:field "CATEGORY" {}]
                                      [:field "CATEGORY_2" {}]]
                 :aggregation        [[:aggregation-options [:count] {:name "count"}]]
                 :order-by           [[:asc [:field "CATEGORY_2" {}]]
                                      [:asc [:field "CATEGORY" {}]]] ; implicit order by gets added after explicit one.
                 :limit              1})
              (-> (lib.tu.macros/mbql-query products
                    {:expressions {"CATEGORY" [:concat $category "2"]}
                     :breakout    [$category
                                   [:expression "CATEGORY"]]
                     :aggregation [[:count]]
                     :order-by    [[:asc [:expression "CATEGORY"]]]
                     :limit       1})
                  qp.preprocess/preprocess
                  :query
                  nest-query/nest-expressions))))))

(deftest ^:parallel uniquify-aliases-test-2
  (driver/with-driver :h2
    (qp.store/with-metadata-provider meta/metadata-provider
      (testing "multi-stage query with an expression name that matches a table column (#39059)"
        (is (=? (lib.tu.macros/$ids orders
                  {:source-query {:breakout     [[:field "ID" {}]
                                                 [:field "SUBTOTAL" {}]
                                                 [:field "DISCOUNT" {}]]
                                  :source-query {:expressions  {"DISCOUNT" [:coalesce [:field %discount {}] 0]}
                                                 :fields       [[:field %id {}]
                                                                [:field %subtotal {}]
                                                                [:expression "DISCOUNT" {}]]
                                                 :source-table $$orders}}
                   :breakout [[:field "ID" {}]
                              [:field "SUBTOTAL" {}]
                              [:field "DISCOUNT" {}]]})
                (-> (lib.tu.macros/$ids orders
                      {:type     :query
                       :database (meta/id)
                       :query    {:source-query {:expressions  {"DISCOUNT" [:coalesce $discount 0]}
                                                 :breakout     [$id
                                                                $subtotal
                                                                [:expression "DISCOUNT"]]
                                                 :source-table $$orders}
                                  :source-query/model? true
                                  :breakout            [[:field "ID"       {:base-type :type/Integer}]
                                                        [:field "SUBTOTAL" {:base-type :type/Float}]
                                                        [:field "DISCOUNT" {:base-type :type/Float}]]}})
                    qp.preprocess/preprocess
                    :query
                    nest-query/nest-expressions)))))))

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
                                                     [:field %created-at {:temporal-unit :default}]]},
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
                                   ;; TODO -- these should PROBABLY be nominal field literal refs (string name, not
                                   ;; integer ID), but we can fix that later.
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
