(ns metabase.query-processor-test.timezones-test
  (:require [clojure
             [set :as set]
             [test :refer :all]]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [sql :as sql.tx]]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]))

(def ^:private broken-drivers
  "The following drivers are broken to some extent -- details listed in the Google Doc, or can be see here:
  https://circleci.com/workflow-run/856f6dd0-3d95-4732-a56e-1af59e3ae4ba. The goal is to gradually remove these
  one-by-one as they are fixed."
  #{:oracle
    :presto
    :redshift
    :snowflake
    :sparksql
    :vertica})

(defn- set-timezone-drivers
  "Drivers that support setting a Session timezone."
  []
  (set/difference
   (set (qp.test/non-timeseries-drivers-with-feature :set-timezone))
   broken-drivers))

(defn- timezone-aware-column-drivers
  "Drivers that support the equivalent of `TIMESTAMP WITH TIME ZONE` columns."
  []
  (conj (set-timezone-drivers) :h2 :bigquery :sqlserver :mongo))

;; TODO - we should also do similar tests for timezone-unaware columns
(deftest result-rows-test
  (data/dataset test-data-with-timezones
    (datasets/test-drivers (timezone-aware-column-drivers)
      (is (= [[12 "2014-07-03T01:30:00.000Z"]
              [10 "2014-07-03T19:30:00.000Z"]]
             (qp.test/formatted-rows [int identity]
               (data/run-mbql-query users
                 {:fields   [$id $last_login]
                  :filter   [:= $id 10 12]
                  :order-by [[:asc $last_login]]})))
          "Basic sanity check: make sure the rows come back with the values we'd expect without setting report-timezone"))
    (datasets/test-drivers (set-timezone-drivers)
      (doseq [[timezone expected-rows] {"UTC"        [[12 "2014-07-03T01:30:00.000Z"]
                                                      [10 "2014-07-03T19:30:00.000Z"]]
                                        "US/Pacific" [[10 "2014-07-03T12:30:00.000-07:00"]]}]
        (tu/with-temporary-setting-values [report-timezone timezone]
          (is (= expected-rows
                 (qp.test/formatted-rows [int identity]
                   (data/run-mbql-query users
                     {:fields   [$id $last_login]
                      :filter   [:= $last_login "2014-07-03"]
                      :order-by [[:asc $last_login]]})))
              (format "There should be %d checkins on July 30th in the %s timezone" (count expected-rows) timezone)))))))

(deftest filter-test
  (data/dataset test-data-with-timezones
    (datasets/test-drivers (set-timezone-drivers)
      (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
        (is (= [[6 "Shad Ferdynand" "2014-08-02T05:30:00.000-07:00"]]
               (qp.test/formatted-rows [int identity identity]
                 (data/run-mbql-query users
                   {:filter [:between $last_login "2014-08-02T03:00:00.000000" "2014-08-02T06:00:00.000000"]})))
            (str "If MBQL datetime literal strings do not explicitly specify a timezone, they should be parsed as if "
                 "in the current reporting timezone (Pacific in this case)"))
        (is (= [[6 "Shad Ferdynand" "2014-08-02T05:30:00.000-07:00"]]
               (qp.test/formatted-rows [int identity identity]
                 (data/run-mbql-query users
                   {:filter [:between $last_login "2014-08-02T10:00:00.000000Z" "2014-08-02T13:00:00.000000Z"]})))
            "MBQL datetime literal strings that include timezone should be parsed in it regardless of report timezone")))

    (testing "UTC timezone"
      (let [run-query   (fn []
                          (qp.test/formatted-rows [int identity identity]
                            (data/run-mbql-query users
                              {:filter [:between $last_login "2014-08-02T10:00:00.000000" "2014-08-02T13:00:00.000000"]})))
            utc-results [[6 "Shad Ferdynand" "2014-08-02T12:30:00.000Z"]]]
        (datasets/test-drivers (set-timezone-drivers)
          (is (= utc-results
                 (tu/with-temporary-setting-values [report-timezone "UTC"]
                   (run-query)))
              "Checking UTC report timezone filtering and responses"))
        (datasets/test-drivers (timezone-aware-column-drivers)
          (is (= utc-results
                 (run-query))
              (str "With no report timezone, the JVM timezone is used. For our tests this is UTC so this should be the "
                   "same as specifying UTC for a report timezone")))))))

