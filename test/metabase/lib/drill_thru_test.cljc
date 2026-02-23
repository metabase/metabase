(ns metabase.lib.drill-thru-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing use-fixtures]]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.field :as-alias lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(use-fixtures :each lib.drill-thru.tu/with-native-card-id)

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

(def ^:private reviews-query
  (lib/query meta/metadata-provider (meta/table-metadata :reviews)))

(def ^:private reviews-row
  (row-for :reviews
           [[:id         4]
            [:product-id 1]
            [:reviewer   "barbara-shields"]
            [:rating     4]
            [:body       "lorem ipsum"]
            [:created-at "2023-11-13T10:29:43.394Z"]]))

(defn- drill-thru-test-args [drill]
  (case (:type drill)
    ;; filter-op value
    :drill-thru/column-filter
    [["!=" 2]]

    :drill-thru/summarize-column
    (for [ag (:aggregations drill)]
      [ag])

    :drill-thru/quick-filter
    (for [operator (:operators drill)]
      [(:name operator)])

    :drill-thru/column-extract
    (for [extraction (:extractions drill)]
      [(:tag extraction)])

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

         (testing (str "\nquery =\n" (u/pprint-to-str query)
                       "\ndrill =\n" (u/pprint-to-str drill)
                       "\nargs =\n" (u/pprint-to-str args))
           (try
             (let [query' (apply lib/drill-thru query -1 nil drill args)]
               (is (not (me/humanize (mr/explain ::lib.schema/query query'))))
               (when (< (inc depth) test-drill-applications-max-depth)
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
                  :column     (meta/field-metadata :orders :id)}
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
        (is (=? [{:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :user-id)}
                 {:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/distribution
                  :column   (meta/field-metadata :orders :user-id)}
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
        (is (=? [{:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :subtotal)}
                 {:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/distribution
                  :column   (meta/field-metadata :orders :subtotal)}
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
        (is (=? [{:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/column-filter
                  :column     (meta/field-metadata :orders :created-at)}
                 {:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/distribution
                  :column   (meta/field-metadata :orders :created-at)}
                 {:lib/type        :metabase.lib.drill-thru/drill-thru
                  :type            :drill-thru/sort
                  :column          (meta/field-metadata :orders :created-at)
                  :sort-directions [:asc :desc]}
                 {:lib/type     :metabase.lib.drill-thru/drill-thru
                  :type         :drill-thru/summarize-column
                  :column       (meta/field-metadata :orders :created-at)
                  :aggregations [:distinct]}
                 {:lib/type     :metabase.lib.drill-thru/drill-thru
                  :type         :drill-thru/column-extract
                  :query        orders-query
                  :stage-number -1
                  :extractions  (partial mr/validate [:sequential [:map [:tag keyword?]]])}]
                (lib/available-drill-thrus orders-query -1 context)))
        (test-drill-applications orders-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-headers-sorted-column-test
  (testing "column headers: click on"
    (testing "a sorted column"
      (let [expected [{:lib/type   :metabase.lib.drill-thru/drill-thru
                       :type       :drill-thru/column-filter
                       :column     (meta/field-metadata :orders :subtotal)}
                      {:lib/type :metabase.lib.drill-thru/drill-thru
                       :type     :drill-thru/distribution
                       :column   (meta/field-metadata :orders :subtotal)}
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
                                               [:!= "≠"]]]
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
                                               [:!= "≠"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :products :vendor)]
                                         "Herta Skiles and Sons"]})}]
                (lib/available-drill-thrus products-query -1 context)))
        (test-drill-applications products-query context)))))

(deftest ^:parallel table-view-available-drill-thrus-description-value-test
  (testing "table values: click on"
    (testing "description value - filter contains, does-not-contain, and object details *for the PK column*"
      (let [context (merge (basic-context (meta/field-metadata :reviews :body) "lorem ipsum")
                           {:row reviews-row})]
        (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :reviews :id) ; It should correctly find the PK column
                  :object-id (-> reviews-row first :value)      ; And its value
                  :many-pks? false}
                 {:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/quick-filter
                  :operators (for [[op label] [[:contains "contains"]
                                               [:does-not-contain "does-not-contain"]]]
                               {:name   label
                                :filter [op {:lib/uuid string?}
                                         [:field {:lib/uuid string?} (meta/id :reviews :body)]
                                         "lorem ipsum"]})}]
                (lib/available-drill-thrus reviews-query -1 context)))
        (test-drill-applications reviews-query context)))))

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
            expected-drills   {:automatic-insights {:lib/type   :metabase.lib.drill-thru/drill-thru
                                                    :type       :drill-thru/automatic-insights
                                                    :column-ref some?
                                                    :dimensions [{:column     {:name                     "CREATED_AT"
                                                                               ::lib.field/temporal-unit :month}
                                                                  :column-ref some?
                                                                  :value      "2018-05-01T00:00:00Z"}]}
                               :quick-filter       {:lib/type  :metabase.lib.drill-thru/drill-thru
                                                    :type      :drill-thru/quick-filter
                                                    :operators [{:name "<"}
                                                                {:name ">"}
                                                                {:name "="}
                                                                {:name "≠"}]}
                               :underlying-records {:lib/type   :metabase.lib.drill-thru/drill-thru
                                                    :type       :drill-thru/underlying-records
                                                    :row-count  pos-int?
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
            (is (=? (map expected-drills [:pivot :underlying-records])
                    (lib/available-drill-thrus query -1 context)))
            (test-drill-applications query context)))
        (testing "with :dimensions"
          (let [context (merge (basic-context count-column 457)
                               {:row        row
                                :dimensions [(basic-context created-at-column "2018-05-01T00:00:00Z")]})]
            (testing (str "\ncontext =\n" (u/pprint-to-str context))
              (is (=? (map expected-drills [:automatic-insights :pivot :quick-filter :underlying-records
                                            :zoom-in.timeseries])
                      (lib/available-drill-thrus query -1 context)))
              (test-drill-applications query context))))))))

