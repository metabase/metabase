(ns metabase.query-processor-test.timezones-test
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [query-processor-test :as qptest]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.query-processor-test :as qpt]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.interface :as i]
            [metabase.test.data.mysql :as mysql-data]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data.generic-sql :as generic-sql]
            [metabase.test.data.datasets :refer [expect-with-engine expect-with-engines *engine* *driver*]]
            [metabase.test.data.dataset-definitions :as defs]
            [toucan.db :as db])
  (:import metabase.driver.mysql.MySQLDriver))

(def ^:private mysql-driver (MySQLDriver.))

(defn- fix-mysql-timestamps?
  "Returns true if the database at `db-spec` needs to have it's timestamps fixed. See the `update-mysql-timestamps
  comment for more information on why these are being fixed"
  [db-spec]
  (empty? (jdbc/query db-spec "select 1 from users where id=1 and last_login='2014-04-01 01:30:00'")))

(defn- update-mysql-timestamps
  "Unfortunately the timestamps we insert in this dataset are in UTC, but MySQL is inserting them as if they were in
  pacific time. This means that they are rolling them forward 7 (or 8) hours. Instead of inserting 08:30 it's
  inserting 15:30. This is wrong, rather than hack something together that weaves through all of the data loading
  code, this function just fixes up the timestamps after the data is loaded using MySQL's `convert_tz` function"
  []
  (when (= :mysql *engine*)
    (let [details (i/database->connection-details mysql-driver :db {:database-name "test-data-with-timezones"})
          db-spec (sql/connection-details->spec mysql-driver details)]
      (when (fix-mysql-timestamps? db-spec)
        (jdbc/execute! db-spec "update users set last_login=convert_tz(last_login,'UTC','America/Los_Angeles')")))))

(defn- call-with-timezones-db [f]
  ;; Does the database exist?
  (when-not (i/metabase-instance defs/test-data-with-timezones *engine*)
    ;; The database doesn't exist, so we need to create it
    (data/get-or-create-database! defs/test-data-with-timezones)
    ;; The db has been created but the timestamps are wrong on MySQL, fix them up
    (update-mysql-timestamps))
  ;; The database can now be used in tests
  (data/with-db (data/get-or-create-database! defs/test-data-with-timezones)
    (f)))

