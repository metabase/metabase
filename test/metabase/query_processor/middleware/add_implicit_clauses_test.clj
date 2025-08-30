(ns ^:mb/driver-tests metabase.query-processor.middleware.add-implicit-clauses-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.test :as mt]))

(defn- add-implicit-breakout-order-by [inner-query]
  (let [query  (lib/query meta/metadata-provider {:database (meta/id), :type :query, :query inner-query})
        path   [:stages (dec (count (:stages query)))]
        stage' (#'qp.add-implicit-clauses/add-order-bys-for-breakouts* query path (get-in query path))]
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
      (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                              {:breakout [$product-id->products.category]
                               :order-by [[:asc $product-id->products.category]]})]
        (is (=? query
                (add-implicit-breakout-order-by query)))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-4
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                              {:breakout [$product-id->products.category]
                               :order-by [[:desc $product-id->products.category]]})]
        (is (=? query
                (add-implicit-breakout-order-by query)))))))

(deftest ^:parallel add-order-bys-for-breakouts-test-5
  (testing "we should add order-bys for breakout clauses"
    (testing "...but not if the Field is already in an order-by"
      (testing "With a datetime-field"
        (let [{:keys [query]} (lib.tu.macros/mbql-query orders
                                {:breakout [!day.created-at]
                                 :order-by [[:asc !day.created-at]]})]
          (is (=? query
                  (add-implicit-breakout-order-by query))))))))

;;; TODO (Cam 8/29/25) -- not convinced these tests belong here. Are they even testing what the middleware does?

(deftest ^:parallel model-breakout-sort-querying-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Query with sort, breakout and _model as a source_ works correctly (#44653)."
      (let [mp                       (lib.tu/mock-metadata-provider
                                      (mt/metadata-provider)
                                      {:cards [{:id            1
                                                :type          :model
                                                :dataset_query (mt/mbql-query orders)}]})
            field-id                 (mt/id :products :created_at)
            {:keys [base-type name]} (lib.metadata/field mp field-id)]
        (is (= [1 19 37 64 79]
               (->> (lib/query
                     mp
                     (mt/mbql-query nil
                       {:source-table "card__1"
                        :aggregation  [[:count]]
                        :breakout     [[:field  name {:base-type base-type :temporal-unit :month}]]
                        :order-by     [[:asc [:field field-id {:base-type base-type :temporal-unit :month}]]]
                        :limit        5}))
                    qp/process-query
                    mt/rows
                    (mapv (comp int second)))))))))

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
