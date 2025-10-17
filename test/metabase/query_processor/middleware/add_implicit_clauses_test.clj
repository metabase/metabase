(ns ^:mb/driver-tests metabase.query-processor.middleware.add-implicit-clauses-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(defn- add-implicit-clauses
  ([query]
   (add-implicit-clauses meta/metadata-provider query))

  ([metadata-provider query]
   (if (= (:lib/type query) :mbql/query)
     (qp.add-implicit-clauses/add-implicit-clauses query)
     (-> (lib/query metadata-provider query)
         qp.add-implicit-clauses/add-implicit-clauses
         lib/->legacy-MBQL))))

(defn- add-implicit-clauses-to-legacy-inner-query
  ([inner-query]
   (add-implicit-clauses-to-legacy-inner-query meta/metadata-provider inner-query))

  ([metadata-provider inner-query]
   (-> (lib/query-from-legacy-inner-query metadata-provider (meta/id) inner-query)
       add-implicit-clauses
       lib/->legacy-MBQL
       :query)))

(deftest ^:parallel add-order-bys-for-breakouts-test
  (testing "we should add order-bys for breakout clauses"
    (is (= {:source-table (meta/id :venues)
            :breakout     [[:field (meta/id :venues :price) nil]]
            :order-by     [[:asc [:field (meta/id :venues :price) nil]]]}
           (add-implicit-clauses-to-legacy-inner-query
            {:source-table (meta/id :venues)
             :breakout     [[:field (meta/id :venues :price) nil]]})))))

(deftest ^:parallel add-order-bys-for-breakouts-test-2
  (testing "we should add order-bys for breakout clauses"
    (testing "Add Field to existing order-by"
      (is (=? (lib.tu.macros/mbql-query orders
                {:breakout [$product-id->products.category]
                 :order-by [[:asc $created-at]
                            [:asc $product-id->products.category]]})
              (update (lib.tu.macros/mbql-query orders
                        {:breakout [$product-id->products.category]
                         :order-by [[:asc $created-at]]})
                      :query add-implicit-clauses-to-legacy-inner-query))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-3
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                              {:breakout [$product-id->products.category]
                               :order-by [[:asc $product-id->products.category]]})]
        (is (= query
               (add-implicit-clauses-to-legacy-inner-query query)))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-4
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                              {:breakout [$product-id->products.category]
                               :order-by [[:desc $product-id->products.category]]})]
        (is (= query
               (add-implicit-clauses-to-legacy-inner-query query)))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-5
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (testing "With a datetime-field"
        (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                                {:breakout [!day.created-at]
                                 :order-by [[:asc !day.created-at]]})]
          (is (= query
                 (add-implicit-clauses-to-legacy-inner-query query))))))))

(deftest ^:parallel add-order-bys-for-no-aggregations-test
  (testing "We should add sorted implicit Fields for a query with no aggregations"
    (is (=? (:query
             (lib.tu.macros/mbql-query venues
               {:fields [[:field %id {}]
                         [:field %name {}]
                         [:field %category-id {}]
                         [:field %latitude {}]
                         [:field %longitude {}]
                         [:field %price {}]]}))
            (add-implicit-clauses-to-legacy-inner-query (:query (lib.tu.macros/mbql-query venues)))))))

(deftest ^:parallel sort-by-field-position-test
  (testing "when adding sorted implicit Fields, Field positions should be taken into account"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:fields [{:id        1
                         :table-id  (meta/id :venues)
                         :position  100
                         :name      "bbbbb"
                         :base-type :type/Text}
                        {:id        2
                         :table-id  (meta/id :venues)
                         :position  101
                         :name      "aaaaa"
                         :base-type :type/Text}]})]
      (is (=? (:query
               (lib.tu.macros/mbql-query venues
                 {:fields [;; all fields with lower positions should get sorted first according to rules above
                           [:field %id {}]
                           [:field %name {}]
                           [:field %category-id {}]
                           [:field %latitude {}]
                           [:field %longitude {}]
                           [:field %price {}]
                           ;; followed by position = 100, then position = 101
                           [:field 1 {}]
                           [:field 2 {}]]}))
              (add-implicit-clauses-to-legacy-inner-query mp (:query (lib.tu.macros/mbql-query venues))))))))

