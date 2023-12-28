(ns metabase.lib.drill-thru.pivot-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

;; Case analysis:
;; 1. No pivot drill:
;;     Basics: a. native query; b. MBQL with no aggregations; c. column click
;;     Bad combinations of breakouts: d. date + address; e. address + category; f. category + category + category
;;         g. unknown type (eg. an FK); h. unknown + date; i. unknown + category; j. unknown + address
;; 2. Category + Location: a. date, b. date + category
;; 3. Category + Time: a. address, b. category, c. category + category
;; 4. All types: a. no breakouts.

(def ^:private orders-date-only-test-case
  {:drill-type   :drill-thru/pivot
   :click-type   :cell
   :query-type   :aggregated
   :query-table  "ORDERS"
   :column-name  "count"
   :custom-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                     (lib/aggregate (lib/count))
                     (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
                     (lib/aggregate (lib/max (meta/field-metadata :orders :discount)))
                     (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                       (lib/with-temporal-bucket :month))))
   :custom-row   (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row])
                     (dissoc "PRODUCT_ID"))})

(deftest ^:parallel returns-pivot-test-1a-no-pivots-for-native-queries
  (mu/disable-enforcement
    (let [query   (lib/native-query meta/metadata-provider "SELECT COUNT(*) FROM Orders")
          context {:column {:name "count"}
                   :column-ref [:field {} "count"]}]
      (is (empty? (filter #(= (:type %) :drill-thru/pivot)
                            (lib/available-drill-thrus query -1 context)))))))

(deftest ^:parallel returns-pivot-test-1b-no-pivots-without-aggregation
  (lib.drill-thru.tu/test-drill-not-returned
    {:drill-type   :drill-thru/pivot
     :click-type   :cell
     :query-type   :unaggregated
     :query-table  "ORDERS"
     :column-name  "CREATED_AT"}))

(deftest ^:parallel returns-pivot-test-1c-no-pivots-for-column-click
  (lib.drill-thru.tu/test-drill-not-returned
    {:drill-type   :drill-thru/pivot
     :click-type   :header
     :query-type   :aggregated
     :query-table  "ORDERS"
     :column-name  "count"}))

(defn- orders-count-with-breakouts [breakout-values]
  {:drill-type   :drill-thru/pivot
   :click-type   :cell
   :query-type   :aggregated
   :query-table  "ORDERS"
   :column-name  "count"
   :custom-query (reduce #(lib/breakout %1 -1 %2)
                         (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                             (lib/aggregate (lib/count)))
                         (map first breakout-values))
   :custom-row   (->> (for [[col value] breakout-values]
                        [(:name col) value])
                      (into {})
                      (merge {"count" 77}))})

(def ^:private bv-date
  [(meta/field-metadata :orders :created-at)
   "2025-12-06T22:22:48.544+02:00"])

(def ^:private bv-address
  [(meta/field-metadata :people :state)
   "MT"])

(def ^:private bv-category1
  [(meta/field-metadata :products :category)
   "Gadget"])
(def ^:private bv-category2
  [(meta/field-metadata :people :source)
   "Twitter"])

; This isn't really a category column, but it has few enough values to be considered one.
(def ^:private bv-category3
  [(meta/field-metadata :products :vendor)
   "Spacely Sprockets Inc."])

(def ^:private bv-unknown
  [(meta/field-metadata :orders :product-id)
   6])

(deftest ^:parallel returns-pivot-test-1d-no-pivots-date+address
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-date bv-address])))

(deftest ^:parallel returns-pivot-test-1e-no-pivots-address+category
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-address bv-category1])))

(deftest ^:parallel returns-pivot-test-1f-no-pivots-triple-category
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-category1 bv-category2 bv-category3])))

(deftest ^:parallel returns-pivot-test-1g-no-pivots-unknown-type
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-unknown])))

(deftest ^:parallel returns-pivot-test-1h-no-pivots-unknown+date
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-unknown bv-date])))

(deftest ^:parallel returns-pivot-test-1i-no-pivots-unknown+category
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-unknown bv-category2])))

(deftest ^:parallel returns-pivot-test-1j-no-pivots-unknown+address
  (lib.drill-thru.tu/test-drill-not-returned
    (orders-count-with-breakouts [bv-unknown bv-address])))

(defn- expecting [dim-names pivot-types]
  {:expected {:type       :drill-thru/pivot
              :dimensions (for [dim dim-names]
                            {:column {:name dim}})
              :pivots     (->> (for [typ [:category :location :time]]
                                 [typ (if ((set pivot-types) typ)
                                        not-empty
                                        (symbol "nil #_\"key is not present.\""))])
                               (into {}))}})

(deftest ^:parallel returns-pivot-test-2a-cat+loc-with-date
  (lib.drill-thru.tu/test-returns-drill
    (merge (orders-count-with-breakouts [bv-date])
           (expecting ["CREATED_AT"] [:category :location]))))

(deftest ^:parallel returns-pivot-test-2b-cat+loc-with-date+category
  (lib.drill-thru.tu/test-returns-drill
    (merge (orders-count-with-breakouts [bv-date bv-category1])
           (expecting ["CREATED_AT" "CATEGORY"] [:category :location]))))

(deftest ^:parallel returns-pivot-test-3a-cat+time-with-address
  (lib.drill-thru.tu/test-returns-drill
    (merge (orders-count-with-breakouts [bv-address])
           (expecting ["STATE"] [:category :time]))))

(deftest ^:parallel returns-pivot-test-3b-cat+time-with-category
  (lib.drill-thru.tu/test-returns-drill
    (merge (orders-count-with-breakouts [bv-category2])
           (expecting ["SOURCE"] [:category :time]))))

(deftest ^:parallel returns-pivot-test-3c-cat+time-with-category+category
  (lib.drill-thru.tu/test-returns-drill
    (merge (orders-count-with-breakouts [bv-category2 bv-category1])
           (expecting ["SOURCE" "CATEGORY"] [:category :time]))))

(deftest ^:parallel returns-pivot-test-4a-none-with-no-breakouts
  (lib.drill-thru.tu/test-returns-drill
    (merge (orders-count-with-breakouts [])
           (expecting [] [:category :location :time]))))

(deftest ^:parallel pivot-application-test-1
  (lib.drill-thru.tu/test-drill-application
    (merge orders-date-only-test-case
           {:expected       {:type :drill-thru/pivot}
            ;; Expecting the original query with filters for the old breakouts, and one new breakout by CATEGORY.
            :drill-args     [(meta/field-metadata :products :category)]
            :expected-query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :query])
                                (update-in [:stages 0] dissoc :breakout)
                                (lib/filter (lib/= (meta/field-metadata :orders :created-at)
                                                   (get-in lib.drill-thru.tu/test-queries
                                                           ["ORDERS" :aggregated :row "CREATED_AT"])))
                                (lib/breakout (meta/field-metadata :products :category)))})))
