(ns metabase.query-processor.middleware.parameters.sql-test
  "Tests for parameters in native SQL queries, which are of the `{{param}}` form."
  (:require [clj-time.core :as t]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :refer [engines-that-support first-row format-rows-by]]]
            [metabase.query-processor.middleware.parameters.sql :as sql :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [generic-sql :as generic-sql]]
            [toucan.db :as db]))

;;; ------------------------------------------ simple substitution -- {{x}} ------------------------------------------

(defn- substitute {:style/indent 1} [sql params]
  ;; apparently you can still bind private dynamic vars
  (binding [metabase.query-processor.middleware.parameters.sql/*driver* (driver/engine->driver :h2)]
    ((resolve 'metabase.query-processor.middleware.parameters.sql/expand-query-params)
     {:query sql}
     (into {} (for [[k v] params]
                {k v})))))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    {:toucans_are_cool true}))

(expect Exception
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    nil))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = ?"
   :params ["toucan"]}
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {:toucans_are_cool true, :bird_type "toucan"}))

(expect Exception
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {:toucans_are_cool true}))


;;; ---------------------------------- optional substitution -- [[ ... {{x}} ... ]] ----------------------------------

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    {:toucans_are_cool true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool }}]]"
    {:toucans_are_cool true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool }}]]"
    {:toucans_are_cool true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool}}]]"
    {:toucans_are_cool true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool_2}}]]"
    {:toucans_are_cool_2 true}))

(expect
  {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = 'toucan']]"
    {:toucans_are_cool true}))

(expect
  {:query  "SELECT * FROM bird_facts"
   :params []}
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    nil))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans 5}))

;; make sure nil gets substituted in as `NULL`
(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > NULL"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans nil}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > TRUE"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans true}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > FALSE"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans false}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > ?"
   :params ["abc"]}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans "abc"}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > ?"
   :params ["yo' mama"]}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans "yo' mama"}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    nil))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 2 AND total_birds > 5"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 2, :total_birds 5}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE  AND total_birds > 5"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:total_birds 5}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 3"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 3}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    nil))

(expect
  {:query  "SELECT * FROM toucanneries WHERE bird_type = ? AND num_toucans > 2 AND total_birds > 5"
   :params ["toucan"]}
  (substitute "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:bird_type "toucan", :num_toucans 2, :total_birds 5}))

(expect
  Exception
  (substitute "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 2, :total_birds 5}))

(expect
  {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5 AND num_toucans < 5"
   :params []}
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND num_toucans < {{num_toucans}}]]"
    {:num_toucans 5}))

;; Make sure that substiutions still work if the subsitution contains brackets inside it (#3657)
(expect
  {:query  "select * from foobars  where foobars.id in (string_to_array(100, ',')::integer[])"
   :params []}
  (substitute "select * from foobars [[ where foobars.id in (string_to_array({{foobar_id}}, ',')::integer[]) ]]"
    {:foobar_id 100}))


;;; -------------------------------------------- tests for value-for-tag ---------------------------------------------

;; variable -- specified
(expect
  "2"
  (#'sql/value-for-tag {:name "id", :display_name "ID", :type "text", :required true, :default "100"}
                       [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}]))

;; variable -- unspecified
(expect
  #metabase.query_processor.middleware.parameters.sql.NoValue{}
  (#'sql/value-for-tag {:name "id", :display_name "ID", :type "text"} nil))

;; variable -- default
(expect
  "100"
  (#'sql/value-for-tag {:name "id", :display_name "ID", :type "text", :required true, :default "100"} nil))

;; dimension -- specified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)}
   :param {:type   "date/range"
           :target ["dimension" ["template-tag" "checkin_date"]]
           :value  "2015-04-01~2015-05-01"}}
  (into {} (#'sql/value-for-tag {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}
                                [{:type "date/range", :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-04-01~2015-05-01"}])))

;; dimension -- unspecified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)}
   :param nil}
  (into {} (#'sql/value-for-tag {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}
                                nil)))

;; multiple values for the same tag should return a vector with multiple params instead of a single param
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)}
   :param [{:type   "date/range"
            :target ["dimension" ["template-tag" "checkin_date"]]
            :value  "2015-01-01~2016-09-01"}
           {:type   "date/single"
            :target ["dimension" ["template-tag" "checkin_date"]]
            :value  "2015-07-01"}]}
  (into {} (#'sql/value-for-tag {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}
                                [{:type "date/range",  :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-01-01~2016-09-01"}
                                 {:type "date/single", :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-07-01"}])))


;;; ------------------------------------------- expansion tests: variables -------------------------------------------

(defn- expand* [query]
  (-> (expand (assoc query :driver (driver/engine->driver :h2)))
      :native
      (select-keys [:query :params])))

;; unspecified optional param
(expect
  {:query  "SELECT * FROM orders ;"
   :params []}
  (expand* {:native     {:query "SELECT * FROM orders [[WHERE id = {{id}}]];"
                         :template_tags {:id {:name "id", :display_name "ID", :type "number"}}}
            :parameters []}))

;; unspecified *required* param
(expect
  Exception
  (expand {:native     {:query "SELECT * FROM orders [[WHERE id = {{id}}]];"
                        :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true}}}
           :parameters []}))

;; default value
(expect
  {:query  "SELECT * FROM orders WHERE id = 100;"
   :params []}
  (expand* {:native     {:query "SELECT * FROM orders WHERE id = {{id}};"
                         :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}}}
            :parameters []}))

;; specified param (numbers)
(expect
  {:query  "SELECT * FROM orders WHERE id = 2;"
   :params []}
  (expand* {:native     {:query "SELECT * FROM orders WHERE id = {{id}};"
                         :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}}}
            :parameters [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}]}))

;; specified param (date/single)
(expect
  {:query  "SELECT * FROM orders WHERE created_at > ?;"
   :params [#inst "2016-07-19T00:00:00.000000000-00:00"]}
  (expand* {:native     {:query "SELECT * FROM orders WHERE created_at > {{created_at}};"
                         :template_tags {:created_at {:name "created_at", :display_name "Created At", :type "date"}}}
            :parameters [{:type "date/single", :target ["variable" ["template-tag" "created_at"]], :value "2016-07-19"}]}))

;; specified param (text)
(expect
  {:query  "SELECT * FROM products WHERE category = ?;"
   :params ["Gizmo"]}
  (expand* {:native     {:query "SELECT * FROM products WHERE category = {{category}};"
                         :template_tags {:category {:name "category", :display_name "Category", :type "text"}}}
            :parameters [{:type "category", :target ["variable" ["template-tag" "category"]], :value "Gizmo"}]}))


;;; ------------------------------------------ expansion tests: dimensions -------------------------------------------

(defn- expand-with-dimension-param [dimension-param]
  (with-redefs [t/now (fn [] (t/date-time 2016 06 07 12 0 0))]
    (expand* {:native     {:query "SELECT * FROM checkins WHERE {{date}};"
                           :template_tags {:date {:name "date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
              :parameters (when dimension-param
                            [(merge {:target ["dimension" ["template-tag" "date"]]}
                                    dimension-param)])})))

;; dimension (date/single)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/single", :value "2016-07-01"}))

;; dimension (date/range)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"
            #inst "2016-08-01T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "2016-07-01~2016-08-01"}))

;; dimension (date/month-year)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"
            #inst "2016-07-31T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/month-year", :value "2016-07"}))

;; dimension (date/quarter-year)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-01-01T00:00:00.000000000-00:00"
            #inst "2016-03-31T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/quarter-year", :value "Q1-2016"}))

;; dimension (date/all-options, before)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) < ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/all-options", :value "~2016-07-01"}))

;; dimension (date/all-options, after)
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) > ?;"
   :params [#inst "2016-07-01T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/all-options", :value "2016-07-01~"}))

;; relative date -- "yesterday"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?;"
   :params [#inst "2016-06-06T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "yesterday"}))

;; relative date -- "past7days"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-31T00:00:00.000000000-00:00"
            #inst "2016-06-06T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "past7days"}))

;; relative date -- "past30days"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-08T00:00:00.000000000-00:00"
            #inst "2016-06-06T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "past30days"}))

;; relative date -- "thisweek"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-06-05T00:00:00.000000000-00:00"
            #inst "2016-06-11T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "thisweek"}))

;; relative date -- "thismonth"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-06-01T00:00:00.000000000-00:00"
            #inst "2016-06-30T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "thismonth"}))

;; relative date -- "thisyear"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-01-01T00:00:00.000000000-00:00"
            #inst "2016-12-31T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "thisyear"}))

;; relative date -- "lastweek"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-29T00:00:00.000000000-00:00"
            #inst "2016-06-04T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "lastweek"}))

;; relative date -- "lastmonth"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2016-05-01T00:00:00.000000000-00:00"
            #inst "2016-05-31T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "lastmonth"}))

;; relative date -- "lastyear"
(expect
  {:query  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?;"
   :params [#inst "2015-01-01T00:00:00.000000000-00:00"
            #inst "2015-12-31T00:00:00.000000000-00:00"]}
  (expand-with-dimension-param {:type "date/range", :value "lastyear"}))

;; dimension with no value -- just replace with an always true clause (e.g. "WHERE 1 = 1")
(expect
  {:query  "SELECT * FROM checkins WHERE 1 = 1;"
   :params []}
  (expand-with-dimension-param nil))

;; dimension -- number
(expect
  {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = 100;"
   :params []}
  (expand-with-dimension-param {:type "number", :value "100"}))

;; dimension -- text
(expect
  {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ?;"
   :params ["100"]}
  (expand-with-dimension-param {:type "text", :value "100"}))


;;; -------------------------------------------- "REAL" END-TO-END-TESTS ---------------------------------------------

(defn- quote-name [identifier]
  (generic-sql/quote-name datasets/*driver* identifier))

(defn- checkins-identifier []
  ;; HACK ! I don't have all day to write protocol methods to make this work the "right" way so for BigQuery and
  ;; Presto we will just hackily return the correct identifier here
  (case datasets/*engine*
    :bigquery "[test_data.checkins]"
    :presto   "\"default\".\"checkins\""
    (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id (data/id :checkins))]
      (str (when (seq schema)
             (str (quote-name schema) \.))
           (quote-name table-name)))))

;; as with the MBQL parameters tests Redshift and Crate fail for unknown reasons; disable their tests for now
(def ^:private ^:const sql-parameters-engines
  (disj (engines-that-support :native-parameters) :redshift :crate))

(defn- process-native {:style/indent 0} [& kvs]
  (qp/process-query
    (apply assoc {:database (data/id), :type :native} kvs)))

(datasets/expect-with-engines sql-parameters-engines
  [29]
  (first-row
    (format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template_tags {:checkin_date {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
        :parameters [{:type "date/range", :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-04-01~2015-05-01"}]))))

;; no parameter -- should give us a query with "WHERE 1 = 1"
(datasets/expect-with-engines sql-parameters-engines
  [1000]
  (first-row
    (format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template_tags {:checkin_date {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
        :parameters []))))

;; test that relative dates work correctly. It should be enough to try just one type of relative date here,
;; since handling them gets delegated to the functions in `metabase.query-processor.parameters`, which is fully-tested :D
(datasets/expect-with-engines sql-parameters-engines
  [0]
  (first-row
    (format-rows-by [int]
      (process-native
        :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                     :template_tags {:checkin_date {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
        :parameters [{:type "date/relative", :target ["dimension" ["template-tag" "checkin_date"]], :value "thismonth"}]))))


;; test that multiple filters applied to the same variable combine into `AND` clauses (#3539)
(datasets/expect-with-engines sql-parameters-engines
  [4]
  (first-row
    (format-rows-by [int]
      (process-native
       :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (checkins-identifier))
                    :template_tags {:checkin_date {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
       :parameters [{:type "date/range",  :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-01-01~2016-09-01"}
                    {:type "date/single", :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-07-01"}]))))


;;; -------------------------------------------- SQL PARAMETERS 2.0 TESTS --------------------------------------------

;; Some random end-to-end param expansion tests added as part of the SQL Parameters 2.0 rewrite

(expect
  {:query         "SELECT count(*) FROM CHECKINS WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ?"
   :template_tags {:created_at {:name "created_at", :display_name "Created At", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}},
   :params        [#inst "2017-03-01T00:00:00.000000000-00:00"
                   #inst "2017-03-31T00:00:00.000000000-00:00"]}
  (:native (expand {:driver     (driver/engine->driver :h2)
                    :native     {:query         "SELECT count(*) FROM CHECKINS WHERE {{created_at}}"
                                 :template_tags {:created_at {:name "created_at", :display_name "Created At", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
                    :parameters [{:type "date/month-year", :target ["dimension" ["template-tag" "created_at"]], :value "2017-03"}]})))

(expect
  {:query         "SELECT count(*) FROM ORDERS"
   :template_tags {:price {:name "price", :display_name "Price", :type "number", :required false}}
   :params        []}
  (:native (expand {:driver     (driver/engine->driver :h2)
                    :native     {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                                 :template_tags {:price {:name "price", :display_name "Price", :type "number", :required false}}}
                    :parameters []})))

(expect
  {:query         "SELECT count(*) FROM ORDERS WHERE price > 100"
   :template_tags {:price {:name "price", :display_name "Price", :type "number", :required false}}
   :params        []}
  (:native (expand {:driver     (driver/engine->driver :h2)
                    :native     {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                                 :template_tags {:price {:name "price", :display_name "Price", :type "number", :required false}}}
                    :parameters [{:type "category", :target ["variable" ["template-tag" "price"]], :value "100"}]})))

(expect
  {:query         "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE ?"
   :template_tags {:x {:name "x", :display_name "X", :type "text", :required true, :default "%Toucan%"}}
   :params        ["%Toucan%"]}
  (:native (expand {:driver     (driver/engine->driver :h2)
                    :native     {:query         "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE {{x}}",
                                 :template_tags {:x {:name "x", :display_name "X", :type "text", :required true, :default "%Toucan%"}}},
                    :parameters [{:type "category", :target ["variable" ["template-tag" "x"]]}]})))

;; make sure that you can use the same parameter multiple times (#4659)
(expect
  {:query         "SELECT count(*) FROM products WHERE title LIKE ? AND subtitle LIKE ?"
   :template_tags {:x {:name "x", :display_name "X", :type "text", :required true, :default "%Toucan%"}}
   :params        ["%Toucan%" "%Toucan%"]}
  (:native (expand {:driver     (driver/engine->driver :h2)
                    :native     {:query         "SELECT count(*) FROM products WHERE title LIKE {{x}} AND subtitle LIKE {{x}}",
                                 :template_tags {:x {:name "x", :display_name "X", :type "text", :required true, :default "%Toucan%"}}},
                    :parameters [{:type "category", :target ["variable" ["template-tag" "x"]]}]})))

(expect
  {:query         "SELECT * FROM ORDERS WHERE true  AND ID = ? OR USER_ID = ?"
   :template_tags {:id {:name "id", :display_name "ID", :type "text"}}
   :params        ["2" "2"]}
  (:native (expand {:driver     (driver/engine->driver :h2)
                    :native     {:query         "SELECT * FROM ORDERS WHERE true [[ AND ID = {{id}} OR USER_ID = {{id}} ]]"
                                 :template_tags {:id {:name "id", :display_name "ID", :type "text"}}}
                    :parameters [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}]})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            RELATIVE DATES & DEFAULTS IN "DIMENSION" PARAMS (#6059)                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure relative date forms like `past5days` work correctly with Field Filters
(expect
  {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                       "FROM CHECKINS "
                       "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ? "
                       "GROUP BY \"DATE\"")
   :template_tags {:checkin_date {:name         "checkin_date"
                                  :display_name "Checkin Date"
                                  :type         "dimension"
                                  :dimension    ["field-id" (data/id :checkins :date)]}}
   :params        [#inst "2017-10-31T00:00:00.000000000-00:00"
                   #inst "2017-11-04T00:00:00.000000000-00:00"]}
  (with-redefs [t/now (fn [] (t/date-time 2017 11 05 12 0 0))]
    (:native (expand {:driver     (driver/engine->driver :h2)
                      :native     {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                                       "FROM CHECKINS "
                                                       "WHERE {{checkin_date}} "
                                                       "GROUP BY \"DATE\"")
                                   :template_tags {:checkin_date {:name         "checkin_date"
                                                                  :display_name "Checkin Date"
                                                                  :type         "dimension"
                                                                  :dimension    ["field-id" (data/id :checkins :date)]}}}
                      :parameters [{:type   "date/range"
                                    :target ["dimension" ["template-tag" "checkin_date"]]
                                    :value  "past5days"}]}))))

;; Make sure defaults values get picked up for field filter clauses
(expect
  {:field {:name "DATE", :parent_id nil, :table_id (data/id :checkins)}
   :param {:type   "date/all-options"
           :target ["dimension" ["template-tag" "checkin_date"]]
           :value  "past5days"}}
  (#'sql/dimension-value-for-tag {:name         "checkin_date"
                                  :display_name "Checkin Date"
                                  :type         "dimension"
                                  :dimension    [:field-id (data/id :checkins :date)]
                                  :default      "past5days"
                                  :widget_type  "date/all-options"}
                                 nil))

;; Make sure we can specify the type of a default value for a "Dimension" (Field Filter) by setting the
;; `:widget_type` key. Check that it works correctly with relative dates...
(expect
  {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                       "FROM CHECKINS "
                       "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN ? AND ? "
                       "GROUP BY \"DATE\"")
   :template_tags {:checkin_date
                   {:name         "checkin_date"
                    :display_name "Checkin Date"
                    :type         "dimension"
                    :dimension    ["field-id" (data/id :checkins :date)]
                    :default      "past5days"
                    :widget_type  "date/all-options"}}
   :params        [#inst "2017-10-31T00:00:00.000000000-00:00"
                   #inst "2017-11-04T00:00:00.000000000-00:00"]}
  (with-redefs [t/now (fn [] (t/date-time 2017 11 05 12 0 0))]
    (:native (expand {:driver (driver/engine->driver :h2)
                      :native {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                                   "FROM CHECKINS "
                                                   "WHERE {{checkin_date}} "
                                                   "GROUP BY \"DATE\"")
                               :template_tags {:checkin_date {:name         "checkin_date"
                                                              :display_name "Checkin Date"
                                                              :type         "dimension"
                                                              :dimension    ["field-id" (data/id :checkins :date)]
                                                              :default      "past5days"
                                                              :widget_type  "date/all-options"}}}}))))

;; Check that it works with absolute dates as well
(expect
  {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                       "FROM CHECKINS "
                       "WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ? "
                       "GROUP BY \"DATE\"")
   :template_tags {:checkin_date {:name         "checkin_date"
                                  :display_name "Checkin Date"
                                  :type         "dimension"
                                  :dimension    ["field-id" (data/id :checkins :date)]
                                  :default      "2017-11-14"
                                  :widget_type  "date/all-options"}}
   :params        [#inst "2017-11-14T00:00:00.000000000-00:00"]}
  (:native (expand {:driver (driver/engine->driver :h2)
                    :native {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                                 "FROM CHECKINS "
                                                 "WHERE {{checkin_date}} "
                                                 "GROUP BY \"DATE\"")
                             :template_tags {:checkin_date {:name         "checkin_date"
                                                            :display_name "Checkin Date"
                                                            :type         "dimension"
                                                            :dimension    ["field-id" (data/id :checkins :date)]
                                                            :default      "2017-11-14"
                                                            :widget_type  "date/all-options"}}}})))


;;; ------------------------------- Multiple Value Support (comma-separated or array) --------------------------------

;; Make sure using commas in numeric params treats them as separate IDs (#5457)
(expect
  "SELECT * FROM USERS where id IN (1, 2, 3)"
  (-> (qp/process-query
        {:database   (data/id)
         :type       "native"
         :native     {:query         "SELECT * FROM USERS [[where id IN ({{ids_list}})]]"
                      :template_tags {:ids_list {:name         "ids_list"
                                                 :display_name "Ids list"
                                                 :type         "number"}}}
         :parameters [{:type   "category"
                       :target ["variable" ["template-tag" "ids_list"]]
                       :value  "1,2,3"}]})
      :data :native_form :query))


;; make sure you can now also pass multiple values in by passing an array of values
(expect
  {:query         "SELECT * FROM CATEGORIES where name IN (?, ?, ?)"
   :template_tags {:names_list {:name "names_list", :display_name "Names List", :type "text"}}
   :params        ["BBQ" "Bakery" "Bar"]}
  (:native (expand
            {:driver     (driver/engine->driver :h2)
             :native     {:query         "SELECT * FROM CATEGORIES [[where name IN ({{names_list}})]]"
                          :template_tags {:names_list {:name         "names_list"
                                                       :display_name "Names List"
                                                       :type         "text"}}}
             :parameters [{:type   "category"
                           :target ["variable" ["template-tag" "names_list"]]
                           :value  ["BBQ", "Bakery", "Bar"]}]})))

;; Make sure arrays of values also work for 'field filter' params
(expect
  {:query         "SELECT * FROM CATEGORIES WHERE \"PUBLIC\".\"USERS\".\"ID\" IN (?, ?, ?)",
   :template_tags {:names_list {:name         "names_list"
                                :display_name "Names List"
                                :type         "dimension"
                                :dimension    ["field-id" (data/id :users :id)]}}
   :params        ["BBQ" "Bakery" "Bar"]}
  (:native (expand
            {:driver     (driver/engine->driver :h2)
             :native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                          :template_tags {:names_list {:name         "names_list"
                                                       :display_name "Names List"
                                                       :type         "dimension"
                                                       :dimension    ["field-id" (data/id :users :id)]}}}
             :parameters [{:type   "text"
                           :target ["dimension" ["template-tag" "names_list"]]
                           :value  ["BBQ", "Bakery", "Bar"]}]})))
