(ns metabase.query-processor.middleware.add-implicit-clauses-test
  (:require
   [clojure.test :refer :all]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel ordering-test
  (testing "check we fetch Fields in the right order"
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      meta/metadata-provider
                                      {:fields [{:id       (meta/id :venues :price)
                                                 :position -1}]})
      (let [ids (map second
                     (#'qp.add-implicit-clauses/sorted-implicit-fields-for-table (meta/id :venues)))]
        (is (=? [;; sorted first because it has lowest positon
                 {:position -1, :name "PRICE", :semantic-type :type/Category}
                 ;; PK
                 {:position 0, :name "ID", :semantic-type :type/PK}
                 ;; Name
                 {:position 1, :name "NAME", :semantic-type :type/Name}
                 ;; The rest are sorted by name
                 {:position 2, :name "CATEGORY_ID", :semantic-type :type/FK}
                 {:position 3, :name "LATITUDE", :semantic-type :type/Latitude}
                 {:position 4, :name "LONGITUDE", :semantic-type :type/Longitude}]
                (for [id ids]
                  (lib.metadata/field (qp.store/metadata-provider) id))))))))

(deftest ^:parallel add-order-bys-for-breakouts-test
  (testing "we should add order-bys for breakout clauses"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :breakout     [[:field 1 nil]]
              :order-by     [[:asc [:field 1 nil]]]}
             (#'qp.add-implicit-clauses/add-implicit-breakout-order-by
              {:source-table 1
               :breakout     [[:field 1 nil]]}))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-2
  (testing "we should add order-bys for breakout clauses"
    (testing "Add Field to existing order-by"
      (mt/with-metadata-provider meta/metadata-provider
        (is (= {:source-table 1
                :breakout     [[:field 2 nil]]
                :order-by     [[:asc [:field 1 nil]]
                               [:asc [:field 2 nil]]]}
               (#'qp.add-implicit-clauses/add-implicit-breakout-order-by
                {:source-table 1
                 :breakout     [[:field 2 nil]]
                 :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-3
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (mt/with-metadata-provider meta/metadata-provider
        (is (= {:source-table 1
                :breakout     [[:field 1 nil]]
                :order-by     [[:asc [:field 1 nil]]]}
               (#'qp.add-implicit-clauses/add-implicit-breakout-order-by
                {:source-table 1
                 :breakout     [[:field 1 nil]]
                 :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-4
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (mt/with-metadata-provider meta/metadata-provider
        (is (= {:source-table 1
                :breakout     [[:field 1 nil]]
                :order-by     [[:desc [:field 1 nil]]]}
               (#'qp.add-implicit-clauses/add-implicit-breakout-order-by
                {:source-table 1
                 :breakout     [[:field 1 nil]]
                 :order-by     [[:desc [:field 1 nil]]]})))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-5
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (testing "With a datetime-field"
        (mt/with-metadata-provider meta/metadata-provider
          (is (= {:source-table 1
                  :breakout     [[:field 1 {:temporal-unit :day}]]
                  :order-by     [[:asc [:field 1 {:temporal-unit :day}]]]}
                 (#'qp.add-implicit-clauses/add-implicit-breakout-order-by
                  {:source-table 1
                   :breakout     [[:field 1 {:temporal-unit :day}]]
                   :order-by     [[:asc [:field 1 {:temporal-unit :day}]]]}))))))))

(defn- add-implicit-fields [inner-query]
  (if (qp.store/initialized?)
    (#'qp.add-implicit-clauses/add-implicit-fields inner-query)
    (qp.store/with-metadata-provider meta/metadata-provider
      (#'qp.add-implicit-clauses/add-implicit-fields inner-query))))

(deftest ^:parallel add-order-bys-for-no-aggregations-test
  (testing "We should add sorted implicit Fields for a query with no aggregations"
    (is (= (:query
            (lib.tu.macros/mbql-query venues
              {:fields [;; :type/PK Fields should get sorted first
                        $id
                        ;; followed by :type/Name Fields
                        $name
                        ;; followed by other Fields sorted by name
                        $category-id $latitude $longitude $price]}))
           (add-implicit-fields (:query (lib.tu.macros/mbql-query venues)))))))

(deftest ^:parallel sort-by-field-position-test
  (testing "when adding sorted implicit Fields, Field positions should be taken into account"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
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
                                                 :base-type :type/Text}]})
      (is (= (:query
              (lib.tu.macros/mbql-query venues
                {:fields [;; all fields with lower positions should get sorted first according to rules above
                          $id $name $category-id $latitude $longitude $price
                          ;; followed by position = 100, then position = 101
                          [:field 1 nil]
                          [:field 2 nil]]}))
             (add-implicit-fields (:query (lib.tu.macros/mbql-query venues))))))))

(deftest ^:parallel default-bucketing-test
  (testing "datetime Fields should get default bucketing of :day"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:fields [{:id        1
                                                 :table-id  (meta/id :venues)
                                                 :position  2
                                                 :name      "aaaaa"
                                                 :base-type :type/DateTime}]})
      (is (lib.types.isa/temporal? (lib.metadata/field (qp.store/metadata-provider) 1)))
      (is (query= (:query
                   (lib.tu.macros/mbql-query venues
                     {:fields [$id $name
                               [:field 1 nil]
                               $category-id $latitude $longitude $price]}))
                  (add-implicit-fields (:query (lib.tu.macros/mbql-query venues))))))))

(deftest ^:parallel add-implicit-fields-for-source-queries-test
  (testing "We should add implicit Fields for source queries that have source-metadata as appropriate"
    (let [{{source-query :query} :dataset_query
           source-metadata       :result_metadata}
          (qp.test-util/card-with-source-metadata-for-query
           (mt/mbql-query checkins
             {:aggregation [[:count]]
              :breakout    [!month.$date]}))]
      (is (=? {:fields [[:field (mt/id :checkins :date) nil]
                        [:field "count" {:base-type :type/BigInteger}]]}
              (add-implicit-fields
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
                (-> (lib.tu.macros/mbql-query nil
                      {:source-query    source-query
                       :source-metadata source-metadata})
                    :query add-implicit-fields :fields))))))

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
                                          :base_type     :type/Text
                                          :source_alias  "c"}
                                         {:table_id     $$categories
                                          :name         "NAME"
                                          :field_ref    $category-id->categories.name
                                          :id           %categories.name
                                          :display_name "Category → Name"
                                          :base_type    :type/Text
                                          :source_alias "CATEGORIES__via__CATEGORY_ID"}]})]
          (is (=? (lib.tu.macros/$ids [$venues.id
                                       (mbql.u/update-field-options field-ref dissoc :temporal-unit)
                                       $venues.category-id->categories.name])
                  (get-in (qp.add-implicit-clauses/add-implicit-clauses query)
                          [:query :fields]))))))))

