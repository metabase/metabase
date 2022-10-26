(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [clojure.tools.macro :as tools.macro]
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

(deftest datetimediff-base-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetimediff)
    (mt/dataset sample-dataset
      (letfn [(query [x y unit]
                (->> (mt/run-mbql-query orders
                                        {:limit 1
                                         :expressions {"diff"
                                                       [:datetimediff x y unit]
                                                       "diff-rev"
                                                       [:datetimediff y x unit]}
                                         :fields [[:expression "diff"]
                                                  [:expression "diff-rev"]]})
                     mt/rows first))]
        (doseq [[unit cases] [[:year [[1 #t "2017-06-10 08:30:00" #t "2018-07-10 08:30:00"]
                                      [2 #t "2017-06-10 08:30:00" #t "2019-07-10 08:30:00"]
                                      [0 #t "2017-06-10 08:30:00" #t "2018-05-10 08:30:00"]]]
                              [:month [[1 #t "2022-06-10 08:30:00" #t "2022-07-15 08:30:00"]
                                       [3 #t "2022-06-10 08:30:00" #t "2022-09-15 08:30:00"]
                                       [0 #t "2022-06-10 08:30:00" #t "2022-06-15 08:30:00"]]]
                              [:day [[3 #t "2022-10-02 08:30:00" #t "2022-10-05 10:30:00"]
                                     [368 #t "2021-10-02 08:30:00" #t "2022-10-05 10:30:00"]
                                     [0 #t "2022-10-02 08:30:00" #t "2022-10-02 10:30:00"]]]
                              [:hour [[2 #t "2022-10-02 08:30:00" #t "2022-10-02 10:31:00"]
                                      [0 #t "2022-10-02 08:30:00" #t "2022-10-02 08:34:00"]
                                      [72 #t "2022-10-02 08:30:00" #t "2022-10-05 08:34:00"]
                                      [8760 #t "2021-10-02 08:30:00" #t "2022-10-02 08:34:00"]]]
                              [:minute [[120 #t "2022-10-02 08:30:00" #t "2022-10-02 10:30:00"]
                                        [4 #t "2022-10-02 08:30:00" #t "2022-10-02 08:34:00"]
                                        [525604 #t "2021-10-02 08:30:00" #t "2022-10-02 08:34:00"]]]]
                [expected x y] cases]
          (testing (name unit)
            (is (= [expected (- expected)] (query x y unit)))))))
    (mt/dataset useful-dates
      (testing "Can compare across dates, datetimes, and with timezones"
        ;; these particular numbers are not important, just that we can compare between dates, datetimes, etc.
        (is (= [[428 397 31]]
               (mt/rows
                (mt/run-mbql-query datediff-mixed-types
                                   {:fields [[:expression "tz,dt"]
                                             [:expression "tz,d"]
                                             [:expression "d,dt"]]
                                    :filter [:= $index 1]
                                    :expressions
                                    {"tz,dt" [:datetimediff $tz $dt :day]
                                     "tz,d"  [:datetimediff $tz $d :day]
                                     "d,dt"  [:datetimediff $d $dt :day]}}))))))))

(mt/defdataset with-time-column
  [["datediff-with-time"
    [{:field-name "index" :base-type :type/Integer}
     {:field-name "description" :base-type :type/Text}
     {:field-name "ts" :base-type :type/DateTimeWithTZ}
     {:field-name "t" :base-type :type/Time}]
    [[1 "simple comparing across types" #t "2021-08-03T08:09:10.582Z" #t "09:19:09"]]]])

(mt/defdataset more-useful-dates4
  [["more-datediff-edgecases"
    [{:field-name "index" :base-type :type/Integer}
     {:field-name "description" :base-type :type/Text}
     {:field-name "start" :base-type :type/DateTime}
     {:field-name "end" :base-type :type/DateTime}]
    [[1 "millisecond under a minute" #t "2022-10-02 08:30:00" #t "2022-10-02 08:30:59.999"]
     [1 "millisecond under a second" #t "2022-10-02 08:30:00" #t "2022-10-02 08:30:00.999"]
     [1 "millisecond under an hour"  #t "2022-10-02 08:30:00" #t "2022-10-02 09:29:59.999"]
     [1 "millisecond under a day"    #t "2022-10-02 00:00:00" #t "2022-10-02 23:59:59.999"]
     [1 "second under a minute"      #t "2022-10-02 08:30:00" #t "2022-10-02 08:30:59"]
     [1 "second under an hour"       #t "2022-10-02 08:30:00" #t "2022-10-02 09:29:59"]
     [1 "second under a day"         #t "2022-10-02 08:30:00" #t "2022-10-03 08:29:59"]
     [1 "minute under an hour"       #t "2022-10-02 08:30:00" #t "2022-10-02 09:29:00"]
     [1 "minute under a day"         #t "2022-10-02 08:30:00" #t "2022-10-03 08:29:00"]
     [1 "day under a year"           #t "2021-10-03 09:18:09" #t "2022-10-02 09:18:09"]
     [1 "day under a month"          #t "2022-10-03 09:18:09" #t "2022-11-02 09:18:09"]
     [1 "day under a week"           #t "2022-10-02 09:18:09" #t "2022-10-08 09:18:09"]
     [1 "minute under a year"        #t "2021-10-03 09:19:09" #t "2022-10-03 09:18:09"]
     [1 "minute under a month"       #t "2022-10-02 09:19:09" #t "2022-11-02 09:18:09"]
     [1 "<7d across weeks"           #t "2022-10-01 09:18:09" #t "2022-10-04 09:18:09"]
     [1 "minute under a week"        #t "2022-10-02 09:19:09" #t "2022-10-09 09:18:09"]
     [1 "<24h same day"              #t "2022-10-02 00:00:00" #t "2022-10-02 23:59:59"]
     [1 "<24h consecutive days"      #t "2022-10-02 09:19:09" #t "2022-10-03 09:18:09"]]]])

(mt/defdataset more-useful-dates-tz20
  [["datetimediff-with-timezone"
    [{:field-name "index" :base-type :type/Integer}
     {:field-name "description" :base-type :type/Text}
     {:field-name "start" :base-type :type/DateTimeWithTZ}
     {:field-name "end" :base-type :type/DateTimeWithTZ}]
    [[1 "2 hours"               #t "2022-10-02T00:00:00Z[+00:00]" #t "2022-10-03T00:00:00Z[+02:00]"]
     [1 "a day tz"              #t "2022-10-02T01:00:00Z[+01:00]" #t "2022-10-03T00:00:00Z[+00:00]"]
     [1 "hour under a day tz"   #t "2022-10-02T00:00:00Z[+00:00]" #t "2022-10-03T00:00:00Z[+01:00]"]
     [1 "a week tz"             #t "2022-10-02T01:00:00Z[+01:00]" #t "2022-10-09T00:00:00Z[+00:00]"]
     [1 "hour under a week tz"  #t "2022-10-02T00:00:00Z[+00:00]" #t "2022-10-09T00:00:00Z[+01:00]"]
     [1 "a month tz"            #t "2022-10-02T01:00:00Z[+01:00]" #t "2022-11-02T00:00:00Z[+00:00]"]
     [1 "hour under a month tz" #t "2022-10-02T00:00:00Z[+00:00]" #t "2022-11-02T00:00:00Z[+01:00]"]]]])

(deftest datetimediff-test-tz
  (mt/test-drivers (mt/normal-drivers-with-feature :datetimediff)
    (mt/dataset sample-dataset
      (let [diffs (fn [x y]
                    (let [units [:second :minute :hour :day :week :month :year]]
                      (->> (mt/run-mbql-query orders
                             {:limit 1
                              :expressions (into {} (for [unit units]
                                                      [(name unit) [:datetimediff x y unit]]))
                              :fields (into [] (for [unit units]
                                                 [:expression (name unit)]))})
                           mt/rows first
                           (zipmap units))))]
        (testing "a day"
          (mt/with-report-timezone-id nil
            (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                          (diffs #t "2022-10-02T01:00:00Z[+01:00]"      ; 2022-10-02T00:00:00Z[+00:00]
                                 #t "2022-10-03T00:00:00Z[+00:00]"))))  ; 2022-10-03T00:00:00Z[+00:00]
          (mt/with-report-timezone-id "Atlantic/Cape_Verde"
            (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                          (diffs #t "2022-10-02T01:00:00Z[+01:00]"      ; 2022-10-01T23:00:00Z[-01:00]
                                 #t "2022-10-03T00:00:00Z[+00:00]"))))) ; 2022-10-02T23:00:00Z[-01:00]
        (testing "hour under a day"
          (mt/with-report-timezone-id nil
            (is (partial= {:second 82800 :minute 1380 :hour 23 :day 0}
                          (diffs #t "2022-10-02T00:00:00Z[+00:00]"      ; 2022-10-02T00:00:00Z[+00:00]
                                 #t "2022-10-03T00:00:00Z[+01:00]"))))  ; 2022-10-02T23:00:00Z[+00:00]
          (mt/with-report-timezone-id "Atlantic/Cape_Verde"
            (is (partial= {:second 82800 :minute 1380 :hour 23 :day 1}
                          (diffs #t "2022-10-02T00:00:00Z[+00:00]"      ; 2022-10-01T23:00:00Z[-01:00]
                                 #t "2022-10-03T00:00:00Z[+01:00]"))))) ; 2022-10-02T22:00:00Z[-01:00]
        (testing "hour under a week"
          (mt/with-report-timezone-id nil
            (is (partial= {:hour 167 :day 6 :week 0}
                          (diffs #t "2022-10-02T00:00:00Z[+00:00]"      ; 2022-10-02T00:00:00Z[+00:00]
                                 #t "2022-10-09T00:00:00Z[+01:00]"))))  ; 2022-10-08T23:00:00Z[+00:00]
          (mt/with-report-timezone-id "Atlantic/Cape_Verde"
            (is (partial= {:hour 167 :day 7 :week 1}
                          (diffs #t "2022-10-02T00:00:00Z[+00:00]"      ; 2022-10-01T23:00:00Z[-01:00]
                                 #t "2022-10-09T00:00:00Z[+01:00]"))))) ; 2022-10-08T22:00:00Z[-01:00]
        (testing "week"
          (mt/with-report-timezone-id nil
            (is (partial= {:hour 168 :day 7 :week 1}
                          (diffs #t "2022-10-02T01:00:00Z[+01:00]"      ; 2022-10-02T00:00:00Z[+00:00]
                                 #t "2022-10-09T00:00:00Z[+00:00]"))))  ; 2022-10-09T00:00:00Z[+00:00]
          (mt/with-report-timezone-id "Atlantic/Cape_Verde"
            (is (partial= {:hour 168 :day 7 :week 1}
                          (diffs #t "2022-10-02T01:00:00Z[+01:00]"      ; 2022-10-01T23:00:00Z[-01:00]
                                 #t "2022-10-09T00:00:00Z[+00:00]"))))) ; 2022-10-08T23:00:00Z[-01:00]
        (testing "hour under a month"
          (mt/with-report-timezone-id nil
            (is (partial= {:hour 743 :day 30 :week 4 :month 0}
                          (diffs #t "2022-10-02T00:00:00Z[+00:00]"      ; 2022-10-02T00:00:00Z[+00:00]
                                 #t "2022-11-02T00:00:00Z[+01:00]"))))  ; 2022-11-01T23:00:00Z[+00:00]
          (mt/with-report-timezone-id "Atlantic/Cape_Verde"
            (is (partial= {:hour 743 :day 31 :week 4 :month 1}
                          (diffs #t "2022-10-02T00:00:00Z[+00:00]"      ; 2022-10-01T23:00:00Z[-01:00]
                                 #t "2022-11-02T00:00:00Z[+01:00]"))))) ; 2022-11-01T22:00:00Z[-01:00]
        (testing "month"
          (mt/with-report-timezone-id nil
            (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                          (diffs #t "2022-10-02T01:00:00Z[+01:00]"      ; 2022-10-02T00:00:00Z[+00:00]
                                 #t "2022-11-02T00:00:00Z[+00:00]"))))  ; 2022-11-02T00:00:00Z[+00:00]
          (mt/with-report-timezone-id "Atlantic/Cape_Verde"
            (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                          (diffs #t "2022-10-02T01:00:00Z[+01:00]"          ; 2022-10-01T23:00:00Z[-01:00]
                                 #t "2022-11-02T00:00:00Z[+00:00]"))))))))) ; 2022-11-01T23:00:00Z[-01:00]

(deftest datetimediff-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetimediff)
    (mt/dataset more-useful-dates4
      (let [test-cases (fn [unit cases]
                         (testing unit
                           (let [transpose                (fn [m] (apply (partial mapv vector) m))
                                 [descriptions expecteds] (transpose (sort-by first cases))]
                             (is (= expecteds
                                    (flatten
                                     (mt/rows
                                      (mt/run-mbql-query more-datediff-edgecases
                                        {:expressions {"d" [:datetimediff $start $end unit]}
                                         :fields      [[:expression "d"]]
                                         :filter      (into [:= $description] descriptions)
                                         :order-by    [[:asc $description]]})))))
                               ;; now with the arguments reversed
                             (is (= (map - expecteds)
                                    (flatten
                                     (mt/rows
                                      (mt/run-mbql-query more-datediff-edgecases
                                        {:expressions {"d" [:datetimediff $end $start unit]}
                                         :fields      [[:expression "d"]]
                                         :filter      (into [:= $description] descriptions)
                                         :order-by    [[:asc $description]]}))))))))]
        (test-cases :year [["day under a year" 0]
                           ["minute under a year" 1]])
        (test-cases :month [["day under a month" 0]
                            ["day under a year" 11]
                            ["minute under a month" 1]
                            ["minute under a year" 12]])
        (test-cases :week [["day under a week" 0]
                           ["<7d across weeks" 0]
                           ["minute under a week" 1]
                           ["minute under a month" 4]])
        (test-cases :day [["<24h consecutive days" 1]
                            ["<24h same day" 0]
                            ["day under a month" 30]
                            ["minute under a month" 31]])
        (test-cases :hour [["minute under an hour" 0]
                             ["minute under a day" 23]
                             ["second under an hour" 0]
                             ["millisecond under an hour" 0]
                             ["second under a day" 23]])
        (test-cases :minute [["minute under a day" 1439]
                               ["minute under an hour" 59]
                               ["second under an hour" 59]
                               ["second under a minute" 0]
                               ["millisecond under a minute" 0]])
        (test-cases :second [["millisecond under a minute" 59]
                               ["millisecond under a second" 0]
                               ["minute under an hour" 3540]])
        (testing "Types from nested functions are ok"
          (testing "Nested functions are ok"
            (is (= [[-3] [362]]
                   (mt/rows
                    (mt/run-mbql-query more-datediff-edgecases
                      {:expressions {"diff-day" [:datetimediff [:date-add $start 3 "day"] $end :day]}
                       :fields      [[:expression "diff-day"]]
                       :filter      [:= $description "minute under a year" "<24h same day"]
                       :order-by    [[:asc $description]]}))))))
        (testing "Result works in arithmetic expressions"
            (is (= [[0 5 0 5] [1 6 365 370]]
                   (mt/rows
                    (mt/run-mbql-query more-datediff-edgecases
                      {:expressions {"datediff1"     [:datetimediff $start $end :year]
                                     "datediff1-add" [:+ [:datetimediff $start $end :year] 5]
                                     "datediff2"     [:datetimediff $start $end :day]
                                     "datediff2-add" [:+ 5 [:datetimediff $start $end :day]]}
                       :fields      [[:expression "datediff1"]
                                     [:expression "datediff1-add"]
                                     [:expression "datediff2"]
                                     [:expression "datediff2-add"]]
                       :filter      [:= $description "minute under a year" "<24h same day"]
                       :order-by    [[:asc $description]]})))))))))

(deftest datetimediff-type-test
  (mt/test-drivers #{:mysql}
    (testing "Cannot datetimediff against time column"
      (mt/dataset with-time-column
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Only datetime, timestamp, or date types allowed. Found .*"
             (mt/rows
              (mt/run-mbql-query datediff-with-time
                {:fields      [[:expression "diff-day"]]
                 :expressions {"diff-day" [:datetimediff $ts $t :day]}}))))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Only datetime, timestamp, or date types allowed. Found .*"
             (mt/rows
              (mt/run-mbql-query datediff-with-time
                {:fields      [[:expression "diff-day"]]
                 :expressions {"diff-day" [:datetimediff $ts [:date-add $t 3 "hour"] :day]}}))))))))
