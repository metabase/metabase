(ns metabase.query-processor.util.transformations.nest-breakouts-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.impl :as driver.impl]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.transformations.nest-breakouts :as nest-breakouts]))

(deftest ^:parallel cumulative-aggregation-with-filter-and-temporal-bucketed-breakout-test
  (binding [add/*escape-alias-fn* (fn [_ s] (driver.impl/truncate-alias s 30))]
    (testing "Query with a filter and a temporally bucketed breakout should work (#41791)"
      (let [orders            (meta/table-metadata :orders)
            orders-quantity   (meta/field-metadata :orders :quantity)
            orders-created-at (meta/field-metadata :orders :created-at)
            orders-id         (meta/field-metadata :orders :id)
            query             (-> (lib/query meta/metadata-provider orders)
                                  (lib/filter (lib/> orders-id 0))
                                  (lib/aggregate (lib/cum-count))
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  (lib/breakout orders-quantity)
                                  (lib/limit 5))]
        (is (=? {:stages [{:filters [[:> {} [:field {} (meta/id :orders :id)] 0]]
                           :fields [[:field {:temporal-unit :month} (meta/id :orders :created-at)]
                                    [:field {} (meta/id :orders :quantity)]]}
                          {:breakout    [[:field {:temporal-unit :default} "CREATED_AT"]
                                         [:field {} "QUANTITY"]]
                           :aggregation [[:cum-count {}]]
                           :limit 5}]}
                (nest-breakouts/nest-breakouts-in-stages-with-window-aggregation query)))))))

(deftest ^:parallel nest-breakouts-test
  (binding [add/*escape-alias-fn* (fn [_ s] (driver.impl/truncate-alias s 30))]
    (let [metadata-provider meta/metadata-provider
          orders            (lib.metadata/table metadata-provider (meta/id :orders))
          orders-created-at (lib.metadata/field metadata-provider (meta/id :orders :created-at))
          orders-total      (lib.metadata/field metadata-provider (meta/id :orders :total))
          query             (-> (lib/query metadata-provider orders)
                                (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                (lib/aggregate (lib// (lib/cum-sum (lib/+ orders-total 1))
                                                      (lib/cum-count)))
                                (lib/limit 3))]
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :breakout     [[:field
                                         {:base-type      :type/DateTimeWithLocalTZ
                                          :effective-type :type/DateTimeWithLocalTZ
                                          :temporal-unit  :month}
                                         (meta/id :orders :created-at)]]
                         :aggregation  [[:/ {}
                                         [:cum-sum {}
                                          [:+ {}
                                           [:field {} (meta/id :orders :total)]
                                           1]]
                                         [:cum-count {}]]]
                         :limit        3}]}
              query))
      (is (=? (sort-by last [[:field {} (meta/id :orders :total)]
                             [:field {:temporal-unit :month} (meta/id :orders :created-at)]])
              (sort-by last
                       (#'nest-breakouts/fields-used-in-breakouts-aggregations-or-expressions
                        (first (:stages query))))))
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field
                                         {:base-type      :type/DateTimeWithLocalTZ
                                          :effective-type :type/DateTimeWithLocalTZ
                                          :temporal-unit  :month}
                                         (meta/id :orders :created-at)]
                                        [:field {} (meta/id :orders :total)]]}
                        {:breakout    [[:field {:temporal-unit :default} "CREATED_AT"]]
                         :aggregation [[:/ {}
                                        [:cum-sum {}
                                         [:+ {}
                                          [:field {} "TOTAL"]
                                          1]]
                                        [:cum-count {}]]]
                         :limit       3}]}
              (nest-breakouts/nest-breakouts-in-stages-with-window-aggregation query))))))

(deftest ^:parallel escape-identifiers-correctly-test
  (testing (str "Refs in the second stage should get escaped correctly when running results thru `add-alias-info`."
                " Simulate Oracle behavior here, which truncates all identifiers to 30 characters.")
    (binding [add/*escape-alias-fn* (fn [_ s] (driver.impl/truncate-alias s 30))]
      (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                               meta/metadata-provider
                               {:database {}
                                ;; mock the Oracle names for things since I want to verify that this behaves correctly
                                ;; specifically for Oracle.
                                :tables   [{:id     (meta/id :orders)
                                            :schema "mb_test"
                                            :name   "test_data_orders"}
                                           {:id     (meta/id :products)
                                            :schema "mb_test"
                                            :name   "test_data_products"}]
                                :fields   [{:id (meta/id :orders :created-at), :name "created_at"}
                                           {:id (meta/id :orders :id), :name "id"}
                                           {:id (meta/id :orders :product-id), :name "product_id"}
                                           {:id (meta/id :products :id), :name "id"}
                                           {:id (meta/id :products :category), :name "category"}]})
            orders            (lib.metadata/table metadata-provider (meta/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (meta/id :orders :created-at))
            orders-id         (lib.metadata/field metadata-provider (meta/id :orders :id))
            products-category (m/find-first (fn [col]
                                              (= (:id col) (meta/id :products :category)))
                                            (lib/visible-columns (lib/query metadata-provider orders)))
            _                 (assert (some? products-category))
            query             (-> (lib/query metadata-provider orders)
                                  (lib/filter (lib/> orders-id 5000))
                                  (lib/aggregate (lib/count))
                                  (lib/aggregate (lib/cum-count))
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :year))
                                  (lib/breakout products-category))
            preprocessed      (driver/with-driver :h2
                                (add/add-alias-info
                                 (qp.preprocess/preprocess
                                  (lib/query metadata-provider query))))
            actual            (driver/with-driver :h2
                                (-> (nest-breakouts/nest-breakouts-in-stages-with-window-aggregation preprocessed)
                                    add/add-alias-info))]
        (is (=? {:stages [{;; join alias is escaped:
                           ;;
                           ;;    (metabase.driver/escape-alias :oracle "test_data_products__via__product_id")
                           ;;    =>
                           ;;    "test_data_products__v_af2712b9"
                           :joins   [{::add/alias "test_data_products__v_af2712b9"
                                      :stages     [{:lib/type :mbql.stage/mbql, :source-table pos-int?}]
                                      :conditions [[:=
                                                    {}
                                                    [:field {} pos-int?]
                                                    [:field
                                                     {::add/source-table "test_data_products__v_af2712b9"}
                                                     pos-int?]]]}]
                           :fields  [[:field {} pos-int?]
                                     [:field {::add/source-table "test_data_products__v_af2712b9"} pos-int?]]
                           :filters [[:>
                                      {}
                                      [:field {} pos-int?]
                                      [:value {} 5000]]]}
                          ;; new second stage. Source column names ONLY GET ESCAPED WHEN RAN THRU `add-alias-info`,
                          ;; which should always be done after using this transformation:
                          ;;
                          ;;    (metabase.driver/escape-alias :oracle "test_data_products__v_af2712b9__category")
                          ;;    =>
                          ;;    "test_data_products__v_f48e965c"
                          {:breakout    [[:field {} "created_at"]
                                         [:field {:join-alias         (symbol "nil #_\"key is not present.\"")
                                                  :source-field       (symbol "nil #_\"key is not present.\"")
                                                  ::add/source-alias  "test_data_products__v_d795ff70"
                                                  ::add/desired-alias "test_data_products__v_d795ff70"}
                                          "test_data_products__via__product_id__category"]]
                           :aggregation [[:count {::add/desired-alias "count"}]
                                         [:cum-count {::add/desired-alias "count_2"}]]}]}
                actual))))))

(deftest ^:parallel cumulative-count-offset-day-of-year-test
  (testing "day is finer than day-of-year (GROUP BY should preserve breakout order; add ORDER BY day-of-year, day)"
    (let [mp         meta/metadata-provider
          created-at (meta/field-metadata :orders :created-at)]
      (is (=? {:breakout [[:field {:inherited-temporal-unit :day}         "CREATED_AT"]
                          [:field {:inherited-temporal-unit :day-of-year} "CREATED_AT_2"]]
               :order-by [[:asc {} [:field {:inherited-temporal-unit :day-of-year} "CREATED_AT_2"]]
                          [:asc {} [:field {:inherited-temporal-unit :day}         "CREATED_AT"]]]}
              (-> (lib/query mp (meta/table-metadata :orders))
                  (lib/breakout (lib/with-temporal-bucket created-at :day))
                  (lib/breakout (lib/with-temporal-bucket created-at :day-of-year))
                  (lib/aggregate (lib/count))
                  (lib/aggregate (lib/offset (lib/count) -1))
                  nest-breakouts/nest-breakouts-in-stages-with-window-aggregation
                  :stages
                  second))))))