(deftest ^:parallel count-aggregation-table-view-available-drill-thrus-test
  (testing "ORDERS + count aggregation + breakout on CREATED_AT by month query"
    (testing "options for COUNT column + value"
      (let [query   orders-count-aggregation-breakout-on-created-at-by-month-query
            column  (m/find-first #(= (:name %) "count")
                                  (lib/returned-columns orders-count-aggregation-breakout-on-created-at-by-month-query))
            _       (assert column)
            context (merge (basic-context column 10)
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
                   {:lib/type   :metabase.lib.drill-thru/drill-thru
                    :type       :drill-thru/underlying-records
                    :row-count  pos-int?
                    :table-name "Orders"
                    :dimensions nil
                    :column-ref [:aggregation {} #_uuid string?]}]
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
                    :column {:name "count"}}
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
                    :column {:display-name "Max of Discount"}}
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
            sum          (lib.drill-thru.tu/column-by-name columns "sum")
            sum-dim      {:column     sum
                          :column-ref (lib/ref sum)
                          :value      42295.12}
            breakout-dim {:column     (first (lib/breakouts-metadata query))
                          :column-ref (first (lib/breakouts query))
                          :value      "2024-11-01T00:00:00Z"}
            context      (merge sum-dim
                                {:row   [breakout-dim sum-dim]
                                 :dimensions [breakout-dim]})]
        (is (=? [{:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/automatic-insights
                  :dimensions [breakout-dim]
                  :column-ref (:column-ref sum-dim)}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
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
;; Tech debt issue: #39373
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
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-available-drill-thrus
   "unaggregated cell click on numeric column"
   {:click-type  :cell
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    [{:type      :drill-thru/zoom
                   :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                   :many-pks? false}
                  {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                               {:name ">"}
                                                               {:name "="}
                                                               {:name "≠"}]}]}

   "drill thrus are disabled for native queries with template-tag variables"
   {:custom-native #(lib/with-native-query % "SELECT * FROM orders WHERE product_id = {{mytag}}")
    :native-drills #{}}

   "snippets and card tags are allowed"
   {:custom-native #(lib/with-native-query % "SELECT * FROM {{#123-mycard}} WHERE {{snippet:mysnip}}")}))

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
    :expected    [{:type :drill-thru/column-filter}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct]}]}))

(deftest ^:parallel available-drill-thrus-test-6
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-available-drill-thrus
   "unaggregated header click on fk column"
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "PRODUCT_ID"
    :expected    [{:type :drill-thru/column-filter}
                  {:type :drill-thru/distribution}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct]}]}

   "drill thrus are disabled for native queries with template-tag variables"
   {:custom-native #(lib/with-native-query % "SELECT * FROM orders WHERE product_id = {{mytag}}")
    :native-drills #{}}

   "snippets and card tags are allowed"
   {:custom-native #(lib/with-native-query % "SELECT * FROM {{#123-mycard}} WHERE {{snippet:mysnip}}")}))

(deftest ^:parallel available-drill-thrus-test-7
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    [{:type :drill-thru/column-filter}
                  {:type :drill-thru/distribution}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct :sum :avg]}
                  {:type :drill-thru/summarize-column-by-time}]}))

