(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Date extract tests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- test-temporal-extract
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

(deftest ^:parallel extraction-function-tests
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

    ;; mongo doesn't support casting string to date
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :temporal-extract) :mongo)
      (testing "with date columns"
        (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
                op                  [:get-year :get-quarter :get-month :get-day :get-day-of-week]
                {:keys [expected-fn query-fn]}
                extraction-test-cases]
          (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
            (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))))

(deftest extraction-function-literal-value-test
  (mt/with-temporary-setting-values [start-of-week   :sunday
                                     report-timezone "UTC"]
    (mt/dataset times-mixed
      (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
        (let [ops   [:get-year :get-quarter :get-month :get-day
                     :get-day-of-week :get-hour :get-minute :get-second]
              query (mt/mbql-query times
                      {:expressions (into {} (for [op ops]
                                               [(name op) [op "2022-10-03T07:10:20"]]))
                       :fields      (into [] (for [op ops] [:expression (name op)]))})]
          (mt/with-native-query-testing-context query
            (is (= {:get-day         3
                    :get-day-of-week 2
                    :get-hour        7
                    :get-minute      10
                    :get-month       10
                    :get-quarter     4
                    :get-second      20
                    :get-year        2022}
                   (->> (qp/process-query query)
                        (mt/formatted-rows (repeat int))
                        first
                        (zipmap ops))))))))))

