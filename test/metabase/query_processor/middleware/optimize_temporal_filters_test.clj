(ns metabase.query-processor.middleware.optimize-temporal-filters-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.optimize-temporal-filters :as optimize-temporal-filters]
            [metabase.test :as mt]
            [metabase.util.date-2 :as u.date]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

(defn- optimize-temporal-filters [filter-clause]
  (let [query {:database 1
               :type     :query
               :query    {:filter filter-clause}}]
    (-> (mt/test-qp-middleware optimize-temporal-filters/optimize-temporal-filters query)
        :pre
        (get-in [:query :filter]))))

(deftest optimize-day-bucketed-filter-test
  (testing "Make sure we aren't doing anything wacky when optimzing filters against fields bucketed by day"
    (letfn [(optimize [filter-type]
              (#'optimize-temporal-filters/optimize-filter
               [filter-type
                [:field 1 {:temporal-unit :day}]
                [:absolute-datetime (t/zoned-date-time "2014-03-04T12:30Z[UTC]") :day]]))]
      (testing :<
        (is (= [:<
                [:field 1 {:temporal-unit :default}]
                [:absolute-datetime (t/zoned-date-time "2014-03-04T00:00Z[UTC]") :default]]
               (optimize :<))
            "day(field) < day('2014-03-04T12:30') => day(field) < '2014-03-04' => field < '2014-03-04T00:00'"))
      (testing :<=
        (is (= [:<
                [:field 1 {:temporal-unit :default}]
                [:absolute-datetime (t/zoned-date-time "2014-03-05T00:00Z[UTC]") :default]]
               (optimize :<=))
            "day(field) <= day('2014-03-04T12:30') => day(field) <= '2014-03-04' => field < '2014-03-05T00:00'"))
      (testing :>
        (is (= [:>=
                [:field 1 {:temporal-unit :default}]
                [:absolute-datetime (t/zoned-date-time "2014-03-05T00:00Z[UTC]") :default]]
               (optimize :>))
            "day(field) > day('2014-03-04T12:30') => day(field) > '2014-03-04' => field >= '2014-03-05T00:00'"))
      (testing :>=
        (is (= [:>=
                [:field 1 {:temporal-unit :default}]
                [:absolute-datetime (t/zoned-date-time "2014-03-04T00:00Z[UTC]") :default]]
               (optimize :>=))
            "day(field) >= day('2014-03-04T12:30') => day(field) >= '2014-03-04' => field >= '2014-03-04T00:00'")))))

(def ^:private test-units-and-values
  [{:unit         :second
    :filter-value (u.date/parse "2019-09-24T12:19:30.500Z" "UTC")
    :lower        (u.date/parse "2019-09-24T12:19:30.000Z" "UTC")
    :upper        (u.date/parse "2019-09-24T12:19:31.000Z" "UTC")}
   {:unit         :minute
    :filter-value (u.date/parse "2019-09-24T12:19:30.000Z" "UTC")
    :lower        (u.date/parse "2019-09-24T12:19:00.000Z" "UTC")
    :upper        (u.date/parse "2019-09-24T12:20:00.000Z" "UTC")}
   {:unit         :hour
    :filter-value (u.date/parse "2019-09-24T12:30:00.000Z" "UTC")
    :lower        (u.date/parse "2019-09-24T12:00:00.000Z" "UTC")
    :upper        (u.date/parse "2019-09-24T13:00:00.000Z" "UTC")}
   {:unit         :day
    :filter-value (u.date/parse "2019-09-24T12:00:00.000Z" "UTC")
    :lower        (u.date/parse "2019-09-24" "UTC")
    :upper        (u.date/parse "2019-09-25" "UTC")}
   {:unit         :week
    :filter-value (u.date/parse "2019-09-24" "UTC")
    :lower        (u.date/parse "2019-09-22" "UTC")
    :upper        (u.date/parse "2019-09-29" "UTC")}
   {:unit         :month
    :filter-value (u.date/parse "2019-09-24" "UTC")
    :lower        (u.date/parse "2019-09-01" "UTC")
    :upper        (u.date/parse "2019-10-01" "UTC")}
   {:unit         :quarter
    :filter-value (u.date/parse "2019-09-01" "UTC")
    :lower        (u.date/parse "2019-07-01" "UTC")
    :upper        (u.date/parse "2019-10-01" "UTC")}
   {:unit         :year
    :filter-value (u.date/parse "2019-09-24" "UTC")
    :lower        (u.date/parse "2019-01-01" "UTC")
    :upper        (u.date/parse "2020-01-01" "UTC")}])

