(ns metabase.lib.drill-thru.zoom-in-timeseries-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.drill-thru.zoom-in-timeseries :as lib.drill-thru.zoom-in-timeseries]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.merged-mock :as merged-mock]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel zoom-in-timeseries-available-test
  (testing "zoom-in for bins is available for cells, pivots and legends on numeric columns which have binning set"
    (canned/canned-test
     :drill-thru/zoom-in.timeseries
     (fn [test-case context {:keys [click]}]
       (and (#{:cell :pivot :legend} click)
            (not (:native? test-case))
            (seq (for [dim (:dimensions context)
                       :when (and (isa? (:effective-type (:column dim)) :type/DateTime)
                                  (lib/temporal-bucket (:column dim)))]
                   dim)))))))

(deftest ^:parallel zoom-in-timeseries-e2e-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/count))
                  (lib/breakout (meta/field-metadata :products :category))
                  (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year)))]
    (is (=? {:stages [{:aggregation [[:count {}]]
                       :breakout    [[:field {} (meta/id :products :category)]
                                     [:field {:temporal-unit :year} (meta/id :orders :created-at)]]}]}
            query))
    (let [columns    (lib/returned-columns query)
          created-at (m/find-first #(and (= (:id %) (meta/id :orders :created-at))
                                         (= (lib.temporal-bucket/raw-temporal-bucket %) :year))
                                   (lib/returned-columns query))
          _          (assert created-at)
          count-col  (m/find-first #(= (:name %) "count") columns)
          _          (assert count-col)
          drill      (lib.drill-thru.zoom-in-timeseries/zoom-in-timeseries-drill
                      query -1
                      {:column     count-col
                       :column-ref (lib/ref count-col)
                       :value 200
                       :dimensions [{:column     created-at
                                     :column-ref (lib/ref created-at)
                                     :value      2022}]})]
      (is (=? {:type         :drill-thru/zoom-in.timeseries
               :dimension    {:column     {:id                               (meta/id :orders :created-at)
                                           :metabase.lib.field/temporal-unit :year}
                              :column-ref [:field {} (meta/id :orders :created-at)]
                              :value      2022}
               :next-unit    :quarter
               :display-name "See this year by quarter"}
              drill))
      (is (=? {:display-name "See this year by quarter"}
              (lib/display-info query -1 drill)))
      (let [query' (lib/drill-thru query -1 nil drill)]
        (is (=? {:stages [{:aggregation [[:count {}]]
                           :breakout    [[:field {} (meta/id :products :category)]
                                         [:field {:temporal-unit :quarter} (meta/id :orders :created-at)]]
                           :filters     [[:=
                                          {}
                                          [:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                          2022]]}]}
                query'))
        (let [columns    (lib/returned-columns query')
              created-at (m/find-first #(and (= (:id %) (meta/id :orders :created-at))
                                             (= (lib.temporal-bucket/raw-temporal-bucket %) :quarter))
                                       columns)
              _          (assert created-at)
              drill      (lib.drill-thru.zoom-in-timeseries/zoom-in-timeseries-drill
                          query' -1
                          {:column     count-col
                           :column-ref (lib/ref count-col)
                           :value      19
                           :dimensions [{:column     created-at
                                         :column-ref (lib/ref created-at)
                                         :value      "2022-04-01T00:00:00"}]})]
          (is (=? {:type         :drill-thru/zoom-in.timeseries
                   :dimension    {:column     {:id                               (meta/id :orders :created-at)
                                               :metabase.lib.field/temporal-unit :quarter}
                                  :column-ref [:field {} (meta/id :orders :created-at)]
                                  :value      "2022-04-01T00:00:00"}
                   :next-unit    :month
                   :display-name "See this quarter by month"}
                  drill))
          (is (=? {:display-name "See this quarter by month"}
                  (lib/display-info query' -1 drill)))
          (let [query'' (lib/drill-thru query' -1 nil drill)]
            (is (=? {:stages [{:aggregation [[:count {}]]
                               :breakout    [[:field {} (meta/id :products :category)]
                                             [:field {:temporal-unit :month} (meta/id :orders :created-at)]]
                               ;; if we were SMART we could remove the first filter clause since it's not adding any
                               ;; value, but it won't hurt anything other than performance to keep it there. QP can
                               ;; generate optimal filters anyway
                               :filters     [[:=
                                              {}
                                              [:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                              2022]
                                             [:=
                                              {}
                                              [:field {:temporal-unit :quarter} (meta/id :orders :created-at)]
                                              "2022-04-01T00:00:00"]]}]}
                    query''))))))))

(defn- valid-current-units-for-field
  [table field]
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata table))
                  (lib/aggregate (lib/count))
                  (lib/breakout (-> (meta/field-metadata table field)
                                    (lib/with-temporal-bucket :year))))
        breakout (first (lib/breakouts query))]
    (#'lib.drill-thru.zoom-in-timeseries/valid-current-units query -1 breakout)))

(def ^:private datetime-unit-pairs
  (partition 2 1 (valid-current-units-for-field :orders :created-at)))

(def ^:private date-unit-pairs
  (partition 2 1 (valid-current-units-for-field :people :birth-date)))

(defn- zoom-in-timeseries-drill-for-orders-created-at
  ([column-name temporal-unit custom-row]
   (zoom-in-timeseries-drill-for-orders-created-at meta/metadata-provider column-name temporal-unit custom-row))
  ([metadata-provider column-name temporal-unit custom-row]
   {:drill-type   :drill-thru/zoom-in.timeseries
    :click-type   :cell
    :query-type   :aggregated
    :column-name  column-name
    :custom-query (-> (lib/query metadata-provider
                                 (lib.metadata/table metadata-provider (meta/id :orders)))
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/sum (lib.metadata/field metadata-provider (meta/id :orders :tax))))
                      (lib/aggregate (lib/max (lib.metadata/field metadata-provider (meta/id :orders :discount))))
                      (lib/breakout (-> (lib.metadata/field metadata-provider (meta/id :orders :created-at))
                                        (lib/with-temporal-bucket temporal-unit))))
    :custom-row   (merge {"count" 77, "sum" 1, "max" nil} custom-row)
    :expected     {:type :drill-thru/zoom-in.timeseries}}))

(deftest ^:parallel returns-zoom-in-timeseries-for-datetime-column-test
  (testing "zoom-in.timeseries should be returned for DateTime dimension (#33811)"
    (doseq [aggregation ["count" "sum" "max"]
            bucketing   (map first datetime-unit-pairs)]
      (testing (str "aggregation = " aggregation ", bucketing = " bucketing)
        (lib.drill-thru.tu/test-returns-drill
         (zoom-in-timeseries-drill-for-orders-created-at
          meta/metadata-provider
          aggregation
          bucketing
          {"CREATED_AT" "2022-12-01T00:00:00+02:00"}))))))

(def ^:private metadata-provider-with-orders-created-at-as-date
  (merged-mock/merged-mock-metadata-provider
   meta/metadata-provider
   {:fields [{:id             (meta/id :orders :created-at)
              :base-type      :type/Date
              :effective-type :type/Date
              :semantic-type  :type/CreationDate
              :database-type  "DATE"}]}))

(deftest ^:parallel returns-zoom-in-timeseries-for-date-column-test
  (testing "zoom-in.timeseries should be returned for Date dimension (#33811, #39366)"
    (doseq [aggregation ["count" "sum" "max"]
            bucketing   (map first date-unit-pairs)]
      (testing (str "aggregation = " aggregation ", bucketing = " bucketing)
        (lib.drill-thru.tu/test-returns-drill
         (zoom-in-timeseries-drill-for-orders-created-at
          metadata-provider-with-orders-created-at-as-date
          aggregation
          bucketing
          {"CREATED_AT" "2022-12-01"}))))))

(deftest ^:parallel does-not-return-zoom-in-timeseries-for-date-column-with-time-temporal-unit-test
  (testing "zoom-in.timeseries should be returned for Date dimension (#33811, #39366)"
    (doseq [aggregation ["count" "sum" "max"]
            ;; :day is valid as a *current* unit, but the next unit will be :hour, which is invalid for a Date column,
            ;; and hence no zoom-in-timeseries drill thru should be returned.
            bucketing   [:day :hour]]
      (testing (str "aggregation = " aggregation ", bucketing = " bucketing)
        (lib.drill-thru.tu/test-drill-not-returned
         (zoom-in-timeseries-drill-for-orders-created-at
          metadata-provider-with-orders-created-at-as-date
          aggregation
          bucketing
          {"CREATED_AT" "2022-12-01"}))))))

(deftest ^:parallel returns-zoom-in-timeseries-for-multi-stage-query-test
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/zoom-in.timeseries
    :click-type   :cell
    :query-type   :aggregated
    :column-name  "count"
    :custom-query #(lib.drill-thru.tu/append-filter-stage % "count")
    :expected     {:type      :drill-thru/zoom-in.timeseries
                   :next-unit :week
                   ;; the "underlying" dimension is reconstructed from the row.
                   :dimension {:column     {:name       "CREATED_AT"
                                            :lib/source :source/breakouts}
                               :column-ref [:field {} (meta/id :orders :created-at)]
                               :value      "2022-12-01T00:00:00+02:00"}}}))

(deftest ^:parallel returns-zoom-in-timeseries-e2e-test-2
  (testing "zoom-in.timeseries should be returned for a"
    (let [base-query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                (lib/aggregate (lib/count))
                                (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                                  (lib/with-temporal-bucket :year))))
          created-at-col    (m/find-first #(= (:name %) "CREATED_AT")
                                          (lib/returned-columns base-query))
          _                 (is (some? created-at-col))
          multi-stage-query (lib.drill-thru.tu/append-filter-stage base-query "count")]
      (doseq [[query-type query] {"single-stage" base-query
                                  "multi-stage" multi-stage-query}
              [message context]  {"pivot cell (no column, value = NULL) (#36173)"
                                  {:value      :null
                                   :column     nil
                                   :column-ref nil
                                   :dimensions [{:column     created-at-col
                                                 :column-ref (lib/ref created-at-col)
                                                 :value      "2022-12-01T00:00:00+02:00"}]}

                                  "legend item (no column, no value) (#36173)"
                                  {:value      nil
                                   :column     nil
                                   :column-ref nil
                                   :dimensions [{:column     created-at-col
                                                 :column-ref (lib/ref created-at-col)
                                                 :value      "2022-12-01T00:00:00+02:00"}]}}]
        (testing (str query-type " query: " message)
          (let [[drill :as drills] (filter #(= (:type %) :drill-thru/zoom-in.timeseries)
                                           (lib/available-drill-thrus query -1 context))
                ;; both queries have the base-query stage where the drill filter should be added
                expected-query (cond-> {:stages
                                        [{:aggregation [[:count {}]]
                                          :breakout    [[:field
                                                         {:temporal-unit :quarter}
                                                         (meta/id :orders :created-at)]],
                                          :filters     [[:=
                                                         {}
                                                         [:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                                         "2022-12-01T00:00:00+02:00"]]}]}
                                 (= query multi-stage-query)
                                 (lib.drill-thru.tu/append-filter-stage-to-test-expectation "count"))]
            (is (= 1
                   (count drills)))
            (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
                     :display-name "See this year by quarter"
                     :type         :drill-thru/zoom-in.timeseries
                     :dimension    {:column {:name "CREATED_AT"}
                                    :value  "2022-12-01T00:00:00+02:00"}
                     :next-unit    :quarter}
                    drill))
            (is (=? expected-query
                    (lib/drill-thru query -1 nil drill)))))))))

