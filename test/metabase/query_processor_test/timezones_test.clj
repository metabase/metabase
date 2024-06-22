(ns metabase.query-processor-test.timezones-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util.date-2 :as u.date]))

;; TIMEZONE FIXME
(def broken-drivers
  "The following drivers are broken to some extent -- details listed in the Google Doc, or can be see here:
  https://circleci.com/workflow-run/856f6dd0-3d95-4732-a56e-1af59e3ae4ba. The goal is to gradually remove these
  one-by-one as they are fixed."
  ;; I think some of these are only in here because they don't support the TIME type -- in that case we
  ;; should be checking [[mt/supports-time-type?]] instead.
  #{:athena
    :bigquery-cloud-sdk
    :oracle
    :redshift
    :sparksql
    :vertica})

(defn- set-timezone-drivers
  "Drivers that support setting a Session timezone."
  []
  (set/difference
   (set (mt/normal-drivers-with-feature :set-timezone))
   broken-drivers))

(defn timezone-aware-column-drivers
  "Drivers that support the equivalent of `TIMESTAMP WITH TIME ZONE` columns."
  []
  (conj (set-timezone-drivers) :h2 :bigquery-cloud-sdk :sqlserver))

;; TODO - we should also do similar tests for timezone-unaware columns
(deftest result-rows-test
  (mt/dataset tz-test-data
    (mt/test-drivers (timezone-aware-column-drivers)
      (is (= [[12 "2014-07-03T01:30:00Z"]
              [10 "2014-07-03T19:30:00Z"]]
             (mt/formatted-rows [int identity]
               (mt/run-mbql-query users
                 {:fields   [$id $last_login]
                  :filter   [:= $id 10 12]
                  :order-by [[:asc $last_login]]})))
          "Basic sanity check: make sure the rows come back with the values we'd expect without setting report-timezone"))
    (mt/test-drivers (set-timezone-drivers)
      (doseq [[timezone expected-rows] {"UTC"        [[12 "2014-07-03T01:30:00Z"]
                                                      [10 "2014-07-03T19:30:00Z"]]
                                        "US/Pacific" [[10 "2014-07-03T12:30:00-07:00"]]}]
        (mt/with-temporary-setting-values [report-timezone timezone]
          (is (= expected-rows
                 (mt/formatted-rows [int identity]
                   (mt/run-mbql-query users
                     {:fields   [$id $last_login]
                      :filter   [:= $last_login "2014-07-03"]
                      :order-by [[:asc $last_login]]})))
              (format "There should be %d checkins on July 3rd in the %s timezone" (count expected-rows) timezone)))))))

(deftest filter-test
  (mt/dataset tz-test-data
    (mt/test-drivers (set-timezone-drivers)
      (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
        (is (= [[6 "Shad Ferdynand" "2014-08-02T05:30:00-07:00"]]
               (mt/formatted-rows [int identity identity]
                 (mt/run-mbql-query users
                   {:filter [:between $last_login "2014-08-02T03:00:00.000000" "2014-08-02T06:00:00.000000"]})))
            (str "If MBQL datetime literal strings do not explicitly specify a timezone, they should be parsed as if "
                 "in the current reporting timezone (Pacific in this case)"))
        (is (= [[6 "Shad Ferdynand" "2014-08-02T05:30:00-07:00"]]
               (mt/formatted-rows [int identity identity]
                 (mt/run-mbql-query users
                   {:filter [:between $last_login "2014-08-02T10:00:00.000000Z" "2014-08-02T13:00:00.000000Z"]})))
            "MBQL datetime literal strings that include timezone should be parsed in it regardless of report timezone")))
    (testing "UTC timezone"
      (let [run-query   (fn []
                          (mt/formatted-rows [int identity identity]
                            (mt/run-mbql-query users
                              {:filter [:between $last_login "2014-08-02T10:00:00.000000" "2014-08-02T13:00:00.000000"]})))
            utc-results [[6 "Shad Ferdynand" "2014-08-02T12:30:00Z"]]]
        (mt/test-drivers (set-timezone-drivers)
          (is (= utc-results
                 (mt/with-temporary-setting-values [report-timezone "UTC"]
                   (run-query)))
              "Checking UTC report timezone filtering and responses"))
        (mt/test-drivers (timezone-aware-column-drivers)
          (is (= utc-results
                 (run-query))
              (str "With no report timezone, the JVM timezone is used. For our tests this is UTC so this should be the "
                   "same as specifying UTC for a report timezone")))))))

