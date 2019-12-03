(ns metabase.query-processor.middleware.parameters.native-test
  "E2E tests for SQL param substitution."
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.mbql.normalize :as normalize]
            [metabase.query-processor.middleware.parameters.native :as native]
            [metabase.query-processor.middleware.parameters.native
             [parse :as parse]
             [substitute :as substitute]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;;; ------------------------------------------ simple substitution — {{x}} ------------------------------------------

(defn- substitute-e2e {:style/indent 1} [sql params]
  (let [[query params] (driver/with-driver :h2
                         (qp.test-util/with-everything-store
                           (#'substitute/substitute (parse/parse sql) (into {} params))))]
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

;;; ---------------------------------- optional substitution — [[ ... {{x}} ... ]] ----------------------------------

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

;; REMOVE ME ?
(defmacro ^:deprecated ^:private with-h2-db-timezone
  "This macro is useful when testing pieces of the query pipeline (such as expand) where it's a basic unit test not
  involving a database, but does need to parse dates"
  [& body]
  `(do ~@body))

(defn- expand**
  "Expand parameters inside a top-level native `query`. Not recursive. "
  [{:keys [parameters], inner :native, :as query}]
  (driver/with-driver :h2
    (qp.test-util/with-everything-store
      (let [inner' (native/expand-inner (update inner :parameters #(concat parameters %)))]
        (assoc query :native inner')))))

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
   :params [#t "2016-07-19"]}
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
   ;; TIMEZONE FIXME
   (t/with-clock (t/mock-clock #t "2016-06-07T12:00-00:00" (t/zone-id "UTC"))
     (-> {:native     {:query
                       sql
                       :template-tags {"date" {:name         "date"
                                               :display-name "Checkin Date"
                                               :type         :dimension
                                               :dimension    [:field-id (data/id :checkins :date)]}}}
          :parameters (when field-filter-param
                        [(merge {:target [:dimension [:template-tag "date"]]}
                                field-filter-param)])}
         expand*
         (dissoc :template-tags)))))

(deftest expand-field-filters-test
  (testing "dimension (date/single)"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?;"
            :params [#t "2016-07-01"]}
           (expand-with-field-filter-param {:type :date/single, :value "2016-07-01"}))))
  (testing "dimension (date/range)"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-07-01"
                     #t "2016-08-01"]}
           (expand-with-field-filter-param {:type :date/range, :value "2016-07-01~2016-08-01"}))))
  (testing "dimension (date/month-year)"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-07-01"
                     #t "2016-07-31"]}
           (expand-with-field-filter-param {:type :date/month-year, :value "2016-07"}))))
  (testing "dimension (date/quarter-year)"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-01-01"
                     #t "2016-03-31"]}
           (expand-with-field-filter-param {:type :date/quarter-year, :value "Q1-2016"}))))
  (testing "dimension (date/all-options, before)"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) < ?;"
            :params [#t "2016-07-01"]}
           (expand-with-field-filter-param {:type :date/all-options, :value "~2016-07-01"}))))
  (testing "dimension (date/all-options, after)"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) > ?;"
            :params [#t "2016-07-01"]}
           (expand-with-field-filter-param {:type :date/all-options, :value "2016-07-01~"}))))
  (testing "relative date — 'yesterday'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?;"
            :params [#t "2016-06-06"]}
           (expand-with-field-filter-param {:type :date/range, :value "yesterday"}))))
  (testing "relative date — 'past7days'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-05-31"
                     #t "2016-06-06"]}
           (expand-with-field-filter-param {:type :date/range, :value "past7days"}))))
  (testing "relative date — 'past30days'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-05-08"
                     #t "2016-06-06"]}
           (expand-with-field-filter-param {:type :date/range, :value "past30days"}))))
  (testing "relative date — 'thisweek'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-06-05"
                     #t "2016-06-11"]}
           (expand-with-field-filter-param {:type :date/range, :value "thisweek"}))))
  (testing "relative date — 'thismonth'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-06-01"
                     #t "2016-06-30"]}
           (expand-with-field-filter-param {:type :date/range, :value "thismonth"}))))
  (testing "relative date — 'thisyear'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-01-01"
                     #t "2016-12-31"]}
           (expand-with-field-filter-param {:type :date/range, :value "thisyear"}))))
  (testing "relative date — 'lastweek'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-05-29"
                     #t "2016-06-04"]}
           (expand-with-field-filter-param {:type :date/range, :value "lastweek"}))))
  (testing "relative date — 'lastmonth'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2016-05-01"
                     #t "2016-05-31"]}
           (expand-with-field-filter-param {:type :date/range, :value "lastmonth"}))))
  (testing "relative date — 'lastyear'"
    (is (= {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
            :params [#t "2015-01-01"
                     #t "2015-12-31"]}
           (expand-with-field-filter-param {:type :date/range, :value "lastyear"}))))
  (testing "dimension with no value — just replace with an always true clause (e.g. 'WHERE 1 = 1')"
    (is (= {:query  "SELECT * FROM checkins WHERE 1 = 1;"
            :params []}
           (expand-with-field-filter-param nil))))
  (testing "dimension — number — should get parsed to Number"
    (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = 100;"
            :params []}
           (expand-with-field-filter-param {:type :number, :value "100"}))))
  (testing "dimension — text"
    (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ?;"
            :params ["100"]}
           (expand-with-field-filter-param {:type :text, :value "100"}))))
  (testing (str "*OPTIONAL* Field Filter params should not get replaced with 1 = 1 if the param is not present "
                "(#5541, #9489). *Optional params should be emitted entirely.")
    (is (= {:query  "SELECT * FROM ORDERS WHERE TOTAL > 100  AND CREATED_AT < now()"
            :params []}
           (expand-with-field-filter-param
            "SELECT * FROM ORDERS WHERE TOTAL > 100 [[AND {{created}} #]] AND CREATED_AT < now()"
            nil)))))


;;; -------------------------------------------- "REAL" END-TO-END-TESTS ---------------------------------------------

(s/defn ^:private checkins-identifier :- su/NonBlankString
  "Get the identifier used for `checkins` for the current driver by looking at what the driver uses when converting MBQL
  to SQL. Different drivers qualify to different degrees (i.e. `table` vs `schema.table` vs `database.schema.table`)."
  []
  (let [sql (:query (qp/query->native (data/mbql-query checkins)))]
    (second (re-find #"FROM\s([^\s()]+)" sql))))

;; as with the MBQL parameters tests Redshift fail for unknown reasons; disable their tests for now
;; TIMEZONE FIXME
(defn- sql-parameters-engines []
  (disj (qp.test/normal-drivers-with-feature :native-parameters) :redshift))

(defn- process-native {:style/indent 0} [& kvs]
  (qp/process-query
    (apply assoc {:database (data/id), :type :native} kvs)))

(deftest e2e-basic-test
  (datasets/test-drivers (sql-parameters-engines)
    (is (= [29]
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
                               :value  "2015-04-01~2015-05-01"}])))))))

(deftest e2e-no-parameter-test
  (datasets/test-drivers (sql-parameters-engines)
    (testing "no parameter — should give us a query with \"WHERE 1 = 1\""
      (is (= [1000]
             (qp.test/first-row
               (qp.test/format-rows-by [int]
                 (process-native
                   :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                                :template-tags {"checkin_date" {:name         "checkin_date"
                                                                :display-name "Checkin Date"
                                                                :type         :dimension
                                                                :dimension    [:field-id (data/id :checkins :date)]}}}
                   :parameters []))))))))

(deftest e2e-relative-dates-test
  (datasets/test-drivers (sql-parameters-engines)
    (testing (str "test that relative dates work correctly. It should be enough to try just one type of relative date "
                  "here, since handling them gets delegated to the functions in `metabase.query-processor.parameters`, "
                  "which is fully-tested :D")
      (is (= [0]
             (qp.test/first-row
               (qp.test/format-rows-by [int]
                 (process-native
                   :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}"
                                                       (checkins-identifier))
                                :template-tags {"checkin_date" {:name         "checkin_date"
                                                                :display-name "Checkin Date"
                                                                :type         :dimension
                                                                :dimension    [:field-id (data/id :checkins :date)]}}}
                   :parameters [{:type   :date/relative
                                 :target [:dimension [:template-tag "checkin_date"]]
                                 :value  "thismonth"}]))))))))

(deftest e2e-combine-multiple-filters-test
  (datasets/test-drivers (sql-parameters-engines)
    (testing "test that multiple filters applied to the same variable combine into `AND` clauses (#3539)"
      (is (= [4]
             (qp.test/first-row
               (qp.test/format-rows-by [int]
                 (process-native
                   :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}"
                                                       (checkins-identifier))
                                :template-tags {"checkin_date" {:name         "checkin_date"
                                                                :display-name "Checkin Date"
                                                                :type         :dimension
                                                                :dimension    [:field-id (data/id :checkins :date)]}}}
                   :parameters [{:type   :date/range
                                 :target [:dimension [:template-tag "checkin_date"]]
                                 :value  "2015-01-01~2016-09-01"}
                                {:type   :date/single
                                 :target [:dimension [:template-tag "checkin_date"]]
                                 :value  "2015-07-01"}]))))))))

(deftest e2e-parse-native-dates-test
  (datasets/test-drivers (disj (sql-parameters-engines) :sqlite)
    (is (= [(cond
              (= driver/*driver* :presto)
              "2018-04-18"

              ;; TIMEZONE FIXME — Busted
              (#{:snowflake :vertica} driver/*driver*)
              "2018-04-17T00:00:00-07:00"

              (qp.test/supports-report-timezone? driver/*driver*)
              "2018-04-18T00:00:00-07:00"

              :else
              "2018-04-18T00:00:00Z")]
           (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
             (qp.test/first-row
               (process-native
                 :native     {:query (case driver/*driver*
                                       :bigquery
                                       "SELECT {{date}} as date"

                                       :oracle
                                       "SELECT cast({{date}} as date) from dual"

                                       "SELECT cast({{date}} as date)")
                              :template-tags {"date" {:name "date" :display-name "Date" :type :date}}}
                 :parameters [{:type :date/single :target [:variable [:template-tag "date"]] :value "2018-04-18"}])))))
    "Native dates should be parsed with the report timezone (where supported)"))

;; Some random end-to-end param expansion tests added as part of the SQL Parameters 2.0 rewrite
(deftest param-expansion-test
  (is (= {:query  "SELECT count(*) FROM CHECKINS WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?",
          :params [#t "2017-03-01"
                   #t "2017-03-31"]}
         (expand* {:native     {:query         "SELECT count(*) FROM CHECKINS WHERE {{created_at}}"
                                :template-tags {"created_at" {:name         "created_at"
                                                              :display-name "Created At"
                                                              :type         :dimension
                                                              :dimension    [:field-id (data/id :checkins :date)]}}}
                   :parameters [{:type   :date/month-year
                                 :target [:dimension [:template-tag "created_at"]]
                                 :value  "2017-03"}]})))
  (is (= {:query  "SELECT count(*) FROM ORDERS"
          :params []}
         (expand* {:native {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                            :template-tags {"price" {:name         "price"
                                                     :display-name "Price"
                                                     :type         :number
                                                     :required     false}}}})))
  (is (= {:query  "SELECT count(*) FROM ORDERS WHERE price > 100"
          :params []}
         (expand* {:native     {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                                :template-tags {"price" {:name         "price"
                                                         :display-name "Price"
                                                         :type         :number
                                                         :required     false}}}
                   :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "100"}]})))
  (is (= {:query  "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE ?"
          :params ["%Toucan%"]}
         (expand* {:native     {:query         "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE {{x}}",
                                :template-tags {"x" {:name         "x"
                                                     :display-name "X"
                                                     :type         :text
                                                     :required     true
                                                     :default      "%Toucan%"}}}
                   :parameters [{:type "category", :target [:variable [:template-tag "x"]]}]})))
  (testing "make sure that you can use the same parameter multiple times (#4659)"
    (is (= {:query  "SELECT count(*) FROM products WHERE title LIKE ? AND subtitle LIKE ?"
            :params ["%Toucan%" "%Toucan%"]}
           (expand* {:native     {:query         "SELECT count(*) FROM products WHERE title LIKE {{x}} AND subtitle LIKE {{x}}",
                                  :template-tags {"x" {:name         "x"
                                                       :display-name "X"
                                                       :type         :text
                                                       :required     true
                                                       :default      "%Toucan%"}}}
                     :parameters [{:type "category", :target [:variable [:template-tag "x"]]}]})))
    (is (= {:query  "SELECT * FROM ORDERS WHERE true  AND ID = ? OR USER_ID = ?"
            :params ["2" "2"]}
           (expand* {:native     {:query         "SELECT * FROM ORDERS WHERE true [[ AND ID = {{id}} OR USER_ID = {{id}} ]]"
                                  :template-tags {"id" {:name "id", :display-name "ID", :type :text}}}
                     :parameters [{:type "category", :target [:variable [:template-tag "id"]], :value "2"}]})))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            RELATIVE DATES & DEFAULTS IN "DIMENSION" PARAMS (#6059)                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure relative date forms like `past5days` work correctly with Field Filters
(expect
  {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                "FROM CHECKINS "
                "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ? "
                "GROUP BY \"DATE\"")
   :params [#t "2017-10-31"
            #t "2017-11-04"]}
  (t/with-clock (t/mock-clock #t "2017-11-05T12:00Z" (t/zone-id "UTC"))
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
   :params [#t "2017-10-31"
            #t "2017-11-04"]}
  (t/with-clock (t/mock-clock #t "2017-11-05T12:00Z" (t/zone-id "UTC"))
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
   :params [#t "2017-11-14"]}
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

(deftest multiple-value-test
  (testing "Make sure using commas in numeric params treats them as separate IDs (#5457)"
    (is (= "SELECT * FROM USERS where id IN (1, 2, 3)"
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
               :data :native_form :query))))
  (testing "make sure you can now also pass multiple values in by passing an array of values"
    (is (= {:query  "SELECT * FROM CATEGORIES where name IN (?, ?, ?)"
            :params ["BBQ" "Bakery" "Bar"]}
           (expand*
            {:native     {:query         "SELECT * FROM CATEGORIES [[where name IN ({{names_list}})]]"
                          :template-tags {"names_list" {:name         "names_list"
                                                        :display-name "Names List"
                                                        :type         :text}}}
             :parameters [{:type   "category"
                           :target [:variable [:template-tag "names_list"]]
                           :value  ["BBQ", "Bakery", "Bar"]}]}))))
  (testing "Make sure arrays of values also work for 'field filter' params"
    (is (= {:query  "SELECT * FROM CATEGORIES WHERE \"PUBLIC\".\"USERS\".\"ID\" IN (?, ?, ?)",
            :params ["BBQ" "Bakery" "Bar"]}
           (expand*
            {:native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                          :template-tags {"names_list" {:name         "names_list"
                                                        :display-name "Names List"
                                                        :type         :dimension
                                                        :dimension    [:field-id (data/id :users :id)]}}}
             :parameters [{:type   :text
                           :target [:dimension [:template-tag "names_list"]]
                           :value  ["BBQ", "Bakery", "Bar"]}]})))))