(deftest ^:parallel available-drill-thrus-test-8
  (lib.drill-thru.tu/test-available-drill-thrus
   {:click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    [{:type :drill-thru/column-filter}
                  {:type :drill-thru/distribution}
                  {:type :drill-thru/sort, :sort-directions [:asc :desc]}
                  {:type :drill-thru/summarize-column, :aggregations [:distinct]}
                  {:type        :drill-thru/column-extract
                   :extractions (partial mr/validate [:sequential [:map
                                                                   [:tag          keyword?]
                                                                   [:display-name string?]]])}]}))

(deftest ^:parallel available-drill-thrus-test-9
  (testing (str "fk-filter should not get returned for non-fk column (#34440) "
                "fk-details should not get returned for non-fk column (#34441) "
                "underlying-records should only get shown once for aggregated query (#34439)"))
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-available-drill-thrus
   "aggregated cell click on count column"
   {:click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    [{:type :drill-thru/automatic-insights
                   :dimensions [{:column {:name "PRODUCT_ID"}}
                                {:column {:name "CREATED_AT"}}]}
                  {:type      :drill-thru/quick-filter
                   :operators [{:name "<"}
                               {:name ">"}
                               {:name "="}
                               {:name "≠"}]}
                  {:type       :drill-thru/underlying-records
                   :row-count  77
                   :table-name "Orders"}
                  {:display-name "See this month by week"
                   :type         :drill-thru/zoom-in.timeseries}]
    ;; Underlying records and automatic insights are not supported for native.
    ;; zoom-in.timeseries can't be because we don't know what unit (if any) it's currently bucketed by.
    :native-drills #{:drill-thru/quick-filter}}

   "drill thrus are disabled for native queries with template-tag variables"
   {:custom-native #(lib/with-native-query %
                      "SELECT COUNT(*) FROM orders GROUP BY product_id HAVING product_id > {{mytag}}")
    :native-drills #{}}

   "snippets and card tags are allowed"
   {:custom-native #(lib/with-native-query % "SELECT COUNT(*) FROM {{#123-mycard}} GROUP BY {{snippet:mysnip}}")}))

(deftest ^:parallel available-drill-thrus-test-10
  (testing (str "fk-filter should not get returned for non-fk column (#34440) "
                "fk-details should not get returned for non-fk column (#34441) "
                "underlying-records should only get shown once for aggregated query (#34439)")
    (lib.drill-thru.tu/test-available-drill-thrus
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :expected    [{:type :drill-thru/automatic-insights
                     :dimensions [{:column {:name "PRODUCT_ID"}}
                                  {:column {:name "CREATED_AT"}}]}
                    {:type :drill-thru/quick-filter, :operators [{:name "="}
                                                                 {:name "≠"}]}
                    {:type :drill-thru/underlying-records, :row-count 2, :table-name "Orders"}
                    {:type :drill-thru/zoom-in.timeseries, :display-name "See this month by week"}]
      :native-drills #{:drill-thru/quick-filter}})))

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
        :expected    [{:type :drill-thru/column-filter}
                      {:sort-directions [:asc :desc], :type :drill-thru/sort}]})))

;; FIXME: for some reason the results for aggregated query are not correct (#34223, #34341)
(deftest ^:parallel available-drill-thrus-test-14
  (testing "We expect column-filter and sort drills, but get distribution and summarize-column"
    #_(lib.drill-thru.tu/test-available-drill-thrus
       {:click-type  :header
        :query-type  :aggregated
        :column-name "PRODUCT_ID"
        :expected    [{:type :drill-thru/column-filter}
                      {:sort-directions [:asc :desc], :type :drill-thru/sort}]})))

;; FIXME: for some reason the results for aggregated query are not correct (#34223, #34341)
(deftest ^:parallel available-drill-thrus-test-15
  (testing "We expect column-filter and sort drills, but get distribution and summarize-column"
    #_(lib.drill-thru.tu/test-available-drill-thrus
       {:click-type  :header
        :query-type  :aggregated
        :column-name "CREATED_AT"
        :expected    [{:type            :drill-thru/column-filter}
                      {:type            :drill-thru/sort
                       :sort-directions [:asc :desc]}]})))

(deftest ^:parallel available-drill-thrus-no-column-drills-for-nil-dimension-values-test
  (testing "column header drills should not be returned when dimensions have nil values (#49740, #51741)"
    (lib.drill-thru.tu/test-available-drill-thrus
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "count"
      :custom-row  #(assoc % "CREATED_AT" nil)
      ;; Expect the same set of drills as [[available-drill-thrus-test-9]] above, but without zoom-in.timeseries
      ;; since "CREATED_AT" is nil.
      :expected    [{:type :drill-thru/automatic-insights
                     :dimensions [{:column {:name "PRODUCT_ID"}}
                                  {:column {:name "CREATED_AT"}}]}
                    {:type      :drill-thru/quick-filter
                     :operators [{:name "<"}
                                 {:name ">"}
                                 {:name "="}
                                 {:name "≠"}]}
                    {:type       :drill-thru/underlying-records
                     :row-count  77
                     :table-name "Orders"}]
      ;; Underlying records and automatic insights are not supported for native.
      :native-drills #{:drill-thru/quick-filter}})))

(deftest ^:parallel available-drill-thrus-use-correct-field-with-models-test
  (testing "drills get the model's column instead of the result metadata column #56799"
    (let [card (:orders (lib.tu/mock-cards))
          metadata-provider (lib.tu/metadata-provider-with-mock-card card)
          query (lib/query metadata-provider card)
          lib-col  (-> (m/find-first #(= (:name %) "CREATED_AT") (lib/returned-columns query))
                       (dissoc :lib/deduplicated-name :lib/original-name :lib/desired-column-alias))
          card-col (m/find-first #(= (:name %) "CREATED_AT") (:result-metadata card))
          context {:column     card-col
                   :column-ref (lib/ref card-col)
                   :value      nil}
          drills (lib/available-drill-thrus query context)]
      (is (=? [;; filter drills are special and use a column from filterable-columns
               {:type :drill-thru/column-filter}
               {:type :drill-thru/distribution
                :column lib-col}
               {:type :drill-thru/sort
                :column lib-col}
               {:type :drill-thru/summarize-column
                :column lib-col}
               {:type :drill-thru/column-extract
                :column lib-col}]
              drills)))))

(deftest ^:parallel available-drill-thrus-for-joined-pk-test
  (testing "ORDERS + PRODUCTS click on PRODUCTS.ID PK key value from a join (#28095)"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/join (-> (lib/join-clause (meta/table-metadata :products)
                                                         [(lib/=
                                                           (meta/field-metadata :orders :product-id)
                                                           (-> (meta/field-metadata :products :id)
                                                               (lib/with-join-alias "Products")))])
                                        (lib/with-join-alias "Products")
                                        (lib/with-join-strategy :left-join))))
          orders-id   (meta/field-metadata :orders :id)
          products-id (-> (m/find-first #(= (:id %) (meta/id :products :id))
                                        (lib/returned-columns query))
                          (lib/with-join-alias "Products"))
          context     {:column     products-id
                       :column-ref (lib/ref products-id)
                       :value      (meta/id :products :id)
                       :row        [{:column     orders-id
                                     :column-ref (lib/ref orders-id)
                                     :value      (meta/id :orders :id)}
                                    {:column     products-id
                                     :column-ref (lib/ref products-id)
                                     :value      (meta/id :products :id)}]}]
      (is (=? [{:lib/type     :metabase.lib.drill-thru/drill-thru
                :type         :drill-thru/zoom
                :object-id    (meta/id :orders :id)
                :many-pks?    false
                :column       orders-id}
               {:lib/type     :metabase.lib.drill-thru/drill-thru
                :type         :drill-thru/quick-filter
                :operators    [{:name "<"}
                               {:name ">"}
                               {:name "="}
                               {:name "≠"}]
                :query        {:stages [{}]}
                :stage-number -1
                :value        (meta/id :products :id)}]
              (lib/available-drill-thrus query -1 context))))))

(deftest ^:parallel geographic-breakout-available-drill-thrus-test
  (let [metadata-provider (lib.tu/mock-metadata-provider
                           meta/metadata-provider
                           {:fields [{:id             1
                                      :table-id       (meta/id :people)
                                      :name           "COUNTRY"
                                      :base-type      :type/Text
                                      :effective-type :type/Text
                                      :semantic-type  :type/Country}]})
        query (as-> (lib/query metadata-provider (meta/table-metadata :people)) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (lib.metadata/field metadata-provider 1))
                (lib/breakout $ (meta/field-metadata :people :state))
                (lib/breakout $ (meta/field-metadata :people :city))
                (lib/breakout $ (let [field (meta/field-metadata :people :latitude)]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field))))
                (lib/breakout $ (let [field (meta/field-metadata :people :longitude)]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field)))))
        lat-col (m/find-first #(= (:id %) (meta/id :people :latitude))
                              (lib/returned-columns query))
        lon-col (m/find-first #(= (:id %) (meta/id :people :longitude))
                              (lib/returned-columns query))]
    (testing "Drills for country breakout"
      (let [country-col (m/find-first #(= (:id %) 1)
                                      (lib/returned-columns query))]
        (is (some? country-col))
        (let [context {:column     country-col
                       :column-ref (lib/ref country-col)
                       :value      2
                       :row        [{:column     lat-col
                                     :column-ref (lib/ref lat-col)
                                     :value      10}
                                    {:column     lon-col
                                     :column-ref (lib/ref lon-col)
                                     :value      10}]}]
          (is (=? [{:type :drill-thru/quick-filter}
                   {:type    :drill-thru/zoom-in.geographic
                    :subtype :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                    :display-name "Zoom in: Country"}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))
    (testing "Drills for state breakout"
      (let [state-col (m/find-first #(= (:id %) (meta/id :people :state))
                                    (lib/returned-columns query))]
        (is (some? state-col))
        (let [context {:column     state-col
                       :column-ref (lib/ref state-col)
                       :value      2
                       :row        [{:column     lat-col
                                     :column-ref (lib/ref lat-col)
                                     :value      10}
                                    {:column     lon-col
                                     :column-ref (lib/ref lon-col)
                                     :value      10}]}]
          (is (=? [{:type :drill-thru/quick-filter}
                   {:type    :drill-thru/zoom-in.geographic
                    :subtype :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                    :display-name "Zoom in: State"}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))
    (testing "Drills for city breakout"
      (let [city-col (m/find-first #(= (:id %) (meta/id :people :city))
                                   (lib/returned-columns query))]
        (is (some? city-col))
        (let [context {:column     city-col
                       :column-ref (lib/ref city-col)
                       :value      2
                       :row        [{:column     lat-col
                                     :column-ref (lib/ref lat-col)
                                     :value      10}
                                    {:column     lon-col
                                     :column-ref (lib/ref lon-col)
                                     :value      10}]}]
          (is (=? [{:type :drill-thru/quick-filter}
                   {:type    :drill-thru/zoom-in.geographic
                    :subtype :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                    :display-name "Zoom in: City"}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))
    (testing "Drills for latitude breakout"
      (is (some? lat-col))
      (let [context {:column     lat-col
                     :column-ref (lib/ref lat-col)
                     :value      2
                     :row        [{:column     lat-col
                                   :column-ref (lib/ref lat-col)
                                   :value      10}
                                  {:column     lon-col
                                   :column-ref (lib/ref lon-col)
                                   :value      10}]}]
        (is (=? [{:type :drill-thru/quick-filter}
                 {:type    :drill-thru/zoom-in.geographic
                  :subtype :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
                  :display-name "Zoom in: Lat/Lon"}]
                (lib/available-drill-thrus query -1 context)))
        (test-drill-applications query context)))
    (testing "Drills for longitude breakout"
      (is (some? lon-col))
      (let [context {:column     lon-col
                     :column-ref (lib/ref lon-col)
                     :value      2
                     :row        [{:column     lat-col
                                   :column-ref (lib/ref lat-col)
                                   :value      10}
                                  {:column     lon-col
                                   :column-ref (lib/ref lon-col)
                                   :value      10}]}]
        (is (=? [{:type :drill-thru/quick-filter}]
                (lib/available-drill-thrus query -1 context)))
        (test-drill-applications query context)))))

(deftest ^:parallel only-lat-available-drill-thrus-test
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :people)) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (let [field (meta/field-metadata :people :latitude)]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field)))))
        lat-col (m/find-first #(= (:id %) (meta/id :people :latitude))
                              (lib/returned-columns query))]
    (testing "Drills for latitude breakout with no longitude"
      (is (some? lat-col))
      (let [context {:column     lat-col
                     :column-ref (lib/ref lat-col)
                     :value      2
                     :row        [{:column     lat-col
                                   :column-ref (lib/ref lat-col)
                                   :value      10}]}]
        (is (=? [{:type :drill-thru/quick-filter}
                 {:type :drill-thru/zoom-in.binning}]
                (lib/available-drill-thrus query -1 context)))
        (test-drill-applications query context)))))

(deftest ^:parallel only-lon-available-drill-thrus-test
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :people)) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (let [field (meta/field-metadata :people :longitude)]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field)))))
        lon-col (m/find-first #(= (:id %) (meta/id :people :longitude))
                              (lib/returned-columns query))]
    (testing "Drills for longitude breakout with no latitude"
      (is (some? lon-col))
      (let [context {:column     lon-col
                     :column-ref (lib/ref lon-col)
                     :value      2
                     :row        [{:column     lon-col
                                   :column-ref (lib/ref lon-col)
                                   :value      10}]}]
        (is (=? [{:type :drill-thru/quick-filter}
                 {:type :drill-thru/zoom-in.binning}]
                (lib/available-drill-thrus query -1 context)))
        (test-drill-applications query context)))))