(deftest optimize-temporal-filters-test
  (driver/with-driver ::timezone-driver
    (doseq [{:keys [unit filter-value lower upper]} test-units-and-values]
      (let [lower [:absolute-datetime lower :default]
            upper [:absolute-datetime upper :default]]
        (testing unit
          (testing :=
            (is (= [:and
                    [:>= [:field 1 {:temporal-unit :default}] lower]
                    [:< [:field 1 {:temporal-unit :default}] upper]]
                   (optimize-temporal-filters
                    [:=
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]]))))
          (testing :!=
            (is (= [:or
                    [:< [:field 1 {:temporal-unit :default}] lower]
                    [:>= [:field 1 {:temporal-unit :default}] upper]]
                   (optimize-temporal-filters
                    [:!=
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]]))))
          (testing :<
            (is (= [:< [:field 1 {:temporal-unit :default}] lower]
                   (optimize-temporal-filters
                    [:<
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]]))))
          (testing :<=
            (is (= [:< [:field 1 {:temporal-unit :default}] upper]
                   (optimize-temporal-filters
                    [:<=
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]]))))
          (testing :>
            (is (= [:>= [:field 1 {:temporal-unit :default}] upper]
                   (optimize-temporal-filters
                    [:>
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]]))))
          (testing :>=
            (is (= [:>= [:field 1 {:temporal-unit :default}] lower]
                   (optimize-temporal-filters
                    [:>=
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]]))))
          (testing :between
            (is (= [:and
                    [:>= [:field 1 {:temporal-unit :default}] lower]
                    [:< [:field 1 {:temporal-unit :default}] upper]]
                   (optimize-temporal-filters
                    [:between
                     [:field 1 {:temporal-unit unit}]
                     [:absolute-datetime filter-value unit]
                     [:absolute-datetime filter-value unit]])))))))))

(defn- optimize-filter-clauses [t]
  (let [query {:database 1
               :type     :query
               :query    {:filter [:=
                                   [:field 1 {:temporal-unit :day}]
                                   [:absolute-datetime t :day]]}}]
    (-> (mt/test-qp-middleware optimize-temporal-filters/optimize-temporal-filters query)
        (get-in [:pre :query :filter]))))

