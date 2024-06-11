(ns metabase.lib.drill-thru.distribution-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/distribution-drill-on-longitude-from-sql-source-card-test]]"
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.distribution :as lib.drill-thru.distribution]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.types.isa :as lib.types.isa]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

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
      :drill-type     :drill-thru/distribution
      :expected       {:type   :drill-thru/distribution
                       :column {:name "USER_ID"}}
      :expected-query {:stages [{:source-table (meta/id :orders)
                                 :aggregation  [[:count {}]]
                                 :breakout     [[:field
                                                 {:binning (symbol "nil #_\"key is not present.\"")}
                                                 (meta/id :orders :user-id)]]}]}})))

(deftest ^:parallel apply-to-column-types-test
  (testing "distribution drill"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/order-by (meta/field-metadata :orders :subtotal))
                    (lib/limit 100))]
      (testing "on numeric columns uses default binning"
        (lib.drill-thru.tu/test-drill-application
          {:click-type     :header
           :custom-query   query
           :column-name    "QUANTITY"
           :query-type     :unaggregated
           :drill-type     :drill-thru/distribution
           :expected       {:type   :drill-thru/distribution
                            :column {:name "QUANTITY"}}
           :expected-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                               ;; Limit and order-by get removed, then COUNT broken out by the clicked column.
                               ;; Numeric columns use default binning.
                               (lib/breakout (lib/with-binning
                                               (meta/field-metadata :orders :quantity)
                                               {:strategy :default}))
                               (lib/aggregate (lib/count)))}))
      (testing "on date columns uses month bucketing"
        (lib.drill-thru.tu/test-drill-application
          {:click-type     :header
           :custom-query   query
           :column-name    "CREATED_AT"
           :query-type     :unaggregated
           :drill-type     :drill-thru/distribution
           :expected       {:type   :drill-thru/distribution
                            :column {:name "CREATED_AT"}}
           :expected-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                               ;; Limit and order-by get removed, then COUNT broken out by the clicked column.
                               ;; Datetime columns use month bucketing.
                               (lib/breakout (lib/with-temporal-bucket
                                               (meta/field-metadata :orders :created-at)
                                               :month))
                               (lib/aggregate (lib/count)))}))
      (testing "on other columns does no extra bucketing"
        (lib.drill-thru.tu/test-drill-application
          {:click-type     :header
           :custom-query   query
           :column-name    "PRODUCT_ID"
           :query-type     :unaggregated
           :drill-type     :drill-thru/distribution
           :expected       {:type   :drill-thru/distribution
                            :column {:name "PRODUCT_ID"}}
           :expected-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                               ;; Limit and order-by get removed, then COUNT broken out by the clicked column.
                               ;; Other columns get no bucketing (including FKs, despite being numeric).
                               (lib/breakout (meta/field-metadata :orders :product-id))
                               (lib/aggregate (lib/count)))})))))
