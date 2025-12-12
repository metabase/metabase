(ns ^:mb/driver-tests metabase.query-processor.date-time-zone-functions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.date-2 :as u.date]))

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

(deftest ^:parallel extraction-function-datetime-test
  (mt/dataset times-mixed
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
      (testing "with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                op                  [:get-year :get-quarter :get-month :get-day
                                     :get-day-of-week :get-hour :get-minute :get-second]
                {:keys [expected-fn query-fn]}
                extraction-test-cases]
          (testing (format "extract %s function works as expected on %s column for driver %s" op col-type driver/*driver*)
            (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))))

(defmethod driver/database-supports? [::driver/driver ::cast-string-to-date]
  [_driver _feature _database]
  true)

;;; mongo doesn't support casting string to date
(defmethod driver/database-supports? [:mongo ::cast-string-to-date]
  [_driver _feature _database]
  false)

(deftest ^:parallel extraction-function-date-test
  (mt/dataset times-mixed
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract ::cast-string-to-date)
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
        (let [datetime  "2022-10-03T07:10:20"
              ops       [:get-year :get-quarter :get-month :get-day
                         :get-day-of-week [:get-day-of-week :iso] :get-hour :get-minute :get-second]
              expr-name (fn [op]
                          (if (sequential? op)
                            (->> op
                                 (map #(if (keyword? %)
                                         (name %)
                                         (str %)))
                                 (str/join "+"))
                            (name op)))
              query     (mt/mbql-query times
                          {:expressions (into {}
                                              (for [op   ops
                                                    :let [[tag args] (if (vector? op)
                                                                       [(first op) (rest op)]
                                                                       [op])]]
                                                [(expr-name op)
                                                 (into [tag datetime] args)]))
                           :fields      (into []
                                              (for [op ops] [:expression (expr-name op)]))})]
          (mt/with-native-query-testing-context query
            (is (= {:get-day                3
                    :get-day-of-week        2
                    [:get-day-of-week :iso] 1
                    :get-hour               7
                    :get-minute             10
                    :get-month              10
                    :get-quarter            4
                    :get-second             20
                    :get-year               2022}
                   (->> (qp/process-query query)
                        (mt/formatted-rows
                         (repeat int))
                        first
                        (zipmap ops))))))))))

(defmulti extraction-function-timestamp-with-time-zone-test-expected-results
  "Expected results for [[extraction-function-timestamp-with-time-zone-test]]."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod extraction-function-timestamp-with-time-zone-test-expected-results :default
  [driver]
  (if (driver.u/supports? driver :set-timezone (mt/db))
    {:get-year        2004
     :get-quarter     1
     :get-month       1
     :get-day         1
     :get-day-of-week 5
     :get-hour        2
     :get-minute      49
     :get-second      9}
    {:get-year        2003
     :get-quarter     4
     :get-month       12
     :get-day         31
     :get-day-of-week 4
     :get-hour        22
     :get-minute      19
     :get-second      9}))

;;; TIMEZONE FIXME these drivers are returning the extracted hours in the timezone that they were inserted in maybe they
;;; need explicit convert-timezone to the report-tz before extraction?
(doseq [driver [:h2 :sqlserver :oracle]]
  (defmethod extraction-function-timestamp-with-time-zone-test-expected-results driver
    [_driver]
    {:get-year        2004
     :get-quarter     1
     :get-month       1
     :get-day         1
     :get-day-of-week 5
     :get-hour        5
     :get-minute      19
     :get-second      9}))

(deftest extraction-function-timestamp-with-time-zone-test
  (mt/dataset times-mixed
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract :test/timestamptz-type)
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
            (is (= (extraction-function-timestamp-with-time-zone-test-expected-results driver/*driver*)
                   (->> (mt/process-query query)
                        (mt/formatted-rows
                         (repeat int))
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
       (mt/formatted-rows
        [int])
       (map first)))

(defmethod driver/database-supports? [::driver/driver ::extract-week-test]
  [_driver _feature _database]
  true)

;;; the native get week of sqlite is not iso, and it's not easy to implement in raw sql, so skips it for now
(defmethod driver/database-supports? [:sqlite ::extract-week-test]
  [_driver _feature _database]
  false)

(deftest extract-week-test
  (mt/with-temporary-setting-values [start-of-week :sunday]
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract ::extract-week-test)
      (mt/dataset times-mixed
        (testing "iso8601 week"
          (is (= [52 52 1 1 1 1 1 1 1 53]
                 (test-extract-week (mt/id :weeks :d) :iso)))
          (testing "shouldn't change if start-of-week settings change"
            (mt/with-temporary-setting-values [start-of-week :monday]
              (is (= [52 52 1 1 1 1 1 1 1 53]
                     (test-extract-week (mt/id :weeks :d) :iso))))))))))

(defmethod driver/database-supports? [::driver/driver ::extract-week-us-test]
  [_driver _feature _database]
  true)

;;; check the (defmethod sql.qp/date [:snowflake :week-of-year-us]) for why we skip snowflake
(defmethod driver/database-supports? [:snowflake ::extract-week-us-test]
  [_driver _feature _database]
  false)

(deftest extract-week-us-test
  (mt/with-temporary-setting-values [start-of-week :sunday]
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract ::extract-week-us-test)
      (mt/dataset times-mixed
        (testing "us week"
          (is (= [1 2 2 2 2 2 2 2 3 1]
                 (test-extract-week (mt/id :weeks :d) :us)))
          (testing "shouldn't change if start-of-week settings change"
            (mt/with-temporary-setting-values [start-of-week :monday]
              (is (= [1 2 2 2 2 2 2 2 3 1]
                     (test-extract-week (mt/id :weeks :d) :us))))))))))

(deftest extract-week-instance-test
  (mt/with-temporary-setting-values [start-of-week :sunday]
    (mt/test-drivers (mt/normal-drivers-with-feature :temporal-extract)
      (mt/dataset times-mixed
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
         (mt/formatted-rows
          [normalize-timestamp-str normalize-timestamp-str]))
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :fields      fields})
         (mt/formatted-rows
          [normalize-timestamp-str])
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

(deftest datetime-math-string-to-date-test
  (mt/with-temporary-setting-values [start-of-week   :sunday
                                     report-timezone "UTC"]
    (mt/test-drivers (mt/normal-drivers-with-feature :date-arithmetics ::cast-string-to-date)
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
                      (mt/formatted-rows
                       [normalize-timestamp-str normalize-timestamp-str])
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
          (is (true?
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
      (is (true?
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
                  (mt/formatted-rows
                   [int])
                  ffirst))))))

(deftest ^:parallel now-test-4
  (mt/test-drivers (mt/normal-drivers-with-feature :now :datetime-diff)
    (testing "should work as an argument to datetime-diff"
      (is (= 0
             (->> (mt/run-mbql-query venues
                    {:expressions {"1" [:datetime-diff [:now] [:now] :month]}
                     :fields [[:expression "1"]]
                     :limit  1})
                  (mt/formatted-rows
                   [int])
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
                  (mt/formatted-rows
                   [int int])
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
                                   (mt/formatted-rows
                                    [int int])
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

(defn- test-convert-tz [field expression]
  (->> (mt/run-mbql-query times
         {:expressions {"expr" expression}
          :limit       1
          :fields      [field                  ;; original row for comparison
                        [:expression "expr"]]}) ;; result
       mt/rows
       first))

(deftest convert-timezone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "timestamp with out timezone columns"
        (mt/with-report-timezone-id! "UTC"
          (testing "convert from Asia/Shanghai(+08:00) to Asia/Seoul(+09:00)"
            (is (= ["2004-03-19T09:19:09Z"
                    "2004-03-19T10:19:09+09:00"]
                   (mt/$ids (test-convert-tz
                             $times.dt
                             [:convert-timezone $times.dt "Asia/Seoul" "Asia/Shanghai"]))))))))))

(deftest convert-timezone-test-1b
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "timestamp with out timezone columns"
        (mt/with-report-timezone-id! "UTC"
          (testing "source-timezone is required"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"input column doesn't have a set timezone. Please set the source parameter in convertTimezone to convert it."
                 (mt/$ids (test-convert-tz
                           $times.dt
                           [:convert-timezone [:field (mt/id :times :dt) nil] "Asia/Seoul"]))))))))))

(deftest convert-timezone-test-1c
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "timestamp with out timezone columns"
        (when (driver.u/supports? driver/*driver* :set-timezone (mt/db))
          (mt/with-report-timezone-id! "Europe/Rome"
            (testing "results should be displayed in the converted timezone, not report-tz"
              (is (= ["2004-03-19T09:19:09+01:00" "2004-03-19T17:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                               $times.dt
                               [:convert-timezone [:field (mt/id :times :dt) nil] "Asia/Seoul" "Europe/Rome"])))))))))))

(deftest convert-timezone-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "timestamp with time zone columns"
        (mt/with-report-timezone-id! "UTC"
          (testing "convert to +09:00"
            (is (= ["2004-03-19T02:19:09Z" "2004-03-19T11:19:09+09:00"]
                   (mt/$ids (test-convert-tz
                             $times.dt_tz
                             [:convert-timezone [:field (mt/id :times :dt_tz) nil] "Asia/Seoul"]))))))))))

(deftest convert-timezone-test-2b
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "timestamp with time zone columns"
        (mt/with-report-timezone-id! "UTC"
          (testing "timestamp with time zone columns shouldn't have `source-timezone`"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"input column already has a set timezone. Please remove the source parameter in convertTimezone."
                 (mt/$ids (test-convert-tz
                           $times.dt_tz
                           [:convert-timezone [:field (mt/id :times :dt_tz) nil]
                            "Asia/Seoul"
                            "UTC"]))))))))))

(deftest convert-timezone-test-2c
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "timestamp with time zone columns"
        (when (driver.u/supports? driver/*driver* :set-timezone (mt/db))
          (mt/with-report-timezone-id! "Europe/Rome"
            (testing "the base timezone should be the timezone of column (Asia/Ho_Chi_Minh)"
              (is (= ["2004-03-19T03:19:09+01:00" "2004-03-19T11:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                               $times.dt_tz
                               [:convert-timezone [:field (mt/id :times :dt_tz) nil] "Asia/Seoul"])))))))))))

(deftest convert-timezone-test-3
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "with literal datetime"
        (mt/with-report-timezone-id! "UTC"
          (is (= "2022-10-03T14:10:20+07:00"
                 (->> (mt/run-mbql-query times
                        {:expressions {"expr" [:convert-timezone "2022-10-03T07:10:20" "Asia/Bangkok" "UTC"]}
                         :fields      [[:expression "expr"]]})
                      mt/rows
                      ffirst))))))))

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
                      (mt/formatted-rows
                       [str str int])
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
                      (mt/formatted-rows
                       [str str str int])
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
                      (mt/formatted-rows
                       [str str int])))))))))

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
                        {:expressions {"to-07"       [:convert-timezone $times.dt "Asia/Bangkok" "UTC"]
                                       "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Seoul"
                                                      "Asia/Bangkok"]}
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

(defmulti nested-convert-timezone-test-6-native-query
  {:arglists '([driver card-tag])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod nested-convert-timezone-test-6-native-query :default
  [_driver card-tag]
  (format "select * from {{%s}} as source" card-tag))

(defmethod nested-convert-timezone-test-6-native-query :oracle
  [_driver card-tag]
  (format "select * from {{%s}}" card-tag))

(deftest nested-convert-timezone-test-6
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/with-report-timezone-id! "UTC"
      (mt/dataset times-mixed
        (testing "nested custom expression should works"
          (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                            (mt/metadata-provider)
                                            [(mt/mbql-query
                                               times
                                               {:expressions {"to-07"       [:convert-timezone $times.dt "Asia/Bangkok" "UTC"]
                                                              "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Seoul" "Asia/Bangkok"]}
                                                :filter      [:= $times.index 1]
                                                :fields      [$times.dt
                                                              [:expression "to-07"]
                                                              [:expression "to-07-to-09"]]})])
            (testing "sanity check: make sure metadata is correct"
              (let [query (lib/query
                           (qp.store/metadata-provider)
                           (lib.metadata/card (qp.store/metadata-provider) 1))]
                (testing `lib.metadata.result-metadata/returned-columns
                  (is (=? [{:name "dt"}
                           {:name "to-07", :converted-timezone "Asia/Bangkok"}
                           {:name "to-07-to-09", :converted-timezone "Asia/Seoul"}]
                          (map #(select-keys % [:name :converted-timezone])
                               (lib.metadata.result-metadata/returned-columns query)))))
                (testing `annotate/expected-cols
                  (is (=? [{:name "dt"}
                           {:name "to-07", :converted_timezone "Asia/Bangkok"}
                           {:name "to-07-to-09", :converted_timezone "Asia/Seoul"}]
                          (map #(select-keys % [:name :converted_timezone])
                               (annotate/expected-cols query)))))
                (testing `qp.preprocess/query->expected-cols
                  (is (=? [{:name "dt"}
                           {:name "to-07", :converted_timezone "Asia/Bangkok"}
                           {:name "to-07-to-09", :converted_timezone "Asia/Seoul"}]
                          (map #(select-keys % [:name :converted_timezone])
                               (qp.preprocess/query->expected-cols query)))))))
            (testing "mbql query"
              (is (= [["2004-03-19T09:19:09Z"
                       "2004-03-19T16:19:09+07:00"
                       "2004-03-19T18:19:09+09:00"]]
                     (->> (mt/mbql-query nil {:source-table "card__1"})
                          mt/process-query
                          mt/rows))))))))))

(deftest convert-timezone-native-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (mt/dataset times-mixed
      (testing "MBQL query with native first stage and MBQL second stage can convert timezones without a src (#64705)"
        ;; We allow `:convert-timezone` with only the destination timezone, when the underlying column has a known
        ;; timezone. When the first stage is a native query (or when SQL-based sandboxing makes it so, in #64705)
        ;; the driver needs to know if the input column has a timezone.
        (when (driver.u/supports? driver/*driver* :set-timezone (mt/db))
          (mt/with-report-timezone-id! "Europe/Rome"
            (let [mp     (mt/metadata-provider)
                  table  (lib.metadata/table mp (mt/id :times))
                  col-fn #(lib.options/ensure-uuid [:field {:base-type :type/DateTimeWithLocalTZ} "dt_tz"])
                  sql    (format "SELECT %s FROM %s WHERE 1 = 1"
                                 (sql.u/quote-name driver/*driver* :field "dt_tz")
                                 (sql.u/quote-name driver/*driver* :table (:schema table) (:name table)))
                  query  (-> (lib/native-query mp sql)
                             lib/append-stage
                             (lib/with-fields [(col-fn)])
                             ;; TODO: Can't build this with `lib/convert-timezone` because it requires both
                             ;; src and dest timezones, while the UI only requires dest.
                             (lib/expression "expr" (lib.options/ensure-uuid
                                                     [:convert-timezone {} (col-fn) "America/Toronto"]))
                             (lib/order-by (col-fn))
                             (lib/limit 1))]
              (is (= [["2004-03-19T03:19:09+01:00" "2004-03-18T21:19:09-05:00"]]
                     (-> query
                         mt/process-query
                         mt/rows))))))))))

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
                (first (mt/formatted-rows
                        [int int]
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

(defmethod driver/database-supports? [::driver/driver ::datetime-diff-mixed-types-test]
  [_driver _feature _database]
  true)

;;; Athena needs special treatment. It supports the `timestamp with time zone` type in query expressions but not in
;;; tables. So we create a native query that returns a `timestamp with time zone` type and then run another query with
;;; `datetime-diff` against it.
;;;
;;; Athena has its own version of this test in [[metabase.driver.athena-test/datetime-diff-mixed-types-test]]
(defmethod driver/database-supports? [:athena ::datetime-diff-mixed-types-test]
  [_driver _feature _database]
  false)

(deftest datetime-diff-mixed-types-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff :test/timestamptz-type ::datetime-diff-mixed-types-test)
    (mt/dataset times-mixed
      (testing "Can compare across dates, datetimes with timezones from a table"
        ;; these particular numbers are not important, just that we can compare between dates, datetimes, etc.
        (mt/with-temporary-setting-values [report-timezone "UTC"]
          (is (= [25200 -8349]
                 (->> (mt/run-mbql-query times
                        {:fields [[:expression "tz,dt"]
                                  [:expression "tz,d"]]
                         :limit 1
                         :expressions
                         {"tz,dt" [:datetime-diff $dt_tz $dt :second]
                          "tz,d"  [:datetime-diff $dt_tz $d :second]}})
                      (mt/formatted-rows
                       [int int])
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

(deftest single-time-zone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff :test/timestamptz-type)
    (mt/dataset diff-time-zones-cases
      (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"] ; UTC-1 all year
        (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                      (let [a-str "2022-10-02T01:00:00+01:00"  ; 2022-10-01T23:00:00-01:00 <- datetime in report-timezone offset
                            b-str "2022-10-03T00:00:00Z"
                            units [:second :minute :hour :day :week :month :quarter :year]]

                        (->> (mt/run-mbql-query times
                               {:filter [:and [:= a-str $a_dt_tz_text] [:= b-str $b_dt_tz_text]]
                                :expressions (into {} (for [unit units]
                                                        [(name unit) [:datetime-diff $a_dt_tz $b_dt_tz unit]]))
                                :fields (into [] (for [unit units]
                                                   [:expression (name unit)]))})
                             (mt/formatted-rows
                              (repeat (count units) int))
                             first
                             (zipmap units)))))))))

(defn run-datetime-diff-time-zone-tests!
  "Runs all the test cases for datetime-diff clauses with :type/DateTimeWithTZ types.

   `diffs` is a function that executes a query with the `datetimeDiff` function applied to its two arguments.
   Its args are strings in the format `:iso-offset-date-time`. It returns a map of all the valid
   `datetimeDiff` units and the results.

   For example:
   (diffs \"2022-10-02T01:00:00+01:00\" \"2022-10-03T00:00:00Z\")
    => `{:second 86400 :minute 1440 :hour 24 :day 1 :quarter 0 :month 0 :year 0}`)."
  [diffs]
  (testing "a day"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"] ; UTC-1 all year
      (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                    (diffs "2022-10-02T01:00:00+01:00"  ; 2022-10-01T23:00:00-01:00 <- datetime in report-timezone offset
                           "2022-10-03T00:00:00Z"))))   ; 2022-10-02T23:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:second 86400 :minute 1440 :hour 24 :day 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2022-10-03T00:00:00Z"))))) ; 2022-10-03T00:00:00Z
  (testing "hour under a day"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:second 82800 :minute 1380 :hour 23 :day 1}
                      {:second 82800 :minute 1380 :hour 23 :day 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2022-10-03T00:00:00+01:00")))) ; 2022-10-02T22:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:second 82800 :minute 1380 :hour 23 :day 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2022-10-03T00:00:00+01:00"))))) ; 2022-10-02T23:00:00Z
  (testing "hour under a week"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:hour 167 :day 7 :week 1}
                      {:hour 167 :day 6 :week 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2022-10-09T00:00:00+01:00")))) ; 2022-10-08T22:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:hour 167 :day 6 :week 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2022-10-09T00:00:00+01:00"))))) ; 2022-10-08T23:00:00Z
  (testing "week"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:hour 168 :day 7 :week 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-01T23:00:00-01:00
                           "2022-10-09T00:00:00Z"))))  ; 2022-10-08T23:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:hour 168 :day 7 :week 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2022-10-09T00:00:00Z"))))) ; 2022-10-09T00:00:00Z
  (testing "hour under a month"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:hour 743 :day 31 :week 4 :month 1}
                      {:hour 743 :day 30 :week 4 :month 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2022-11-02T00:00:00+01:00")))) ; 2022-11-01T22:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:hour 743 :day 30 :week 4 :month 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2022-11-02T00:00:00+01:00"))))) ; 2022-11-01T23:00:00Z
  (testing "month"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-01T23:00:00-01:00
                           "2022-11-02T00:00:00Z"))))  ; 2022-11-01T23:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:hour 744 :day 31 :month 1 :year 0}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2022-11-02T00:00:00Z"))))) ; 2022-11-02T00:00:00Z
  (testing "hour under a quarter"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:month 3 :quarter 1}
                      {:month 2 :quarter 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2023-01-02T00:00:00+01:00")))) ; 2023-01-01T22:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:month 2 :quarter 0}
                    (diffs "2022-10-02T00:00:00Z"           ; 2022-10-02T00:00:00Z
                           "2023-01-02T00:00:00+01:00"))))) ; 2023-01-01T23:00:00Z
  (testing "quarter"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:month 3 :quarter 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-01T23:00:00-01:00
                           "2023-01-02T00:00:00Z"))))  ; 2023-01-01T23:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:month 3 :quarter 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2023-01-02T00:00:00Z"))))) ; 2023-01-02T00:00:00Z
  (testing "year"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= {:day 365, :week 52, :month 12, :year 1}
                    (diffs "2022-10-02T01:00:00+01:00"     ; 2022-10-01T23:00:00-01:00
                           "2023-10-02T00:00:00Z"))))      ; 2023-10-01T23:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:day 365, :week 52, :month 12, :year 1}
                    (diffs "2022-10-02T01:00:00+01:00" ; 2022-10-02T00:00:00Z
                           "2023-10-02T00:00:00Z"))))) ; 2023-10-02T00:00:00Z
  (testing "hour under a year"
    (mt/with-temporary-setting-values [report-timezone "Atlantic/Cape_Verde"]
      (is (partial= (if (driver.u/supports? driver/*driver* :set-timezone (mt/db))
                      {:day 365 :month 12 :year 1}
                      {:day 364 :month 11 :year 0})
                    (diffs "2022-10-02T00:00:00Z"          ; 2022-10-01T23:00:00-01:00
                           "2023-10-02T00:00:00+01:00")))) ; 2023-10-01T22:00:00-01:00
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (is (partial= {:day 364 :month 11 :year 0}
                    (diffs "2022-10-02T00:00:00Z"            ; 2022-10-02T00:00:00Z
                           "2023-10-02T00:00:00+01:00")))))) ; 2023-10-01T23:00:00Z

;;; there is an Athena version of this test in [[metabase.driver.athena-test/datetime-diff-time-zones-test]]
(deftest datetime-diff-time-zones-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff :test/timestamptz-type)
    (mt/dataset diff-time-zones-cases
      (let [diffs (fn [a-str b-str]
                    (let [units [:second :minute :hour :day :week :month :quarter :year]]
                      (->> (mt/run-mbql-query times
                             {:filter [:and [:= a-str $a_dt_tz_text] [:= b-str $b_dt_tz_text]]
                              :expressions (into {} (for [unit units]
                                                      [(name unit) [:datetime-diff $a_dt_tz $b_dt_tz unit]]))
                              :fields (into [] (for [unit units]
                                                 [:expression (name unit)]))})
                           (mt/formatted-rows
                            (repeat (count units) int))
                           first
                           (zipmap units))))]
        (run-datetime-diff-time-zone-tests! diffs)))))

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
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff :test/time-type)
    (testing "Cannot datetime-diff against time column"
      (mt/dataset time-test-data
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"datetimeDiff only allows datetime, timestamp, or date types. Found .*"
             (mt/run-mbql-query users
               {:limit 1
                :fields      [[:expression "diff-day"]]
                :expressions {"diff-day" [:datetime-diff $last_login_time $last_login_date :day]}})))))))
