(ns metabase.query-processor.middleware.parameters.native-test
  "E2E tests for SQL param substitution."
  (:require [clj-time.core :as t]
            [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.mbql.normalize :as normalize]
            [metabase.query-processor.middleware.parameters.native :as native]
            [metabase.query-processor.middleware.parameters.native
             [parse :as parse]
             [substitute :as substitute]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s]))

;;; ------------------------------------------ simple substitution -- {{x}} ------------------------------------------

(defn- substitute-e2e {:style/indent 1} [sql params]
  (let [[query params] (driver/with-driver :h2
                         (#'substitute/substitute (parse/parse sql) (into {} params)))]
    {:query query, :params (vec params)}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    {"toucans_are_cool" true}))

(expect Exception
  (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    nil))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = ?"
   :params ["toucan"]}
  (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {"toucans_are_cool" true, "bird_type" "toucan"}))

(expect Exception
  (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {"toucans_are_cool" true}))

;;; ---------------------------------- optional substitution -- [[ ... {{x}} ... ]] ----------------------------------

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    {"toucans_are_cool" true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool }}]]"
    {"toucans_are_cool" true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool }}]]"
    {"toucans_are_cool" true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool}}]]"
    {"toucans_are_cool" true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool_2}}]]"
    {"toucans_are_cool_2" true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = 'toucan']]"
    {"toucans_are_cool" true}))

;; Two parameters in an optional
(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = ?"
   :params ["toucan"]}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}]]"
    {"toucans_are_cool" true, "bird_type" "toucan"}))

(expect
  {:query  "SELECT * FROM bird_facts"
   :params []}
  (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    nil))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {"num_toucans" 5}))

;; make sure nil gets substitute-e2ed in as `NULL`
(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > NULL"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {"num_toucans" nil}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {"num_toucans" true}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > FALSE"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {"num_toucans" false}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > ?"
   :params ["abc"]}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {"num_toucans" "abc"}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > ?"
   :params ["yo' mama"]}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {"num_toucans" "yo' mama"}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    nil))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 2 AND total_birds > 5"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {"num_toucans" 2, "total_birds" 5}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE  AND total_birds > 5"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {"total_birds" 5}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 3"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {"num_toucans" 3}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    nil))

(expect
  {:query  "SELECT * FROM toucanneries WHERE bird_type = ? AND num_toucans > 2 AND total_birds > 5"
   :params ["toucan"]}
  (substitute-e2e "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {"bird_type" "toucan", "num_toucans" 2, "total_birds" 5}))

(expect
  Exception
  (substitute-e2e "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {"num_toucans" 2, "total_birds" 5}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5 AND num_toucans < 5"
   :params []}
  (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND num_toucans < {{num_toucans}}]]"
    {"num_toucans" 5}))

