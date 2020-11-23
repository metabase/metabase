(ns metabase.query-processor.middleware.optimize-datetime-filters-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.query-processor.middleware.optimize-datetime-filters :as optimize-datetime-filters]
            [metabase.util.date-2 :as u.date]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

(defn- optimize-datetime-filters [filter-clause]
  (let [query {:database 1
               :type     :query
               :query    {:filter filter-clause}}]
    (-> (mt/test-qp-middleware optimize-datetime-filters/optimize-datetime-filters query)
        :pre
        (get-in [:query :filter]))))

(deftest optimize-day-bucketed-filter-test
  (testing "Make sure we aren't doing anything wacky when optimzing filters against fields bucketed by day"
    (letfn [(optimize [filter-type]
              (#'optimize-datetime-filters/optimize-filter
               [filter-type
                [:datetime-field [:field-id 1] :day]
                [:absolute-datetime (t/zoned-date-time "2014-03-04T12:30Z[UTC]") :day]]))]
      (testing :<
        (is (= [:<
                [:datetime-field [:field-id 1] :default]
                [:absolute-datetime (t/zoned-date-time "2014-03-04T00:00Z[UTC]") :default]]
               (optimize :<))
            "day(field) < day('2014-03-04T12:30') => day(field) < '2014-03-04' => field < '2014-03-04T00:00'"))
      (testing :<=
        (is (= [:<
                [:datetime-field [:field-id 1] :default]
                [:absolute-datetime (t/zoned-date-time "2014-03-05T00:00Z[UTC]") :default]]
               (optimize :<=))
            "day(field) <= day('2014-03-04T12:30') => day(field) <= '2014-03-04' => field < '2014-03-05T00:00'"))
      (testing :>
        (is (= [:>=
                [:datetime-field [:field-id 1] :default]
                [:absolute-datetime (t/zoned-date-time "2014-03-05T00:00Z[UTC]") :default]]
               (optimize :>))
            "day(field) > day('2014-03-04T12:30') => day(field) > '2014-03-04' => field >= '2014-03-05T00:00'"))
      (testing :>=
        (is (= [:>=
                [:datetime-field [:field-id 1] :default]
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

(deftest optimize-datetime-filters-test
  (driver/with-driver ::timezone-driver
    (doseq [{:keys [unit filter-value lower upper]} test-units-and-values]
      (let [lower [:absolute-datetime lower :default]
            upper [:absolute-datetime upper :default]]
        (testing unit
          (testing :=
            (is (= [:and
                    [:>= [:datetime-field [:field-id 1] :default] lower]
                    [:< [:datetime-field [:field-id 1] :default] upper]]
                   (optimize-datetime-filters
                    [:=
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]]))))
          (testing :!=
            (is (= [:or
                    [:< [:datetime-field [:field-id 1] :default] lower]
                    [:>= [:datetime-field [:field-id 1] :default] upper]]
                   (optimize-datetime-filters
                    [:!=
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]]))))
          (testing :<
            (is (= [:< [:datetime-field [:field-id 1] :default] lower]
                   (optimize-datetime-filters
                    [:<
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]]))))
          (testing :<=
            (is (= [:< [:datetime-field [:field-id 1] :default] upper]
                   (optimize-datetime-filters
                    [:<=
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]]))))
          (testing :>
            (is (= [:>= [:datetime-field [:field-id 1] :default] upper]
                   (optimize-datetime-filters
                    [:>
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]]))))
          (testing :>=
            (is (= [:>= [:datetime-field [:field-id 1] :default] lower]
                   (optimize-datetime-filters
                    [:>=
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]]))))
          (testing :between
            (is (= [:and
                    [:>= [:datetime-field [:field-id 1] :default] lower]
                    [:< [:datetime-field [:field-id 1] :default] upper]]
                   (optimize-datetime-filters
                    [:between
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]
                     [:absolute-datetime filter-value unit]])))))))))

(defn- optimize-with-timezone [t]
  (let [query {:database 1
               :type     :query
               :query    {:filter [:=
                                   [:datetime-field [:field-id 1] :day]
                                   [:absolute-datetime t :day]]}}]
    (-> (mt/test-qp-middleware optimize-datetime-filters/optimize-datetime-filters query)
        :pre
        (get-in [:query :filter]))))

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
                     (#'optimize-datetime-filters/lower-bound :day t))
                  (format "lower bound of day(%s) in the %s timezone should be %s" t timezone-id lower))
              (is (= upper
                     (#'optimize-datetime-filters/upper-bound :day t))
                  (format "upper bound of day(%s) in the %s timezone should be %s" t timezone-id upper)))
            (testing "optimize-with-datetime"
              (let [expected [:and
                              [:>= [:datetime-field [:field-id 1] :default] [:absolute-datetime lower :default]]
                              [:<  [:datetime-field [:field-id 1] :default] [:absolute-datetime upper :default]]]]
                (is (= expected
                       (optimize-with-timezone t))
                    (format "= %s in the %s timezone should be optimized to range %s -> %s"
                            t timezone-id lower upper))))))))))

(deftest skip-optimization-test
  (let [clause [:= [:datetime-field [:field-id 1] :day] [:absolute-datetime #t "2019-01-01" :month]]]
    (is (= clause
           (optimize-datetime-filters clause))
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
