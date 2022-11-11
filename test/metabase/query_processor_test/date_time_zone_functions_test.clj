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
           (is (= (set (expected-fn op)) (set (test-temporal-extract (query-fn op field-id)))))))))))

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

(defmacro with-start-of-week
  "With start of week."
  [start-of-week & body]
  `(mt/with-temporary-setting-values [start-of-week ~start-of-week]
     ~@body))

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
            (with-start-of-week :monday
              (is (= [52 52 1 1 1 1 1 1 1 53]
                     (test-extract-week (mt/id :weeks :d) :iso)))))))

      ;; check the (defmethod sql.qp/date [:snowflake :week-of-year-us]) for why we skip snowflake
      (when-not (#{:snowflake} driver/*driver*)
        (testing "us week"
          (is (= [1 2 2 2 2 2 2 2 3 1]
                 (test-extract-week (mt/id :weeks :d) :us)))
          (testing "shouldn't change if start-of-week settings change"
            (with-start-of-week :monday
              (is (= [1 2 2 2 2 2 2 2 3 1]
                     (test-extract-week (mt/id :weeks :d) :us)))))))

      (testing "instance week"
        (is (= [1 2 2 2 2 2 2 2 3 1]
               (test-extract-week (mt/id :weeks :d) :instance)))

        (with-start-of-week :monday
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
            (is (= (set expected) (set (test-datetime-math query))))))))))


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

(def offset->zone
  "A map of all Offset to a zone-id.
  {\"+07\00\" \"Asia/Saigon\"}"
  (into {"+00:00" "UTC"}
        (for [zone-id (java.time.ZoneId/getAvailableZoneIds)]
          [(-> (t/zone-id zone-id)
               .getRules
               (.getOffset (java.time.Instant/now))
               .toString)
           zone-id])))

(defmacro with-results-and-report-timezone-id
  [timezone-id & body]
  `(mt/with-results-timezone-id ~timezone-id
     (mt/with-report-timezone-id ~timezone-id
       ~@body)))

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
          (with-results-and-report-timezone-id "UTC"
            (testing "convert from +05:00 to +09:00"
              (is (= ["2004-03-19T09:19:09Z"
                      "2004-03-19T13:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt
                                [:convert-timezone $times.dt (offset->zone "+09:00") (offset->zone "+05:00")])))))
            (testing "convert to +09:00, from_tz should have default is system-tz (UTC)"
              (is (= ["2004-03-19T09:19:09Z" "2004-03-19T18:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt
                                [:convert-timezone [:field (mt/id :times :dt) nil] (offset->zone "+09:00")]))))))

          (with-results-and-report-timezone-id "Europe/Rome"
            (testing "from_tz should default to report_tz"
              (is (= ["2004-03-19T09:19:09+01:00" "2004-03-19T17:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt
                                [:convert-timezone [:field (mt/id :times :dt) nil] (offset->zone "+09:00")])))))

            (testing "if from_tz is provided, ignore report_tz"
              (is (= ["2004-03-19T09:19:09+01:00" "2004-03-19T18:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt
                                [:convert-timezone [:field (mt/id :times :dt) nil] (offset->zone "+09:00") (offset->zone "+00:00")])))))))

        (testing "timestamp with time zone columns"
          (with-results-and-report-timezone-id "UTC"
            (testing "convert to +09:00"
              (is (= ["2004-03-19T02:19:09Z" "2004-03-19T11:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt_tz
                                [:convert-timezone [:field (mt/id :times :dt_tz) nil] (offset->zone "+09:00")])))))
            (testing "timestamp with time zone columns shouldn't have `from_tz`"
              (is (thrown-with-msg?
                    clojure.lang.ExceptionInfo
                    #".* columns shouldn't have a `source timezone`"
                    (mt/$ids (test-convert-tz
                               $times.dt_tz
                               [:convert-timezone [:field (mt/id :times :dt_tz) nil]
                                (offset->zone "+09:00")
                                (offset->zone "+00:00")]))))))

          (with-results-and-report-timezone-id "Europe/Rome"
            (testing "the base timezone should be the timezone of column (Asia/Ho_Chi_Minh)"
              (is (= ["2004-03-19T03:19:09+01:00" "2004-03-19T11:19:09+09:00"]
                     (mt/$ids (test-convert-tz
                                $times.dt_tz
                                [:convert-timezone [:field (mt/id :times :dt_tz) nil] (offset->zone "+09:00")])))))))))))

(deftest nested-convert-timezone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
    (with-results-and-report-timezone-id "UTC"
      (mt/dataset times-mixed
        (testing "convert-timezone nested with datetime extract"
          (is (= ["2004-03-19T09:19:09Z" "2004-03-19T13:19:09+09:00" 13]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt (offset->zone "+09:00") (offset->zone "+05:00")]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "converted"]
                                       [:expression "hour"]]})
                      (mt/formatted-rows [str str int])
                      first))))

        (testing "convert-timezone nested with date-math, date-extract"
          (is (= ["2004-03-19T09:19:09Z" "2004-03-19T18:19:09+09:00" "2004-03-19T20:19:09Z" 20]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted"  [:convert-timezone $times.dt (offset->zone "+09:00")]
                                       "date-added" [:datetime-add [:expression "converted"] 2 :hour]
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
                        {:expressions {"to-07"       [:convert-timezone $times.dt (offset->zone "+07:00")]
                                       "to-07-to-09" [:convert-timezone [:expression "to-07"] (offset->zone "+09:00")
                                                      (offset->zone "+07:00")]}
                         :filter      [:= $times.index 1]
                         :fields      [$times.dt
                                       [:expression "to-07"]
                                       [:expression "to-07-to-09"]]})
                      first))))

        (testing "filter a converted-timezone column"
          (is (= ["2004-03-19T18:19:09+09:00"]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt (offset->zone "+09:00")]
                                       "hour"       [:get-hour [:expression "converted"]]}
                         :filter      [:between [:expression "hour"] 17 18]
                         :fields      [[:expression "converted"]]})
                      mt/rows
                      first)))
          (is (= ["2004-03-19T18:19:09+09:00"]
                 (->> (mt/run-mbql-query
                        times
                        {:expressions {"converted" [:convert-timezone $times.dt (offset->zone "+09:00")]
                                       "hour"      [:get-hour [:expression "converted"]]}
                         :filter      [:= [:expression "hour"] 18]
                         :fields      [[:expression "converted"]]})
                      mt/rows
                      first))))

        (testing "nested query should works"
          (mt/with-temp Card [card
                              {:dataset_query
                               (mt/mbql-query
                                 times
                                 {:expressions {"to-07"       [:convert-timezone $times.dt (offset->zone "+07:00")]
                                                "to-07-to-09" [:convert-timezone [:expression "to-07"] (offset->zone "+09:00")
                                                               (offset->zone "+07:00")]}
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

            (testing "native query"
              (let [card-tag (format "#%d" (:id card))]
                ;; FIXME: technically these values should have offset timezone(not just all are 'Z')
                ;; but we haven't figured out a way to pass the convert_timezone metadata if you use a native query.
                ;; FWIW we don't display `offset` part on UI, so whether it's Z or "+XX:XX" it doesn't matter
                ;; What important is datetime extraction or date-math functions gives correct values
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
