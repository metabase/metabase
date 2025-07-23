(ns ^:mb/driver-tests metabase.query-processor.middleware.add-implicit-clauses-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(defn- add-implicit-breakout-order-by [inner-query]
  (let [query  (lib/query meta/metadata-provider {:database (meta/id), :type :query, :query inner-query})
        path   [:stages (dec (count (:stages query)))]
        stage' (#'qp.add-implicit-clauses/add-implicit-breakout-order-by query path (get-in query path))]
    (lib/->legacy-MBQL stage')))

(deftest ^:parallel add-order-bys-for-breakouts-test
  (testing "we should add order-bys for breakout clauses"
    (is (=? {:source-table 1
             :breakout     [[:field 1 nil]]
             :order-by     [[:asc [:field 1 nil]]]}
            (add-implicit-breakout-order-by
             {:source-table 1
              :breakout     [[:field 1 nil]]})))))

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
                      :query add-implicit-breakout-order-by))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-3
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (mt/with-metadata-provider meta/metadata-provider
        (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                                {:breakout [$product-id->products.category]
                                 :order-by [[:asc $product-id->products.category]]})]
          (is (=? query
                  (add-implicit-breakout-order-by query))))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-4
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (mt/with-metadata-provider meta/metadata-provider
        (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                                {:breakout [$product-id->products.category]
                                 :order-by [[:desc $product-id->products.category]]})]
          (is (=? query
                  (add-implicit-breakout-order-by query))))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-5
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (testing "With a datetime-field"
        (mt/with-metadata-provider meta/metadata-provider
          (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                                  {:breakout [!day.created-at]
                                   :order-by [[:asc !day.created-at]]})]
            (is (=? query
                    (add-implicit-breakout-order-by query)))))))))

(defn- add-implicit-fields [inner-query]
  (if (qp.store/initialized?)
    (#'qp.add-implicit-clauses/add-implicit-fields inner-query)
    (qp.store/with-metadata-provider meta/metadata-provider
      (#'qp.add-implicit-clauses/add-implicit-fields inner-query))))

(defn- add-implicit-fields
  ([inner-query]
   (add-implicit-fields meta/metadata-provider inner-query))

  ([mp inner-query]
   (let [query  (lib/query
                 mp
                 {:database (meta/id)
                  :type     :query
                  :query    inner-query})
         path   [:stages (dec (count (:stages query)))]
         stage' (#'qp.add-implicit-clauses/add-implicit-fields query path (get-in query path))]
     (lib/->legacy-MBQL stage'))))

(deftest ^:parallel add-order-bys-for-no-aggregations-test
  (testing "We should add sorted implicit Fields for a query with no aggregations"
    (is (=? (:query
             (lib.tu.macros/mbql-query venues
               {:fields [ ;; :type/PK Fields should get sorted first
                         [:field %id {}]
                         ;; followed by :type/Name Fields
                         [:field %name {}]
                         ;; followed by other Fields sorted by name
                         [:field %category-id {}]
                         [:field %latitude {}]
                         [:field %longitude {}]
                         [:field %price {}]]}))
            (add-implicit-fields (:query (lib.tu.macros/mbql-query venues)))))))

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
                 {:fields [ ;; all fields with lower positions should get sorted first according to rules above
                           [:field %id {}]
                           [:field %name {}]
                           [:field %category-id {}]
                           [:field %latitude {}]
                           [:field %longitude {}]
                           [:field %price {}]
                           ;; followed by position = 100, then position = 101
                           [:field 1 {}]
                           [:field 2 {}]]}))
              (add-implicit-fields mp (:query (lib.tu.macros/mbql-query venues))))))))

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
              (add-implicit-fields mp (:query (lib.tu.macros/mbql-query venues))))))))

(deftest ^:parallel add-implicit-fields-for-source-queries-test
  (testing "We should add implicit Fields for source queries that have source-metadata as appropriate"
    (let [{{source-query :query} :dataset_query
           source-metadata       :result_metadata}
          (qp.test-util/card-with-source-metadata-for-query
           (mt/mbql-query checkins
             {:aggregation [[:count]]
              :breakout    [!month.$date]}))]
      (is (=? {:fields [[:field "DATE" {:inherited-temporal-unit :month}] ; (was an ID ref)
                        [:field "count" {:base-type :type/Integer}]]}
              (add-implicit-fields
               (mt/application-database-metadata-provider (mt/id))
               (:query (lib.tu.macros/mbql-query checkins
                         {:source-query    source-query
                          :source-metadata source-metadata}))))))))