(deftest extraction-function-timestamp-with-time-zone-test
  (mt/dataset times-mixed
    (mt/test-drivers (filter mt/supports-timestamptz-type? (mt/normal-drivers-with-feature :temporal-extract))
      (mt/with-temporary-setting-values [start-of-week   :sunday
                                         report-timezone "Asia/Kabul"]
        (let [ops   [:get-year :get-quarter :get-month :get-day
                     :get-day-of-week :get-hour :get-minute :get-second]
              query (mt/mbql-query times {:expressions (into {"shifted-day"  [:datetime-subtract $dt_tz 78 :day]
                                                              ;; the idea is to extract a column with value =
                                                              ;; 2004-01-01 02:49:09 +04:30 this way the UTC value is
                                                              ;; 2003-12-31 22:19:09 +00:00 which will make sure the
                                                              ;; year, quarter, month, day, week is extracted
                                                              ;; correctly TODO: it's better to use a literal for
                                                              ;; this, but the function is not working properly with
                                                              ;; OffsetDatetime for all drivers, so we'll go wit this
                                                              ;; for now
                                                              "shifted-hour" [:datetime-subtract
                                                                              [:expression "shifted-day"]
                                                                              4
                                                                              :hour]}
                                                             (for [op ops]
                                                               [(name op) [op [:expression "shifted-hour"]]]))
                                          :fields      (into [] (for [op ops] [:expression (name op)]))
                                          :filter      [:= $index 1]
                                          :limit       1})]
          (mt/with-native-query-testing-context query
            (is (= (if (or (#{:sqlserver :h2} driver/*driver*)
                           (driver.u/supports? driver/*driver* :set-timezone (mt/db)))
                     {:get-year        2004
                      :get-quarter     1
                      :get-month       1
                      :get-day         1
                      :get-day-of-week 5
                      ;; TIMEZONE FIXME these drivers are returning the extracted hours in
                      ;; the timezone that they were inserted in
                      ;; maybe they need explicit convert-timezone to the report-tz before extraction?
                      :get-hour        (case driver/*driver*
                                         (:h2 :sqlserver :oracle) 5
                                         2)
                      :get-minute      (case driver/*driver*
                                         (:h2 :sqlserver :oracle) 19
                                         49)
                      :get-second      9}
                     {:get-year        2003
                      :get-quarter     4
                      :get-month       12
                      :get-day         31
                      :get-day-of-week 4
                      :get-hour        22
                      :get-minute      19
                      :get-second      9})
                   (->> (mt/process-query query)
                        (mt/formatted-rows (repeat int))
                        first
                        (zipmap ops))))))))))

(deftest ^:parallel temporal-extraction-with-filter-expresion-tests
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

(deftest ^:parallel temporal-extraction-with-datetime-arithmetic-expression-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract :expressions :date-arithmetics)
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
  (mt/with-temporary-setting-values [start-of-week :sunday]
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
                   (test-extract-week (mt/id :weeks :d) :instance)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Date arithmetics tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn datetime-math
  [op x amount unit]
  (let [amount (if (= op :datetime-add)
                 amount
                 (- amount))
        fmt    (cond
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
  (mt/with-temporary-setting-values [start-of-week   :sunday
                                     report-timezone "UTC"]
    (mt/dataset times-mixed
      (mt/test-drivers (mt/normal-drivers-with-feature :date-arithmetics)
        (testing "date arithmetic with datetime columns"
          (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                  op                  [:datetime-add :datetime-subtract]
                  unit                [:year :quarter :month :day :hour :minute :second]

                  {:keys [expected query]}
                  [{:expected [(datetime-math op #t "2004-03-19 09:19:09" 2 unit) (datetime-math op #t "2008-06-20 10:20:10" 2 unit)
                               (datetime-math op #t "2012-11-21 11:21:11" 2 unit) (datetime-math op #t "2012-11-21 11:21:11" 2 unit)]
                    :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                               :fields      [[:expression "expr"]]}}
                   {:expected (into [] (frequencies
                                        [(datetime-math op #t "2004-03-19 09:19:09" 2 unit) (datetime-math op #t "2008-06-20 10:20:10" 2 unit)
                                         (datetime-math op #t "2012-11-21 11:21:11" 2 unit) (datetime-math op #t "2012-11-21 11:21:11" 2 unit)]))
                    :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                               :aggregation [[:count]]
                               :breakout    [[:expression "expr"]]}}]]
            (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
              (is (= (set expected) (set (test-datetime-math query)))))))))))

(deftest datetime-math-tests-mongodb
  (mt/with-temporary-setting-values [start-of-week   :sunday
                                     report-timezone "UTC"]
    ;; mongo doesn't support casting string to date so we exclude it here
    ;; tests for it are in [[metabase.driver.mongo.query-processor-test]]
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-arithmetics) :mongo)
      (mt/dataset times-mixed
        (testing "date arithmetic with date columns"
          (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
                  op                  [:datetime-add :datetime-subtract]
                  unit                [:year :quarter :month :day]

                  {:keys [expected query]}
                  [{:expected [(datetime-math op #t "2004-03-19 00:00:00" 2 unit) (datetime-math op #t "2008-06-20 00:00:00" 2 unit)
                               (datetime-math op #t "2012-11-21 00:00:00" 2 unit) (datetime-math op #t "2012-11-21 00:00:00" 2 unit)]
                    :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                               :fields      [[:expression "expr"]]}}
                   {:expected (into [] (frequencies
                                        [(datetime-math op #t "2004-03-19 00:00:00" 2 unit) (datetime-math op #t "2008-06-20 00:00:00" 2 unit)
                                         (datetime-math op #t "2012-11-21 00:00:00" 2 unit) (datetime-math op #t "2012-11-21 00:00:00" 2 unit)]))
                    :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                               :aggregation [[:count]]
                               :breakout    [[:expression "expr"]]}}]]
            (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
              (is (= (set expected) (set (test-datetime-math query)))))))))))

(deftest temporal-arithmetic-with-literal-date-test
  (mt/with-temporary-setting-values [start-of-week   :sunday
                                     report-timezone "UTC"]
    (mt/dataset times-mixed
      (mt/test-drivers (mt/normal-drivers-with-feature :date-arithmetics)
        (testing "date arithmetics with literal date"
          (is (= ["2008-08-20 00:00:00" "2008-04-20 00:00:00"]
                 (->> (mt/run-mbql-query times
                        {:expressions {"add" [:datetime-add "2008-06-20T00:00:00" 2 :month]
                                       "sub" [:datetime-subtract "2008-06-20T00:00:00" 2 :month]}
                         :fields      [[:expression "add"] [:expression "sub"]]})
                      (mt/formatted-rows [normalize-timestamp-str normalize-timestamp-str])
                      first))))))))

(defn- close? [t1 t2 period]
  (and (t/before? (t/instant t1) (t/plus (t/instant t2) period))
       (t/after? (t/instant t1) (t/minus (t/instant t2) period))))

(deftest now-test
  (mt/test-drivers (mt/normal-drivers-with-feature :now)
    (testing "should return the current time"
      ;; Allow a 30 second window for the current time to account for any difference between the time in Clojure and the DB
      (doseq [timezone [nil "America/Los_Angeles"]]
        (mt/with-report-timezone-id! timezone
          (is (= true
                 (-> (mt/run-mbql-query venues
                       {:expressions {"1" [:now]}
                        :fields [[:expression "1"]]
                        :limit  1})
                     mt/rows
                     ffirst
                     u.date/parse
                     (t/zoned-date-time (t/zone-id "UTC")) ; needed for sqlite, which returns a local date time
                     (close? (t/instant) (t/seconds 30))))))))))

(deftest ^:parallel now-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :now :date-arithmetics)
    (testing "should work as an argument to datetime-add and datetime-subtract"
      (is (= true
             (-> (mt/run-mbql-query venues
                   {:expressions {"1" [:datetime-subtract [:datetime-add [:now] 1 :day] 1 :day]}
                    :fields [[:expression "1"]]
                    :limit  1})
                 mt/rows
                 ffirst
                 u.date/parse
                 (t/zoned-date-time (t/zone-id "UTC"))
                 (close? (t/instant) (t/seconds 30))))))))

(deftest ^:parallel now-test-3
  (mt/test-drivers (mt/normal-drivers-with-feature :now)
    (testing "now works in a filter"
      (is (= 1000
             (->> (mt/run-mbql-query checkins
                    {:aggregation [[:count]]
                     :filter      [:<= $date [:now]]})
                  (mt/formatted-rows [int])
                  ffirst))))))

(deftest ^:parallel now-test-4
  (mt/test-drivers (mt/normal-drivers-with-feature :now :datetime-diff)
    (testing "should work as an argument to datetime-diff"
      (is (= 0
             (->> (mt/run-mbql-query venues
                    {:expressions {"1" [:datetime-diff [:now] [:now] :month]}
                     :fields [[:expression "1"]]
                     :limit  1})
                  (mt/formatted-rows [int])
                  ffirst))))))

(deftest ^:parallel now-test-5
  (mt/test-drivers (mt/normal-drivers-with-feature :now :date-arithmetics :datetime-diff)
    (testing "should work in combination with datetime-diff and date-arithmetics"
      (is (= [1 1]
             (->> (mt/run-mbql-query venues
                    {:expressions {"1" [:datetime-diff [:now] [:datetime-add [:now] 1 :day] :day]
                                   "2" [:now]
                                   "3" [:datetime-diff [:expression "2"] [:datetime-add [:expression "2"] 1 :day] :day]}
                     :fields [[:expression "1"]
                              [:expression "3"]]
                     :limit  1})
                  (mt/formatted-rows [int int])
                  first))))))

(defn- close-minute?
  "Tests whether two minute integers are within 1 minute of each other on the clock.
   0 and 59 are considered close."
  [a b]
  (or (<= (mod (- b a) 60) 1)
      (<= (mod (- a b) 60) 1)))

(defn- close-hour?
  "Tests whether two hour integers are within 1 hour of each other on the clock.
   0 and 23 are considered close."
  [a b]
  (or (<= (mod (- b a) 24) 1)
      (<= (mod (- a b) 24) 1)))

(deftest now-with-extract-test
  (mt/test-drivers (mt/normal-drivers-with-feature :now :temporal-extract)
    (testing "now should work with temporal extract functions according to the report timezone"
      (doseq [timezone ["UTC" "Asia/Kathmandu"]] ; UTC+5:45 all year
        (mt/with-temporary-setting-values [report-timezone timezone]
          (let [[minute hour] (->> (mt/run-mbql-query venues
                                     {:expressions {"minute" [:get-minute [:now]]
                                                    "hour" [:get-hour [:now]]}
                                      :fields [[:expression "minute"]
                                               [:expression "hour"]]
                                      :limit  1})
                                   (mt/formatted-rows [int int])
                                   first)
                results-timezone (mt/with-metadata-provider (mt/id) (qp.timezone/results-timezone-id))
                now              (t/local-date-time (t/zone-id results-timezone))]
            (is (true? (close-minute? minute (.getMinute now))))
            (is (true? (close-hour? hour (.getHour now))))))))))

(deftest datetime-math-with-extract-test
  (mt/with-temporary-setting-values [start-of-week   :sunday
                                     report-timezone "UTC"]
    (mt/test-drivers (mt/normal-drivers-with-feature :date-arithmetics)
      (mt/dataset times-mixed
        (doseq [{:keys [title expected query]}
                [{:title    "Nested date math then extract"
                  :expected [2006 2010 2014]
                  :query    {:expressions {"expr" [:get-year [:datetime-add [:field (mt/id :times :dt) nil] 2 :year]]}
                             :fields      [[:expression "expr"]]}}

                 {:title    "Nested date math twice"
                  :expected ["2006-05-19 09:19:09" "2010-08-20 10:20:10" "2015-01-21 11:21:11"]
                  :query    {:expressions {"expr" [:datetime-add [:datetime-add [:field (mt/id :times :dt) nil] 2 :year] 2 :month]}
                             :fields      [[:expression "expr"]]}}

                 {:title    "filter with date math"
                  :expected [1]
                  :query    {:filter [:= [:get-year [:datetime-add [:field (mt/id :times :dt) nil] 2 :year]] 2006]
                             :fields [[:field (mt/id :times :index)]]}}]]
          (testing title
            (is (= (set expected) (set (test-datetime-math query))))))))))


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
                        :fields      [field                   ;; original row for comparision
                                      [:expression "expr"]]}) ;; result
                     mt/rows
                     first))]
        (testing "timestamp with out timezone columns"
          (mt/with-report-timezone-id! "UTC"
            (testing "convert from Asia/Shanghai(+08:00) to Asia/Seoul(+09:00)"
              (is (= ["2004-03-19T09:19:09Z"
                      "2004-03-19T10:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                  $times.dt
                                  [:convert-timezone $times.dt "Asia/Seoul" "Asia/Shanghai"])))))
            (testing "source-timezone is required"
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"input column doesnt have a set timezone. Please set the source parameter in convertTimezone to convert it."
                   (mt/$ids (test-convert-tz
                                $times.dt
                                [:convert-timezone [:field (mt/id :times :dt) nil] "Asia/Seoul"]))))))

          (when (driver.u/supports? driver/*driver* :set-timezone (mt/db))
            (mt/with-report-timezone-id! "Europe/Rome"
              (testing "results should be displayed in the converted timezone, not report-tz"
                (is (= ["2004-03-19T09:19:09+01:00" "2004-03-19T17:19:09+09:00"]
                       (mt/$ids (test-convert-tz
                                    $times.dt
                                    [:convert-timezone [:field (mt/id :times :dt) nil] "Asia/Seoul" "Europe/Rome"]))))))))

        (testing "timestamp with time zone columns"
          (mt/with-report-timezone-id! "UTC"
            (testing "convert to +09:00"
              (is (= ["2004-03-19T02:19:09Z" "2004-03-19T11:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                  $times.dt_tz
                                  [:convert-timezone [:field (mt/id :times :dt_tz) nil] "Asia/Seoul"])))))

            (testing "timestamp with time zone columns shouldn't have `source-timezone`"
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"input column already has a set timezone. Please remove the source parameter in convertTimezone."
                   (mt/$ids (test-convert-tz
                                $times.dt_tz
                                [:convert-timezone [:field (mt/id :times :dt_tz) nil]
                                 "Asia/Seoul"
                                 "UTC"]))))))

          (when (driver.u/supports? driver/*driver* :set-timezone (mt/db))
            (mt/with-report-timezone-id! "Europe/Rome"
              (testing "the base timezone should be the timezone of column (Asia/Ho_Chi_Minh)"
                (is (= ["2004-03-19T03:19:09+01:00" "2004-03-19T11:19:09+09:00"]
                       (mt/$ids (test-convert-tz
                                    $times.dt_tz
                                    [:convert-timezone [:field (mt/id :times :dt_tz) nil] "Asia/Seoul"]))))))))

        (testing "with literal datetime"
          (mt/with-report-timezone-id! "UTC"
            (is (= "2022-10-03T14:10:20+07:00"
                   (->> (mt/run-mbql-query times
                          {:expressions {"expr" [:convert-timezone "2022-10-03T07:10:20" "Asia/Saigon" "UTC"]}
                           :fields      [[:expression "expr"]]})
                        mt/rows
                        ffirst)))))))))

(deftest nested-convert-timezone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "convert-timezone nested with datetime extract"
          (is (= ["2004-03-19T09:19:09Z"      ;; original col
                  "2004-03-19T10:19:09+09:00" ;; converted
                  10]                         ;; hour
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "Asia/Seoul" "Asia/Shanghai"]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "converted"]
                                       [:expression "hour"]]})
                      (mt/formatted-rows [str str int])
                      first))))))))

(deftest nested-convert-timezone-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "convert-timezone nested with date-math, date-extract"
          (is (= ["2004-03-19T09:19:09Z"      ;; original
                  "2004-03-19T18:19:09+09:00" ;; converted
                  "2004-03-19T20:19:09+09:00" ;; date-added
                  20]                         ;; hour
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted"  [:convert-timezone $times.dt "Asia/Seoul" "UTC"]
                                       "date-added" [:datetime-add [:convert-timezone $times.dt "Asia/Seoul" "UTC"] 2 :hour]
                                       "hour"       [:get-hour [:expression "date-added"]]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "converted"]
                                       [:expression "date-added"]
                                       [:expression "hour"]]})
                      (mt/formatted-rows [str str str int])
                      first))))))))

(deftest nested-convert-timezone-test-3
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
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
                      (mt/formatted-rows [str str int])))))))))

(deftest nested-convert-timezone-test-4
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "convert-timezone twice should works"
          (is (= ["2004-03-19T09:19:09Z"       ;; original column
                  "2004-03-19T16:19:09+07:00"  ;; at +07
                  "2004-03-19T18:19:09+09:00"] ;; at +09
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"to-07"       [:convert-timezone $times.dt "Asia/Saigon" "UTC"]
                                       "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Seoul"
                                                      "Asia/Saigon"]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "to-07"]
                                       [:expression "to-07-to-09"]]})
                      mt/rows
                      first))))))))

(deftest nested-convert-timezone-test-5
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "filter a converted-timezone column"
          (is (= ["2004-03-19T18:19:09+09:00"]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "Asia/Seoul" "UTC"]
                                       "hour" [:get-hour [:expression "converted"]]}
                         :filter      [:between [:expression "hour"] 17 18]
                         :fields      [[:expression "converted"]]})
                      mt/rows
                      first))))))))

(deftest nested-convert-timezone-test-5b
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "filter a converted-timezone column"
          (is (= ["2004-03-19T18:19:09+09:00"]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt "Asia/Seoul" "UTC"]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:= [:expression "hour"] 18]
                         :fields      [[:expression "converted"]]})
                      mt/rows
                      first))))))))

(deftest nested-convert-timezone-test-6
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "nested custom expression should works"
          (t2.with-temp/with-temp [Card
                                   card
                                   {:dataset_query
                                    (mt/mbql-query
                                        times
                                        {:expressions {"to-07"       [:convert-timezone $times.dt "Asia/Saigon" "UTC"]
                                                       "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Seoul"
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

(deftest ^:parallel datetime-diff-base-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset test-data
      (letfn [(query [x y unit]
                (mt/mbql-query orders
                  {:limit 1
                   :expressions {"diff"     [:datetime-diff x y unit]
                                 "diff-rev" [:datetime-diff y x unit]}
                   :fields [[:expression "diff"]
                            [:expression "diff-rev"]]}))
              (results [a-query]
                (first (mt/formatted-rows [int int]
                         (qp/process-query a-query))))]
        (doseq [[unit cases] [[:year [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0 "same time"]
                                      ["2021-10-03T09:18:09" "2022-10-02T09:18:09" 0 "day under a year"]
                                      ["2021-10-03T09:19:09" "2022-10-03T09:18:09" 1 "ignores time"]
                                      ["2016-02-03T09:19:09" "2017-02-02T09:19:09" 0 "starts in leap year before leap day"]
                                      ["2016-10-03T09:19:09" "2017-10-03T09:19:09" 1 "starts in leap year after leap day"]
                                      ["2017-06-10T08:30:00" "2019-07-10T08:30:00" 2 "multiple years"]
                                      ["2017-06-10" "2019-07-10" 2 "dates"]]]
                              [:quarter [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0 "same time"]
                                         ["2021-10-03T09:18:09" "2022-01-02T09:18:09" 0 "day under a quarter"]
                                         ["2021-10-03T09:19:09" "2022-01-03T09:18:09" 1 "ignores time"]
                                         ["2017-06-10T08:30:00" "2019-07-10T08:30:00" 8 "multiple years"]
                                         ["2017-06-10" "2019-07-10" 8 "dates"]]]
                              [:month [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0  "same time"]
                                       ["2022-10-03T09:18:09" "2022-11-02T09:18:09" 0  "day under a month"]
                                       ["2022-10-02T09:19:09" "2022-11-02T09:18:09" 1  "minute under a month"]
                                       ["2022-10-02T09:18:09" "2023-10-03T09:18:09" 12 "over a year"]
                                       ["2022-10-02" "2023-10-03" 12 "dates"]]]
                              [:week [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0  "same time"]
                                      ["2022-10-01T09:18:09" "2022-10-04T09:18:09" 0  "under 7 days across week boundary"]
                                      ["2022-10-02T09:19:09" "2022-10-09T09:18:09" 1  "ignores time"]
                                      ["2022-10-02T09:18:09" "2023-10-03T09:18:09" 52 "over a year"]
                                      ["2022-10-02" "2023-10-03" 52 "dates"]]]
                              [:day [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0   "same time"]
                                     ["2022-10-02T08:30:00" "2022-10-02T10:30:00" 0   "<24h same day"]
                                     ["2022-10-02T09:19:09" "2022-10-03T09:18:09" 1   "<24h consecutive days"]
                                     ["2021-10-02T08:30:00" "2022-10-05T10:30:00" 368 "over a year"]
                                     ["2021-10-02" "2022-10-05" 368 "dates"]]]
                              [:hour [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0     "same time"]
                                      ["2022-10-02T08:30:00" "2022-10-02T08:34:00" 0     "minutes"]
                                      ["2022-10-02T08:30:00" "2022-10-02T09:29:59.999" 0 "millisecond under an hour"]
                                      ["2022-10-02T08:30:00" "2022-10-05T08:34:00" 72    "hours"]
                                      ["2021-10-02T08:30:00" "2022-10-02T08:34:00" 8760  "over a year"]
                                      ["2021-10-02" "2022-10-02" 8760  "dates"]]]
                              [:minute [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0      "same time"]
                                        ["2022-10-02T08:30:00" "2022-10-02T08:30:59.999" 0  "millisecond under a minute"]
                                        ["2022-10-02T08:30:00" "2022-10-02T08:34:00" 4      "minutes"]
                                        ["2022-10-02T08:30:00" "2022-10-02T10:30:00" 120    "hours"]
                                        ["2021-10-02T08:30:00" "2022-10-02T08:34:00" 525604 "over a year"]
                                        ["2021-10-02" "2022-10-02" 525600  "dates"]]]
                              [:second [["2021-10-03T09:00:00" "2021-10-03T09:00:00" 0        "same time"]
                                        ["2022-10-02T08:30:00" "2022-10-02T08:30:00.999" 0    "millisecond under a second"]
                                        ["2022-10-02T08:30:00" "2022-10-02T08:34:00" 240      "minutes"]
                                        ["2022-10-02T08:30:00" "2022-10-02T10:30:00" 7200     "hours"]
                                        ["2021-10-02T08:30:00" "2022-10-02T08:34:00" 31536240 "over a year"]
                                        ["2021-10-02" "2022-10-02" 31536000 "dates"]
                                        ["2021-10-02" "2022-10-02T08:34:00" 31566840 "dates and datetimes"]]]]
                [x y expected description] cases]
          (testing (name unit)
            (testing description
              (let [query (query x y unit)]
                (mt/with-native-query-testing-context query
                  (is (= [expected (- expected)]
                         (results query))))))))))))

(deftest datetime-diff-mixed-types-test
  (mt/test-drivers (filter mt/supports-timestamptz-type? (mt/normal-drivers-with-feature :datetime-diff))
    (mt/dataset times-mixed
      (testing "Can compare across dates, datetimes with timezones from a table"
        ;; these particular numbers are not important, just that we can compare between dates, datetimes, etc.
        (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
          (is (= [25200 -8349]
                 (->> (mt/run-mbql-query times
                        {:fields [[:expression "tz,dt"]
                                  [:expression "tz,d"]]
                         :limit 1
                         :expressions
                         {"tz,dt" [:datetime-diff $dt_tz $dt :second]
                          "tz,d"  [:datetime-diff $dt_tz $d :second]}})
                      (mt/formatted-rows [int int])
                      first)))))))
  ;; Athena needs special treatment. It supports the `timestamp with time zone` type in query expressions
  ;; but not in tables. So we create a native query that returns a `timestamp with time zone` type and then
  ;; run another query with `datetime-diff` against it.
  (mt/test-driver :athena
    (testing "datetime-diff can compare `date`, `timestamp`, and `timestamp with time zone` args with Athena"
      (mt/with-temp
        [Card card (qp.test-util/card-with-source-metadata-for-query
                    (mt/native-query {:query (str "select"
                                                  " date '2022-01-01' as d,"
                                                  " timestamp '2022-01-01 00:00:00.000' as dt,"
                                                  " with_timezone(timestamp '2022-01-01 00:00:00.000', 'Africa/Lagos') as dt_tz")}))]
        (let [d       [:field "d" {:base-type :type/Date}]
              dt      [:field "dt" {:base-type :type/DateTime}]
              dt_tz   [:field "dt_tz" {:base-type :type/DateTimeWithZoneID}]
              results (mt/process-query
                       {:database (mt/id)
                        :type     :query
                        :query    {:fields   [[:expression "tz,dt"]
                                              [:expression "tz,d"]]
                                   :expressions
                                   {"tz,dt" [:datetime-diff dt_tz dt :second]
                                    "tz,d"  [:datetime-diff dt_tz d :second]}
                                   :source-table (str "card__" (u/the-id card))}})]
          (is (= [3600 3600]
                 (->> results
                      (mt/formatted-rows [int int])
                      first))))))))

(mt/defdataset diff-time-zones-cases
  [["times"
    [{:field-name "a_dt_tz",      :base-type :type/DateTimeWithTZ}
     {:field-name "b_dt_tz",      :base-type :type/DateTimeWithTZ}
     {:field-name "a_dt_tz_text", :base-type :type/Text}
     {:field-name "b_dt_tz_text", :base-type :type/Text}]
    (let [times [#t "2022-10-02T00:00:00Z[UTC]"
                 #t "2022-10-02T01:00:00+01:00[Africa/Lagos]"
                 #t "2022-10-03T00:00:00Z[UTC]"
                 #t "2022-10-03T00:00:00+01:00[Africa/Lagos]"
                 #t "2022-10-09T00:00:00Z[UTC]"
                 #t "2022-10-09T00:00:00+01:00[Africa/Lagos]"
                 #t "2022-11-02T00:00:00Z[UTC]"
                 #t "2022-11-02T00:00:00+01:00[Africa/Lagos]"
                 #t "2023-01-02T00:00:00Z[UTC]"
                 #t "2023-01-02T00:00:00+01:00[Africa/Lagos]"
                 #t "2023-10-02T00:00:00Z[UTC]"
                 #t "2023-10-02T00:00:00+01:00[Africa/Lagos]"]]
      (for [a times
            b times
            :when (and (t/before? a b)
                       (not= (t/zone-id a) (t/zone-id b)))]
        [a                                        ; a_dt_tz
         b                                        ; b_dt_tz
         (t/format :iso-offset-date-time a)       ; a_dt_tz_text
         (t/format :iso-offset-date-time b)]))]]) ; b_dt_tz_text

(mt/defdataset diff-time-zones-athena-cases
  ;; This dataset contains the same set of values as [[diff-time-zones-cases]], but without the time zones.
  ;; It is needed to test `datetime-diff` with Athena, since Athena supports `timestamp with time zone`
  ;; in query expressions but not in a table. [[diff-time-zones-athena-cases-query]] uses this dataset
  ;; to recreate [[diff-time-zones-cases]] for Athena as a query.
  [["times"
    [{:field-name "dt",      :base-type :type/DateTime}
     {:field-name "dt_text", :base-type :type/Text}]
    (for [dt [#t "2022-10-02T00:00:00"
              #t "2022-10-02T01:00:00"
              #t "2022-10-03T00:00:00"
              #t "2022-10-09T00:00:00"
              #t "2022-11-02T00:00:00"
              #t "2023-01-02T00:00:00"
              #t "2023-10-02T00:00:00"]]
      [dt (u.date/format dt)])]])

(def ^:private diff-time-zones-athena-cases-query
  ;; This query recreates [[diff-time-zones-cases]] for Athena from [[diff-time-zones-athena-cases]].
  "with x as (
     select
     with_timezone(dt, 'UTC') as dt
     , concat(dt_text, 'Z') as dt_text -- e.g. 2022-10-02T00:00:00Z
     , 'UTC' as time_zone
   from diff_time_zones_athena_cases.times
   union
   select
     with_timezone(dt, 'Africa/Lagos') as dt
     , concat(dt_text, '+01:00') as dt_text -- e.g. 2022-10-02T00:00:00+01:00
     , 'Africa/Lagos' as time_zone
   from diff_time_zones_athena_cases.times
   )
   select
     a.dt as a_dt_tz
     , a.dt_text as a_dt_tz_text
     , b.dt as b_dt_tz
     , b.dt_text as b_dt_tz_text
   from x a
   join x b on a.dt < b.dt and a.time_zone <> b.time_zone")

(defn- run-datetime-diff-time-zone-tests!
  "Runs all the test cases for datetime-diff clauses with :type/DateTimeWithTZ types.

   `diffs` is a function that executes a query with the `datetimeDiff` function applied to its two arguments.
   Its args are strings in the format `:iso-offset-date-time`. It returns a map of all the valid
   `datetimeDiff` units and the results.

   For example:
   (diffs \"2022-10-02T01:00:00+01:00\" \"2022-10-03T00:00:00Z\")
    => `{:second 86400 :minute 1440 :hour 24 :day 1 :quarter 0 :month 0 :year 0}`)."
  [diffs]
  (testing "a day"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"] ; UTC-1 all year
      (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                    (diffs "2022-10-02T01:00:00+01:00"  ; 2022-10-01T23:00:00-01:00 <- datetime in report-timezone offset
                           "2022-10-03T00:00:00Z"))))   ; 2022-10-02T23:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2022-10-03T00:00:00Z"))))) ; 2022-10-03T00:00:00Z
  (testing "hour under a day"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:second 82800 :minute 1380 :hour 23 :day 1}
                      {:second 82800 :minute 1380 :hour 23 :day 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2022-10-03T00:00:00+01:00")))) ; 2022-10-02T22:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:second 82800 :minute 1380 :hour 23 :day 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2022-10-03T00:00:00+01:00"))))) ; 2022-10-02T23:00:00Z
  (testing "hour under a week"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:hour 167 :day 7 :week 1}
                      {:hour 167 :day 6 :week 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2022-10-09T00:00:00+01:00")))) ; 2022-10-08T22:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:hour 167 :day 6 :week 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2022-10-09T00:00:00+01:00"))))) ; 2022-10-08T23:00:00Z
  (testing "week"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:hour 168 :day 7 :week 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-01T23:00:00-01:00
                           "2022-10-09T00:00:00Z"))))  ; 2022-10-08T23:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:hour 168 :day 7 :week 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2022-10-09T00:00:00Z"))))) ; 2022-10-09T00:00:00Z
  (testing "hour under a month"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:hour 743 :day 31 :week 4 :month 1}
                      {:hour 743 :day 30 :week 4 :month 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2022-11-02T00:00:00+01:00")))) ; 2022-11-01T22:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:hour 743 :day 30 :week 4 :month 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2022-11-02T00:00:00+01:00"))))) ; 2022-11-01T23:00:00Z
  (testing "month"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-01T23:00:00-01:00
                           "2022-11-02T00:00:00Z"))))  ; 2022-11-01T23:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2022-11-02T00:00:00Z"))))) ; 2022-11-02T00:00:00Z
  (testing "hour under a quarter"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:month 3 :quarter 1}
                      {:month 2 :quarter 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2023-01-02T00:00:00+01:00")))) ; 2023-01-01T22:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:month 2 :quarter 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2023-01-02T00:00:00+01:00"))))) ; 2023-01-01T23:00:00Z
  (testing "quarter"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:month 3 :quarter 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-01T23:00:00-01:00
                           "2023-01-02T00:00:00Z"))))  ; 2023-01-01T23:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:month 3 :quarter 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2023-01-02T00:00:00Z"))))) ; 2023-01-02T00:00:00Z
  (testing "year"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:day 365, :week 52, :month 12, :year 1}
                    (diffs "2022-10-02T01:00:00+01:00"     ; 2022-10-01T23:00:00-01:00
                           "2023-10-02T00:00:00Z"))))      ; 2023-10-01T23:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:day 365, :week 52, :month 12, :year 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2023-10-02T00:00:00Z"))))) ; 2023-10-02T00:00:00Z
  (testing "hour under a year"
    (mt/with-temporary-setting-values [driver/report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:day 365 :month 12 :year 1}
                      {:day 364 :month 11 :year 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2023-10-02T00:00:00+01:00")))) ; 2023-10-01T22:00:00-01:00
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (is (partial= {:day 364 :month 11 :year 0}
                    (diffs "2022-10-02T00:00:00Z"            ; 2022-10-02T00:00:00Z
                           "2023-10-02T00:00:00+01:00")))))) ; 2023-10-01T23:00:00Z

(deftest datetime-diff-time-zones-test
  (mt/test-drivers (filter mt/supports-timestamptz-type? (mt/normal-drivers-with-feature :datetime-diff))
    (mt/dataset diff-time-zones-cases
      (let [diffs (fn [a-str b-str]
                    (let [units [:second :minute :hour :day :week :month :quarter :year]]
                      (->> (mt/run-mbql-query times
                             {:filter [:and [:= a-str $a_dt_tz_text] [:= b-str $b_dt_tz_text]]
                              :expressions (into {} (for [unit units]
                                                      [(name unit) [:datetime-diff $a_dt_tz $b_dt_tz unit]]))
                              :fields (into [] (for [unit units]
                                                 [:expression (name unit)]))})
                           (mt/formatted-rows (repeat (count units) int))
                           first
                           (zipmap units))))]
        (run-datetime-diff-time-zone-tests! diffs)))))

(deftest datetime-diff-time-zones-test-athena
  ;; Athena needs special treatment. It supports the `timestamp with time zone` type in query expressions
  ;; but not at rest. Here we create a native query that returns a `timestamp with time zone` type and then
  ;; run another query with `datetime-diff` against it.
  (mt/test-driver :athena
    (mt/dataset diff-time-zones-athena-cases
      (mt/with-temp [Card card (qp.test-util/card-with-source-metadata-for-query
                                (mt/native-query {:query diff-time-zones-athena-cases-query}))]
        (let [diffs
              (fn [a-str b-str]
                (let [units   [:second :minute :hour :day :week :month :quarter :year]
                      results (mt/process-query
                               {:database (mt/id)
                                :type     :query
                                :query    {:filter [:and
                                                    [:= a-str [:field "a_dt_tz_text" {:base-type :type/DateTime}]]
                                                    [:= b-str [:field "b_dt_tz_text" {:base-type :type/DateTime}]]]
                                           :expressions  (into {}
                                                               (for [unit units]
                                                                 [(name unit) [:datetime-diff
                                                                               [:field "a_dt_tz" {:base-type :type/DateTime}]
                                                                               [:field "b_dt_tz" {:base-type :type/DateTime}]
                                                                               unit]]))
                                           :fields       (into [] (for [unit units]
                                                                    [:expression (name unit)]))
                                           :source-table (str "card__" (u/the-id card))}})]
                  (->> results
                       (mt/formatted-rows (repeat (count units) int))
                       first
                       (zipmap units))))]
          (run-datetime-diff-time-zone-tests! diffs))))))

(deftest ^:parallel datetime-diff-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset test-data
      (testing "Args can be expressions that return datetime values"
        (let [diffs (fn [x y]
                      (let [units [:second :minute :hour :day :week :month :quarter :year]]
                        (->> (mt/run-mbql-query orders
                               {:limit 1
                                :expressions (into {} (for [unit units]
                                                        [(name unit) [:datetime-diff x y unit]]))
                                :fields (into [] (for [unit units]
                                                   [:expression (name unit)]))})
                             (mt/formatted-rows (repeat (count units) int))
                             first
                             (zipmap units))))]
          (is (= {:second 31795200, :minute 529920, :hour 8832, :day 368, :week 52, :month 12, :quarter 4, :year 1}
                 (diffs [:datetime-add #t "2022-10-03T00:00:00" 1 "day"] [:datetime-add #t "2023-10-03T00:00:00" 4 "day"]))))))))

(deftest ^:parallel datetime-diff-expressions-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset test-data
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

(deftest ^:parallel datetime-diff-type-test
  (mt/test-drivers (filter mt/supports-time-type? (mt/normal-drivers-with-feature :datetime-diff))
    (testing "Cannot datetime-diff against time column"
      (mt/dataset time-test-data
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"datetimeDiff only allows datetime, timestamp, or date types. Found .*"
             (mt/run-mbql-query users
               {:limit 1
                :fields      [[:expression "diff-day"]]
                :expressions {"diff-day" [:datetime-diff $last_login_time $last_login_date :day]}})))))))