(deftest ^:parallel default-bucketing-test
  (testing "datetime Fields should get default bucketing of :day"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:fields [{:id        1
                         :table-id  (meta/id :venues)
                         :position  2
                         :name      "aaaaa"
                         :base-type :type/DateTime}]})]
      (is (lib.types.isa/temporal? (lib.metadata/field mp 1)))
      (is (=? (:query
               (lib.tu.macros/mbql-query venues
                 {:fields [[:field %id {}]
                           [:field %name {}]
                           [:field 1 {}]
                           [:field %category-id {}]
                           [:field %latitude {}]
                           [:field %longitude {}]
                           [:field %price {}]]}))
              (add-implicit-clauses-to-legacy-inner-query mp (:query (lib.tu.macros/mbql-query venues))))))))

(deftest ^:parallel add-implicit-fields-for-source-queries-test
  (testing "We should add implicit Fields when we have source queries"
    (is (=? {:fields [[:field "DATE" {:inherited-temporal-unit :month}]
                      [:field "count" {:base-type :type/Integer}]]}
            (add-implicit-clauses-to-legacy-inner-query
             (:query (lib.tu.macros/mbql-query checkins
                       {:source-query {:source-table $$checkins
                                       :aggregation  [[:count]]
                                       :breakout     [!month.$date]}})))))))

(deftest ^:parallel expression-with-only-field-in-source-query-test
  (testing "Field coming from expression in source query should have string id"
    (is (some #(when (= % [:field "ccprice" {:base-type :type/Integer}]) %)
              (-> (lib.tu.macros/mbql-query nil
                    {:source-query {:source-table $$venues
                                    :expressions  {"ccprice" $venues.price}}})
                  :query add-implicit-clauses-to-legacy-inner-query :fields)))))

(deftest ^:parallel joined-field-test
  (testing "When adding implicit `:fields` clauses, should include `join-alias` clauses for joined fields (#14745)"
    (doseq [field-ref (lib.tu.macros/$ids
                        [[:field %categories.name {:join-alias "c"}]
                         [:field %categories.name {:join-alias "c", :temporal-unit :default}]])]
      (testing (format "field ref = %s" (pr-str field-ref))
        (let [query (lib.tu.macros/mbql-query venues
                      {:source-query    {:source-table $$venues
                                         :fields       [$id &c.categories.name $category-id->categories.name]
                                         :joins        [{:fields       [&c.categories.name]
                                                         :source-table $$categories
                                                         :strategy     :left-join
                                                         :condition    [:= $category-id &c.categories.id]
                                                         :alias        "c"}]}
                       :source-metadata [{:table_id      $$venues
                                          :semantic_type :type/PK
                                          :name          "ID"
                                          :field_ref     $id
                                          :id            %id
                                          :display_name  "ID"
                                          :base_type     :type/BigInteger}
                                         {:table_id      $$categories
                                          :semantic_type :type/Name
                                          :name          "NAME"
                                          :field_ref     field-ref
                                          :id            %categories.name
                                          :display_name  "c → Name"
                                          :base_type     :type/Text}
                                         {:table_id     $$categories
                                          :name         "NAME"
                                          :field_ref    $category-id->categories.name
                                          :id           %categories.name
                                          :display_name "Category → Name"
                                          :base_type    :type/Text}]})]
          (is (= [[:field "ID" {:base-type :type/BigInteger}]
                  [:field "c__NAME" {:base-type :type/Text}]
                  [:field "CATEGORIES__via__CATEGORY_ID__NAME" {:base-type :type/Text}]]
                 (get-in (add-implicit-clauses query)
                         [:query :fields]))))))))

