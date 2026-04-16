(ns metabase.lib.drill-thru.pivot-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli :as mu]))

;; Case analysis:
;; 1. No pivot drill:
;;     Basics: a. native query; b. MBQL with no aggregations; c. column click
;;     Bad combinations of breakouts: d. date + address; e. address + category; f. category + category + category
;;         g. unknown type (eg. an FK); h. unknown + date; i. unknown + category; j. unknown + address
;; 2. Category + Location: a. date, b. date + category
;; 3. Category + Time: a. address, b. category, c. category + category
;; 4. All types: a. no breakouts.

(use-fixtures :each lib.drill-thru.tu/with-native-card-id)

(deftest ^:parallel pivot-availability-test
  (testing "pivot drill is available only for cell clicks"
    (canned/canned-test
     :drill-thru/pivot
     (fn [_test-case _context {:keys [click]}]
       (if (= click :cell)
          ;; The pivot conditions are too complex to capture here; other tests check them.
          ;; Just skip the canned cases for cell clicks.
         ::canned/skip
          ;; Non-cell clicks are false though.
         false)))))

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
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   {:drill-type   :drill-thru/pivot
    :click-type   :cell
    :query-type   :unaggregated
    :query-table  "ORDERS"
    :column-name  "CREATED_AT"}

   "multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage
                    %
                    "CREATED_AT"
                    (fn [col]
                      (lib/= col "2025-01-01T13:24:00")))}))

(deftest ^:parallel returns-pivot-test-1c-no-pivots-for-column-click
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   {:drill-type   :drill-thru/pivot
    :click-type   :header
    :query-type   :aggregated
    :query-table  "ORDERS"
    :column-name  "count"}

   "multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "count")}))

(defn- orders-count-with-breakouts* [base-query breakout-values]
  {:drill-type   :drill-thru/pivot
   :click-type   :cell
   :query-type   :aggregated
   :query-table  "ORDERS"
   :column-name  "count"
   :custom-query (reduce #(lib/breakout %1 -1 %2)
                         (-> base-query
                             (lib/aggregate (lib/count)))
                         (map first breakout-values))
   :custom-row   (->> (for [[col value] breakout-values]
                        [(:name col) value])
                      (into {})
                      (merge {"count" 77}))})

(defn- orders-count-with-breakouts [breakout-values]
  (orders-count-with-breakouts*
   (lib/query meta/metadata-provider (meta/table-metadata :orders))
   breakout-values))

(defn- orders-count-with-breakouts-and-join [breakout-values]
  (orders-count-with-breakouts*
   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
       (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                     (lib/with-join-alias "P"))))
   (for [[col v] breakout-values]
     [(cond-> col
        (= (:table-id col) (meta/id :products)) (lib/with-join-alias "P"))
      v])))

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

(defn- variant-with-count-filter-stage [base-case]
  {:custom-query (lib.drill-thru.tu/append-filter-stage (:custom-query base-case) "count")})

(deftest ^:parallel returns-pivot-test-1d-no-pivots-date+address
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-date bv-address])
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-1e-no-pivots-address+category
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-address bv-category1])
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-1f-no-pivots-triple-category
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-category1 bv-category2 bv-category3])
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-1g-no-pivots-unknown-type
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-unknown])
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-1h-no-pivots-unknown+date
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-unknown bv-date])
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-1i-no-pivots-unknown+category
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-unknown bv-category2])
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-1j-no-pivots-unknown+address
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   (orders-count-with-breakouts [bv-unknown bv-address])
   "multi-stage-query"
   variant-with-count-filter-stage))

(defn- expecting [dim-names pivot-types]
  {:expected {:type       :drill-thru/pivot
              :dimensions (not-empty (for [dim dim-names]
                                       {:column {:name dim}}))
              :pivots     (->> (for [typ [:category :location :time]]
                                 [typ (if ((set pivot-types) typ)
                                        not-empty
                                        (symbol "nil #_\"key is not present.\""))])
                               (into {}))}})