(deftest ^:parallel regular-binning-with-lat-lon-available-drill-thrus-test
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :people)) $
                (lib/join $ (-> (lib/join-clause (meta/table-metadata :orders)
                                                 [(lib/=
                                                   (meta/field-metadata :people :id)
                                                   (-> (meta/field-metadata :orders :user-id)
                                                       (lib/with-join-alias "Orders")))])
                                (lib/with-join-alias "Orders")
                                (lib/with-join-strategy :left-join)))
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (let [field (meta/field-metadata :people :latitude)]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field))))
                (lib/breakout $ (let [field (meta/field-metadata :people :longitude)]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field))))
                (lib/breakout $ (let [field (-> (meta/field-metadata :orders :subtotal)
                                                (lib/with-join-alias "Orders"))]
                                  (->> (lib/available-binning-strategies $ field)
                                       first
                                       (lib/with-binning field)))))
        lat-col (m/find-first #(= (:id %) (meta/id :people :latitude))
                              (lib/returned-columns query))
        lon-col (m/find-first #(= (:id %) (meta/id :people :longitude))
                              (lib/returned-columns query))]
    (testing "Drills for numeric breakout when lat/lon exist"
      (let [subtotal-col (m/find-first #(= (:id %) (meta/id :orders :subtotal))
                                       (lib/returned-columns query))]
        (is (some? subtotal-col))
        (let [context {:column     subtotal-col
                       :column-ref (lib/ref subtotal-col)
                       :value      2
                       :row        [{:column     lat-col
                                     :column-ref (lib/ref lat-col)
                                     :value      10}
                                    {:column     lon-col
                                     :column-ref (lib/ref lon-col)
                                     :value      10}]}]
          (is (=? [{:type :drill-thru/quick-filter}
                   {:type :drill-thru/zoom-in.binning}]
                  (lib/available-drill-thrus query -1 context)))
          (test-drill-applications query context))))))