(deftest ^:parallel add-correct-implicit-fields-for-deeply-nested-source-queries-test
  (testing "Make sure we add correct `:fields` from deeply-nested source queries (#14872)"
    (let [expected-cols (fn [query]
                          (-> (lib/query meta/metadata-provider query)
                              qp.preprocess/query->expected-cols))
          q1            (lib.tu.macros/mbql-query orders
                          {:filter      [:= $id 1]
                           :aggregation [[:sum $total]]
                           :breakout    [!day.created-at
                                         $product-id->products.title
                                         $product-id->products.category]})
          q2            (lib.tu.macros/mbql-query nil
                          {:source-query    (:query q1)
                           :filter          [:> *sum/Float 100]
                           :aggregation     [[:sum *sum/Float]]
                           :breakout        [$orders.product-id->products.title]
                           :source-metadata (expected-cols q1)})
          query         (lib.tu.macros/mbql-query nil
                          {:source-query    (:query q2)
                           :filter          [:> *sum/Float 100]
                           :source-metadata (expected-cols q2)})]
      (is (=? [[:field "PRODUCTS__via__PRODUCT_ID__TITLE" {:base-type :type/Text}]
               [:field "sum" {:base-type :type/Float}]]
              (-> (add-implicit-clauses query)
                  :query
                  :fields))))))

(deftest ^:parallel add-implicit-fields-for-source-query-inside-join-test
  (testing "Should add implicit `:fields` for `:source-query` inside a join"
    (is (=? (lib.tu.macros/mbql-query venues
              {:joins    [{:source-query {:source-table $$categories
                                          :fields       [[:field %categories.id {}]
                                                         [:field %categories.name {}]]}
                           :alias        "cat"
                           :condition    [:= $venues.category-id &cat.*ID/BigInteger]}]
               :fields   [[:field %venues.id {}]
                          [:field %venues.name {}]
                          [:field %venues.category-id {}]
                          [:field %venues.latitude {}]
                          [:field %venues.longitude {}]
                          [:field %venues.price {}]]
               :order-by [[:asc $venues.name]]
               :limit    3})
            (add-implicit-clauses
             (lib.tu.macros/mbql-query venues
               {:joins    [{:alias        "cat"
                            :source-query {:source-table $$categories}
                            :condition    [:= $category-id &cat.*categories.id]}]
                :order-by [[:asc $name]]
                :limit    3}))))))

(deftest ^:parallel add-implicit-fields-skip-join-test
  (testing "Don't add implicit `:fields` clause to a JOIN even if we have source metadata"
    (is (=? (lib.tu.macros/mbql-query venues
              {:joins    [{:source-query {:source-table $$categories
                                          :fields       [[:field %categories.id {}]
                                                         [:field %categories.name {}]]}
                           :alias        "cat"
                           :condition    [:= $venues.category-id &cat.*ID/BigInteger]}]
               :fields   [[:field %venues.id {}]
                          [:field %venues.name {}]
                          [:field %venues.category-id {}]
                          [:field %venues.latitude {}]
                          [:field %venues.longitude {}]
                          [:field %venues.price {}]]
               :order-by [[:asc $venues.name]]
               :limit    3})              (add-implicit-clauses
                                           (lib.tu.macros/mbql-query venues
                                             {:source-table $$venues
                                              :joins        [{:alias        "cat"
                                                              :source-query {:source-table $$categories}
                                                              :condition    [:= $category-id &cat.*categories.id]}]
                                              :order-by     [[:asc $name]]
                                              :limit        3}))))))

