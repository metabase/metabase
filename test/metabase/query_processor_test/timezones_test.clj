(ns metabase.query-processor-test.timezones-test
  (:require [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qpt]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :refer [expect-with-drivers]]
             [interface :as i]
             [sql :as sql.tx]]
            [toucan.db :as db]))

(defn- call-with-timezones-db [f]
  ;; Does the database exist?
  (when-not (i/metabase-instance defs/test-data-with-timezones driver/*driver*)
    ;; The database doesn't exist, so we need to create it
    (data/get-or-create-database! defs/test-data-with-timezones))
  ;; The database can now be used in tests
  (data/with-db (data/get-or-create-database! defs/test-data-with-timezones)
    (f)))

(defmacro ^:private with-tz-db
  "Calls `with-db` on the `test-data-with-timezones` dataset and ensures the timestamps are fixed up on MySQL"
  [& body]
  `(call-with-timezones-db (fn [] ~@body)))

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
(expect-with-drivers [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (-> (data/run-mbql-query users
            {:filter [:between $last_login "2014-08-02T03:00:00.000000" "2014-08-02T06:00:00.000000"]})
          qpt/rows
          set))))

(defn- users-table-identifier []
  ;; HACK ! I don't have all day to write protocol methods to make this work the "right" way so for BigQuery and
  (if (= driver/*driver* :bigquery)
    "[test_data_with_timezones.users]"
    (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id (data/id :users))]
      (str (when (seq schema)
             (str (sql.tx/quote-name driver/*driver* schema) \.))
           (sql.tx/quote-name driver/*driver* table-name)))))

(defn- field-identifier [& kwds]
  (let [field (db/select-one ['Field :name :table_id] :id (apply data/id kwds))
        {table-name :name, schema :schema} (db/select-one ['Table :name :schema] :id (:table_id field))]
    (str (when (seq schema)
           (str (sql.tx/quote-name driver/*driver* schema) \.))
         (sql.tx/quote-name driver/*driver* table-name) \. (sql.tx/quote-name driver/*driver* (:name field)))))

(def ^:private process-query' (comp set qpt/rows qp/process-query))

;; Test that native dates are parsed with the report timezone (when supported)
(expect-with-drivers [:postgres :mysql]
  default-pacific-results-for-params
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (process-query'
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
(expect-with-drivers [:postgres :mysql]
  default-pacific-results-for-params
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (process-query'
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
(expect-with-drivers [:postgres :mysql]
  default-pacific-results-for-params
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
                     :template-tags {:just_a_date {:name "just_a_date", :display_name "Just A Date", :type "dimension",
                                                   :dimension ["field-id" (data/id :users :last_login)]}}}
        :parameters [{:type "date/single", :target ["dimension" ["template-tag" "just_a_date"]], :value "2014-08-02"}]}))))

;; This is the same answer as above but uses timestamp with the timezone included. The report timezone is still
;; pacific though, so it should return as pacific regardless of how the filter was specified
(expect-with-drivers [:postgres :mysql]
  default-pacific-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (-> (data/run-mbql-query users
            {:filter [:between $last_login "2014-08-02T10:00:00.000000Z" "2014-08-02T13:00:00.000000Z"]})
          qpt/rows
          set))))

;; Checking UTC report timezone filtering and responses
(expect-with-drivers [:postgres :bigquery :mysql]
  default-utc-results
  (with-tz-db
    (tu/with-temporary-setting-values [report-timezone "UTC"]
      (-> (data/run-mbql-query users
            {:filter [:between $last_login "2014-08-02T10:00:00.000000" "2014-08-02T13:00:00.000000"]})
          qpt/rows
          set))))

;; With no report timezone, the JVM timezone is used. For our tests this is UTC so this should be the same as
;; specifying UTC for a report timezone
(expect-with-drivers [:postgres :bigquery :mysql]
  default-utc-results
  (with-tz-db
    (-> (data/run-mbql-query users
          {:filter [:between $last_login "2014-08-02T10:00:00.000000" "2014-08-02T13:00:00.000000"]})
        qpt/rows
        set)))