(deftest timezones-test
  (driver/with-driver ::timezone-driver
    (doseq [timezone-id ["UTC" "US/Pacific"]]
      (testing (format "%s timezone" timezone-id)
        (let [t     (u.date/parse "2015-11-18" timezone-id)
              lower (t/zoned-date-time (t/local-date 2015 11 18) (t/local-time 0) timezone-id)
              upper (t/zoned-date-time (t/local-date 2015 11 19) (t/local-time 0) timezone-id)]
          (mt/with-report-timezone-id timezone-id
            (testing "lower-bound and upper-bound util fns"
              (is (= lower
                     (#'optimize-temporal-filters/temporal-literal-lower-bound :day t))
                  (format "lower bound of day(%s) in the %s timezone should be %s" t timezone-id lower))
              (is (= upper
                     (#'optimize-temporal-filters/temporal-literal-upper-bound :day t))
                  (format "upper bound of day(%s) in the %s timezone should be %s" t timezone-id upper)))
            (testing "optimize-with-datetime"
              (let [expected [:and
                              [:>= [:field 1 {:temporal-unit :default}] [:absolute-datetime lower :default]]
                              [:<  [:field 1 {:temporal-unit :default}] [:absolute-datetime upper :default]]]]
                (is (= expected
                       (optimize-filter-clauses t))
                    (format "= %s in the %s timezone should be optimized to range %s -> %s"
                            t timezone-id lower upper))))))))))

(deftest skip-optimization-test
  (let [clause [:= [:field 1 {:temporal-unit :day}] [:absolute-datetime #t "2019-01-01" :month]]]
    (is (= clause
           (optimize-temporal-filters clause))
        "Filters with different units in the datetime field and absolute-datetime shouldn't get optimized")))

;; Make sure the optimization logic is actually applied in the resulting native query!
(defn- filter->sql [filter-clause]
  (let [result (qp/query->native
                 (mt/mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      filter-clause}))]
    (update result :query #(-> (last (re-matches #"^.*(WHERE .*$)" %))
                               (str/replace #"\"" "")
                               (str/replace #"PUBLIC\." "")))))

(deftest e2e-test
  (testing :=
    (is (= {:query  "WHERE (CHECKINS.DATE >= ? AND CHECKINS.DATE < ?)"
            :params [(t/zoned-date-time (t/local-date 2019 9 24) (t/local-time 0) "UTC")
                     (t/zoned-date-time (t/local-date 2019 9 25) (t/local-time 0) "UTC")]}
           (mt/$ids checkins
             (filter->sql [:= !day.date "2019-09-24T12:00:00.000Z"])))))
  (testing :<
    (is (= {:query  "WHERE CHECKINS.DATE < ?"
            :params [(t/zoned-date-time (t/local-date 2019 9 24) (t/local-time 0) "UTC")]}
           (mt/$ids checkins
             (filter->sql [:< !day.date "2019-09-24T12:00:00.000Z"])))))
  (testing :between
    (is (= {:query  "WHERE (CHECKINS.DATE >= ? AND CHECKINS.DATE < ?)"
            :params [(t/zoned-date-time (t/local-date 2019  9 1) (t/local-time 0) "UTC")
                     (t/zoned-date-time (t/local-date 2019 11 1) (t/local-time 0) "UTC")]}
           (mt/$ids checkins
             (filter->sql [:between !month.date "2019-09-02T12:00:00.000Z" "2019-10-05T12:00:00.000Z"]))))
    (is (= {:query "WHERE (CHECKINS.DATE >= ? AND CHECKINS.DATE < ?)"
            :params           [(t/zoned-date-time "2019-09-01T00:00Z[UTC]")
                               (t/zoned-date-time "2019-10-02T00:00Z[UTC]")]}
           (mt/$ids checkins
             (filter->sql [:between !day.date "2019-09-01" "2019-10-01"]))))))

(deftest optimize-relative-datetimes-test
  (testing "Should optimize relative-datetime clauses (#11837)"
    (mt/dataset attempted-murders
      ;; second/millisecond are not currently allowed in `:relative-datetime`, but if we add them we can re-enable
      ;; their tests
      (doseq [unit [#_:millisecond #_:second :minute :hour :day :week :month :quarter :year]]
        (testing (format "last %s" unit)
          (is (= (mt/mbql-query attempts
                   {:aggregation [[:count]]
                    :filter      [:and
                                  [:>=
                                   [:field %datetime {:temporal-unit :default}]
                                   [:relative-datetime -1 unit]]
                                  [:<
                                   [:field %datetime {:temporal-unit :default}]
                                   [:relative-datetime 0 unit]]]})

                 (optimize-temporal-filters
                  (mt/mbql-query attempts
                    {:aggregation [[:count]]
                     :filter      [:=
                                   [:field %datetime {:temporal-unit unit}]
                                   [:relative-datetime -1 unit]]})))))
        (testing (format "this %s" unit)
          ;; test the various different ways we might refer to 'now'
          (doseq [clause [[:relative-datetime 0]
                          [:relative-datetime :current]
                          [:relative-datetime 0 unit]]]
            (testing (format "clause = %s" (pr-str clause))
              (is (= (mt/mbql-query attempts
                       {:aggregation [[:count]]
                        :filter      [:and
                                      [:>=
                                       [:field %datetime {:temporal-unit :default}]
                                       [:relative-datetime 0 unit]]
                                      [:<
                                       [:field %datetime {:temporal-unit :default}]
                                       [:relative-datetime 1 unit]]]})
                     (optimize-temporal-filters
                      (mt/mbql-query attempts
                        {:aggregation [[:count]]
                         :filter      [:=
                                       [:field %datetime {:temporal-unit unit}]
                                       clause]})))))))
        (testing (format "next %s" unit)
          (is (= (mt/mbql-query attempts
                   {:aggregation [[:count]]
                    :filter      [:and
                                  [:>=
                                   [:field %datetime {:temporal-unit :default}]
                                   [:relative-datetime 1 unit]]
                                  [:<
                                   [:field %datetime {:temporal-unit :default}]
                                   [:relative-datetime 2 unit]]]})
                 (optimize-temporal-filters
                  (mt/mbql-query attempts
                    {:aggregation [[:count]]
                     :filter      [:=
                                   [:field %datetime {:temporal-unit unit}]
                                   [:relative-datetime 1 unit]]})))))))))

(deftest optimize-mixed-temporal-values-test
  (testing "We should be able to optimize mixed usages of `:absolute-datetime` and `:relative-datetime`"
    (mt/dataset attempted-murders
      (testing "between month(2021-01-15) and month(now) [inclusive]"
        ;; i.e. between 2021-01-01T00:00:00 and [first-day-of-next-month]T00:00:00
        (is (= (mt/mbql-query attempts
                 {:aggregation [[:count]]
                  :filter      [:and
                                [:>=
                                 [:field %datetime {:temporal-unit :default}]
                                 [:absolute-datetime #t "2021-01-01T00:00:00Z" :default]]
                                [:<
                                 [:field %datetime {:temporal-unit :default}]
                                 [:relative-datetime 1 :month]]]})
               (optimize-temporal-filters
                (mt/mbql-query attempts
                  {:aggregation [[:count]]
                   :filter      [:between
                                 [:field %datetime {:temporal-unit :month}]
                                 [:absolute-datetime #t "2021-01-15T00:00:00Z" :month]
                                 [:relative-datetime 0]]}))))))))

(deftest optimize-relative-datetimes-e2e-test
  (testing "Should optimize relative-datetime clauses (#11837)"
    (mt/dataset attempted-murders
      (is (= (str "SELECT count(*) AS \"count\" "
                  "FROM \"PUBLIC\".\"ATTEMPTS\" "
                  "WHERE"
                  " (\"PUBLIC\".\"ATTEMPTS\".\"DATETIME\""
                  " >= parsedatetime(formatdatetime(dateadd('month', CAST(-1 AS long), now()), 'yyyyMM'), 'yyyyMM')"
                  " AND"
                  " \"PUBLIC\".\"ATTEMPTS\".\"DATETIME\""
                  " < parsedatetime(formatdatetime(now(), 'yyyyMM'), 'yyyyMM'))")
             (:query
              (qp/query->native
               (mt/mbql-query attempts
                 {:aggregation [[:count]]
                  :filter      [:time-interval $datetime :last :month]}))))))))

(deftest flatten-filters-test
  (testing "Should flatten the `:filter` clause after optimizing"
    (mt/$ids checkins
      (is (= [:and
              [:= $venue_id 1]
              [:>= [:field %date {:temporal-unit :default}] [:relative-datetime -1 :month]]
              [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]]
             (optimize-temporal-filters
              [:and
               [:= $venue_id 1]
               [:= [:field %date {:temporal-unit :month}] [:relative-datetime -1 :month]]]))))))

(deftest deduplicate-filters-tets
  (testing "Should deduplicate the optimized filters with any existing ones"
    (mt/$ids checkins
      (is (= [:and
              [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]
              [:>= [:field %date {:temporal-unit :default}] [:relative-datetime -1 :month]]]
             (optimize-temporal-filters
              [:and
               [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]
               [:= [:field %date {:temporal-unit :month}] [:relative-datetime -1 :month]]]))))))

(deftest optimize-filters-all-levels-test
  (testing "Should optimize filters at all levels of the query"
    (mt/$ids checkins
      (is (= (mt/mbql-query checkins
               {:source-query
                {:source-table $$checkins
                 :filter       [:and
                                [:>= [:field %date {:temporal-unit :default}] [:relative-datetime -1 :month]]
                                [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]]}})
             (:pre
              (mt/test-qp-middleware
               optimize-temporal-filters/optimize-temporal-filters
               (mt/mbql-query checkins
                 {:source-query
                  {:source-table $$checkins
                   :filter       [:= [:field %date {:temporal-unit :month}] [:relative-datetime -1 :month]]}}))))))))