(deftest ^:parallel expression-with-only-field-in-source-query-test
  (testing "Field coming from expression in source query should have string id"
    (let [{{source-query :query} :dataset_query
           source-metadata       :result_metadata}
          (qp.test-util/card-with-source-metadata-for-query
           (mt/mbql-query venues {:expressions {"ccprice" $price}}))]
      (is (some #(when (= % [:field "ccprice" {:base-type :type/Integer}]) %)
                (->> (lib.tu.macros/mbql-query nil
                       {:source-query    source-query
                        :source-metadata source-metadata})
                     :query
                     (add-implicit-fields (mt/application-database-metadata-provider (mt/id)))
                     :fields))))))

(defn- add-implicit-clauses
  ([query]
   (add-implicit-clauses meta/metadata-provider query))

  ([mp query]
   (let [query (lib/query mp query)]
     (-> query
         qp.add-implicit-clauses/add-implicit-clauses
         lib/->legacy-MBQL))))

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
          (is (=? [[:field "ID" {:base-type :type/BigInteger}]
                   [:field "c__NAME" {:base-type :type/Text}]
                   [:field "CATEGORIES__via__CATEGORY_ID__NAME" {:base-type :type/Text}]]
                  (get-in (add-implicit-clauses query)
                          [:query :fields]))))))))

(deftest ^:parallel add-correct-implicit-fields-for-deeply-nested-source-queries-test
  (testing "Make sure we add correct `:fields` from deeply-nested source queries (#14872)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [expected-cols qp.preprocess/query->expected-cols
            q1            (lib.tu.macros/mbql-query orders
                            {:filter       [:= $id 1]
                             :aggregation  [[:sum $total]]
                             :breakout     [!day.created-at
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
                    :fields)))))))

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
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? (-> (add-source-metadata/add-source-metadata-for-source-queries
                   (lib.tu.macros/mbql-query venues
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
                      :limit    3}))
                  (m/dissoc-in [:query :joins 0 :source-metadata]))
              (add-implicit-clauses
               (add-source-metadata/add-source-metadata-for-source-queries
                (lib.tu.macros/mbql-query venues
                  {:source-table $$venues
                   :joins        [{:alias        "cat"
                                   :source-query {:source-table $$categories}
                                   :condition    [:= $category-id &cat.*categories.id]}]
                   :order-by     [[:asc $name]]
                   :limit        3}))))))))

(deftest ^:parallel model-breakout-sort-querying-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Query with sort, breakout and _model as a source_ works correctly (#44653)."
      (let [mp (lib.tu/mock-metadata-provider
                (mt/application-database-metadata-provider (mt/id))
                {:cards [{:id            1
                          :type          :model
                          :dataset-query (mt/mbql-query orders)}]})
            field-id                 (mt/id :products :created_at)
            {:keys [base-type name]} (lib.metadata/field mp field-id)]
        (qp.store/with-metadata-provider mp
          (is (= [1 19 37 64 79]
                 (->> (mt/run-mbql-query nil
                        {:source-table "card__1"
                         :aggregation  [[:count]]
                         :breakout     [[:field  name {:base-type base-type :temporal-unit :month}]]
                         :order-by     [[:asc [:field field-id {:base-type base-type :temporal-unit :month}]]]
                         :limit        5})
                      mt/rows
                      (mapv (comp int second))))))))))

(deftest ^:parallel changed-coercion-of-models-unerlying-data-test
  (let [mp    (mt/application-database-metadata-provider (mt/id))
        query (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        mp    (lib.tu/mock-metadata-provider
               mp
               {:cards [{:id 1
                         :type :model
                         :dataset-query query}]})
        mp    (lib.tu/merged-mock-metadata-provider
               mp
               {:fields [{:id (mt/id :venues :price)
                          :coercion-strategy :Coercion/UNIXSeconds->DateTime
                          :effective-type :type/Instant}]})]
    ;; It is irrelevant which provider is used to get card and create query. Important is that one used in qp,
    ;; by means of `with-metdata-provider`, contains the coercion.
    (is (=? {:status :completed}
            (qp/process-query (lib/query mp (lib.metadata/card mp 1)))))))
