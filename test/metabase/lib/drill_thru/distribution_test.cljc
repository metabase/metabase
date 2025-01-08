(ns metabase.lib.drill-thru.distribution-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/distribution-drill-on-longitude-from-sql-source-card-test]]"
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.distribution :as lib.drill-thru.distribution]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.types.isa :as lib.types.isa]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel distribution-availability-test
  (testing "distribution is available only for header clicks on non-aggregate, non-breakout columns which are not PKs, JSON, comments or descriptions"
    (canned/canned-test
     :drill-thru/distribution
     (fn [test-case context {:keys [click column-kind column-type]}]
       (and (= click :header)
            (not (:native? test-case))
            (not (#{:aggregation :breakout} column-kind))
            (not= column-type :pk)
            (not (#{:type/Comment :type/Description} (:semantic-type (:column context))))
            (not (lib.types.isa/structured? (:column context))))))))

(deftest ^:parallel aggregate-column-test
  (testing "Don't suggest distribution drill thrus for aggregate columns like `count(*)`"
    (let [query     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/count))
                        (lib/breakout (meta/field-metadata :orders :product-id)))
          count-col (m/find-first (fn [col]
                                    (= (:display-name col) "Count"))
                                  (lib/returned-columns query))
          context   {:column     count-col
                     :column-ref (lib/ref count-col)
                     :value      nil}]
      (is (some? count-col))
      (is (nil? (lib.drill-thru.distribution/distribution-drill query -1 context))))))

(deftest ^:parallel distribution-not-returned-for-aggregate-or-breakout-cols-test
  (doseq [column-name ["PRODUCT_ID" "CREATED_AT" "count" "sum" "max"]]
    (testing (str "distribution drill not returned for ORDERS." column-name)
      (lib.drill-thru.tu/test-drill-not-returned
       {:drill-type  :drill-thru/distribution
        :click-type  :header
        :query-kinds [:mbql]
        :query-type  :aggregated
        :query-table "ORDERS"
        :column-name column-name}))))

(deftest ^:parallel distribution-not-returned-for-aggregate-or-breakout-cols-for-multi-stage-queries-test
  (doseq [column-name ["PRODUCT_ID" "CREATED_AT" "count" "sum" "max"]]
    (testing (str "distribution drill not returned for ORDERS." column-name)
      (lib.drill-thru.tu/test-drill-not-returned
       {:drill-type  :drill-thru/distribution
        :click-type  :header
        :query-kinds [:mbql]
        :query-type  :aggregated
        :custom-query (let [base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                           (lib/aggregate (lib/count))
                                           (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
                                           (lib/aggregate (lib/max (meta/field-metadata :orders :discount)))
                                           (lib/breakout (meta/field-metadata :orders :product-id))
                                           (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                                             (lib/with-temporal-bucket :month)))
                                           lib/append-stage)
                            count-col  (m/find-first #(= (:name %) "count")
                                                     (lib/returned-columns base-query))
                            _          (is (some? count-col))]
                        (lib/filter base-query (lib/> count-col 0)))
        :custom-row   {"PRODUCT_ID" 3
                       "CREATED_AT" "2023-12-01"
                       "count"      77
                       "sum"        1
                       "max"        nil}
        :column-name column-name}))))

(deftest ^:parallel returns-distribution-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/distribution
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/distribution}}))

(deftest ^:parallel returns-distribution-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/distribution
    :click-type  :header
    :query-type  :unaggregated
    :column-name "TAX"
    :expected    {:type :drill-thru/distribution}}))

(deftest ^:parallel returns-distribution-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/distribution
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/distribution}}))

(deftest ^:parallel apply-to-fk-column-test
  (testing "do not apply binning to FK columns (#34343)"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :column-name    "USER_ID"
      :query-type     :unaggregated
      :query-kinds    [:native]
      :drill-type     :drill-thru/distribution
      :expected       {:type   :drill-thru/distribution
                       :column {:name "USER_ID"}}
      :expected-query {:stages [{:aggregation  [[:count {}]]
                                 :breakout     [[:field
                                                 {:binning (symbol "nil #_\"key is not present.\"")}
                                                 (lib.drill-thru.tu/field-key=
                                                  "USER_ID" (meta/id :orders :user-id))]]}]}})))

(deftest ^:parallel apply-to-column-types-test
  (testing "distribution drill"
    (let [query     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/order-by (meta/field-metadata :orders :subtotal))
                        (lib/limit 100))
          test-case (fn [col-name exp-column]
                      {:click-type     :header
                       :custom-query   query
                       :custom-native  (lib.drill-thru.tu/->native-wrapped query)
                       :column-name    col-name
                       :query-type     :unaggregated
                       :drill-type     :drill-thru/distribution
                       :expected       {:type   :drill-thru/distribution
                                        :column {:name col-name}}
                       ;; Limit and order-by get removed, then COUNT broken out by the clicked column.
                       ;; Numeric columns use default binning; Datetimes get month bucketing.
                       ;; Other columns get no special handling - including FKs even though they're numeric.
                       :expected-query {:stages [{:breakout    [exp-column]
                                                  :aggregation [[:count {}]]}]}})]
      (testing "on numeric columns uses default binning"
        (lib.drill-thru.tu/test-drill-application
         (test-case "QUANTITY" [:field {:binning {:strategy :default}}
                                (lib.drill-thru.tu/field-key= "QUANTITY" (meta/id :orders :quantity))])))
      (testing "on date columns uses month bucketing"
        (lib.drill-thru.tu/test-drill-application
         (test-case "CREATED_AT" [:field {:temporal-unit :month}
                                  (lib.drill-thru.tu/field-key= "CREATED_AT" (meta/id :orders :created-at))])))
      (testing "on other columns does no extra bucketing"
        (lib.drill-thru.tu/test-drill-application
         (test-case "PRODUCT_ID" [:field {}
                                  (lib.drill-thru.tu/field-key= "PRODUCT_ID" (meta/id :orders :product-id))]))))))
