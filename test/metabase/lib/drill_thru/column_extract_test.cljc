(ns metabase.lib.drill-thru.column-extract-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/quick-filter-on-bucketed-date-test]]"
  (:require
   [clojure.test :refer [deftest testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   #?@(:clj  ([metabase.test :as mt])
       :cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private time-extraction-units
  [{:key :hour-of-day, :display-name "Hour of day"}])

(def ^:private date-extraction-units
  [{:key :day-of-month,    :display-name "Day of month"}
   {:key :day-of-week,     :display-name "Day of week"}
   {:key :month-of-year,   :display-name "Month of year"}
   {:key :quarter-of-year, :display-name "Quarter of year"}
   {:key :year,            :display-name "Year"}])

(def ^:private datetime-extraction-units
  (concat time-extraction-units date-extraction-units))

(deftest ^:parallel column-extract-availability-test
  (testing "column-extract is avaiable for column clicks on temporal columns"
    (canned/canned-test
      :drill-thru/column-extract
      (fn [_test-case _context {:keys [click column-type]}]
        (and (= click :header)
             (= column-type :datetime))))))

(deftest ^:parallel returns-column-extract-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-extract
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type        :drill-thru/column-extract
                  :extractions datetime-extraction-units}}))

(defn- case-extraction
  "Returns `=?` friendly value for a `:case`-based extraction, eg. `:day-of-week`.

  `(case-extraction :get-month \"Month of year\" (meta/id :orders :created-at) [\"Jan\" \"Feb\" ... \"Dec\"])`"
  [extraction expression-name field-id labels]
  [:case {:lib/expression-name expression-name}
   (vec (for [[index label] (m/indexed labels)]
          [[:= {} [extraction {} [:field {} field-id]] (inc index)] label]))
   ""])

(deftest ^:parallel apply-column-extract-test-1a-month-of-year
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["month-of-year"]
      :expected-query {:stages [{:expressions
                                 [(case-extraction :get-month "Month of year" (meta/id :orders :created-at)
                                                   ["Jan" "Feb" "Mar" "Apr" "May" "Jun"
                                                    "Jul" "Aug" "Sep" "Oct" "Nov" "Dec"])]}]}})))

(deftest ^:parallel apply-column-extract-test-1b-day-of-week
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["day-of-week"]
      :expected-query {:stages [{:expressions
                                 [(case-extraction :get-day-of-week "Day of week" (meta/id :orders :created-at)
                                                   ["Sunday" "Monday" "Tuesday" "Wednesday" "Thursday"
                                                    "Friday" "Saturday"])]}]}})))

(deftest ^:parallel apply-column-extract-test-1c-quarter
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["quarter-of-year"]
      :expected-query {:stages [{:expressions
                                 [(case-extraction :get-quarter "Quarter of year" (meta/id :orders :created-at)
                                                   ["Q1" "Q2" "Q3" "Q4"])]}]}})))

