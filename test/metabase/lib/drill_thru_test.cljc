(ns metabase.lib.drill-thru-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.field :as-alias lib.field]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]
   [metabase.util.log :as log]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn by-name [cols column-name]
  (first (filter #(= (:name %) column-name) cols)))

(def ^:private orders-query
  (lib/query meta/metadata-provider (meta/table-metadata :orders)))

(defn- basic-context
  [column value]
  {:column     column
   :column-ref (lib/ref column)
   :value      value})

(defn- row-for [table col-values]
  (mapv (fn [[col value]]
          (basic-context (meta/field-metadata table col) value))
        col-values))

(def ^:private orders-row
  (row-for :orders
           [[:id         2]
            [:user-id    1]
            [:product-id 123]
            [:subtotal   110.93]
            [:tax        6.10]
            [:total      117.03]
            [:discount   nil]
            [:created-at "2018-05-15T08:04:04.58Z"]
            [:quantity   3]]))

 (def ^:private products-query
  (lib/query meta/metadata-provider (meta/table-metadata :products)))

(def ^:private products-row
  (row-for :products
           [[:id         118]
            [:ean        "5291392809646"]
            [:title      "Synergistic Rubber Shoes"]
            [:category   "Gadget"]
            [:vendor     "Herta Skiles and Sons"]
            [:price      38.42]
            [:rating     3.5]
            [:created-at "2016-10-19T12:34:56.789Z"]]))

(defn- drill-thru-test-args [drill]
  (case (:type drill)
    ;; filter-op value
    :drill-thru/column-filter
    (concat
     (when-let [initial-op (:initial-op drill)]
       [[(:short initial-op) 1]])
     [["!=" 2]])

    :drill-thru/summarize-column
    (for [ag (:aggregations drill)]
      [ag])

    :drill-thru/quick-filter
    (for [operator (:operators drill)]
      [(:name operator)])

    [nil]))

(def ^:private test-drill-applications-max-depth 1)

(defn- test-drill-applications
  "Test that we can actually apply a given drill to a query."
  ([query context]
   (test-drill-applications query context 0))

  ([query context depth]
   (testing "\nTest drill applications"
     (doseq [drill (lib/available-drill-thrus query -1 context)
             args  (drill-thru-test-args drill)]
       (condp = (:type drill)
         :drill-thru/pivot
         (log/warn "drill-thru-method is not yet implemented for :drill-thru/pivot (#33559)")

         :drill-thru/underlying-records
         (log/warn "drill-thru-method is not yet implemented for :drill-thru/underlying-records (#34233)")

         (testing (str "\nquery =\n" (u/pprint-to-str query)
                       "\ndrill =\n" (u/pprint-to-str drill)
                       "\nargs =\n" (u/pprint-to-str args))
           (try
             (let [query' (apply lib/drill-thru query -1 drill args)]
               (is (not (me/humanize (mc/validate ::lib.schema/query query'))))
               (when (< depth test-drill-applications-max-depth)
                 (testing (str "\n\nDEPTH = " (inc depth) "\n\nquery =\n" (u/pprint-to-str query'))
                   (test-drill-applications query' context (inc depth)))))
             (catch #?(:clj Throwable :cljs :default) e
               (is (not e))))))))))

(deftest ^:parallel table-view-available-drill-thrus-headers-pk-test
  (testing "column headers: click on"
    (testing "primary key - column filter (default: Is), sort, summarize (distinct only)"
      (let [context (basic-context (meta/field-metadata :orders :id) nil)]
        (is (=? [{:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :id)
                  :initial-op {:short := :display-name-variant :default}}
                 {:lib/type        :metabase.lib.drill-thru/drill-thru
                  :type            :drill-thru/sort
                  :column          (meta/field-metadata :orders :id)
                  :sort-directions [:asc :desc]}
                 {:lib/type     :metabase.lib.drill-thru/drill-thru
                  :type         :drill-thru/summarize-column
                  :column       (meta/field-metadata :orders :id)
                  :aggregations [:distinct]}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-headers-fk-test
  (testing "column headers: click on"
    (testing "foreign key - distribution, column filter (default: Is), sort, summarize (distinct only)"
      (let [context (basic-context (meta/field-metadata :orders :user-id) nil)]
        (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/distribution
                  :column   (meta/field-metadata :orders :user-id)}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :user-id)
                  :initial-op {:short := :display-name-variant :default}}
                 {:lib/type        :metabase.lib.drill-thru/drill-thru
                  :type            :drill-thru/sort
                  :column          (meta/field-metadata :orders :user-id)
                  :sort-directions [:asc :desc]}
                 {:lib/type     :metabase.lib.drill-thru/drill-thru
                  :type         :drill-thru/summarize-column
                  :column       (meta/field-metadata :orders :user-id)
                  :aggregations [:distinct]}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-headers-numeric-column-test
  (testing "column headers: click on"
    (testing "numeric column - distribution, column filter (default: Equal To), sort, summarize (all 3), summarize by time"
      (let [context (basic-context (meta/field-metadata :orders :subtotal) nil)]
        (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/distribution
                  :column   (meta/field-metadata :orders :subtotal)}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :subtotal)
                  :initial-op {:short := :display-name-variant :equal-to}}
                 {:lib/type        :metabase.lib.drill-thru/drill-thru
                  :type            :drill-thru/sort
                  :column          (meta/field-metadata :orders :subtotal)
                  :sort-directions [:asc :desc]}
                 {:lib/type     :metabase.lib.drill-thru/drill-thru
                  :type         :drill-thru/summarize-column
                  :column       (meta/field-metadata :orders :subtotal)
                  :aggregations [:distinct :sum :avg]}
                 {:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/summarize-column-by-time
                  :column   (meta/field-metadata :orders :subtotal)
                  :breakout (meta/field-metadata :orders :created-at)
                  :unit     :month}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-headers-date-column-test
  (testing "column headers: click on"
    (testing "date column - distribution, column filter (no default), sort, summarize (distinct only)"
      (let [context (basic-context (meta/field-metadata :orders :created-at) nil)]
        (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/distribution
                  :column   (meta/field-metadata :orders :created-at)}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :created-at)
                  :initial-op nil}
                 {:lib/type        :metabase.lib.drill-thru/drill-thru
                  :type            :drill-thru/sort
                  :column          (meta/field-metadata :orders :created-at)
                  :sort-directions [:asc :desc]}
                 {:lib/type     :metabase.lib.drill-thru/drill-thru
                  :type         :drill-thru/summarize-column
                  :column       (meta/field-metadata :orders :created-at)
                  :aggregations [:distinct]}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-headers-sorted-column-test
  (testing "column headers: click on"
    (testing "a sorted column"
      (let [expected [{:lib/type :metabase.lib.drill-thru/drill-thru
                       :type     :drill-thru/distribution
                       :column   (meta/field-metadata :orders :subtotal)}
                      {:lib/type   :metabase.lib.drill-thru/drill-thru
                       :type       :drill-thru/column-filter
                       :column     (meta/field-metadata :orders :subtotal)
                       :initial-op {:short := :display-name-variant :equal-to}}
                      {:lib/type        :metabase.lib.drill-thru/drill-thru
                       :type            :drill-thru/sort
                       :column          (meta/field-metadata :orders :subtotal)
                       ;; Starting off empty.
                       :sort-directions []}
                      {:lib/type     :metabase.lib.drill-thru/drill-thru
                       :type         :drill-thru/summarize-column
                       :column       (meta/field-metadata :orders :subtotal)
                       :aggregations [:distinct :sum :avg]}
                      {:lib/type :metabase.lib.drill-thru/drill-thru
                       :type     :drill-thru/summarize-column-by-time
                       :column   (meta/field-metadata :orders :subtotal)
                       :breakout (meta/field-metadata :orders :created-at)}]]
        (doseq [[sort-dir other-option] [[:asc :desc]
                                         [:desc :asc]]]
          (testing (str "which is " sort-dir " and the sort drill only offers " other-option)
            (let [query (-> orders-query
                            (lib/order-by -1 (meta/field-metadata :orders :subtotal) sort-dir))
                  context (basic-context (meta/field-metadata :orders :subtotal) nil)]
              (is (=? (assoc-in expected [2 :sort-directions] [other-option])
                      (lib/available-drill-thrus query -1 context)))
              (test-drill-applications query context))))))))

(deftest ^:parallel table-view-available-drill-thrus-fk-value-test
  (testing "table values: click on"
    (testing "foreign key - FK filter and FK details"
      (let [context (merge (basic-context (meta/field-metadata :orders :user-id) 1)
                           {:row orders-row})]
        (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/fk-filter
                  :filter   [:= {:lib/uuid string?}
                             [:field {:lib/uuid string?} (meta/id :orders :user-id)]
                             1]}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/fk-details
                  :column    (meta/field-metadata :orders :user-id)
                  :object-id 1
                  :many-pks? false}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-numeric-value-test
  (testing "table values: click on"
    (testing "numeric value - numeric quick filters and object details *for the PK column*"
      (let [context (merge (basic-context (meta/field-metadata :orders :subtotal) 110.93)
                           {:row orders-row})]
        (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                  :object-id (-> orders-row first :value)      ; And its value
                  :many-pks? false}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/quick-filter
                  :operators (for [[op label] [[:<  "<"]
                                               [:>  ">"]
                                               [:=  "="]
                                               [:!= "≠"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :orders :subtotal)]
                                         110.93]})}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-category-value-test
  (testing "table values: click on"
    (testing "category/enum value - filter is/is not, and object details *for the PK column*"
      (let [context (merge (basic-context (meta/field-metadata :products :category) "Gadget")
                           {:row products-row})]
        (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :products :id) ; It should correctly find the PK column
                  :object-id (-> products-row first :value)      ; And its value
                  :many-pks? false}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/quick-filter
                  :operators (for [[op label] [[:=  "="]
                                               [:!= "≠"]
                                               [:contains "contains"]
                                               [:does-not-contain "does-not-contain"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :products :category)]
                                         "Gadget"]})}]
                (lib/available-drill-thrus products-query -1 context)))
        (test-drill-applications products-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-string-value-test
  (testing "table values: click on"
    (testing "string value - filter (not) equal, and object details *for the PK column*"
      (let [context (merge (basic-context (meta/field-metadata :products :vendor) "Herta Skiles and Sons")
                           {:row products-row})]
        (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :products :id) ; It should correctly find the PK column
                  :object-id (-> products-row first :value)      ; And its value
                  :many-pks? false}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/quick-filter
                  :operators (for [[op label] [[:=  "="]
                                               [:!= "≠"]
                                               [:contains "contains"]
                                               [:does-not-contain "does-not-contain"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :products :vendor)]
                                         "Herta Skiles and Sons"]})}]
                (lib/available-drill-thrus products-query -1 context)))
        (test-drill-applications products-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-null-value-test
  (testing "table values: click on"
    (testing "NULL value - basic quick filters and object details *for the PK column*"
      (let [context (merge (basic-context (meta/field-metadata :orders :discount) :null)
                           {:row orders-row})]
        (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                  :object-id (-> orders-row first :value)      ; And its value
                  :many-pks? false}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/quick-filter
                  :operators (for [[op label] [[:is-null  "="]
                                               [:not-null "≠"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :orders :discount)]]})}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-date-value-test
  (testing "table values: click on"
    (testing "date value - date quick filters and object details *for the PK column*"
      (let [context (merge (basic-context (meta/field-metadata :orders :created-at) "2018-05-15T08:04:04.58Z")
                           {:row orders-row})]
        (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                  :object-id (-> orders-row first :value)      ; And its value
                  :many-pks? false}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/quick-filter
                  :operators (for [[op label] [[:<  "<"]
                                               [:>  ">"]
                                               [:=  "="]
                                               [:!= "≠"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :orders :created-at)]
                                         "2018-05-15T08:04:04.58Z"]})}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(def ^:private orders-count-aggregation-breakout-on-created-at-by-month-query
  "ORDERS + count aggregation + breakout on CREATED_AT by month query"
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/aggregate (lib/count))
      (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))))

(deftest ^:parallel timeseries-breakout-table-view-available-drill-thrus-test
  (testing "ORDERS + count aggregation + breakout on CREATED_AT by month query"
    (testing "options for CREATED_AT column + value"
      (let [query             orders-count-aggregation-breakout-on-created-at-by-month-query
            count-column      (m/find-first #(= (:name %) "count")
                                            (lib/returned-columns orders-count-aggregation-breakout-on-created-at-by-month-query))
            _                 (assert count-column)
            created-at-column (m/find-first #(= (:name %) "CREATED_AT")
                                            (lib/returned-columns orders-count-aggregation-breakout-on-created-at-by-month-query))
            _                 (assert created-at-column)
            row               [(basic-context created-at-column "2018-05-01T00:00:00Z")
                               (basic-context count-column 457)]
            expected-drills   {:quick-filter       {:lib/type  :metabase.lib.drill-thru/drill-thru
                                                    :type      :drill-thru/quick-filter
                                                    :operators [{:name "<"}
                                                                {:name ">"}
                                                                {:name "="}
                                                                {:name "≠"}]}
                               :underlying-records {:lib/type   :metabase.lib.drill-thru/drill-thru
                                                    :type       :drill-thru/underlying-records
                                                    :row-count  457
                                                    :table-name "Orders"}
                               :zoom-in.timeseries {:lib/type     :metabase.lib.drill-thru/drill-thru
                                                    :display-name "See this month by week"
                                                    :type         :drill-thru/zoom-in.timeseries
                                                    :dimension    {:column     {:name                     "CREATED_AT"
                                                                                ::lib.field/temporal-unit :month}
                                                                   :column-ref some?
                                                                   :value      "2018-05-01T00:00:00Z"}
                                                    :next-unit    :week}
                               :pivot              {:lib/type :metabase.lib.drill-thru/drill-thru
                                                    :type     :drill-thru/pivot
                                                    :pivots   {:category sequential?
                                                               :location sequential?
                                                               :time     (symbol "nil #_\"key is not present.\"")}}}]
        (let [context (merge (basic-context count-column 123)
                             {:row row})]
          (testing (str "\ncontext =\n" (u/pprint-to-str context))
            (is (=? (map expected-drills [:pivot :quick-filter])
                    (lib/available-drill-thrus query -1 context)))
            (test-drill-applications query context)))
        (testing "with :dimensions"
          (let [context (merge (basic-context count-column 457)
                               {:row        row
                                :dimensions [(basic-context created-at-column "2018-05-01T00:00:00Z")]})]
            (testing (str "\ncontext =\n" (u/pprint-to-str context))
              (is (=? (map expected-drills [:pivot :quick-filter :underlying-records :zoom-in.timeseries])
                      (lib/available-drill-thrus query -1 context)))
              (test-drill-applications query context))))))))

(deftest ^:parallel count-aggregation-table-view-available-drill-thrus-test
  (testing "ORDERS + count aggregation + breakout on CREATED_AT by month query"
    (testing "options for COUNT column + value"
      (let [query   orders-count-aggregation-breakout-on-created-at-by-month-query
            column  (m/find-first #(= (:name %) "count")
                                  (lib/returned-columns orders-count-aggregation-breakout-on-created-at-by-month-query))
            _       (assert column)
            context (merge (basic-context column "2018-05")
                           {:row [(basic-context (meta/field-metadata :orders :created-at) "2018-05")
                                  (basic-context column 10)]})]
        (testing (str "\ncontext =\n" (u/pprint-to-str context))
          (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                    :type     :drill-thru/pivot
                    :pivots   {:category [{:name "NAME"}
                                          {:name "SOURCE"}
                                          {:name "TITLE"}
                                          {:name "CATEGORY"}
                                          {:name "VENDOR"}]
                               :location [{:name "CITY"}
                                          {:name "STATE"}
                                          {:name "ZIP"}]}}
                   {:lib/type :metabase.lib.drill-thru/drill-thru
                    :type     :drill-thru/quick-filter
                    :operators [{:name "<"}
                                {:name ">"}
                                {:name "="}
                                {:name "≠"}]}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))))

(deftest ^:parallel table-view-available-drill-thrus-aggregate-column-header-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/count))
                  (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
                  (lib/aggregate (lib/max (meta/field-metadata :orders :discount)))
                  (lib/breakout (meta/field-metadata :orders :product-id))
                  (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                    (lib/with-temporal-bucket :month))))]
    (testing "Drills for count aggregation"
      (let [count-col (m/find-first (fn [col]
                                      (= (:display-name col) "Count"))
                                    (lib/returned-columns query))]
        (is (some? count-col))
        (let [context {:column     count-col
                       :column-ref (lib/ref count-col)
                       :value      nil}]
          (is (=? [{:type   :drill-thru/column-filter
                    :column {:name "count"}
                    :initial-op {:display-name-variant :equal-to
                                 :short :=}}
                   {:type   :drill-thru/sort
                    :column {:name "count"}}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))
    (testing "Drills for max(discount) aggregation"
      (let [max-of-discount-col (m/find-first (fn [col]
                                                (= (:display-name col) "Max of Discount"))
                                              (lib/returned-columns query))]
        (is (some? max-of-discount-col))
        (let [context {:column     max-of-discount-col
                       :column-ref (lib/ref max-of-discount-col)
                       :value      nil}]
          (is (=? [{:type   :drill-thru/column-filter,
                    :column {:display-name "Max of Discount"}
                    :initial-op {:display-name-variant :equal-to
                                 :short :=}}
                   {:type   :drill-thru/sort
                    :column {:display-name "Max of Discount"}}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))))

(deftest ^:parallel line-chart-available-drill-thrus-time-series-point-test
  (testing "line chart: click on"
    (testing "time series data point - underlying records, date zoom, pivot by non-date, automatic insights"
      (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                             (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                             (lib/breakout (lib/with-temporal-bucket
                                             (meta/field-metadata :orders :created-at)
                                             :month)))
            columns      (lib/returned-columns query)
            sum          (by-name columns "sum")
            breakout     (by-name columns "CREATED_AT")
            sum-dim      {:column     sum
                          :column-ref (lib/ref sum)
                          :value      42295.12}
            breakout-dim {:column     breakout
                          :column-ref (first (lib/breakouts query))
                          :value      "2024-11-01T00:00:00Z"}
            context      (merge sum-dim
                                {:row   [breakout-dim sum-dim]
                                 :dimensions [breakout-dim]})]
        (is (=? [{:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/pivot
                  :pivots     {:category (repeat 5 {})
                               :location (repeat 3 {})}}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/quick-filter
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/underlying-records
                  :row-count  (:value sum-dim)
                  :dimensions [breakout-dim]
                  :column-ref (:column-ref sum-dim)}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/zoom-in.timeseries
                  :dimension  breakout-dim}]
                (lib/available-drill-thrus query -1 context)))
        (test-drill-applications query context)))))

;; TODO: Restore this test once zoom-in and underlying-records are checked properly.
#_(deftest ^:parallel histogram-available-drill-thrus-test
  (testing "histogram breakout view"
    (testing "broken out by state - click a state - underlying, zoom in, pivot (non-location), automatic insights, quick filter"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                      (lib/aggregate (lib/count))
                      (lib/breakout (meta/field-metadata :people :state)))
            row   [{:column-name "STATE" :value "Wisconsin"} ; Yes, the full name here, not WI.
                   {:column-name "count" :value 87}]
            cols  (lib.metadata.calculation/visible-columns query)]
        (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru,
                  :type :drill-thru/pivot,
                  :pivots {:category [(by-name cols "NAME")
                                      (by-name cols "SOURCE")]
                           :time     [(by-name cols "BIRTH_DATE")
                                      (by-name cols "CREATED_AT")]}}
                 {:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/quick-filter
                  :operators (for [[op label] [[:<  "<"]
                                               [:>  ">"]
                                               [:=  "="]
                                               [:!= "≠"]]]
                               {:name label
                                :filter [op {:lib/uuid string?}
                                         [:aggregation {:lib/uuid string?} (-> query
                                                                               lib/aggregations
                                                                               first
                                                                               lib.options/uuid)]
                                         87]})}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/underlying-records
                  :row-count  87
                  :table-name "People"}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :people :state)
                  :object-id "WI"
                  :many-pks? false}]
                (lib/available-drill-thrus query -1 {:column     (-> query
                                                                     lib.metadata.calculation/returned-columns
                                                                     (by-name "count"))
                                                     :value      87
                                                     :row        row
                                                     :dimensions [{:column-name "STATE" :value "WI"}]})))))))




;;;
;;; The tests below are adapted from frontend/src/metabase-lib/drills.unit.spec.ts
;;;

(deftest ^:parallel available-drill-thrus-test-1
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :cell
    :query-type  :unaggregated
    :column-name "ID"
    :expected    [{:type      :drill-thru/zoom
                   :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                   :many-pks? false}]}))

(deftest ^:parallel available-drill-thrus-test-2
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :cell
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    [{:type :drill-thru/fk-filter}
                  {:type      :drill-thru/fk-details
                   :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "USER_ID"])
                   :many-pks? false}]}))

(deftest ^:parallel available-drill-thrus-test-3
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :cell
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    [{:type      :drill-thru/zoom
                   :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                   :many-pks? false}
                  {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                               {:name ">"}
                                                               {:name "="}
                                                               {:name "≠"}]}]}))

(deftest ^:parallel available-drill-thrus-test-4
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :cell
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    [{:type      :drill-thru/zoom
                   :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                   :many-pks? false}
                  {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                               {:name ">"}
                                                               {:name "="}
                                                               {:name "≠"}]}]}))