(defn- table-identifier [table-key]
  (let [table-name (db/select-one-field :name Table, :id (data/id table-key))]
    (apply hx/identifier :table (sql.tx/qualified-name-components driver/*driver* (:name (data/db)) table-name))))

(defn- field-identifier [table-key field-key]
  (let [table-name (db/select-one-field :name Table, :id (data/id table-key))
        field-name (db/select-one-field :name Field, :id (data/id table-key field-key))]
    (apply hx/identifier :field (sql.tx/qualified-name-components driver/*driver* (:name (data/db)) table-name field-name))))

(defn- honeysql->sql [honeysql]
  (first (sql.qp/format-honeysql driver/*driver* honeysql)))

(defn- native-params-queries
  "Map with different types of native params queries, used in test below. Key is a description of the type of native
  params in the query."
  []
  {"variable w/ single date"
   {:native     {:query         (honeysql->sql
                                 {:select   (mapv (partial field-identifier :users)
                                                  [:id :name :last_login])
                                  :from     [(table-identifier :users)]
                                  :where    [:between
                                             (hx/cast :date (field-identifier :users :last_login))
                                             (hsql/raw "{{date1}}")
                                             (hsql/raw "{{date2}}")]
                                  :order-by [[(field-identifier :users :id) :asc]]})
                 :template-tags {:date1 {:name "date1" :display_name "Date1" :type "date" }
                                 :date2 {:name "date2" :display_name "Date2" :type "date" }}}
    :parameters [{:type   "date/single"
                  :target ["variable" ["template-tag" "date1"]]
                  :value  "2014-08-02T02:00:00.000000"}
                 {:type   "date/single"
                  :target ["variable" ["template-tag" "date2"]]
                  :value  "2014-08-02T06:00:00.000000"}]}

   "field filter w/ date range"
   {:native     {:query         (honeysql->sql
                                 {:select   (mapv (partial field-identifier :users)
                                                  [:id :name :last_login])
                                  :from     [(table-identifier :users)]
                                  :where    (hsql/raw "{{ts_range}}")
                                  :order-by [[(field-identifier :users :id) :asc]]})
                 :template-tags {:ts_range {:name         "ts_range"
                                            :display_name "Timestamp Range"
                                            :type         "dimension"
                                            :dimension    [:field-id (data/id :users :last_login)]}}}
    :parameters [{:type   "date/range"
                  :target ["dimension" ["template-tag" "ts_range"]]
                  :value  "2014-08-02~2014-08-03"}]}

   "field filter w/ single date"
   {:native     {:query         (honeysql->sql
                                 {:select   (mapv (partial field-identifier :users)
                                                  [:id :name :last_login])
                                  :from     [(table-identifier :users)]
                                  :where    (hsql/raw "{{just_a_date}}")
                                  :order-by [[(field-identifier :users :id) :asc]]})
                 :template-tags {:just_a_date {:name         "just_a_date"
                                               :display_name "Just A Date"
                                               :type         "dimension",
                                               :dimension    [:field-id (data/id :users :last_login)]}}}
    :parameters [{:type   "date/single"
                  :target ["dimension" ["template-tag" "just_a_date"]]
                  :value  "2014-08-02"}]}})

(deftest native-params-filter-test
  ;; parameters always get `date` bucketing so doing something the between stuff we do below is basically just going
  ;; to match anything with a `2014-08-02` date
  (datasets/test-drivers (set-timezone-drivers)
    (data/dataset test-data-with-timezones
      (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
        (testing "Native dates should be parsed with the report timezone"
          (doseq [[params-description query] (native-params-queries)]
            (testing (format "Query with %s" params-description)
              (is (= [[6 "Shad Ferdynand"  "2014-08-02T05:30:00.000-07:00"]
                      [7 "Conchúr Tihomir" "2014-08-02T02:30:00.000-07:00"]]
                     (qp.test/formatted-rows [int identity identity]
                       (qp/process-query
                         (merge
                          {:database (data/id)
                           :type     :native}
                          query))))))))))))