(deftest ^:parallel zoom-in-timeseries-unit-tower-test
  (doseq [[unit1 unit2] datetime-unit-pairs]
    (let [base-query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                (lib/aggregate (lib/count))
                                (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                                  (lib/with-temporal-bucket unit1))))
          multi-stage-query (lib.drill-thru.tu/append-filter-stage base-query "count")]
      (doseq [[query-type query] {"single-stage" base-query
                                  "multi-stage"  multi-stage-query}]
        (testing (str "zoom-in.timeseries for a DateTime column in a " query-type " query should zoom from " unit1 " to " unit2)
          (let [expected-query (cond-> {:stages
                                        [{:source-table (meta/id :orders)
                                          :aggregation  [[:count {}]]
                                          :breakout     [[:field
                                                          {:temporal-unit unit2}
                                                          (meta/id :orders :created-at)]]
                                          :filters      [[:= {}
                                                          [:field
                                                           {:temporal-unit unit1}
                                                           (meta/id :orders :created-at)]
                                                          "2022-12-09T11:22:33+02:00"]]}]}
                                 (= query multi-stage-query)
                                 (lib.drill-thru.tu/append-filter-stage-to-test-expectation "count"))]
            (lib.drill-thru.tu/test-drill-application
             {:click-type     :cell
              :query-type     :aggregated
              :custom-query   query
              :custom-row     {"count"      100
                               "CREATED_AT" "2022-12-09T11:22:33+02:00"}
              :column-name    "count"
              :drill-type     :drill-thru/zoom-in.timeseries
              :expected       {:type         :drill-thru/zoom-in.timeseries
                               :display-name (str "See this " (name unit1) " by " (name unit2))
                               :dimension    {:column     {:name "CREATED_AT"}
                                              :column-ref [:field {:temporal-unit unit1} (meta/id :orders :created-at)]
                                              :value      "2022-12-09T11:22:33+02:00"}
                               :next-unit    unit2}
              :expected-query expected-query})))))))