(defn- table-identifier [table-key]
  (sql.qp/->honeysql driver/*driver*
                     (lib.metadata/table (qp.store/metadata-provider) (mt/id table-key))))

(defn- field-identifier [table-key field-key]
  (sql.qp/->honeysql driver/*driver*
                     [:field
                      (mt/id table-key field-key)
                      {:metabase.query-processor.util.add-alias-info/source-table (mt/id table-key)}]))

(defn- honeysql->sql [honeysql]
  (first (sql.qp/format-honeysql driver/*driver* honeysql)))

(defn- native-params-queries
  "Map with different types of native params queries, used in test below. Key is a description of the type of native
  params in the query."
  []
  {"variable w/ single date"
   {:native     {:query         (honeysql->sql
                                 {:select   (mapv (fn [field-name]
                                                    [(field-identifier :users field-name)])
                                                  [:id :name :last_login])
                                  :from     [[(table-identifier :users)]]
                                  :where    [:between
                                             (field-identifier :users :last_login)
                                             [:raw "{{date1}}"]
                                             [:raw "{{date2}}"]]
                                  :order-by [[(field-identifier :users :id) :asc]]})
                 :template-tags {:date1 {:name "date1" :display_name "Date1" :type "date"}
                                 :date2 {:name "date2" :display_name "Date2" :type "date"}}}
    :parameters [{:type   "date/single"
                  :target ["variable" ["template-tag" "date1"]]
                  :value  "2014-08-02T02:00:00.000000"}
                 {:type   "date/single"
                  :target ["variable" ["template-tag" "date2"]]
                  :value  "2014-08-02T06:00:00.000000"}]}

   "field filter w/ date range"
   {:native     {:query         (honeysql->sql
                                 {:select   (mapv (fn [field-name]
                                                    [(field-identifier :users field-name)])
                                                  [:id :name :last_login])
                                  :from     [[(table-identifier :users)]]
                                  :where    [:raw "{{ts_range}}"]
                                  :order-by [[(field-identifier :users :id) :asc]]})
                 :template-tags {:ts_range {:name         "ts_range"
                                            :display_name "Timestamp Range"
                                            :type         "dimension"
                                            :widget-type  :date/all-options
                                            :dimension    [:field (mt/id :users :last_login) nil]}}}
    :parameters [{:type   "date/range"
                  :target ["dimension" ["template-tag" "ts_range"]]
                  :value  "2014-08-02~2014-08-03"}]}

   "field filter w/ single date"
   {:native     {:query         (honeysql->sql
                                 {:select   (mapv (fn [field-name]
                                                    [(field-identifier :users field-name)])
                                                  [:id :name :last_login])
                                  :from     [[(table-identifier :users)]]
                                  :where    [:raw "{{just_a_date}}"]
                                  :order-by [[(field-identifier :users :id) :asc]]})
                 :template-tags {:just_a_date {:name         "just_a_date"
                                               :display_name "Just A Date"
                                               :type         "dimension"
                                               :widget-type  :date/all-options
                                               :dimension    [:field (mt/id :users :last_login) nil]}}}
    :parameters [{:type   "date/single"
                  :target ["dimension" ["template-tag" "just_a_date"]]
                  :value  "2014-08-02"}]}})

(deftest native-sql-params-filter-test
  ;; parameters always get `date` bucketing so doing something the between stuff we do below is basically just going
  ;; to match anything with a `2014-08-02` date
  (mt/test-drivers (filter
                    #(isa? driver/hierarchy % :sql)
                    (set/intersection (set-timezone-drivers)
                                      (mt/normal-drivers-with-feature :native-parameters)))
    (mt/dataset tz-test-data
      (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
        (testing "Native dates should be parsed with the report timezone"
          (qp.store/with-metadata-provider (mt/id)
            (doseq [[params-description query] (native-params-queries)]
              (testing (format "Query with %s" params-description)
                (mt/with-native-query-testing-context query
                  (is (= [[6 "Shad Ferdynand"  "2014-08-02T05:30:00-07:00"]
                          [7 "Conchúr Tihomir" "2014-08-02T02:30:00-07:00"]]
                         (mt/formatted-rows
                          [int identity identity]
                          (qp/process-query
                           (merge
                            {:database (mt/id)
                             :type     :native}
                            query))))))))))))))

;; Make sure TIME values are handled consistently (#10366)
(defn- attempts []
  (zipmap
   [:date :time :datetime :time_ltz :time_tz :datetime_ltz :datetime_tz :datetime_tz_id]
   (mt/first-row
     (qp/process-query
       (mt/query attempts
         {:query      {:fields [$date $time $datetime $time_ltz $time_tz $datetime_ltz $datetime_tz $datetime_tz_id]
                       :filter [:= $id 1]}
          :middleware {:format-rows? false}})))))

(defn- driver-distinguishes-between-base-types?
  "True if the current distinguishes between two base types when loading data in test datasets.
  TODO — how is this supposed to work for MongoDB?"
  [base-type-1 base-type-2]
  (not= (sql.tx/field-base-type->sql-type driver/*driver* base-type-1)
        (sql.tx/field-base-type->sql-type driver/*driver* base-type-2)))

(defn- supports-time-with-time-zone?   [] (driver-distinguishes-between-base-types? :type/TimeWithTZ :type/Time))
(defn- supports-time-with-offset?      [] (driver-distinguishes-between-base-types? :type/TimeWithZoneOffset :type/TimeWithTZ))
(defn- supports-datetime-with-offset?  [] (driver-distinguishes-between-base-types? :type/DateTimeWithZoneOffset :type/DateTimeWithTZ))
(defn- supports-datetime-with-zone-id? [] (driver-distinguishes-between-base-types? :type/DateTimeWithZoneID :type/DateTimeWithTZ))

(defn- expected-attempts []
  (merge
   {:date         (t/local-date "2019-11-01")
    :time         (t/local-time "00:23:18.331")
    :datetime     (t/local-date-time "2019-11-01T00:23:18.331")
    :datetime_ltz (t/offset-date-time "2019-11-01T07:23:18.331Z")}
   (when (supports-time-with-time-zone?)
     {:time_ltz (t/offset-time "07:23:18.331Z")})
   (when (supports-time-with-offset?)
     {:time_tz (t/offset-time "00:23:18.331-07:00")})
   (when (supports-datetime-with-offset?)
     {:datetime_tz (t/offset-date-time "2019-11-01T00:23:18.331-07:00")})
   (when (supports-datetime-with-zone-id?)
     {:datetime_tz_id (t/zoned-date-time "2019-11-01T00:23:18.331-07:00[America/Los_Angeles]")})))

(deftest sql-time-timezone-handling-test
  ;; Actual value : "2019-11-01T00:23:18.331-07:00[America/Los_Angeles]"
  ;; Oracle doesn't have a time type
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql) (set-timezone-drivers))
    (mt/dataset attempted-murders
      (doseq [timezone [nil "US/Pacific" "US/Eastern" "Asia/Hong_Kong"]]
        (mt/with-temporary-setting-values [report-timezone timezone]
          (let [expected (expected-attempts)
                actual   (select-keys (attempts) (keys expected))]
            (is (= expected actual))))))))

(mt/defdataset all-dates-leap-year
  (let [start-date #t "2012-01-01T01:30:54Z"]
    [["alldates" [{:field-name "dt"
                   :base-type :type/DateTimeWithTZ}]
      (for [i (range 366)]
        [(u.date/add start-date :day i)])]]))

(defmethod driver/database-supports? [::driver/driver ::extract-week-of-year-us]
  [_driver _feature _database]
  true)

;;; Snowflake doesn't support extracting week of year US
(defmethod driver/database-supports? [:snowflake ::extract-week-of-year-us]
  [_driver _feature _database]
  false)

(deftest general-timezone-support-test
  (mt/dataset all-dates-leap-year
    (mt/test-drivers (set-timezone-drivers)
      (let [extract-units (cond-> (disj u.date/extract-units :day-of-year)
                            (not (driver.u/supports? driver/*driver* ::extract-week-of-year-us (mt/db)))
                            (disj :week-of-year))
            ;; :week-of-year-instance is the behavior of u.date/extract (based on public-settings start-of-week)
            extract-translate {:year :year-of-era :week-of-year :week-of-year-us}
            trunc-units (disj u.date/truncate-units :millisecond :second)
            cols        (concat
                         (for [extract-unit extract-units]
                           extract-unit)
                         (for [trunc-unit trunc-units]
                           trunc-unit)
                         [:dt_tz])]
        (doseq [timezone ["Pacific/Honolulu" "America/Los_Angeles" "UTC" "Pacific/Auckland"]
                :let [expected-rows (for [i (range 366)
                                          :let [expected-datetime (u.date/add #t "2012-01-01T01:30:54Z" :day i)
                                                in-tz (u.date/with-time-zone-same-instant expected-datetime timezone)]]
                                      (into {}
                                            cat
                                            [(for [extract-unit extract-units]
                                               [extract-unit (u.date/extract in-tz extract-unit)])
                                             (for [trunc-unit trunc-units]
                                               [trunc-unit
                                                (-> in-tz
                                                    (u.date/truncate trunc-unit)
                                                    u.date/format-sql
                                                    (str/replace #" " "T"))])
                                             [[:dt_tz
                                               (-> in-tz
                                                   u.date/format-sql
                                                   (str/replace #" " "T"))]]]))]]
          (mt/with-temporary-setting-values [report-timezone timezone]
            (let [rows (->> (mt/run-mbql-query alldates
                              {:expressions (->> extract-units
                                                 (map
                                                  (fn [extract-unit]
                                                    [extract-unit [:temporal-extract
                                                                   [:field (mt/id :alldates :dt) nil]
                                                                   (get extract-translate extract-unit extract-unit)]]))
                                                 (into {}))
                               :fields (concat
                                        (for [extract-unit extract-units]
                                          [:expression extract-unit])
                                        (for [trunc-unit trunc-units]
                                          [:field (mt/id :alldates :dt)
                                           {:temporal-unit trunc-unit}])
                                        [[:field (mt/id :alldates :dt)]])
                               :order-by [[:asc (mt/id :alldates :id)]]})
                            (mt/rows)
                            (map (fn [row]
                                   (zipmap cols
                                           row))))]
              (doseq [[expected-row row] (map vector expected-rows rows)]
                (is (= expected-row row))))))))))

(deftest filter-datetime-by-date-in-timezone-relative-to-current-date-test
  (mt/test-drivers (set-timezone-drivers)
    (testing "Relative to current date"
      (let [expected-datetime (u.date/truncate (t/zoned-date-time) :second)]
        (mt/with-temp-test-data [["relative_filter"
                                  [{:field-name "created", :base-type :type/DateTimeWithTZ}]
                                  [[expected-datetime]]]]
          (doseq [timezone ["UTC" "America/Los_Angeles"]]
            (mt/with-temporary-setting-values [report-timezone timezone]
              (let [query (mt/mbql-query relative_filter {:fields [$created]
                                                          :filter [:time-interval $created :current :day]})]
                (mt/with-native-query-testing-context query
                  (let [results (qp/process-query query)]
                    (is (=? {:status :completed}
                            results))
                    (is (= (-> expected-datetime
                               (u.date/with-time-zone-same-instant timezone)
                               t/offset-date-time)
                           (some-> results
                                   mt/first-row
                                   first
                                   (u.date/parse nil)
                                   t/offset-date-time)))))))))))))

(deftest filter-datetime-by-date-in-timezone-relative-to-days-since-test
  (mt/test-drivers (set-timezone-drivers)
    (testing "Relative to days since"
      (let [expected-datetime (u.date/truncate (u.date/add (t/zoned-date-time) :day -1) :second)]
        (mt/with-temp-test-data [["relative_filter"
                                  [{:field-name "created", :base-type :type/DateTimeWithTZ}]
                                  [[expected-datetime]]]]
          (doseq [timezone ["UTC" "Asia/Hong_Kong" "US/Hawaii" "America/Puerto_Rico"]]
            (mt/with-temporary-setting-values [report-timezone timezone]
              (let [query (mt/mbql-query relative_filter {:fields [$created]
                                                          :filter [:time-interval $created -1 :day]})]
                (mt/with-native-query-testing-context query
                  (let [results (qp/process-query query)]
                    (is (=? {:status :completed}
                            results))
                    (is (= (-> expected-datetime
                               (u.date/with-time-zone-same-instant timezone)
                               t/offset-date-time)
                           (some-> results
                                   mt/first-row
                                   first
                                   (u.date/parse nil)
                                   t/offset-date-time)))))))))))))

(deftest filter-datetime-by-date-in-timezone-fixed-date-test
  (mt/test-drivers (set-timezone-drivers)
    (testing "Fixed date"
      (mt/dataset tz-test-data
        (let [expected-datetime #t "2014-07-03T01:30:00Z"]
          (doseq [[timezone date-filter] [["US/Pacific" "2014-07-02"]
                                          ["US/Eastern" "2014-07-02"]
                                          ["UTC" "2014-07-03"]
                                          ["Asia/Hong_Kong" "2014-07-03"]]
                  :let [expected (-> (u.date/with-time-zone-same-instant expected-datetime timezone)
                                     (u.date/format-sql)
                                     (str/replace #" " "T"))]]
            (mt/with-temporary-setting-values [report-timezone timezone]
              (is (= [expected]
                     (mt/first-row
                      (mt/run-mbql-query users
                        {:fields [$last_login]
                         :filter [:and [:= $id 12]
                                  [:= $last_login date-filter]]})))))))))))