(defmacro ^:private with-tz-db
  "Calls `with-db` on the `test-data-with-timezones` dataset and ensures the timestamps are fixed up on MySQL"
  [& body]
  `(call-with-timezones-db (fn [] ~@body)))

(def ^:private default-utc-results
  #{[6 "Shad Ferdynand" "2014-08-02T12:30:00.000Z"]
    [7 "Conchúr Tihomir" "2014-08-02T09:30:00.000Z"]})

(def ^:private default-pacific-results
  #{[6 "Shad Ferdynand" "2014-08-02T05:30:00.000-07:00"]
    [7 "Conchúr Tihomir" "2014-08-02T02:30:00.000-07:00"]})

;; Test querying a database that does NOT support report timezones
;;
;; The report-timezone of Europe/Brussels is UTC+2, our tests use a JVM timezone of UTC. If the timestamps below are
;; interpretted incorrectly as Europe/Brussels, it would adjust that back 2 hours to UTC
;; (i.e. 2014-07-01T22:00:00.000Z). We then cast that time to a date, which truncates it to 2014-07-01, which is then
;; querying the day before. This reproduces the bug found in https://github.com/metabase/metabase/issues/7584
(expect-with-engine :bigquery
  #{[10 "Frans Hevel" "2014-07-03T19:30:00.000Z"]
    [12 "Kfir Caj" "2014-07-03T01:30:00.000Z"]}
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "Europe/Brussels"]
      (-> (data/run-query users
            (ql/filter (ql/between $last_login
                                   "2014-07-02"
                                   "2014-07-03")))
          qptest/rows
          set))))

;; Query PG using a report-timezone set to pacific time. Should adjust the query parameter using that report timezone
;; and should return the timestamp in pacific time as well
(expect-with-engines [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (-> (data/run-query users
            (ql/filter (ql/between $last_login
                                   "2014-08-02T03:00:00.000000"
                                   "2014-08-02T06:00:00.000000")))
          qptest/rows
          set))))

(defn- quote-name [identifier]
  (generic-sql/quote-name *driver* identifier))

(defn- users-table-identifier []
  ;; HACK ! I don't have all day to write protocol methods to make this work the "right" way so for BigQuery and
  (if (= *engine* :bigquery)
    "[test_data_with_timezones.users]"
    (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id (data/id :users))]
      (str (when (seq schema)
             (str (quote-name schema) \.))
           (quote-name table-name)))))

(defn- field-identifier [& kwds]
  (let [field (db/select-one ['Field :name :table_id] :id (apply data/id kwds))
        {table-name :name, schema :schema} (db/select-one ['Table :name :schema] :id (:table_id field))]
    (str (when (seq schema)
           (str (quote-name schema) \.))
         (quote-name table-name) \. (quote-name (:name field)))))

(def ^:private process-query' (comp set qpt/rows qp/process-query))

;; Test that native dates are parsed with the report timezone (when supported)
(expect-with-engines [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (process-query'
       {:database (data/id)
        :type :native
        :native     {:query         (format "select %s, %s, %s from %s where cast(last_login as date) between {{date1}} and {{date2}}"
                                            (field-identifier :users :id)
                                            (field-identifier :users :name)
                                            (field-identifier :users :last_login)
                                            (users-table-identifier))
                     :template_tags {:date1 {:name "date1" :display_name "Date1" :type "date" }
                                     :date2 {:name "date2" :display_name "Date2" :type "date" }}}
        :parameters [{:type "date/single" :target ["variable" ["template-tag" "date1"]] :value "2014-08-02T02:00:00.000000"}
                     {:type "date/single" :target ["variable" ["template-tag" "date2"]] :value "2014-08-02T06:00:00.000000"}]}))))

;; This does not currently work for MySQL
(expect-with-engines [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (process-query'
       {:database (data/id)
        :type :native
        :native     {:query         (format "select %s, %s, %s from %s where {{ts_range}}"
                                            (field-identifier :users :id)
                                            (field-identifier :users :name)
                                            (field-identifier :users :last_login)
                                            (users-table-identifier))
                     :template_tags {:ts_range {:name "ts_range", :display_name "Timestamp Range", :type "dimension",
                                                :dimension ["field-id" (data/id :users :last_login)]}}}
        :parameters [{:type "date/range", :target ["dimension" ["template-tag" "ts_range"]], :value "2014-08-02~2014-08-03"}]}))))

;; Querying using a single date
(expect-with-engines [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (process-query'
       {:database (data/id)
        :type :native
        :native     {:query         (format "select %s, %s, %s from %s where {{just_a_date}}"
                                            (field-identifier :users :id)
                                            (field-identifier :users :name)
                                            (field-identifier :users :last_login)
                                            (users-table-identifier))
                     :template_tags {:just_a_date {:name "just_a_date", :display_name "Just A Date", :type "dimension",
                                                   :dimension ["field-id" (data/id :users :last_login)]}}}
        :parameters [{:type "date/single", :target ["dimension" ["template-tag" "just_a_date"]], :value "2014-08-02"}]}))))

;; This is the same answer as above but uses timestamp with the timezone included. The report timezone is still
;; pacific though, so it should return as pacific regardless of how the filter was specified
(expect-with-engines [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (-> (data/run-query users
            (ql/filter (ql/between $last_login
                                   "2014-08-02T10:00:00.000000Z"
                                   "2014-08-02T13:00:00.000000Z")))
          qptest/rows
          set))))

;; Checking UTC report timezone filtering and responses
(expect-with-engines [:postgres :bigquery :mysql]
  default-utc-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "UTC"]
      (-> (data/run-query users
            (ql/filter (ql/between $last_login
                                   "2014-08-02T10:00:00.000000"
                                   "2014-08-02T13:00:00.000000")))
          qptest/rows
          set))))

;; With no report timezone, the JVM timezone is used. For our tests this is UTC so this should be the same as
;; specifying UTC for a report timezone
(expect-with-engines [:postgres :bigquery :mysql]
  default-utc-results
  (with-tz-db
    (-> (data/run-query users
          (ql/filter (ql/between $last_login
                                 "2014-08-02T10:00:00.000000"
                                 "2014-08-02T13:00:00.000000")))
        qptest/rows
        set)))