;; Make sure that substiutions still work if the subsitution contains brackets inside it (#3657)
(expect
  {:query  "select * from foobars  where foobars.id in (string_to_array(100, ',')::integer[])"
   :params []}
  (substitute-e2e "select * from foobars [[ where foobars.id in (string_to_array({{foobar_id}}, ',')::integer[]) ]]"
    {"foobar_id" 100}))


;;; ------------------------------------------- expansion tests: variables -------------------------------------------

(defmacro ^:private with-h2-db-timezone
  "This macro is useful when testing pieces of the query pipeline (such as expand) where it's a basic unit test not
  involving a database, but does need to parse dates"
  [& body]
  `(du/with-effective-timezone {:engine   :h2
                                :timezone "UTC"
                                :name     "mock_db"
                                :id       1}
     ~@body))

(defn- expand**
  "Expand parameters inside a top-level native `query`. Not recursive. "
  [{:keys [parameters], inner :native, :as query}]
  (driver/with-driver :h2
    (let [inner' (native/expand-inner (update inner :parameters #(concat parameters %)))]
      (assoc query :native inner'))))

(defn- expand* [query]
  (-> (with-h2-db-timezone
        (expand** (normalize/normalize query)))
      :native
      (select-keys [:query :params :template-tags])
      (update :params vec)))

;; unspecified optional param
(expect
  {:query  "SELECT * FROM orders ;"
   :params []}
  (expand* {:native     {:query         "SELECT * FROM orders [[WHERE id = {{id}}]];"
                         :template-tags {"id" {:name "id", :display-name "ID", :type :number}}}
            :parameters []}))

;; unspecified *required* param
(expect
  Exception
  (expand** {:native  {:query         "SELECT * FROM orders [[WHERE id = {{id}}]];"
                       :template-tags {"id" {:name "id", :display-name "ID", :type :number, :required true}}}
             :parameters []}))

;; default value
(expect
  {:query  "SELECT * FROM orders WHERE id = 100;"
   :params []}
  (expand* {:native     {:query         "SELECT * FROM orders WHERE id = {{id}};"
                         :template-tags {"id" {:name "id", :display-name "ID", :type :number, :required true, :default "100"}}}
            :parameters []}))

;; specified param (numbers)
(expect
  {:query  "SELECT * FROM orders WHERE id = 2;"
   :params []}
  (expand* {:native     {:query         "SELECT * FROM orders WHERE id = {{id}};"
                         :template-tags {"id" {:name "id", :display-name "ID", :type :number, :required true, :default "100"}}}
            :parameters [{:type "category", :target [:variable [:template-tag "id"]], :value "2"}]}))

;; specified param (date/single)
(expect
  {:query  "SELECT * FROM orders WHERE created_at > ?;"
   :params [#inst "2016-07-19T00:00:00.000000000-00:00"]}
  (expand* {:native     {:query         "SELECT * FROM orders WHERE created_at > {{created_at}};"
                         :template-tags {"created_at" {:name "created_at", :display-name "Created At", :type "date"}}}
            :parameters [{:type :date/single, :target [:variable [:template-tag "created_at"]], :value "2016-07-19"}]}))

;; specified param (text)
(expect
  {:query  "SELECT * FROM products WHERE category = ?;"
   :params ["Gizmo"]}
  (expand* {:native     {:query         "SELECT * FROM products WHERE category = {{category}};"
                         :template-tags {"category" {:name "category", :display-name "Category", :type :text}}}
            :parameters [{:type "category", :target [:variable [:template-tag "category"]], :value "Gizmo"}]}))


;;; ----------------------------------------- expansion tests: field filters -----------------------------------------

(defn- expand-with-field-filter-param
  ([field-filter-param]
   (expand-with-field-filter-param "SELECT * FROM checkins WHERE {{date}};" field-filter-param))

  ([sql field-filter-param]
   (with-redefs [t/now (constantly (t/date-time 2016 06 07 12 0 0))]
     (-> {:native     {:query         sql
                       :template-tags {"date" {:name         "date"
                                               :display-name "Checkin Date"
                                               :type         :dimension
                                               :dimension    [:field-id (data/id :checkins :date)]}}}
          :parameters (when field-filter-param
                        [(merge {:target [:dimension [:template-tag "date"]]}
                                field-filter-param)])}
         expand*
         (dissoc :template-tags)))))

;; dimension (date/single)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/single, :value "2016-07-01"}))

;; dimension (date/range)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"
            #inst "2016-08-01T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "2016-07-01~2016-08-01"}))

;; dimension (date/month-year)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"
            #inst "2016-07-31T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/month-year, :value "2016-07"}))

;; dimension (date/quarter-year)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-01-01T00:00:00.000000000-00:00"
            #inst "2016-03-31T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/quarter-year, :value "Q1-2016"}))

;; dimension (date/all-options, before)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) < ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/all-options, :value "~2016-07-01"}))

;; dimension (date/all-options, after)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) > ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/all-options, :value "2016-07-01~"}))

;; relative date -- "yesterday"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?;"
   :params [#inst "2016-06-06T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "yesterday"}))

;; relative date -- "past7days"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-31T00:00:00.000000000-00:00"
            #inst "2016-06-06T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "past7days"}))

;; relative date -- "past30days"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-08T00:00:00.000000000-00:00"
            #inst "2016-06-06T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "past30days"}))

;; relative date -- "thisweek"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-06-05T00:00:00.000000000-00:00"
            #inst "2016-06-11T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "thisweek"}))

;; relative date -- "thismonth"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-06-01T00:00:00.000000000-00:00"
            #inst "2016-06-30T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "thismonth"}))

;; relative date -- "thisyear"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-01-01T00:00:00.000000000-00:00"
            #inst "2016-12-31T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "thisyear"}))

;; relative date -- "lastweek"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-29T00:00:00.000000000-00:00"
            #inst "2016-06-04T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "lastweek"}))

;; relative date -- "lastmonth"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-01T00:00:00.000000000-00:00"
            #inst "2016-05-31T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "lastmonth"}))

;; relative date -- "lastyear"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2015-01-01T00:00:00.000000000-00:00"
            #inst "2015-12-31T00:00:00.000000000-00:00"]}
  (expand-with-field-filter-param {:type :date/range, :value "lastyear"}))

;; dimension with no value -- just replace with an always true clause (e.g. "WHERE 1 = 1")
(expect
  {:query  "SELECT * FROM checkins WHERE 1 = 1;"
   :params []}
  (expand-with-field-filter-param nil))

;; dimension -- number -- should get parsed to Number
(expect
  {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = 100;"
   :params []}
  (expand-with-field-filter-param {:type :number, :value "100"}))

;; dimension -- text
(expect
  {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ?;"
   :params ["100"]}
  (expand-with-field-filter-param {:type :text, :value "100"}))

;; *OPTIONAL* Field Filter params should not get replaced with 1 = 1 if the param is not present (#5541, #9489).
;; *Optional params should be emitted entirely.
(expect
  {:query  "SELECT * FROM ORDERS WHERE TOTAL > 100  AND CREATED_AT < now()"
   :params []}
  (expand-with-field-filter-param
   "SELECT * FROM ORDERS WHERE TOTAL > 100 [[AND {{created}} #]] AND CREATED_AT < now()"
   nil))


;;; -------------------------------------------- "REAL" END-TO-END-TESTS ---------------------------------------------

(s/defn ^:private checkins-identifier :- su/NonBlankString
  "Get the identifier used for `checkins` for the current driver by looking at what the driver uses when converting MBQL
  to SQL. Different drivers qualify to different degrees (i.e. `table` vs `schema.table` vs `database.schema.table`)."
  []
  (let [sql (:query (qp/query->native (data/mbql-query checkins)))]
    (second (re-find #"FROM\s([^\s()]+)" sql))))

;; as with the MBQL parameters tests Redshift fail for unknown reasons; disable their tests for now
(def ^:private sql-parameters-engines
  (delay (disj (qp.test/non-timeseries-drivers-with-feature :native-parameters) :redshift)))

(defn- process-native {:style/indent 0} [& kvs]
  (du/with-effective-timezone (data/db)
    (qp/process-query
      (apply assoc {:database (data/id), :type :native, :settings {:report-timezone "UTC"}} kvs))))

(datasets/expect-with-drivers @sql-parameters-engines
  [29]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template-tags {"checkin_date" {:name         "checkin_date"
                                                     :display-name "Checkin Date"
                                                     :type         :dimension
                                                     :dimension    [:field-id (data/id :checkins :date)]}}}
        :parameters [{:type   :date/range
                      :target [:dimension [:template-tag "checkin_date"]]
                      :value  "2015-04-01~2015-05-01"}]))))

;; no parameter -- should give us a query with "WHERE 1 = 1"
(datasets/expect-with-drivers @sql-parameters-engines
  [1000]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template-tags {"checkin_date" {:name         "checkin_date"
                                                     :display-name "Checkin Date"
                                                     :type         :dimension
                                                     :dimension    [:field-id (data/id :checkins :date)]}}}
        :parameters []))))

;; test that relative dates work correctly. It should be enough to try just one type of relative date here, since
;; handling them gets delegated to the functions in `metabase.query-processor.parameters`, which is fully-tested :D
(datasets/expect-with-drivers @sql-parameters-engines
  [0]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template-tags {"checkin_date" {:name         "checkin_date"
                                                     :display-name "Checkin Date"
                                                     :type         :dimension
                                                     :dimension    [:field-id (data/id :checkins :date)]}}}
        :parameters [{:type :date/relative, :target [:dimension [:template-tag "checkin_date"]], :value "thismonth"}]))))


;; test that multiple filters applied to the same variable combine into `AND` clauses (#3539)
(datasets/expect-with-drivers @sql-parameters-engines
  [4]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template-tags {"checkin_date" {:name         "checkin_date"
                                                     :display-name "Checkin Date"
                                                     :type         :dimension
                                                     :dimension    [:field-id (data/id :checkins :date)]}}}
        :parameters [{:type :date/range, :target [:dimension [:template-tag "checkin_date"]], :value "2015-01-01~2016-09-01"}
                     {:type :date/single, :target [:dimension [:template-tag "checkin_date"]], :value "2015-07-01"}]))))

;; Test that native dates are parsed with the report timezone (when supported)
(datasets/expect-with-drivers (disj @sql-parameters-engines :sqlite)
  [(cond
     (= :presto driver/*driver*)
     "2018-04-18"

     ;; Snowflake appears to have a bug in their JDBC driver when including the target timezone along with the SQL
     ;; date parameter. The below value is not correct, but is what the driver returns right now. This bug is written
     ;; up as https://github.com/metabase/metabase/issues/8804 and when fixed this should be removed as it should
     ;; return the same value as the other drivers that support a report timezone
     (= :snowflake driver/*driver*)
     "2018-04-16T17:00:00.000-07:00"

     (qp.test/supports-report-timezone? driver/*driver*)
     "2018-04-18T00:00:00.000-07:00"

     :else
     "2018-04-18T00:00:00.000Z")]
  (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
    (qp.test/first-row
      (process-native
        :native     {:query         (case driver/*driver*
                                      :bigquery
                                      "SELECT {{date}} as date"

                                      :oracle
                                      "SELECT cast({{date}} as date) from dual"

                                      "SELECT cast({{date}} as date)")
                     :template-tags {"date" {:name "date" :display-name "Date" :type :date}}}
        :parameters [{:type :date/single :target [:variable [:template-tag "date"]] :value "2018-04-18"}]))))

;; Some random end-to-end param expansion tests added as part of the SQL Parameters 2.0 rewrite

(expect
  {:query  "SELECT count(*) FROM CHECKINS WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?",
   :params [#inst "2017-03-01T00:00:00.000000000-00:00"
            #inst "2017-03-31T00:00:00.000000000-00:00"]}
  (expand* {:native     {:query         "SELECT count(*) FROM CHECKINS WHERE {{created_at}}"
                         :template-tags {"created_at" {:name         "created_at"
                                                       :display-name "Created At"
                                                       :type         :dimension
                                                       :dimension    [:field-id (data/id :checkins :date)]}}}
            :parameters [{:type :date/month-year, :target [:dimension [:template-tag "created_at"]], :value "2017-03"}]}))

(expect
  {:query  "SELECT count(*) FROM ORDERS"
   :params []}
  (expand* {:native {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                     :template-tags {"price" {:name "price", :display-name "Price", :type :number, :required false}}}}))

(expect
  {:query  "SELECT count(*) FROM ORDERS WHERE price > 100"
   :params []}
  (expand* {:native     {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                         :template-tags {"price" {:name "price", :display-name "Price", :type :number, :required false}}}
            :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "100"}]}))

(expect
  {:query  "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE ?"
   :params ["%Toucan%"]}
  (expand* {:native     {:query         "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE {{x}}",
                         :template-tags {"x" {:name         "x"
                                              :display-name "X"
                                              :type         :text
                                              :required     true
                                              :default      "%Toucan%"}}}
            :parameters [{:type "category", :target [:variable [:template-tag "x"]]}]}))

;; make sure that you can use the same parameter multiple times (#4659)
(expect
  {:query  "SELECT count(*) FROM products WHERE title LIKE ? AND subtitle LIKE ?"
   :params ["%Toucan%" "%Toucan%"]}
  (expand* {:native     {:query         "SELECT count(*) FROM products WHERE title LIKE {{x}} AND subtitle LIKE {{x}}",
                         :template-tags {"x" {:name         "x"
                                              :display-name "X"
                                              :type         :text
                                              :required     true
                                              :default      "%Toucan%"}}}
            :parameters [{:type "category", :target [:variable [:template-tag "x"]]}]}))

(expect
  {:query  "SELECT * FROM ORDERS WHERE true  AND ID = ? OR USER_ID = ?"
   :params ["2" "2"]}
  (expand* {:native     {:query         "SELECT * FROM ORDERS WHERE true [[ AND ID = {{id}} OR USER_ID = {{id}} ]]"
                         :template-tags {"id" {:name "id", :display-name "ID", :type :text}}}
            :parameters [{:type "category", :target [:variable [:template-tag "id"]], :value "2"}]}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            RELATIVE DATES & DEFAULTS IN "DIMENSION" PARAMS (#6059)                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure relative date forms like `past5days` work correctly with Field Filters
(expect
  {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                "FROM CHECKINS "
                "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ? "
                "GROUP BY \"DATE\"")
   :params [#inst "2017-10-31T00:00:00.000000000-00:00"
            #inst "2017-11-04T00:00:00.000000000-00:00"]}
  (with-redefs [t/now (constantly (t/date-time 2017 11 05 12 0 0))]
    (expand* {:native     {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                               "FROM CHECKINS "
                                               "WHERE {{checkin_date}} "
                                               "GROUP BY \"DATE\"")
                           :template-tags {"checkin_date" {:name         "checkin_date"
                                                           :display-name "Checkin Date"
                                                           :type         :dimension
                                                           :dimension    [:field-id (data/id :checkins :date)]}}}
              :parameters [{:type   :date/range
                            :target [:dimension [:template-tag "checkin_date"]]
                            :value  "past5days"}]})))

;; Make sure we can specify the type of a default value for a "Dimension" (Field Filter) by setting the
;; `:widget-type` key. Check that it works correctly with relative dates...
(expect
  {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                "FROM CHECKINS "
                "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ? "
                "GROUP BY \"DATE\"")
   :params [#inst "2017-10-31T00:00:00.000000000-00:00"
            #inst "2017-11-04T00:00:00.000000000-00:00"]}
  (with-redefs [t/now (constantly (t/date-time 2017 11 05 12 0 0))]
    (expand* {:native {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                           "FROM CHECKINS "
                                           "WHERE {{checkin_date}} "
                                           "GROUP BY \"DATE\"")
                       :template-tags {"checkin_date" {:name         "checkin_date"
                                                       :display-name "Checkin Date"
                                                       :type         :dimension
                                                       :dimension    [:field-id (data/id :checkins :date)]
                                                       :default      "past5days"
                                                       :widget-type  :date/all-options}}}})))

;; Check that it works with absolute dates as well
(expect
  {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                "FROM CHECKINS "
                "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ? "
                "GROUP BY \"DATE\"")
   :params [#inst "2017-11-14T00:00:00.000000000-00:00"]}
  (expand* {:native {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                         "FROM CHECKINS "
                                         "WHERE {{checkin_date}} "
                                         "GROUP BY \"DATE\"")
                     :template-tags {"checkin_date" {:name         "checkin_date"
                                                     :display-name "Checkin Date"
                                                     :type         :dimension
                                                     :dimension    [:field-id (data/id :checkins :date)]
                                                     :default      "2017-11-14"
                                                     :widget-type  :date/all-options}}}}))


;;; ------------------------------- Multiple Value Support (comma-separated or array) --------------------------------

;; Make sure using commas in numeric params treats them as separate IDs (#5457)
(expect
  "SELECT * FROM USERS where id IN (1, 2, 3)"
  (-> (qp/process-query
        {:database   (data/id)
         :type       "native"
         :native     {:query         "SELECT * FROM USERS [[where id IN ({{ids_list}})]]"
                      :template-tags {"ids_list" {:name         "ids_list"
                                                  :display-name "Ids list"
                                                  :type         :number}}}
         :parameters [{:type   "category"
                       :target [:variable [:template-tag "ids_list"]]
                       :value  "1,2,3"}]})
      :data :native_form :query))


;; make sure you can now also pass multiple values in by passing an array of values
(expect
  {:query  "SELECT * FROM CATEGORIES where name IN (?, ?, ?)"
   :params ["BBQ" "Bakery" "Bar"]}
  (expand*
   {:native     {:query         "SELECT * FROM CATEGORIES [[where name IN ({{names_list}})]]"
                 :template-tags {"names_list" {:name         "names_list"
                                               :display-name "Names List"
                                               :type         :text}}}
    :parameters [{:type   "category"
                  :target [:variable [:template-tag "names_list"]]
                  :value  ["BBQ", "Bakery", "Bar"]}]}))

;; Make sure arrays of values also work for 'field filter' params
(expect
  {:query  "SELECT * FROM CATEGORIES WHERE \"PUBLIC\".\"USERS\".\"ID\" IN (?, ?, ?)",
   :params ["BBQ" "Bakery" "Bar"]}
  (expand*
   {:native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                 :template-tags {"names_list" {:name         "names_list"
                                               :display-name "Names List"
                                               :type         :dimension
                                               :dimension    [:field-id (data/id :users :id)]}}}
    :parameters [{:type   :text
                  :target [:dimension [:template-tag "names_list"]]
                  :value  ["BBQ", "Bakery", "Bar"]}]}))