(deftest ^:parallel returns-pivot-test-2a-cat+loc-with-date
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts [bv-date])
          (expecting ["CREATED_AT"] [:category :location]))
   "multi-stage query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-2b-cat+loc-with-date+category
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts [bv-date bv-category1])
          (expecting ["CREATED_AT" "CATEGORY"] [:category :location]))
   "multi-stage query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-2c-explicit-join-cat+loc-with-cat
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts-and-join [bv-date bv-category1])
          (expecting ["CREATED_AT" "CATEGORY"] [:category :location]))
   "multi-stage-query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-3a-cat+time-with-address
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts [bv-address])
          (expecting ["STATE"] [:category :time]))
   "multi-stage query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-3b-cat+time-with-category
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts [bv-category2])
          (expecting ["SOURCE"] [:category :time]))
   "multi-stage query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-3c-cat+time-with-category+category
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts [bv-category2 bv-category1])
          (expecting ["SOURCE" "CATEGORY"] [:category :time]))
   "multi-stage query"
   variant-with-count-filter-stage))

(deftest ^:parallel returns-pivot-test-4a-none-with-no-breakouts
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   (merge (orders-count-with-breakouts [])
          (expecting [] [:category :location :time]))
   "multi-stage query"
   variant-with-count-filter-stage))

(deftest ^:parallel pivot-application-test-1
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-application
   "single-stage query"
   (merge orders-date-only-test-case
          {:expected       {:type :drill-thru/pivot}
           ;; Expecting the original query with filters for the old breakouts, and one new breakout by CATEGORY.
           :drill-args     [(meta/field-metadata :products :category)]
           :expected-query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :query])
                               (update-in [:stages 0] dissoc :breakout)
                               (lib/filter (lib/= (meta/field-metadata :orders :created-at)
                                                  (get-in lib.drill-thru.tu/test-queries
                                                          ["ORDERS" :aggregated :row "CREATED_AT"])))
                               (lib/breakout (meta/field-metadata :products :category)))})
   "multi-stage query"
   (fn [base-case]
     {:custom-query (-> base-case
                        :custom-query
                        (lib.drill-thru.tu/append-filter-stage "count"))
      :expected-query (-> base-case
                          :expected-query
                          (lib.drill-thru.tu/append-filter-stage-to-test-expectation "count"))})))

(deftest ^:parallel returns-pivot-drill-boolean-column-test
  (let [metadata-provider (lib.tu/mock-metadata-provider
                           meta/metadata-provider
                           {:fields [(merge (meta/field-metadata :gh/issues :is-open)
                                            {:base-type         :type/Boolean
                                             :effective-type    :type/Boolean})]})
        query             (-> (lib/query metadata-provider (meta/table-metadata :gh/issues))
                              (lib/aggregate (lib/count))
                              (lib/breakout (meta/field-metadata :gh/issues :is-open)))]
    (lib.drill-thru.tu/test-drill-variants-with-merged-args
     lib.drill-thru.tu/test-returns-drill
     "boolean column"
     (merge {:drill-type   :drill-thru/pivot
             :click-type   :cell
             :query-type   :aggregated
             :column-name  "count"
             :custom-query query
             :custom-row   {"IS_OPEN" true
                            "count"   10}}
            (expecting ["IS_OPEN"] [:category :time])))))

(deftest ^:parallel expression-after-aggregation-test
  (testing "custom column defined after aggregation should not offer pivot drill (#66715)"
    (let [;; Stage 0: Count of products by category
          ;; Stage 1: Add custom column "Custom Category" that references the breakout result
          base-query     (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                             (lib/aggregate (lib/count))
                             (lib/breakout (meta/field-metadata :products :category))
                             lib/append-stage)
          category-col   (some #(when (= (:name %) "CATEGORY") %)
                               (lib/returned-columns base-query))
          query          (lib/expression base-query "Custom Category" (lib/ref category-col))
          cols           (lib/returned-columns query)
          custom-cat-col (some #(when (= (:name %) "Custom Category") %) cols)
          count-col      (some #(when (= (:name %) "count") %) cols)
          ;; Simulate clicking on a cell with Custom Category as the dimension
          context        {:column     count-col
                          :column-ref (lib/ref count-col)
                          :value      42
                          :row        [{:column     custom-cat-col
                                        :column-ref (lib/ref custom-cat-col)
                                        :value      "Doohickey"}
                                       {:column     count-col
                                        :column-ref (lib/ref count-col)
                                        :value      42}]
                          :dimensions [{:column     custom-cat-col
                                        :column-ref (lib/ref custom-cat-col)
                                        :value      "Doohickey"}]}
          ;; No pivot drill:
          drill          (some #(when (= (:type %) :drill-thru/pivot) %)
                               (lib/available-drill-thrus query context))]
      (testing "drill should not be available when dimension can't be traced back"
        (is (nil? drill))))))
