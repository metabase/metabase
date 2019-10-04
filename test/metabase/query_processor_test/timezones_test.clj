(ns metabase.query-processor-test.timezones-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [sql :as sql.tx]]
            [toucan.db :as db]))

(defmacro ^:private with-tz-db
  "Calls `with-db` on the `test-data-with-timezones` dataset and ensures the timestamps are fixed up on MySQL"
  [& body]
  `(data/dataset ~'test-data-with-timezones
     ~@body))

(def ^:private default-utc-results
  #{[6 "Shad Ferdynand" "2014-08-02T12:30:00.000Z"]})

(def ^:private default-pacific-results
  #{[6 "Shad Ferdynand" "2014-08-02T05:30:00.000-07:00"]})

;; parameters always get `date` bucketing so doing something the between stuff we do below is basically just going to
;; match anything with a `2014-08-02` date
(def ^:private default-pacific-results-for-params
  #{[6 "Shad Ferdynand" "2014-08-02T05:30:00.000-07:00"]
    [7 "Conchúr Tihomir" "2014-08-02T02:30:00.000-07:00"]})

;; Query PG using a report-timezone set to pacific time. Should adjust the query parameter using that report timezone
;; and should return the timestamp in pacific time as well
(datasets/expect-with-drivers [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (-> (data/run-mbql-query users
            {:filter [:between $last_login "2014-08-02T03:00:00.000000" "2014-08-02T06:00:00.000000"]})
          qp.test/rows
          set))))

(defn- table-identifier [table-key]
  (let [table-name (db/select-one-field :name Table, :id (data/id table-key))]
    (sql.tx/qualify-and-quote driver/*driver* (:name (data/db)) table-name)))

(defn- users-table-identifier []
  (table-identifier :users))

(defn- field-identifier [table-key & field-keys]
  (let [table-name (db/select-one-field :name Table, :id (data/id table-key))
        field-name (db/select-one-field :name Field, :id (apply data/id table-key field-keys))]
    (sql.tx/qualify-and-quote driver/*driver* (:name (data/db)) table-name field-name)))

(def ^:private query-rows-set (comp set qp.test/rows qp/process-query))

;; Test that native dates are parsed with the report timezone (when supported)
(datasets/expect-with-drivers [:postgres :mysql]
  default-pacific-results-for-params
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (query-rows-set
       {:database   (data/id)
        :type       :native
        :native     {:query         (format "select %s, %s, %s from %s where cast(last_login as date) between {{date1}} and {{date2}}"
                                            (field-identifier :users :id)
                                            (field-identifier :users :name)
                                            (field-identifier :users :last_login)
                                            (users-table-identifier))
                     :template-tags {:date1 {:name "date1" :display_name "Date1" :type "date" }
                                     :date2 {:name "date2" :display_name "Date2" :type "date" }}}
        :parameters [{:type "date/single" :target ["variable" ["template-tag" "date1"]] :value "2014-08-02T02:00:00.000000"}
                     {:type "date/single" :target ["variable" ["template-tag" "date2"]] :value "2014-08-02T06:00:00.000000"}]}))))

;; This does not currently work for MySQL
(datasets/expect-with-drivers [:postgres :mysql]
  default-pacific-results-for-params
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (query-rows-set
       {:database   (data/id)
        :type       :native
        :native     {:query         (format "select %s, %s, %s from %s where {{ts_range}}"
                                            (field-identifier :users :id)
                                            (field-identifier :users :name)
                                            (field-identifier :users :last_login)
                                            (users-table-identifier))
                     :template-tags {:ts_range {:name      "ts_range", :display_name "Timestamp Range", :type "dimension",
                                                :dimension ["field-id" (data/id :users :last_login)]}}}
        :parameters [{:type "date/range", :target ["dimension" ["template-tag" "ts_range"]], :value "2014-08-02~2014-08-03"}]}))))

;; Querying using a single date
(datasets/expect-with-drivers [:postgres :mysql]
  default-pacific-results-for-params
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (query-rows-set
       {:database (data/id)
        :type :native
        :native     {:query         (format "select %s, %s, %s from %s where {{just_a_date}}"
                                            (field-identifier :users :id)
                                            (field-identifier :users :name)
                                            (field-identifier :users :last_login)
                                            (users-table-identifier))
                     :template-tags {:just_a_date {:name "just_a_date", :display_name "Just A Date", :type "dimension",
                                                   :dimension ["field-id" (data/id :users :last_login)]}}}
        :parameters [{:type "date/single", :target ["dimension" ["template-tag" "just_a_date"]], :value "2014-08-02"}]}))))

;; This is the same answer as above but uses timestamp with the timezone included. The report timezone is still
;; pacific though, so it should return as pacific regardless of how the filter was specified
(datasets/expect-with-drivers [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (-> (data/run-mbql-query users
            {:filter [:between $last_login "2014-08-02T10:00:00.000000Z" "2014-08-02T13:00:00.000000Z"]})
          qp.test/rows
          set))))

;; Checking UTC report timezone filtering and responses
(datasets/expect-with-drivers [:postgres :bigquery :mysql]
  default-utc-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "UTC"]
      (-> (data/run-mbql-query users
            {:filter [:between $last_login "2014-08-02T10:00:00.000000" "2014-08-02T13:00:00.000000"]})
          qp.test/rows
          set))))

;; With no report timezone, the JVM timezone is used. For our tests this is UTC so this should be the same as
;; specifying UTC for a report timezone
(datasets/expect-with-drivers [:postgres :bigquery :mysql]
  default-utc-results
  (with-tz-db
    (-> (data/run-mbql-query users
          {:filter [:between $last_login "2014-08-02T10:00:00.000000" "2014-08-02T13:00:00.000000"]})
        qp.test/rows
        set)))

(defn- rows-on-july-30 []
  (qp.test/rows
    (data/run-mbql-query users
      {:fields   [$id $last_login]
       :filter   [:= $last_login "2014-07-03"]
       :order-by [[:asc $last_login]]})))

(deftest result-rows-test
  (datasets/test-drivers (qp.test/non-timeseries-drivers-with-feature :set-timezone)
    (println "metabase.driver/*driver*:" metabase.driver/*driver*) ; NOCOMMIT
    (testing "timezone-aware columns\n"
      (data/dataset test-data-with-timezones
        (doseq [[timezone expected-rows] {"UTC"        [[12 "2014-07-03T01:30:00.000Z"]
                                                        [10 "2014-07-03T19:30:00.000Z"]]
                                          "US/Pacific" [[10 "2014-07-03T12:30:00.000-07:00"]]}]
          (tu/with-temporary-setting-values [report-timezone timezone]
            (is (= expected-rows
                   (rows-on-july-30))
                (format "There should be %d checkins on July 30th in the %s timezone" (count expected-rows) timezone))))))
    (testing "non-timezone-aware columns\n"
      (doseq [[timezone expected-rows] {"UTC"        [[12 "2014-07-03T01:30:00.000Z"]
                                                      [10 "2014-07-03T19:30:00.000Z"]]
                                        ;; I think the results should be test same for any timezone??????? If the
                                        ;; column is not timezone aware (?)
                                        "US/Pacific" [[12 "2014-07-03T01:30:00.000Z"]
                                                      [10 "2014-07-03T19:30:00.000Z"]]}]
        (tu/with-temporary-setting-values [report-timezone timezone]
          (is (= expected-rows
                 (rows-on-july-30))
              (format "There should be %d checkins on July 30th in the %s timezone" (count expected-rows) timezone)))))))