(deftest ^:parallel primary-key?-test
  (let [orders+products-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                  (lib/join (lib/join-clause (meta/table-metadata :products)
                                                             [(lib/=
                                                               (meta/field-metadata :orders :product-id)
                                                               (meta/field-metadata :products :id))])))
        source-table-pk       (m/find-first #(= (:id %) (meta/id :orders :id))
                                            (lib/returned-columns orders+products-query))

        joined-table-pk       (m/find-first #(= (:id %) (meta/id :products :id))
                                            (lib/returned-columns orders+products-query))
        source-table-fk       (m/find-first #(= (:id %) (meta/id :orders :product-id))
                                            (lib/returned-columns orders+products-query))]
    (testing "primary key from source table"
      (is (lib.drill-thru.common/primary-key? orders+products-query -1 source-table-pk)))
    (testing "primary key from joined table"
      (is (not (lib.drill-thru.common/primary-key? orders+products-query -1 joined-table-pk))))
    (testing "foreign key from source table"
      (is (not (lib.drill-thru.common/primary-key? orders+products-query -1 source-table-fk))))))

(deftest ^:parallel foreign-key?-test
  (let [products+orders-query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                  (lib/join (lib/join-clause (meta/table-metadata :orders)
                                                             [(lib/=
                                                               (meta/field-metadata :products :id)
                                                               (meta/field-metadata :orders :product-id))])))
        source-table-fk       (m/find-first #(= (:id %) (meta/id :orders :product-id))
                                            (lib/returned-columns orders-query))
        joined-table-fk       (m/find-first #(= (:id %) (meta/id :orders :product-id))
                                            (lib/returned-columns products+orders-query))
        source-table-pk       (m/find-first #(= (:id %) (meta/id :orders :id))
                                            (lib/returned-columns orders-query))]
    (testing "foreign key from source table"
      (is (lib.drill-thru.common/foreign-key? orders-query -1 source-table-fk)))
    (testing "foreign key from joined table"
      (is (not (lib.drill-thru.common/foreign-key? products+orders-query -1 joined-table-fk))))
    (testing "primary key from source table"
      (is (not (lib.drill-thru.common/foreign-key? products+orders-query -1 source-table-pk))))))

(deftest ^:parallel drill-value->js-test
  (testing "should convert :null to nil"
    (doseq [[input expected] [[:null nil]
                              [nil nil]
                              [0 0]
                              ["" ""]
                              ["a" "a"]
                              [{} {}]
                              [[] []]]]
      (is (= expected (lib.drill-thru.common/drill-value->js input))))))

(deftest ^:parallel js->drill-value-test
  (testing "should convert nil to :null"
    (doseq [[input expected] [[nil :null]
                              [0 0]
                              ["" ""]
                              ["a" "a"]
                              [{} {}]
                              [[] []]]]
      (is (= expected (lib.drill-thru.common/js->drill-value input))))))

(deftest ^:parallel js->drill-value->js-test
  (testing "should round trip js->drill-value -> drill-value->js"
    (doseq [input [nil 0 1 "" "a" {} [] {"a" "b"} [nil "a" "b"]]]
      (is (= input (-> input
                       lib.drill-thru.common/js->drill-value
                       lib.drill-thru.common/drill-value->js))))))
