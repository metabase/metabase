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

(deftest datetimediff-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetimediff)
    (tools.macro/macrolet [(datetimediff-of [unit]
                             `(testing ~(name unit)
                                (mt/mbql-query
                                 datetimediff-demo
                                 {:filter [:= ~'$description ~(name unit)]
                                  :fields [[:expression ~(str "diff-" (name unit))]]
                                  :expressions
                                  {~(str "diff-" (name unit))
                                   [:datetimediff ~'$start ~'$end ~unit]}})))]
      (mt/dataset useful-dates
        (testing "year"
          (is (= (case driver/*driver*
                   [[1] [2] [0]])
                 (mt/rows (mt/process-query (datetimediff-of :year))))))
        (testing "month"
          (is (= [[1] [3] [0]]
                 (mt/rows (mt/process-query (datetimediff-of :month))))))
        (testing "day"
          (is (= [[3] [368] [0]]
                 (mt/rows (mt/process-query (datetimediff-of :day))))))
        (testing "hour"
          (is (= [[2] [0] [72] [8760]]
                 (mt/rows (mt/process-query (datetimediff-of :hour))))))
        (testing "minute"
          (is (= [[120] [4] [525604]] (mt/rows (mt/process-query (datetimediff-of :minute))))))))
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
    [[1 "minute under an hour" #t "2022-10-02 08:30:00" #t "2022-10-02 09:29:00"]
     [1 "minute under a day"  #t "2022-10-02 08:30:00" #t "2022-10-03 08:29:00"]
     [1 "second under an hour" #t "2022-10-02 08:30:00" #t "2022-10-02 09:29:59"]
     [1 "second under a day"  #t "2022-10-02 08:30:00" #t "2022-10-03 08:29:59"]
     [1 "second under a minute"  #t "2022-10-02 08:30:00" #t "2022-10-02 08:30:59"]
     [1 "millisecond under an hour"  #t "2022-10-02 08:30:00" #t "2022-10-02 09:29:59.999"]
     [1 "millisecond under a minute"  #t "2022-10-02 08:30:00" #t "2022-10-02 08:30:59.999"]
     [1 "millisecond under a second"  #t "2022-10-02 08:30:00" #t "2022-10-02 08:30:00.999"]
     [1 "day under a year"        #t "2021-10-03 09:18:09" #t "2022-10-02 09:18:09"]
     [1 "minute under a year"     #t "2021-10-03 09:19:09" #t "2022-10-03 09:18:09"]
     [1 "day under a month"       #t "2022-10-03 09:18:09" #t "2022-11-02 09:18:09"]
     [1 "minute under a month"    #t "2022-10-02 09:19:09" #t "2022-11-02 09:18:09"]
     [1 "day under a week"        #t "2022-10-02 09:18:09" #t "2022-10-08 09:18:09"]
     [1 "<7d across weeks"        #t "2022-10-01 09:18:09" #t "2022-10-04 09:18:09"]
     [1 "minute under a week"     #t "2022-10-02 09:19:09" #t "2022-10-09 09:18:09"]
     [1 "<24h same day"           #t "2022-10-02 00:00:00" #t "2022-10-02 23:59:59"]
     [1 "millisecond under a day" #t "2022-10-02 00:00:00" #t "2022-10-02 23:59:59.999"]
     [1 "<24h consecutive days"   #t "2022-10-02 09:19:09" #t "2022-10-03 09:18:09"]]]])

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
        (test-cases :hour [["minute under an hour" 0]
                           ["minute under a day"   23]
                           ["second under an hour" 0]
                           ["millisecond under an hour" 0]
                           ["second under a day"   23]])
        (test-cases :minute [["minute under a day"  1439]
                             ["minute under an hour" 59]
                             ["second under an hour" 59]
                             ["second under a minute" 0]
                             ["millisecond under a minute" 0]])
        (test-cases :second [["millisecond under a minute" 59]
                             ["millisecond under a second" 0]
                             ["minute under an hour" 3540]])
        (test-cases :day [["<24h consecutive days" 1]
                          ["<24h same day" 0]
                          ["day under a month" 30]
                          ["minute under a month" 31]])
        (test-cases :week [["day under a week" 0]
                           ["<7d across weeks" 0]
                           ["minute under a week" 1]
                           ["minute under a month" 4]])
        (test-cases :month [["day under a month" 0]
                            ["day under a year" 11]
                            ["minute under a month" 1]
                            ["minute under a year" 12]])
        (test-cases :year [["day under a year" 0]
                           ["minute under a year" 1]])
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
                     :order-by    [[:asc $description]]}))))))))
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
               :expressions {"diff-day" [:datetimediff $ts $t :day]}}))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Only datetime, timestamp, or date types allowed. Found .*"
           (mt/rows
            (mt/run-mbql-query datediff-with-time
              {:fields      [[:expression "diff-day"]]
               :expressions {"diff-day" [:datetimediff $ts [:date-add $t 3 "hour"] :day]}})))))))