(deftest ^:parallel apply-column-extract-test-1d-year
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["year"]
      :expected-query {:stages [{:expressions [[:get-year {:lib/expression-name "Year"}
                                                [:field {} (meta/id :orders :created-at)]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1e-day-of-month
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["day-of-month"]
      :expected-query {:stages [{:expressions [[:get-day {:lib/expression-name "Day of month"}
                                                [:field {} (meta/id :orders :created-at)]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1f-hour-of-day
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["hour-of-day"]
      :expected-query {:stages [{:expressions [[:get-hour {:lib/expression-name "Hour of day"}
                                                [:field {} (meta/id :orders :created-at)]]]}]}})))

(deftest ^:parallel apply-column-extract-test-2-duplicate-name
  (testing "column-extract on the same field twice disambiguates the expression names"
    (let [;; The standard ORDERS query but with a :day-of-month extraction already applied.
          query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                    (lib/expression -1 "Day of month" (lib/get-day (meta/field-metadata :orders :created-at))))]
      (lib.drill-thru.tu/test-drill-application
        {:click-type     :header
         :query-type     :unaggregated
         :column-name    "CREATED_AT"
         :drill-type     :drill-thru/column-extract
         :custom-query   query
         :expected       {:type         :drill-thru/column-extract
                          :extractions  datetime-extraction-units
                          :query        query
                          :stage-number -1}
         :drill-args     ["day-of-month"]
         :expected-query {:stages [{:expressions [;; The original
                                                  [:get-day {:lib/expression-name "Day of month"}
                                                   [:field {} (meta/id :orders :created-at)]]
                                                  ;; The newly added one
                                                  [:get-day {:lib/expression-name "Day of month_2"}
                                                   [:field {} (meta/id :orders :created-at)]]]}]}}))))

(deftest ^:parallel apply-column-extract-test-3-aggregated
  (testing "column-extract on an aggregated query appends a new stage"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/max (meta/field-metadata :orders :created-at)))
                    (lib/breakout (meta/field-metadata :products :category)))]
      (lib.drill-thru.tu/test-drill-application
        {:click-type     :header
         :query-type     :aggregated
         :column-name    "max"
         :drill-type     :drill-thru/column-extract
         :custom-query   query
         :expected       {:type         :drill-thru/column-extract
                          :extractions  datetime-extraction-units
                          :query        (lib/append-stage query)
                          :stage-number -1}
         :drill-args     ["day-of-month"]
         :expected-query {:stages [(get-in query [:stages 0])
                                   {:expressions [[:get-day {:lib/expression-name "Day of month"}
                                                   [:field {} "max"]]]}]}}))))

#?(:clj
   ;; TODO: This should be possible to run in CLJS if we have a library for setting the locale in JS.
   ;; Metabase FE has this in frontend/src/metabase/lib/i18n.js but that's loaded after the CLJS.
   (deftest ^:synchronized apply-column-extract-test-4-i18n-labels
     (testing "column-extract with custom labels get i18n'd"
       (mt/with-locale "es"
         (lib.drill-thru.tu/test-drill-application
           {:click-type     :header
            :query-type     :unaggregated
            :column-name    "CREATED_AT"
            :drill-type     :drill-thru/column-extract
            :expected       {:type         :drill-thru/column-extract
                             :extractions  datetime-extraction-units
                             ;; Query unchanged
                             :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                             :stage-number -1}
            :drill-args     ["day-of-week"]
            :expected-query {:stages [{:expressions
                                       [(case-extraction :get-day-of-week "Day of week" (meta/id :orders :created-at)
                                                         ["domingo" "lunes" "martes" "miércoles" "jueves"
                                                          "viernes" "sábado"])]}]}})))))

(deftest ^:parallel column-extract-relevant-units-test-1-time
  (let [ship-time (assoc (meta/field-metadata :orders :created-at)
                         :id             9999001
                         :name           "SHIP_TIME"
                         :display-name   "Ship time"
                         :base-type      :type/Time
                         :effective-type :type/Time
                         :semantic-type  :type/Time)
        mp        (lib/composed-metadata-provider
                    (lib.tu/mock-metadata-provider {:fields [ship-time]})
                    meta/metadata-provider)
        query     (lib/query mp (lib.metadata/table mp (meta/id :orders)))]
    (lib.drill-thru.tu/test-returns-drill
      {:drill-type   :drill-thru/column-extract
       :click-type   :header
       :query-type   :unaggregated
       :column-name  "SHIP_TIME"
       :custom-query query
       :expected     {:type        :drill-thru/column-extract
                      :extractions time-extraction-units}})))

(deftest ^:parallel column-extract-relevant-units-test-2-date
  (let [arrival   (assoc (meta/field-metadata :orders :created-at)
                         :id             9999001
                         :name           "ARRIVAL_DATE"
                         :display-name   "Expected arrival"
                         :base-type      :type/Date
                         :effective-type :type/Date
                         :semantic-type  :type/Date)
        mp        (lib/composed-metadata-provider
                    (lib.tu/mock-metadata-provider {:fields [arrival]})
                    meta/metadata-provider)
        query     (lib/query mp (lib.metadata/table mp (meta/id :orders)))]
    (lib.drill-thru.tu/test-returns-drill
      {:drill-type   :drill-thru/column-extract
       :click-type   :header
       :query-type   :unaggregated
       :column-name  "ARRIVAL_DATE"
       :custom-query query
       :expected     {:type        :drill-thru/column-extract
                      :extractions date-extraction-units}})))