(deftest ^:parallel available-drill-thrus-test-5
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "ID"
    :expected    [{:type :drill-thru/column-filter, :initial-op {:short :=}}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct]}]}))

(deftest ^:parallel available-drill-thrus-test-6
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "PRODUCT_ID"
    :expected    [{:type :drill-thru/distribution}
                  {:type :drill-thru/column-filter, :initial-op {:short :=}}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct]}]}))

(deftest ^:parallel available-drill-thrus-test-7
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    [{:type :drill-thru/distribution}
                  {:type :drill-thru/column-filter, :initial-op {:short :=}}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct :sum :avg]}
                  {:type :drill-thru/summarize-column-by-time}]}))

(deftest ^:parallel available-drill-thrus-test-8
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    [{:type :drill-thru/distribution}
                  {:type :drill-thru/column-filter, :initial-op nil}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct]}]}))

(deftest ^:parallel available-drill-thrus-test-9
  (testing (str "fk-filter should not get returned for non-fk column (#34440) "
                "fk-details should not get returned for non-fk column (#34441) "
                "underlying-records should only get shown once for aggregated query (#34439)"))
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    [{:type      :drill-thru/quick-filter
                   :operators [{:name "<"}
                               {:name ">"}
                               {:name "="}
                               {:name "≠"}]}
                  {:type       :drill-thru/underlying-records
                   :row-count  77
                   :table-name "Orders"}
                  {:display-name "See this month by week"
                   :type         :drill-thru/zoom-in.timeseries}]}))