(deftest ^:parallel add-correct-implicit-fields-for-deeply-nested-source-queries-test
  (testing "Make sure we add correct `:fields` from deeply-nested source queries (#14872)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [expected-cols (fn [query]
                            (qp.preprocess/query->expected-cols
                             {:database (meta/id)
                              :type     :query
                              :query    query}))
            q1            (lib.tu.macros/$ids orders
                            {:source-table $$orders
                             :filter       [:= $id 1]
                             :aggregation  [[:sum $total]]
                             :breakout     [!day.created-at
                                            $product-id->products.title
                                            $product-id->products.category]})
            q2            (lib.tu.macros/$ids orders
                            {:source-query    q1
                             :filter          [:> *sum/Float 100]
                             :aggregation     [[:sum *sum/Float]]
                             :breakout        [$product-id->products.title]
                             :source-metadata (expected-cols q1)})
            q3            (lib.tu.macros/$ids orders
                            {:source-query    q2
                             :filter          [:> *sum/Float 100]
                             :source-metadata (expected-cols q2)})
            query         {:database (meta/id)
                           :type     :query
                           :query    q3}]
        (is (=? (lib.tu.macros/$ids orders
                  [$product-id->products.title
                   *sum/Float])
                (-> (qp.add-implicit-clauses/add-implicit-clauses query)
                    :query
                    :fields)))))))

(defn- add-implicit-clauses [query]
  (qp.store/with-metadata-provider meta/metadata-provider
    (qp.add-implicit-clauses/add-implicit-clauses query)))

(deftest ^:parallel add-implicit-fields-for-source-query-inside-join-test
  (testing "Should add implicit `:fields` for `:source-query` inside a join"
    (is (query= (lib.tu.macros/mbql-query venues
                  {:joins    [{:source-query {:source-table $$categories
                                              :fields       [$categories.id
                                                             $categories.name]}
                               :alias        "cat"
                               :condition    [:= $venues.category-id &cat.*ID/BigInteger]}]
                   :fields   [$venues.id
                              $venues.name
                              $venues.category-id
                              $venues.latitude
                              $venues.longitude
                              $venues.price]
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
      (is (query= (add-source-metadata/add-source-metadata-for-source-queries
                   (lib.tu.macros/mbql-query venues
                     {:joins    [{:source-query {:source-table $$categories
                                                 :fields       [$categories.id
                                                                $categories.name]}
                                  :alias        "cat"
                                  :condition    [:= $venues.category-id &cat.*ID/BigInteger]}]
                      :fields   [$venues.id
                                 $venues.name
                                 $venues.category-id
                                 $venues.latitude
                                 $venues.longitude
                                 $venues.price]
                      :order-by [[:asc $venues.name]]
                      :limit    3}))
                  (qp.add-implicit-clauses/add-implicit-mbql-clauses
                   (add-source-metadata/add-source-metadata-for-source-queries
                    (lib.tu.macros/mbql-query venues
                      {:source-table $$venues
                       :joins        [{:alias        "cat"
                                       :source-query {:source-table $$categories}
                                       :condition    [:= $category-id &cat.*categories.id]}]
                       :order-by     [[:asc $name]]
                       :limit        3}))))))))

(deftest ^:synchronized model-breakout-sort-querying-test
  (mt/test-drivers
    (mt/normal-drivers)
    (testing "Query with sort, breakout and _model as a source_ works correctly (#44653)."
      (t2.with-temp/with-temp [:model/Card {card-id :id} {:type :model
                                                          :dataset_query (mt/mbql-query orders)}]
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
              field-id (mt/id :products :created_at)
              {:keys [base-type name]} (lib.metadata/field mp field-id)]
          (is (= [1 19 37 64 79]
                 (->> (mt/run-mbql-query
                        nil
                        {:source-table (str "card__" card-id)
                         :aggregation  [[:count]]
                         :breakout     [[:field  name {:base-type base-type :temporal-unit :month}]]
                         :order-by     [[:asc [:field field-id {:base-type base-type :temporal-unit :month}]]]
                         :limit        5})
                      mt/rows
                      (mapv (comp int second))))))))))
