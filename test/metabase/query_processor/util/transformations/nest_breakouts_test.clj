(ns metabase.query-processor.util.transformations.nest-breakouts-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.util.transformations.nest-breakouts :as nest-breakouts]))

(deftest ^:parallel cumulative-aggregation-with-filter-and-temporal-bucketed-breakout-test
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
              (nest-breakouts/nest-breakouts-in-stages-with-window-aggregation query))))))

(deftest ^:parallel nest-breakouts-test
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
            (nest-breakouts/nest-breakouts-in-stages-with-window-aggregation query)))))

(defn- mock-escape-alias
  "This is based on Oracle's implementation of [[metabase.driver/escape-alias]]."
  [s]
  (lib.util/truncate-alias s 30))

(deftest ^:parallel escape-identifiers-correctly-test
  (testing (str "Refs in the second stage need to get escaped using [[metabase.driver/escape-alias]] (indirectly via"
                " [[metabase.lib.database.methods/escape-alias]]). Simulate Oracle behavior here, which truncates all"
                " identifiers to 30 characters. Make sure `mock-escape-alias` gets used everywhere, including for"
                " generating join aliases.")
    (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                             meta/metadata-provider
                             {:database {:lib/methods {:escape-alias mock-escape-alias}}
                              ;; mock the Oracle names for things since I want to verify that this behaves correctly
                              ;; specifically for Oracle.
                              :tables   [{:id     (meta/id :orders)
                                          :schema "mb_test"
                                          :name   "test_data_orders"}
                                         {:id     (meta/id :products)
                                          :schema "mb_test"
                                          :name   "test_data_products"}]
                              :fields   [{:id (meta/id :orders :created-at), :name "created_at"}
                                         {:id (meta/id :orders :id),         :name "id"}
                                         {:id (meta/id :orders :product-id), :name "product_id"}
                                         {:id (meta/id :products :id),       :name "id"}
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
          preprocessed     (lib.query/query metadata-provider (qp.preprocess/preprocess query))]
      (is (=? {:stages [{;; join alias is escaped:
                         ;;
                         ;;    (metabase.driver/escape-alias :oracle "test_data_products__via__product_id")
                         ;;    =>
                         ;;    "test_data_products__v_af2712b9"
                         :joins [{:alias "test_data_products__v_af2712b9"
                                  :conditions [[:=
                                                {}
                                                [:field {} pos-int?]
                                                [:field
                                                 {:join-alias "test_data_products__v_af2712b9"}
                                                 pos-int?]]]
                                  :stages     [{:lib/type :mbql.stage/mbql, :source-table pos-int?}]}]
                         :fields [[:field {} pos-int?]
                                  [:field {:join-alias "test_data_products__v_af2712b9"} pos-int?]]
                         :filters [[:>
                                    {}
                                    [:field {} pos-int?]
                                    [:value {} 5000]]]}
                        ;; new second stage. Source column names are escaped:
                        ;;
                        ;;    (metabase.driver/escape-alias :oracle "test_data_products__v_af2712b9__category")
                        ;;    =>
                        ;;    "test_data_products__v_f48e965c"
                        {:breakout [[:field {} "created_at"]
                                    [:field {:join-alias   (symbol "nil #_\"key is not present.\"")
                                             :source-field (symbol "nil #_\"key is not present.\"")}
                                     "test_data_products__v_f48e965c"]]
                         :aggregation [[:count {:name "count"}]
                                       [:cum-count {:name "count_2"}]]
                         :order-by [[:asc {} [:field {} "created_at"]]
                                    [:asc {} [:field {:join-alias   (symbol "nil #_\"key is not present.\"")
                                                      :source-field (symbol "nil #_\"key is not present.\"")}
                                              "test_data_products__v_f48e965c"]]]}]
               ;; unrelated TODO, but I think `:alias/escaped->original` should be a string -> string map not keyword ->
               ;; string
               :info {:alias/escaped->original {:test-data-products--v-af2712b9 "test_data_products__via__product_id"}}}
              (nest-breakouts/nest-breakouts-in-stages-with-window-aggregation preprocessed))))))