(deftest ^:parallel available-drill-thrus-test-10
  (testing (str "fk-filter should not get returned for non-fk column (#34440) "
                "fk-details should not get returned for non-fk column (#34441) "
                "underlying-records should only get shown once for aggregated query (#34439)")
    (lib.drill-thru.tu/test-available-drill-thrus
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :expected    [{:type :drill-thru/quick-filter, :operators [{:name "="}
                                                                 {:name "≠"}]}
                    {:type :drill-thru/underlying-records, :row-count 2, :table-name "Orders"}
                    {:type :drill-thru/zoom-in.timeseries, :display-name "See this month by week"}]})))

;; FIXME: quick-filter gets returned for non-metric column (#34443)
(deftest ^:parallel available-drill-thrus-test-11
  #_(lib.drill-thru.tu/test-available-drill-thrus
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "PRODUCT_ID"
      :expected    [{:type :drill-thru/fk-filter}
                    {:type :drill-thru/fk-details, :object-id 3, :many-pks? false}
                    {:row-count 2, :table-name "Orders", :type :drill-thru/underlying-records}]}))

;; FIXME: quick-filter gets returned for non-metric column (#34443)
(deftest ^:parallel available-drill-thrus-test-12
  #_(lib.drill-thru.tu/test-available-drill-thrus
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "CREATED_AT"
      :expected    [{:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                                 {:name ">"}
                                                                 {:name "="}
                                                                 {:name "≠"}]}
                    {:row-count 3, :table-name "Orders", :type :drill-thru/underlying-records}]}))

