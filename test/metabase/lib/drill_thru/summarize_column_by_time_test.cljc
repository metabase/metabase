(ns metabase.lib.drill-thru.summarize-column-by-time-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.summarize-column-by-time
    :as lib.drill-thru.summarize-column-by-time]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel summarize-column-by-time-availability-test
  (testing (str "summarize-column-by-time is available for header click with no aggregations or breakouts, "
                "for a summable column and at least one date-flavoured breakout available")
    (canned/canned-test
      :drill-thru/summarize-column-by-time
      (fn [test-case _context {:keys [click column-type]}]
        (and (= click :header)
             (= column-type :number)
             (not (:native? test-case))
             (zero? (:aggregations test-case))
             (zero? (:breakouts test-case))
             (some #(or (isa? (:effective-type %) :type/Date)
                        (isa? (:effective-type %) :type/DateTime))
                   (lib/breakoutable-columns (:query test-case))))))))

(deftest ^:parallel aggregate-column-test
  (testing "Don't suggest summarize-column-by-time drill thrus for aggregate columns like `count(*)`"
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
      (is (nil? (lib.drill-thru.summarize-column-by-time/summarize-column-by-time-drill query -1 context))))))

(deftest ^:parallel returns-summarize-column-by-time-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type :drill-thru/summarize-column-by-time}}))

(deftest ^:parallel returns-summarize-column-by-time-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type :drill-thru/summarize-column-by-time}}))

(deftest ^:parallel returns-summarize-column-by-time-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/summarize-column-by-time}}))

(deftest ^:parallel apply-summarize-column-by-time-test
  (lib.drill-thru.tu/test-drill-application
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type :drill-thru/summarize-column-by-time}
    :expected-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                        (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)))}))

;; TODO: Bring the fingerprint-based unit selection logic from
;; https://github.com/metabase/metabase/blob/0624d8d0933f577cc70c03948f4b57f73fe13ada/frontend/src/metabase-lib/metadata/Field.ts#L397
;; into this drill. Currently it always chooses the default date unit of months.
;; Tech Debt Issue: #39382