(deftest ^:parallel zoom-in-timeseries-unit-tower-test-2
  (doseq [[unit1 unit2] date-unit-pairs]
    (testing (str "zoom-in.timeseries for a Date column should zoom from " unit1 " to " unit2)
      (let [query (-> (lib/query metadata-provider-with-orders-created-at-as-date
                                 (lib.metadata/table metadata-provider-with-orders-created-at-as-date
                                                     (meta/id :orders)))
                      (lib/aggregate (lib/count))
                      (lib/breakout (-> (lib.metadata/field metadata-provider-with-orders-created-at-as-date
                                                            (meta/id :orders :created-at))
                                        (lib/with-temporal-bucket unit1))))]
        (lib.drill-thru.tu/test-drill-application
         {:click-type     :cell
          :query-type     :aggregated
          :custom-query   query
          :custom-row     {"count"      100
                           "CREATED_AT" "2022-12-09"}
          :column-name    "count"
          :drill-type     :drill-thru/zoom-in.timeseries
          :expected       {:type         :drill-thru/zoom-in.timeseries
                           :display-name (str "See this " (name unit1) " by " (name unit2))
                           :dimension    {:column     {:name "CREATED_AT"}
                                          :column-ref [:field {:temporal-unit unit1} (meta/id :orders :created-at)]
                                          :value      "2022-12-09"}
                           :next-unit    unit2}
          :expected-query {:stages [{:source-table (meta/id :orders)
                                     :aggregation  [[:count {}]]
                                     :breakout     [[:field
                                                     {:temporal-unit unit2}
                                                     (meta/id :orders :created-at)]]
                                     :filters      [[:= {}
                                                     [:field {:temporal-unit unit1} (meta/id :orders :created-at)]
                                                     "2022-12-09"]]}]}})))))