;;; These are Libor's original notes about the code in the middleware that was needed to make this test pass. With
;;; various Lib and QP improvements this just works automatically, so I moved the notes here next to the test. -- Cam
;;;
;;; > In current situation, ie. model as a source, then aggregation and breakout, and finally order by a breakout field,
;;; > [[metabase.lib.order-by/orderable-columns]] returns field ref with integer id, while reference to same field, but
;;; > with string id is present in breakout. Then, [[add-implicit-breakout-order-by]] adds the string ref to order by.
;;; >
;;; > Resulting query would contain both references, while integral is transformed differently -- it contains no
;;; > casting. As that is not part of group by, the query would fail.
;;; >
;;; > Reference: https://github.com/metabase/metabase/issues/44653.
(deftest ^:parallel model-breakout-sort-querying-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Query with sort, breakout and _model as a source_ works correctly (#44653)."
      (let [mp (lib.tu/mock-metadata-provider
                (mt/metadata-provider)
                {:cards [{:id            1
                          :type          :model
                          :dataset_query (mt/mbql-query orders)}]})]
        (doseq [[message query] {"with a hand-rolled query that doesn't match what the FE/Lib does anymore"
                                 (let [field-id                 (mt/id :products :created_at)
                                       {:keys [base-type name]} (lib.metadata/field mp field-id)]
                                   (lib/query
                                    mp
                                    (mt/mbql-query nil
                                      {:source-table "card__1"
                                       :aggregation  [[:count]]
                                       :breakout     [[:field name {:base-type base-type :temporal-unit :month}]]
                                       ;; using ID here is wrong! This is what Lib did a while back. It no longer does
                                       ;; this (see query below), and at any rate the `fix-bad-field-id-refs`
                                       ;; middleware fixes the query anyway
                                       :order-by     [[:asc [:field field-id {:base-type base-type :temporal-unit :month}]]]
                                       :limit        5})))

                                 "with a query created using Lib to mimic what we create IRL"
                                 (-> (lib/query mp (lib.metadata/card mp 1))
                                     (lib/aggregate (lib/count))
                                     (as-> $query (lib/breakout $query (-> (lib.tu.notebook/find-col-with-spec
                                                                            $query
                                                                            (lib/breakoutable-columns $query)
                                                                            {:display-name "Card 1"}
                                                                            {:display-name "Created At"})
                                                                           (lib/with-temporal-bucket :month))))
                                     (as-> $query (lib/order-by $query (lib.tu.notebook/find-col-with-spec
                                                                        $query
                                                                        (lib/orderable-columns $query)
                                                                        {:display-name "Card 1"}
                                                                        {:display-name "Created At: Month"})))
                                     (lib/limit 5))}]
          (testing message
            (when (= driver/*driver* :h2)
              (testing (str "After preprocessing: should not have added any new order bys. For the hand-rolled"
                            " query, breakout order by should get fixed (converted to a name ref)")
                ;; this actually gets fixed by [[metabase.query-processor.middleware.fix-bad-field-id-refs]]
                (is (=? [[:asc {} [:field {:temporal-unit :month} "CREATED_AT"]]]
                        (-> query qp.preprocess/preprocess :stages second :order-by)))))
            (is (= [1 19 37 64 79]
                   (->> query
                        qp/process-query
                        mt/rows
                        (mapv (comp int second)))))))))))

(deftest ^:parallel changed-coercion-of-models-underlying-data-test
  (let [mp    (mt/metadata-provider)
        query (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        mp    (lib.tu/mock-metadata-provider
               mp
               {:cards [{:id            1
                         :type          :model
                         :dataset-query (lib.convert/->legacy-MBQL query)}]})
        query (lib/query mp (lib.metadata/card mp 1))
        ;; It is irrelevant which provider is used to get card and create query. Important is that one used in qp
        ;; contains the coercion.
        mp'   (lib.tu/merged-mock-metadata-provider
               mp
               {:fields [{:id                (mt/id :venues :price)
                          :coercion-strategy :Coercion/UNIXSeconds->DateTime
                          :effective-type    :type/Instant}]})]

    (is (=? {:status :completed}
            (qp/process-query (assoc query :lib/metadata mp'))))))

(deftest ^:parallel add-implicit-clauses-inside-joins-e2e-test
  (testing "Add :fields to a join with a source query with :expressions correctly"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query nil
                   {:source-query {:source-query {:source-table $$products
                                                  :aggregation  [[:count]]
                                                  :breakout     [$products.category]}
                                   :expressions  {:CC [:+ 1 1]}}
                    :joins        [{:source-query {:source-query {:source-table $$products
                                                                  :aggregation  [[:count]]
                                                                  :breakout     [$products.category]}
                                                   :expressions  {:CC [:+ 1 1]}}
                                    :alias        "Q1"
                                    :condition    [:=
                                                   [:field "CC" {:base-type :type/Integer}]
                                                   [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]
                                    :fields       :all}]
                    :order-by     [[:asc $products.category]
                                   [:desc [:field "count" {:base-type :type/Integer}]]
                                   [:asc &Q1.products.category]]
                    :limit        1}))]
      (is (=? [{:source-table (meta/id :products)}
               {:expressions  [[:+ {:lib/expression-name "CC"} 1 1]]
                :fields       [[:field {} "CATEGORY"]
                               [:field {:base-type :type/Integer} "count"]
                               [:expression {} "CC"]]}]
              (-> query
                  qp.preprocess/preprocess
                  :stages
                  last
                  :joins
                  first
                  :stages))))))