;; FIXME: for some reason the results for aggregated query are not correct (#34223, #34341)
(deftest ^:parallel available-drill-thrus-test-13
  (testing "We expect column-filter and sort drills, but get distribution and summarize-column"
    #_(lib.drill-thru.tu/test-available-drill-thrus
       {:click-type  :header
        :query-type  :aggregated
        :column-name "count"
        :expected    [{:initial-op {:short :=}, :type :drill-thru/column-filter}
                      {:sort-directions [:asc :desc], :type :drill-thru/sort}]})))

;; FIXME: for some reason the results for aggregated query are not correct (#34223, #34341)
(deftest ^:parallel available-drill-thrus-test-14
  (testing "We expect column-filter and sort drills, but get distribution and summarize-column"
    #_(lib.drill-thru.tu/test-available-drill-thrus
       {:click-type  :header
        :query-type  :aggregated
        :column-name "PRODUCT_ID"
        :expected    [{:initial-op {:short :=}, :type :drill-thru/column-filter}
                      {:sort-directions [:asc :desc], :type :drill-thru/sort}]})))

;; FIXME: for some reason the results for aggregated query are not correct (#34223, #34341)
(deftest ^:parallel available-drill-thrus-test-15
  (testing "We expect column-filter and sort drills, but get distribution and summarize-column"
    #_(lib.drill-thru.tu/test-available-drill-thrus
       {:click-type  :header
        :query-type  :aggregated
        :column-name "CREATED_AT"
        :expected    [{:type       :drill-thru/column-filter
                       :initial-op {:short :=}}
                      {:type            :drill-thru/sort
                       :sort-directions [:asc :desc]}]})))
