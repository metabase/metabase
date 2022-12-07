(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.models :refer [Card]]
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
             {:field-name "dt_tz"
              :base-type  :type/DateTimeWithTZ}
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
    (for [[idx t]
          (map-indexed vector [#t "2004-03-19 09:19:09+07:00[Asia/Ho_Chi_Minh]"
                               #t "2008-06-20 10:20:10+07:00[Asia/Ho_Chi_Minh]"
                               #t "2012-11-21 11:21:11+07:00[Asia/Ho_Chi_Minh]"
                               #t "2012-11-21 11:21:11+07:00[Asia/Ho_Chi_Minh]"])]
      [(inc idx)
       (t/local-date-time t)                                  ;; dt
       (t/with-zone-same-instant t "Asia/Ho_Chi_Minh")        ;; dt_tz
       (t/local-date t)                                       ;; d
       (t/format "yyyy-MM-dd HH:mm:ss" (t/local-date-time t)) ;; as _dt
       (t/format "yyyy-MM-dd" (t/local-date-time t))])]       ;; as_d
   ["weeks" [{:field-name "index"
              :base-type :type/Integer}
             {:field-name "description"
              :base-type :type/Text}
             {:field-name "d"
              :base-type :type/Date}]
    [[1 "1st saturday"   #t "2000-01-01"]
     [2 "1st sunday"     #t "2000-01-02"]
     [3 "1st monday"     #t "2000-01-03"]
     [4 "1st wednesday"  #t "2000-01-04"]
     [5 "1st tuesday"    #t "2000-01-05"]
     [6 "1st thursday"   #t "2000-01-06"]
     [7 "1st friday"     #t "2000-01-07"]
     [8 "2nd saturday"   #t "2000-01-08"]
     [9 "2nd sunday"     #t "2000-01-09"]
     [10 "2005 saturday" #t "2005-01-01"]]]])

(def ^:private temporal-extraction-op->unit
  {:get-second      :second-of-minute
   :get-minute      :minute-of-hour
   :get-hour        :hour-of-day
   :get-day-of-week :day-of-week
   :get-day         :day-of-month
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
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
      (testing "with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                op                  [:get-year :get-quarter :get-month :get-day
                                     :get-day-of-week :get-hour :get-minute :get-second]
                {:keys [expected-fn query-fn]}
                extraction-test-cases]
          (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
            (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))

     ;; mongo doesn't supports cast string to date
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :temporal-extract) :mongo)
      (testing "with date columns"
        (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
                op                  [:get-year :get-quarter :get-month :get-day :get-day-of-week]
                {:keys [expected-fn query-fn]}
                extraction-test-cases]
          (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
            (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))

    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
      (testing "works with literal value"
        (let [ops [:get-year :get-quarter :get-month :get-day
                   :get-day-of-week :get-hour :get-minute :get-second]]
          (is (= {:get-day         3
                  :get-day-of-week 2
                  :get-hour        7
                  :get-minute      10
                  :get-month       10
                  :get-quarter     4
                  :get-second      20
                  :get-year        2022}
                 (->> (mt/run-mbql-query times
                                         {:expressions (into {} (for [op ops]
                                                                  [(name op) [op "2022-10-03T07:10:20"]]))
                                          :fields      (into [] (for [op ops] [:expression (name op)]))})
                      (mt/formatted-rows (repeat int))
                      first
                      (zipmap ops)))))))

    (testing "with timestamptz columns"
      (mt/test-drivers (filter mt/supports-timestamptz-type? (mt/normal-drivers-with-feature :temporal-extract))
        (mt/with-report-timezone-id "Asia/Kabul"
          (is (= (if (or (= driver/*driver* :sqlserver)
                         (driver/supports? driver/*driver* :set-timezone))
                     {:get-year        2004,
                      :get-quarter     1,
                      :get-month       1,
                      :get-day         1,
                      :get-day-of-week 5,
                      ;; TIMEZONE FIXME these drivers are returning the extracted hours in
                      ;; the timezone that they were inserted in
                      ;; maybe they need explicit convert-timezone to the report-tz before extraction?
                      :get-hour        (case driver/*driver*
                                         (:sqlserver :presto :presto-jdbc :snowflake :oracle) 5
                                         2),
                      :get-minute      (case driver/*driver*
                                         (:sqlserver :presto :presto-jdbc :snowflake :oracle) 19
                                         49),
                      :get-second      9}
                     {:get-year        2003,
                      :get-quarter     4,
                      :get-month       12,
                      :get-day         31,
                      :get-day-of-week 4,
                      :get-hour        22,
                      :get-minute      19,
                      :get-second      9})
                 (let [ops [:get-year :get-quarter :get-month :get-day
                            :get-day-of-week :get-hour :get-minute :get-second]]
                    (->> (mt/mbql-query times {:expressions (into {"shifted-day"  [:datetime-subtract $dt_tz 78 :day]
                                                                   ;; the idea is to extract a column with value = 2004-01-01 02:49:09 +04:30
                                                                   ;; this way the UTC value is 2003-12-31 22:19:09 +00:00 which will make sure
                                                                   ;; the year, quarter, month, day, week is extracted correctly
                                                                   ;; TODO: it's better to use a literal for this, but the function is not working properly
                                                                   ;; with OffsetDatetime for all drivers, so we'll go wit this for now
                                                                   "shifted-hour" [:datetime-subtract [:expression "shifted-day"] 4 :hour]}
                                                                  (for [op ops]
                                                                    [(name op) [op [:expression "shifted-hour"]]]))
                                               :fields      (into [] (for [op ops] [:expression (name op)]))
                                               :filter      [:= $index 1]
                                               :limit       1})
                        mt/process-query
                        (mt/formatted-rows (repeat int))
                        first
                        (zipmap ops))))))))))

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

(deftest temporal-extraction-with-datetime-arithmetic-expression-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract :expressions)
    (mt/dataset times-mixed
      (doseq [{:keys [title expected query]}
              [{:title    "Nested interval addition expression"
                :expected [2005]
                :query    {:expressions {"expr" [:abs [:get-year [:+ [:field (mt/id :times :dt) nil] [:interval 1 :year]]]]}
                           :filter      [:= [:field (mt/id :times :index) nil] 1]
                           :fields      [[:expression "expr"]]}}

               {:title    "Interval addition nested in numeric addition"
                :expected [2006]
                :query    {:expressions {"expr" [:+ [:get-year [:+ [:field (mt/id :times :dt) nil] [:interval 1 :year]]] 1]}
                           :filter      [:= [:field (mt/id :times :index) nil] 1]
                           :fields      [[:expression "expr"]]}}]]
        (testing title
          (is (= expected (test-temporal-extract query))))))))

(defn test-extract-week
  [field-id method]
  (->> (mt/mbql-query weeks {:expressions {"expr" [:get-week [:field field-id nil] method]}
                             :order-by    [[:asc [:field (mt/id :weeks :index)]]]
                             :fields      [[:expression "expr"]]})
       mt/process-query
       (mt/formatted-rows [int])
       (map first)))

(deftest extract-week-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
    (mt/dataset times-mixed
      ;; the native get week of sqlite is not iso, and it's not easy
      ;; to implement in raw sql, so skips it for now
      (when-not (#{:sqlite} driver/*driver*)
        (testing "iso8601 week"
          (is (= [52 52 1 1 1 1 1 1 1 53]
                 (test-extract-week (mt/id :weeks :d) :iso)))
          (testing "shouldn't change if start-of-week settings change"
            (mt/with-temporary-setting-values [start-of-week :monday]
              (is (= [52 52 1 1 1 1 1 1 1 53]
                     (test-extract-week (mt/id :weeks :d) :iso)))))))

        ;; check the (defmethod sql.qp/date [:snowflake :week-of-year-us]) for why we skip snowflake
      (when-not (#{:snowflake} driver/*driver*)
        (testing "us week"
          (is (= [1 2 2 2 2 2 2 2 3 1]
                 (test-extract-week (mt/id :weeks :d) :us)))
          (testing "shouldn't change if start-of-week settings change"
            (mt/with-temporary-setting-values [start-of-week :monday]
              (is (= [1 2 2 2 2 2 2 2 3 1]
                     (test-extract-week (mt/id :weeks :d) :us)))))))

      (testing "instance week"
        (is (= [1 2 2 2 2 2 2 2 3 1]
               (test-extract-week (mt/id :weeks :d) :instance)))

        (mt/with-temporary-setting-values [start-of-week :monday]
          (is (= [1 1 2 2 2 2 2 2 2 1]
                 (test-extract-week (mt/id :weeks :d) :instance))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Date arithmetics tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn datetime-math
  [op x amount unit col-type]
  (let [amount (if (= op :datetime-add)
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

(defn test-datetime-math
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

(deftest datetime-math-tests
  (mt/dataset times-mixed
    ;; mongo doesn't supports coercion yet so we exclude it here, Tests for it are in [[metabase.driver.mongo.query-processor-test]]
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-arithmetics) :mongo)
      (testing "date arithmetic with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                op                  [:datetime-add :datetime-subtract]
                unit                [:year :quarter :month :day :hour :minute :second]

                {:keys [expected query]}
                [{:expected [(datetime-math op #t "2004-03-19 09:19:09" 2 unit col-type) (datetime-math op #t "2008-06-20 10:20:10" 2 unit col-type)
                             (datetime-math op #t "2012-11-21 11:21:11" 2 unit col-type) (datetime-math op #t "2012-11-21 11:21:11" 2 unit col-type)]
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :fields      [[:expression "expr"]]}}
                 {:expected (into [] (frequencies
                                       [(datetime-math op #t "2004-03-19 09:19:09" 2 unit col-type) (datetime-math op #t "2008-06-20 10:20:10" 2 unit col-type)
                                        (datetime-math op #t "2012-11-21 11:21:11" 2 unit col-type) (datetime-math op #t "2012-11-21 11:21:11" 2 unit col-type)]))
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :aggregation [[:count]]
                             :breakout    [[:expression "expr"]]}}]]
          (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
            (is (= (set expected) (set (test-datetime-math query)))))))

      (testing "date arithmetic with datetime columns"
        (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
                op                  [:datetime-add :datetime-subtract]
                unit                [:year :quarter :month :day]

                {:keys [expected query]}
                [{:expected [(datetime-math op #t "2004-03-19 00:00:00" 2 unit col-type) (datetime-math op #t "2008-06-20 00:00:00" 2 unit col-type)
                             (datetime-math op #t "2012-11-21 00:00:00" 2 unit col-type) (datetime-math op #t "2012-11-21 00:00:00" 2 unit col-type)]
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :fields      [[:expression "expr"]]}}
                 {:expected (into [] (frequencies
                                       [(datetime-math op #t "2004-03-19 00:00:00" 2 unit col-type) (datetime-math op #t "2008-06-20 00:00:00" 2 unit col-type)
                                        (datetime-math op #t "2012-11-21 00:00:00" 2 unit col-type) (datetime-math op #t "2012-11-21 00:00:00" 2 unit col-type)]))
                  :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                             :aggregation [[:count]]
                             :breakout    [[:expression "expr"]]}}]]
          (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
            (is (= (set expected) (set (test-datetime-math query)))))))

      (testing "date arithmetics with literal date"
        (is (= ["2008-08-20 00:00:00" "2008-04-20 00:00:00"]
               (->> (mt/run-mbql-query times
                                       {:expressions {"add" [:datetime-add "2008-06-20T00:00:00" 2 :month]
                                                      "sub" [:datetime-subtract "2008-06-20T00:00:00" 2 :month]}
                                        :fields      [[:expression "add"] [:expression "sub"]]})
                    (mt/formatted-rows [normalize-timestamp-str normalize-timestamp-str])
                    first)))))))

(deftest datetime-math-with-extract-test
  (mt/test-drivers (mt/normal-drivers-with-feature :date-arithmetics)
    (mt/dataset times-mixed
      (doseq [{:keys [title expected query]}
              [{:title    "Nested date math then extract"
                :expected [2006 2010 2014]
                :query    {:expressions {"expr" [:get-year [:datetime-add [:field (mt/id :times :dt) nil] 2 :year]]}
                           :fields [[:expression "expr"]]}}

               {:title   "Nested date math twice"
                :expected ["2006-05-19 09:19:09" "2010-08-20 10:20:10" "2015-01-21 11:21:11"]
                :query    {:expressions {"expr" [:datetime-add [:datetime-add [:field (mt/id :times :dt) nil] 2 :year] 2 :month]}
                           :fields [[:expression "expr"]]}}

               {:title    "filter with date math"
                :expected [1]
                :query   {:filter [:= [:get-year [:datetime-add [:field (mt/id :times :dt) nil] 2 :year]] 2006]
                          :fields [[:field (mt/id :times :index)]]}}]]
        (testing title
          (is (= (set expected) (set (test-datetime-math query)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Convert Timezone tests                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest convert-timezone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (letfn [(test-convert-tz
                [field
                 expression]
                (->> (mt/run-mbql-query times
                                        {:expressions {"expr" expression}
                                         :limit       1
                                         :fields      [field                  ;; original row for comparision
                                                       [:expression "expr"]]});; result
                     mt/rows
                     first))]
        (testing "timestamp with out timezone columns"
          (mt/with-report-timezone-id "UTC"
            (testing "convert from Asia/Shanghai(+08:00) to Asia/Tokyo(+09:00)"
              (is (= ["2004-03-19T09:19:09Z"
                      "2004-03-19T10:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt
                                [:convert-timezone $times.dt "Asia/Tokyo" "Asia/Shanghai"])))))
            (testing "source-timezone is required"
              (is (thrown-with-msg?
                    clojure.lang.ExceptionInfo
                    #"input column doesnt have a set timezone. Please set the source parameter in convertTimezone to convert it."
                    (mt/$ids (test-convert-tz
                               $times.dt
                               [:convert-timezone [:field (mt/id :times :dt) nil] "Asia/Tokyo"]))))))

          (when (driver/supports? driver/*driver* :set-timezone)
            (mt/with-report-timezone-id "Europe/Rome"
              (testing "results should be displayed in the converted timezone, not report-tz"
                (is (= ["2004-03-19T09:19:09+01:00" "2004-03-19T17:19:09+09:00"]
                       (mt/$ids (test-convert-tz
                                  $times.dt
                                  [:convert-timezone [:field (mt/id :times :dt) nil] "Asia/Tokyo" "Europe/Rome"]))))))))

        (testing "timestamp with time zone columns"
          (mt/with-report-timezone-id "UTC"
            (testing "convert to +09:00"
              (is (= ["2004-03-19T02:19:09Z" "2004-03-19T11:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt_tz
                                [:convert-timezone [:field (mt/id :times :dt_tz) nil] "Asia/Tokyo"])))))

            (testing "timestamp with time zone columns shouldn't have `source-timezone`"
              (is (thrown-with-msg?
                    clojure.lang.ExceptionInfo
                    #"input column already has a set timezone. Please remove the source parameter in convertTimezone."
                    (mt/$ids (test-convert-tz
                               $times.dt_tz
                               [:convert-timezone [:field (mt/id :times :dt_tz) nil]
                                "Asia/Tokyo"
                                "UTC"]))))))

          (when (driver/supports? driver/*driver* :set-timezone)
            (mt/with-report-timezone-id "Europe/Rome"
              (testing "the base timezone should be the timezone of column (Asia/Ho_Chi_Minh)"
                (is (= ["2004-03-19T03:19:09+01:00" "2004-03-19T11:19:09+09:00"]
                       (mt/$ids (test-convert-tz
                                  $times.dt_tz
                                  [:convert-timezone [:field (mt/id :times :dt_tz) nil] "Asia/Tokyo"]))))))))

        (testing "with literal datetime"
          (mt/with-report-timezone-id "UTC"
            (is (= "2022-10-03T14:10:20+07:00"
                   (->> (mt/run-mbql-query times
                                           {:expressions {"expr" [:convert-timezone "2022-10-03T07:10:20" "Asia/Saigon" "UTC"]}
                                            :fields      [[:expression "expr"]]})
                        mt/rows
                        ffirst)))))))))

(deftest nested-convert-timezone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id "UTC"
      (mt/dataset times-mixed
        (testing "convert-timezone nested with datetime extract"
          (is (= ["2004-03-19T09:19:09Z"      ;; original col
                  "2004-03-19T10:19:09+09:00" ;; converted
                  10]                         ;; hour
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "Asia/Tokyo" "Asia/Shanghai"]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "converted"]
                                       [:expression "hour"]]})
                      (mt/formatted-rows [str str int])
                      first))))

        (testing "convert-timezone nested with date-math, date-extract"
          (is (= ["2004-03-19T09:19:09Z"       ;; original
                  "2004-03-19T18:19:09+09:00"  ;; converted
                  "2004-03-19T20:19:09+09:00"  ;; date-added
                  20]                          ;; hour
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted"  [:convert-timezone $times.dt "Asia/Tokyo" "UTC"]
                                       "date-added" [:datetime-add [:convert-timezone $times.dt "Asia/Tokyo" "UTC"] 2 :hour]
                                       "hour"       [:get-hour [:expression "date-added"]]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "converted"]
                                       [:expression "date-added"]
                                       [:expression "hour"]]})
                      (mt/formatted-rows [str str str int])
                      first))))

        (testing "extract hour should respect daylight savings times"
          (is (= [["2004-03-19T09:19:09Z" "2004-03-19T01:19:09-08:00" 1]  ;; Before DST -- UTC-8
                  ["2008-06-20T10:20:10Z" "2008-06-20T03:20:10-07:00" 3]] ;; During DST -- UTC-7
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "America/Los_Angeles" "UTC"]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:< $times.index 3]
                         :fields      [$times.dt
                                       [:expression "converted"]
                                       [:expression "hour"]]})
                      (mt/formatted-rows [str str int])))))

        (testing "convert-timezone twice should works"
          (is (= ["2004-03-19T09:19:09Z"      ;; original column
                  "2004-03-19T16:19:09+07:00" ;; at +07
                  "2004-03-19T18:19:09+09:00"];; at +09
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"to-07"       [:convert-timezone $times.dt "Asia/Saigon" "UTC"]
                                       "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Tokyo"
                                                      "Asia/Saigon"]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "to-07"]
                                       [:expression "to-07-to-09"]]})
                      mt/rows
                      first))))

        (testing "filter a converted-timezone column"
          (is (= ["2004-03-19T18:19:09+09:00"]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "Asia/Tokyo" "UTC"]
                                       "hour"       [:get-hour [:expression "converted"]]}
                         :filter      [:between [:expression "hour"] 17 18]
                         :fields      [[:expression "converted"]]})
                      mt/rows
                      first)))

          (is (= ["2004-03-19T18:19:09+09:00"]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "Asia/Tokyo" "UTC"]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:= [:expression "hour"] 18]
                         :fields      [[:expression "converted"]]})
                      mt/rows
                      first))))

        (testing "nested custom expression should works"
          (mt/with-temp Card [card
                              {:dataset_query
                               (mt/mbql-query
                                 times
                                 {:expressions {"to-07"       [:convert-timezone $times.dt "Asia/Saigon" "UTC"]
                                                "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Tokyo"
                                                               "Asia/Saigon"]}
                                  :filter      [:= $times.index 1]
                                  :fields      [$times.dt
                                                [:expression "to-07"]
                                                [:expression "to-07-to-09"]]})}]
            (testing "mbql query"
              (is (= [["2004-03-19T09:19:09Z"
                       "2004-03-19T16:19:09+07:00"
                       "2004-03-19T18:19:09+09:00"]]
                     (->> (mt/mbql-query nil {:source-table (format "card__%d" (:id card))})
                          mt/process-query
                          mt/rows))))

            ;; TIMEZONE FIXME: technically these values should have offset timezone(different than 'Z')
            ;; like the mbql query test above
            ;; but we haven't figured out a way to pass the convert_timezone metadata if you use a native query.
            (testing "native query"
              (let [card-tag (format "#%d" (:id card))]
                (is (= [["2004-03-19T09:19:09Z"
                         "2004-03-19T16:19:09Z"
                         "2004-03-19T18:19:09Z"]]
                       (->> (mt/native-query {:query         (format "select * from {{%s}} %s" card-tag
                                                                    (case driver/*driver*
                                                                      :oracle ""
                                                                      "as source"))
                                              :template-tags {card-tag {:card-id      (:id card)
                                                                        :type         :card
                                                                        :display-name "CARD ID"
                                                                        :id           "_CARD_ID_"}}})
                            mt/process-query
                            mt/rows)))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Datetime diff tests                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

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
                     (mt/formatted-rows [int int])
                     first))]
        (doseq [[unit cases] [[:year [["2021-10-03T09:18:09" "2022-10-02T09:18:09" 0 "day under a year"]
                                      ["2021-10-03T09:19:09" "2022-10-03T09:18:09" 1 "ignores time"]
                                      ["2016-02-03T09:19:09" "2017-02-02T09:19:09" 0 "starts in leap year before leap day"]
                                      ["2016-10-03T09:19:09" "2017-10-03T09:19:09" 1 "starts in leap year after leap day"]
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
    (mt/dataset times-mixed
      (testing "Can compare across dates, datetimes, and with timezones from a table"
        ;; these particular numbers are not important, just that we can compare between dates, datetimes, etc.
        (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
          (is (= [25200 -8349 33549]
                 (->> (mt/run-mbql-query times
                        {:fields [[:expression "tz,dt"]
                                  [:expression "tz,d"]
                                  [:expression "d,dt"]]
                         :limit 1
                         :expressions
                         {"tz,dt" [:datetime-diff $dt_tz $dt :second]
                          "tz,d"  [:datetime-diff $dt_tz $d :second]
                          "d,dt"  [:datetime-diff $d $dt :second]}})
                      (mt/formatted-rows [int int int])
                      first))))))))

(mt/defdataset diff-time-zone-cases
  [["times"
    [{:field-name "a_dt",            :base-type :type/DateTime}
     {:field-name "a_dt_ltz",        :base-type :type/DateTimeWithLocalTZ}
     {:field-name "a_dt_tz",         :base-type :type/DateTimeWithTZ}
     {:field-name "a_dt_tz_offset",  :base-type :type/DateTimeWithZoneOffset}
     {:field-name "a_dt_tz_id",      :base-type :type/DateTimeWithZoneID}
     {:field-name "a_dt_tz_text",    :base-type :type/Text}
     {:field-name "a_dt_tz_id_text", :base-type :type/Text}
     {:field-name "b_dt",            :base-type :type/DateTime}
     {:field-name "b_dt_ltz",        :base-type :type/DateTimeWithLocalTZ}
     {:field-name "b_dt_tz",         :base-type :type/DateTimeWithTZ}
     {:field-name "b_dt_tz_offset",  :base-type :type/DateTimeWithZoneOffset}
     {:field-name "b_dt_tz_id",      :base-type :type/DateTimeWithZoneID}
     {:field-name "b_dt_tz_text",    :base-type :type/Text}
     {:field-name "b_dt_tz_id_text", :base-type :type/Text}]
    (let [times ["2022-10-02T01:00:00+01:00[Africa/Lagos]"
                 "2022-10-02T00:00:00Z[UTC]"
                 "2022-10-02T01:00:00+01:00[Africa/Lagos]"
                 "2022-10-03T00:00:00Z[UTC]"
                 "2022-10-03T00:00:00+01:00[Africa/Lagos]"
                 "2022-10-09T00:00:00Z[UTC]"
                 "2022-10-09T00:00:00+01:00[Africa/Lagos]"
                 "2022-11-02T00:00:00Z[UTC]"
                 "2022-11-02T00:00:00+01:00[Africa/Lagos]"
                 "2023-10-02T00:00:00Z[UTC]"
                 "2023-10-02T00:00:00+01:00[Africa/Lagos]"]]
      (for [a times b times]
        [(t/local-date-time (u.date/parse a))              ; a_dt
         (t/offset-date-time (u.date/parse a))             ; a_dt_ltz
         (u.date/parse a)                                  ; a_dt_tz
         (t/offset-date-time (u.date/parse a))             ; a_dt_tz_offset
         (u.date/parse a)                                  ; a_dt_tz_id
         (t/format :iso-offset-date-time (u.date/parse a)) ; a_dt_tz_text
         a                                                 ; a_dt_tz_id_text
         (t/local-date-time (u.date/parse b))              ; b_dt
         (t/offset-date-time (u.date/parse b))             ; b_dt_ltz
         (u.date/parse b)                                  ; b_dt_tz
         (t/offset-date-time (u.date/parse b))             ; b_dt_tz_offset
         (u.date/parse b)                                  ; b_dt_tz_id
         (t/format :iso-offset-date-time (u.date/parse b)) ; b_dt_tz_text
         b]))]])                                           ; b_dt_tz_id_text

(deftest datetime-diff-time-zones-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset diff-time-zone-cases
      (let [diffs (fn [x y]
                    (let [units [:second :minute :hour :day :week :month :year]]
                      (->> (mt/run-mbql-query times
                             {:filter [:and [:= x $a_dt_tz_text] [:= y $b_dt_tz_text]]
                              :expressions (into {} (for [unit units]
                                                      [(name unit) [:datetime-diff $a_dt_tz $b_dt_tz unit]]))
                              :fields (into [] (for [unit units]
                                                 [:expression (name unit)]))})
                           (mt/formatted-rows (repeat (count units) int))
                           first
                           (zipmap units))))]
        (testing "a day"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"] ; UTC-1 all year
            (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                          (diffs "2022-10-02T01:00:00+01:00"     ; 2022-10-01T23:00:00-01:00 <- datetime in report-timezone offset
                                 "2022-10-03T00:00:00Z"))))      ; 2022-10-02T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00Z
                                 "2022-10-03T00:00:00Z")))))      ; 2022-10-03T00:00:00Z
        (testing "hour under a day"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:second 82800 :minute 1380 :hour 23 :day 1}
                          (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                                 "2022-10-03T00:00:00+01:00")))) ; 2022-10-02T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:second 82800 :minute 1380 :hour 23 :day 0}
                          (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                                 "2022-10-03T00:00:00+01:00"))))) ; 2022-10-02T23:00:00Z
        (testing "hour under a week"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 167 :day 7 :week 1}
                          (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                                 "2022-10-09T00:00:00+01:00")))) ; 2022-10-08T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 167 :day 6 :week 0}
                          (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                                 "2022-10-09T00:00:00+01:00"))))) ; 2022-10-08T23:00:00Z
        (testing "week"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 168 :day 7 :week 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-01T23:00:00-01:00
                                 "2022-10-09T00:00:00Z"))))       ; 2022-10-08T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 168 :day 7 :week 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00Z
                                 "2022-10-09T00:00:00Z")))))      ; 2022-10-09T00:00:00Z
        (testing "hour under a month"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 743 :day 31 :week 4 :month 1}
                          (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                                 "2022-11-02T00:00:00+01:00")))) ; 2022-11-01T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 743 :day 30 :week 4 :month 0}
                          (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                                 "2022-11-02T00:00:00+01:00"))))) ; 2022-11-01T23:00:00Z
        (testing "month"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-01T23:00:00-01:00
                                 "2022-11-02T00:00:00Z"))))       ; 2022-11-01T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00Z
                                 "2022-11-02T00:00:00Z")))))      ; 2022-11-02T00:00:00Z
        (testing "year"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:day 365, :week 52, :month 12, :year 1}
                          (diffs "2022-10-02T01:00:00+01:00"     ; 2022-10-01T23:00:00-01:00
                                 "2023-10-02T00:00:00Z"))))      ; 2023-10-01T23:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:day 365, :week 52, :month 12, :year 1}
                          (diffs "2022-10-02T01:00:00+01:00"      ; 2022-10-02T00:00:00Z
                                 "2023-10-02T00:00:00Z")))))      ; 2023-10-02T00:00:00Z
        (testing "hour under a year"
          (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
            (is (partial= {:day 365 :month 12 :year 1}
                          (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                                 "2023-10-02T00:00:00+01:00")))) ; 2023-10-01T22:00:00-01:00
          (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
            (is (partial= {:day 364 :month 11 :year 0}
                          (diffs "2022-10-02T00:00:00Z"               ; 2022-10-02T00:00:00Z
                                 "2023-10-02T00:00:00+01:00"))))))))) ; 2023-10-01T23:00:00Z

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
                             (mt/formatted-rows (repeat (count units) int))
                             first
                             (zipmap units))))]
          (is (= {:second 31795200, :minute 529920, :hour 8832, :day 368, :week 52, :month 12, :year 1}
                 (diffs [:datetime-add #t "2022-10-03T00:00:00" 1 "day"] [:datetime-add #t "2023-10-03T00:00:00" 4 "day"])))))
      (testing "Result works in arithmetic expressions"
        (let [start "2021-10-03T09:19:09"
              end   "2022-10-03T09:18:09"]
          (is (= [1 6 365 370]
                 (->> (mt/run-mbql-query orders
                        {:limit       1
                         :expressions {"datediff1"     [:datetime-diff start end :year]
                                       "datediff1-add" [:+ [:datetime-diff start end :year] 5]
                                       "datediff2"     [:datetime-diff start end :day]
                                       "datediff2-add" [:+ 5 [:datetime-diff start end :day]]}
                         :fields      [[:expression "datediff1"]
                                       [:expression "datediff1-add"]
                                       [:expression "datediff2"]
                                       [:expression "datediff2-add"]]})
                      (mt/formatted-rows [int int int int])
                      first))))))))

(deftest datetime-diff-type-test
  ;; FIXME — The excluded drivers below don't have TIME types. These shouldn't be hard-coded with #26807
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :datetime-diff)
                         :oracle :presto :redshift :sparksql :snowflake)
    (testing "Cannot datetime-diff against time column"
      (mt/dataset attempted-murders
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Only datetime, timestamp, or date types allowed. Found .*"
             (mt/rows
              (mt/run-mbql-query attempts
                {:limit 1
                 :fields      [[:expression "diff-day"]]
                 :expressions {"diff-day" [:datetime-diff $time_tz $datetime_tz :day]}}))))))))
