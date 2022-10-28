(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.test :as mt]
            [metabase.util.date-2 :as u.date]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Date extract tests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn test-temporal-extract
  [{:keys [aggregation breakout expressions fields filter limit]}]
  (if breakout
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :breakout    breakout})
         (mt/formatted-rows [int int]))
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :fields      fields})
         (mt/formatted-rows [int])
         (map first))))

(mt/defdataset times-mixed
  [["times" [{:field-name "index"
              :base-type :type/Integer}
             {:field-name "dt"
              :base-type :type/DateTime}
             {:field-name "d"
              :base-type :type/Date}
             {:field-name "as_dt"
              :base-type :type/Text
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/ISO8601->DateTime}
             {:field-name "as_d"
              :base-type :type/Text
              :effective-type :type/Date
              :coercion-strategy :Coercion/ISO8601->Date}]
    [[1 #t "2004-03-19 09:19:09" #t "2004-03-19" "2004-03-19 09:19:09" "2004-03-19"]
     [2 #t "2008-06-20 10:20:10" #t "2008-06-20" "2008-06-20 10:20:10" "2008-06-20"]
     [3 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]
     [4 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]]]])

(def ^:private temporal-extraction-op->unit
  {:get-second      :second-of-minute
   :get-minute      :minute-of-hour
   :get-hour        :hour-of-day
   :get-day-of-week :day-of-week
   :get-day         :day-of-month
   :get-week        :week-of-year
   :get-month       :month-of-year
   :get-quarter     :quarter-of-year
   :get-year        :year})

(defn- extract
  [x op]
  (u.date/extract x (temporal-extraction-op->unit op)))

(def ^:private extraction-test-cases
  [{:expected-fn (fn [op]          [(extract #t "2004-03-19 09:19:09" op) (extract #t "2008-06-20 10:20:10" op)
                                    (extract #t "2012-11-21 11:21:11" op) (extract #t "2012-11-21 11:21:11" op)])
    :query-fn    (fn [op field-id] {:expressions {"expr" [op [:field field-id nil]]}
                                    :fields      [[:expression "expr"]]})}
   {:expected-fn (fn [op]          (into [] (frequencies [(extract #t "2004-03-19 09:19:09" op)
                                                          (extract #t "2008-06-20 10:20:10" op)
                                                          (extract #t "2012-11-21 11:21:11" op)
                                                          (extract #t "2012-11-21 11:21:11" op)])))
    :query-fn    (fn [op field-id] {:expressions {"expr" [op [:field field-id nil]]}
                                    :aggregation [[:count]]
                                    :breakout    [[:expression "expr"]]})}])

(deftest extraction-function-tests
  (mt/dataset times-mixed
    ;; need to have seperate tests for mongo because it doesn't have supports for casting yet
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :temporal-extract) :mongo)
      (testing "with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                op                  [:get-year :get-quarter :get-month :get-day
                                     :get-day-of-week :get-hour :get-minute :get-second]
                {:keys [expected-fn query-fn]}
                extraction-test-cases]
          (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
            (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id))))))))

     (testing "with date columns"
       (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
               op                  [:get-year :get-quarter :get-month :get-day :get-day-of-week]
               {:keys [expected-fn query-fn]}
               extraction-test-cases]
        (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
          (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))

    (mt/test-driver :mongo
      (testing "with datetimes columns"
        (let [[col-type field-id] [:datetime (mt/id :times :dt)]]
          (doseq [op              [:get-year :get-quarter :get-month :get-day
                                   :get-day-of-week :get-hour :get-minute :get-second]
                  {:keys [expected-fn query-fn]}
                  extraction-test-cases]
           (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
             (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))

      (testing "with date columns"
        (let [[col-type field-id] [:date (mt/id :times :d)]]
          (doseq [op               [:get-year :get-quarter :get-month :get-day :get-day-of-week]
                  {:keys [expected-fn query-fn]}
                  extraction-test-cases]
           (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
             (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id))))))))))))


(deftest temporal-extraction-with-filter-expresion-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
    (mt/dataset times-mixed
      (doseq [{:keys [title expected query]}
              [{:title    "Nested expression"
                :expected [2004]
                :query    {:expressions {"expr" [:abs [:get-year [:field (mt/id :times :dt) nil]]]}
                           :filter      [:= [:field (mt/id :times :index) nil] 1]
                           :fields      [[:expression "expr"]]}}

               {:title     "Nested with arithmetic"
                :expected  [4008]
                :query     {:expressions {"expr" [:* [:get-year [:field (mt/id :times :dt) nil]] 2]}
                            :filter      [:= [:field (mt/id :times :index) nil] 1]
                            :fields      [[:expression "expr"]]}}

               {:title    "Filter using the extracted result - equality"
                :expected [1]
                :query    {:filter [:= [:get-year [:field (mt/id :times :dt) nil]] 2004]
                           :fields [[:field (mt/id :times :index) nil]]}}

               {:title    "Filter using the extracted result - comparable"
                :expected [1]
                :query    {:filter [:< [:get-year [:field (mt/id :times :dt) nil]] 2005]
                           :fields [[:field (mt/id :times :index) nil]]}}

               {:title    "Nested expression in fitler"
                :expected [1]
                :query    {:filter [:= [:* [:get-year [:field (mt/id :times :dt) nil]] 2] 4008]
                           :fields [[:field (mt/id :times :index) nil]]}}]]
        (testing title
          (is (= expected (test-temporal-extract query))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Date arithmetics tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn date-math
  [op x amount unit col-type]
  (let [amount (if (= op :date-add)
                 amount
                 (- amount))
        fmt    (cond
                 ;; the :date column of :presto should have this format too,
                 ;; but the test data we created for presto is datetime even if we define it as date
                 (and (= driver/*driver* :presto) (#{:text-as-date} col-type))
                 "yyyy-MM-dd"

                 (= unit :millisecond)
                 "yyyy-MM-dd HH:mm:ss.SSS"

                 :else
                 "yyyy-MM-dd HH:mm:ss")]
    (t/format fmt (u.date/add x unit amount))))

(defn- normalize-timestamp-str [x]
  (if (number? x)
    (int x)
    (-> x
        (str/replace  #"T" " ")
        (str/replace  #"Z" ""))))

(defn test-date-math
  [{:keys [aggregation breakout expressions fields filter limit]}]
  (if breakout
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :breakout    breakout})
         (mt/formatted-rows [normalize-timestamp-str normalize-timestamp-str]))
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :fields      fields})
         (mt/formatted-rows [normalize-timestamp-str])
         (map first))))

(deftest date-math-tests
  (mt/dataset times-mixed
    ;; mongo doesn't supports coercion yet so we exclude it here, Tests for it are in [[metabase.driver.mongo.query-processor-test]]
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-arithmetics) :mongo)
      (testing "date arithmetic with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                op                  [:date-add :date-subtract]
                unit                [:year :quarter :month :day :hour :minute :second]

                {:keys [expected query]}
                [{:expected [(date-math op #t "2004-03-19 09:19:09" 2 unit col-type) (date-math op #t "2008-06-20 10:20:10" 2 unit col-type)
                             (date-math op #t "2012-11-21 11:21:11" 2 unit col-type) (date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :fields      [[:expression "expr"]]}}
                 {:expected (into [] (frequencies
                                       [(date-math op #t "2004-03-19 09:19:09" 2 unit col-type) (date-math op #t "2008-06-20 10:20:10" 2 unit col-type)
                                        (date-math op #t "2012-11-21 11:21:11" 2 unit col-type) (date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]))
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :aggregation [[:count]]
                             :breakout    [[:expression "expr"]]}}]]
          (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
            (is (= (set expected) (set (test-date-math query)))))))

      (testing "date arithmetic with datetime columns"
        (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
                op                  [:date-add :date-subtract]
                unit                [:year :quarter :month :day]

                {:keys [expected query]}
                [{:expected [(date-math op #t "2004-03-19 00:00:00" 2 unit col-type) (date-math op #t "2008-06-20 00:00:00" 2 unit col-type)
                             (date-math op #t "2012-11-21 00:00:00" 2 unit col-type) (date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :fields      [[:expression "expr"]]}}
                 {:expected (into [] (frequencies
                                       [(date-math op #t "2004-03-19 00:00:00" 2 unit col-type) (date-math op #t "2008-06-20 00:00:00" 2 unit col-type)
                                        (date-math op #t "2012-11-21 00:00:00" 2 unit col-type) (date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]))
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :aggregation [[:count]]
                             :breakout    [[:expression "expr"]]}}]]
          (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
            (is (= (set expected) (set (test-date-math query))))))))))

(deftest date-math-with-extract-test
  (mt/test-drivers (mt/normal-drivers-with-feature :date-arithmetics)
    (mt/dataset times-mixed
      (doseq [{:keys [title expected query]}
              [{:title    "Nested date math then extract"
                :expected [2006 2010 2014]
                :query    {:expressions {"expr" [:get-year [:date-add [:field (mt/id :times :dt) nil] 2 :year]]}
                            :fields [[:expression "expr"]]}}

               {:title   "Nested date math twice"
                :expected ["2006-05-19 09:19:09" "2010-08-20 10:20:10" "2015-01-21 11:21:11"]
                :query    {:expressions {"expr" [:date-add [:date-add [:field (mt/id :times :dt) nil] 2 :year] 2 :month]}
                           :fields [[:expression "expr"]]}}

               {:title    "filter with date math"
                :expected [1]
                :query   {:filter [:= [:get-year [:date-add [:field (mt/id :times :dt) nil] 2 :year]] 2006]
                          :fields [[:field (mt/id :times :index)]]}}]]
        (testing title
          (is (= (set expected) (set (test-date-math query)))))))))

(mt/defdataset temporal-dataset
  [["datediff-mixed-types"
    [{:field-name "index" :base-type :type/Integer}
     {:field-name "description" :base-type :type/Text}
     {:field-name "tz" :base-type :type/DateTimeWithTZ}
     {:field-name "d" :base-type :type/Date}
     {:field-name "dt" :base-type :type/DateTime}]
    [[1 "simple comparing across types" #t "2021-08-03T08:09:10.582Z" #t "2022-09-04" #t "2022-10-05 09:19:09"]]]])

(deftest datetime-diff-base-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset sample-dataset
      (letfn [(query [x y unit]
                (->> (mt/run-mbql-query orders
                       {:limit 1
                        :expressions {"diff"     [:datetime-diff x y unit]
                                      "diff-rev" [:datetime-diff y x unit]}
                        :fields [[:expression "diff"]
                                 [:expression "diff-rev"]]})
                     mt/rows first))]
        (doseq [[unit cases] [[:year [["2021-10-03T09:18:09" "2022-10-02T09:18:09" 0 "day under a year"]
                                      ["2021-10-03T09:19:09" "2022-10-03T09:18:09" 1 "ignores time"]
                                      ["2017-06-10T08:30:00" "2019-07-10T08:30:00" 2 "multiple years"]]]
                              [:month [["2022-10-03T09:18:09" "2022-11-02T09:18:09" 0  "day under a month"]
                                       ["2022-10-02T09:19:09" "2022-11-02T09:18:09" 1  "minute under a month"]
                                       ["2022-10-02T09:18:09" "2023-10-03T09:18:09" 12 "over a year"]]]
                              [:week [["2022-10-01T09:18:09" "2022-10-04T09:18:09" 0   "under 7 days across week boundary"]
                                      ["2022-10-02T09:19:09" "2022-10-09T09:18:09" 1   "ignores time"]
                                      ["2022-10-02T09:18:09" "2023-10-03T09:18:09" 52 "over a year"]]]
                              [:day [["2022-10-02T08:30:00" "2022-10-02T10:30:00" 0   "<24h same day"]
                                     ["2022-10-02T09:19:09" "2022-10-03T09:18:09" 1   "<24h consecutive days"]
                                     ["2021-10-02T08:30:00" "2022-10-05T10:30:00" 368 "over a year"]]]
                              [:hour [["2022-10-02T08:30:00" "2022-10-02T08:34:00" 0     "minutes"]
                                      ["2022-10-02T08:30:00" "2022-10-02T09:29:59.999" 0 "millisecond under an hour"]
                                      ["2022-10-02T08:30:00" "2022-10-05T08:34:00" 72    "hours"]
                                      ["2021-10-02T08:30:00" "2022-10-02T08:34:00" 8760  "over a year"]]]
                              [:minute [["2022-10-02T08:30:00" "2022-10-02T08:30:59.999" 0  "millisecond under a minute"]
                                        ["2022-10-02T08:30:00" "2022-10-02T08:34:00" 4      "minutes"]
                                        ["2022-10-02T08:30:00" "2022-10-02T10:30:00" 120    "hours"]
                                        ["2021-10-02T08:30:00" "2022-10-02T08:34:00" 525604 "over a year"]]]
                              [:second [["2022-10-02T08:30:00" "2022-10-02T08:30:00.999" 0    "millisecond under a second"]
                                        ["2022-10-02T08:30:00" "2022-10-02T08:34:00" 240      "minutes"]
                                        ["2022-10-02T08:30:00" "2022-10-02T10:30:00" 7200     "hours"]
                                        ["2021-10-02T08:30:00" "2022-10-02T08:34:00" 31536240 "over a year"]]]]

                [x y expected description] cases]
          (testing (name unit)
            (testing description
              (is (= [expected (- expected)] (query x y unit))))))))
    (mt/dataset temporal-dataset
      (testing "Can compare across dates, datetimes, and with timezones from a table"
        ;; these particular numbers are not important, just that we can compare between dates, datetimes, etc.
        (is (= [[428 397 31]]
               (mt/rows
                (mt/run-mbql-query datediff-mixed-types
                  {:fields [[:expression "tz,dt"]
                            [:expression "tz,d"]
                            [:expression "d,dt"]]
                   :filter [:= $index 1]
                   :expressions
                   {"tz,dt" [:datetime-diff $tz $dt :day]
                    "tz,d"  [:datetime-diff $tz $d :day]
                    "d,dt"  [:datetime-diff $d $dt :day]}}))))))))

(deftest datetime-diff-time-zones-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset sample-dataset
      (let [diffs (fn [x y]
                    (let [units [:second :minute :hour :day :week :month :year]]
                      (->> (mt/run-mbql-query orders
                             {:limit 1
                              :expressions (into {} (for [unit units]
                                                      [(name unit) [:datetime-diff x y unit]]))
                              :fields (into [] (for [unit units]
                                                 [:expression (name unit)]))})
                           mt/rows first
                           (zipmap units))))]
        (testing "a day"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"] ; UTC-1 all year
            (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                          (diffs "2022-10-02T01:00:00+01:00"     ; 2022-10-01T23:00:00-01:00 <- datetime in report-timezone offset
                                 "2022-10-03T00:00:00+00:00")))) ; 2022-10-02T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00+00:00
                                 "2022-10-03T00:00:00+00:00"))))) ; 2022-10-03T00:00:00+00:00
        (testing "hour under a day"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:second 82800 :minute 1380 :hour 23 :day 1}
                          (diffs "2022-10-02T00:00:00+00:00"     ; 2022-10-01T23:00:00-01:00
                                 "2022-10-03T00:00:00+01:00")))) ; 2022-10-02T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:second 82800 :minute 1380 :hour 23 :day 0}
                          (diffs "2022-10-02T00:00:00+00:00"      ; 2022-10-02T00:00:00+00:00
                                 "2022-10-03T00:00:00+01:00"))))) ; 2022-10-02T23:00:00+00:00
        (testing "hour under a week"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 167 :day 7 :week 1}
                          (diffs "2022-10-02T00:00:00+00:00"     ; 2022-10-01T23:00:00-01:00
                                 "2022-10-09T00:00:00+01:00")))) ; 2022-10-08T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 167 :day 6 :week 0}
                          (diffs "2022-10-02T00:00:00+00:00"      ; 2022-10-02T00:00:00+00:00
                                 "2022-10-09T00:00:00+01:00"))))) ; 2022-10-08T23:00:00+00:00
        (testing "week"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 168 :day 7 :week 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-01T23:00:00-01:00
                                 "2022-10-09T00:00:00+00:00"))))  ; 2022-10-08T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 168 :day 7 :week 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00+00:00
                                 "2022-10-09T00:00:00+00:00"))))) ; 2022-10-09T00:00:00+00:00
        (testing "hour under a month"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 743 :day 31 :week 4 :month 1}
                          (diffs "2022-10-02T00:00:00+00:00"     ; 2022-10-01T23:00:00-01:00
                                 "2022-11-02T00:00:00+01:00")))) ; 2022-11-01T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 743 :day 30 :week 4 :month 0}
                          (diffs "2022-10-02T00:00:00+00:00"      ; 2022-10-02T00:00:00+00:00
                                 "2022-11-02T00:00:00+01:00"))))) ; 2022-11-01T23:00:00+00:00
        (testing "month"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-01T23:00:00-01:00
                                 "2022-11-02T00:00:00+00:00"))))  ; 2022-11-01T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00+00:00
                                 "2022-11-02T00:00:00+00:00"))))) ; 2022-11-02T00:00:00+00:00
        (testing "year"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:day 365, :week 52, :month 12, :year 1}
                          (diffs "2022-10-02T01:00:00+01:00"     ; 2022-10-01T23:00:00-01:00
                                 "2023-10-02T00:00:00+00:00")))) ; 2023-10-01T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
           (is (partial= {:day 365, :week 52, :month 12, :year 1}
                         (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00+00:00
                                "2023-10-02T00:00:00+00:00"))))) ; 2023-10-02T00:00:00+00:00
        (testing "hour under a year"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:day 365 :month 12 :year 1}
                          (diffs "2022-10-02T00:00:00+00:00"     ; 2022-10-01T23:00:00-01:00
                                 "2023-10-02T00:00:00+01:00")))) ; 2023-10-01T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:day 364 :month 11 :year 0}
                          (diffs "2022-10-02T00:00:00+00:00"          ; 2022-10-02T00:00:00+00:00
                                 "2023-10-02T00:00:00+01:00"))))))))) ; 2023-10-01T23:00:00+00:00

(deftest datetime-diff-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset sample-dataset
      (testing "Args can be expressions that return datetime values"
        (let [diffs (fn [x y]
                      (let [units [:second :minute :hour :day :week :month :year]]
                        (->> (mt/run-mbql-query orders
                               {:limit 1
                                :expressions (into {} (for [unit units]
                                                        [(name unit) [:datetime-diff x y unit]]))
                                :fields (into [] (for [unit units]
                                                   [:expression (name unit)]))})
                             mt/rows first
                             (zipmap units))))]
          (is (= {:second 31795200, :minute 529920, :hour 8832, :day 368, :week 52, :month 12, :year 1}
                 (diffs [:date-add #t "2022-10-03T00:00:00" 1 "day"] [:date-add #t "2023-10-03T00:00:00" 4 "day"])))))
      (testing "Result works in arithmetic expressions"
        (let [start "2021-10-03T09:19:09"
              end   "2022-10-03T09:18:09"]
          (is (= [[1 6 365 370]]
                 (mt/rows
                  (mt/run-mbql-query orders
                    {:limit       1
                     :expressions {"datediff1"     [:datetime-diff start end :year]
                                   "datediff1-add" [:+ [:datetime-diff start end :year] 5]
                                   "datediff2"     [:datetime-diff start end :day]
                                   "datediff2-add" [:+ 5 [:datetime-diff start end :day]]}
                     :fields      [[:expression "datediff1"]
                                   [:expression "datediff1-add"]
                                   [:expression "datediff2"]
                                   [:expression "datediff2-add"]]})))))))))

(deftest datetime-diff-type-test
  (mt/test-drivers #{:bigquery-cloud-sdk}
    (testing "Cannot datetime-diff against time column"
      (mt/dataset sample-dataset
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Only datetime, timestamp, or date types allowed. Found .*"
             (mt/rows
              (mt/run-mbql-query orders
                {:limit 1
                 :fields      [[:expression "diff-day"]]
                 :expressions {"diff-day" [:datetime-diff "2022-01-01T00:00:00" #t "00:00:01" :day]}}))))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Only datetime, timestamp, or date types allowed. Found .*"
             (mt/rows
              (mt/run-mbql-query orders
                {:limit 1
                 :fields      [[:expression "diff-day"]]
                 :expressions {"diff-day" [:datetime-diff "2021-01-01" [:date-add #t "00:00:01" 3 "hour"] :day]}}))))))))
