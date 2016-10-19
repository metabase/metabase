(ns metabase.query-processor.sql-parameters-test
  (:require [clojure.set :as set]
            [clj-time.core :as t]
            [expectations :refer :all]
            (metabase [db :as db]
                      [driver :as driver])
            [metabase.models.table :as table]
            [metabase.query-processor :as qp]
            [metabase.query-processor.sql-parameters :refer :all]
            [metabase.query-processor-test :refer [engines-that-support first-row format-rows-by]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.data.generic-sql :as generic-sql]
            [metabase.test.util :as tu]
            [metabase.test.data.generic-sql :as generic]))


;;; ------------------------------------------------------------ simple substitution -- {{x}} ------------------------------------------------------------

(defn- substitute {:style/indent 1} [sql params]
  (binding [metabase.query-processor.sql-parameters/*driver* (driver/engine->driver :h2)] ; apparently you can still bind private dynamic vars
    ((resolve 'metabase.query-processor.sql-parameters/substitute) sql params)))

(expect "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    {:toucans_are_cool true}))

(expect AssertionError
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    nil))

(expect "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {:toucans_are_cool true, :bird_type "toucan"}))

(expect AssertionError
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {:toucans_are_cool true}))


;;; ------------------------------------------------------------ optional substitution -- [[ ... {{x}} ... ]] ------------------------------------------------------------

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool }}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool }}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool}}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool_2}}]]"
    {:toucans_are_cool_2 true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = 'toucan']]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    nil))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > NULL"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans nil}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > TRUE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans true}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > FALSE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans false}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 'abc'"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans "abc"}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 'yo\\' mama'"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans "yo' mama"}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    nil))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 2 AND total_birds > 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 2, :total_birds 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE  AND total_birds > 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:total_birds 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 3"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 3}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    nil))

(expect
  "SELECT * FROM toucanneries WHERE bird_type = 'toucan' AND num_toucans > 2 AND total_birds > 5"
  (substitute "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:bird_type "toucan", :num_toucans 2, :total_birds 5}))

(expect
  AssertionError
  (substitute "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 2, :total_birds 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5 AND num_toucans < 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND num_toucans < {{num_toucans}}]]"
    {:num_toucans 5}))

;;; ------------------------------------------------------------ tests for value-for-tag ------------------------------------------------------------

(tu/resolve-private-vars metabase.query-processor.sql-parameters value-for-tag)

;; variable -- specified
(expect
  "2"
  (value-for-tag {:name "id", :display_name "ID", :type "text", :required true, :default "100"}
                 [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}]))

;; variable -- unspecified
(expect
  nil
  (value-for-tag {:name "id", :display_name "ID", :type "text"} nil))

;; variable -- default
(expect
  "100"
  (value-for-tag {:name "id", :display_name "ID", :type "text", :required true, :default "100"} nil))

;; dimension -- specified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)}
   :param {:type   "date/range"
           :target ["dimension" ["template-tag" "checkin_date"]]
           :value  "2015-04-01~2015-05-01"}}
  (into {} (value-for-tag {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}
                          [{:type "date/range", :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-04-01~2015-05-01"}])))

;; dimension -- unspecified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)}
   :param nil}
  (into {} (value-for-tag {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}
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
  (into {} (value-for-tag {:name "checkin_date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}
                          [{:type "date/range",  :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-01-01~2016-09-01"}
                           {:type "date/single", :target ["dimension" ["template-tag" "checkin_date"]], :value "2015-07-01"}])))


;;; ------------------------------------------------------------ expansion tests: variables ------------------------------------------------------------

;; unspecified optional param
(expect
  "SELECT * FROM orders ;"
  (-> (expand-params {:native     {:query "SELECT * FROM orders [[WHERE id = {{id}}]];"
                                   :template_tags {:id {:name "id", :display_name "ID", :type "number"}}}
                      :parameters []})
      :native :query))

;; unspecified *required* param
(expect
  Exception
  (expand-params {:native     {:query "SELECT * FROM orders [[WHERE id = {{id}}]];"
                               :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true}}}
                  :parameters []}))

;; default value
(expect
  "SELECT * FROM orders WHERE id = 100;"
  (-> (expand-params {:native     {:query "SELECT * FROM orders WHERE id = {{id}};"
                                   :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}}}
                      :parameters []})
      :native :query))

;; specified param (numbers)
(expect
  "SELECT * FROM orders WHERE id = 2;"
  (-> (expand-params {:native     {:query "SELECT * FROM orders WHERE id = {{id}};"
                                   :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}}}
                      :parameters [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}]})
      :native :query))

;; specified param (date/single)
(expect
  "SELECT * FROM orders WHERE created_at > '2016-07-19';"
  (-> (expand-params {:native     {:query "SELECT * FROM orders WHERE created_at > {{created_at}};"
                                   :template_tags {:created_at {:name "created_at", :display_name "Created At", :type "date"}}}
                      :parameters [{:type "date/single", :target ["variable" ["template-tag" "created_at"]], :value "2016-07-19"}]})
      :native :query))

;; specified param (text)
(expect
  "SELECT * FROM products WHERE category = 'Gizmo';"
  (-> (expand-params {:native     {:query "SELECT * FROM products WHERE category = {{category}};"
                                   :template_tags {:category {:name "category", :display_name "Category", :type "text"}}}
                      :parameters [{:type "category", :target ["variable" ["template-tag" "category"]], :value "Gizmo"}]})
      :native :query))


;;; ------------------------------------------------------------ expansion tests: dimensions ------------------------------------------------------------

(defn- expand-with-dimension-param [dimension-param]
  (with-redefs [t/now (fn [] (t/date-time 2016 06 07 12 0 0))]
    (-> (expand-params {:driver        (driver/engine->driver :h2)
                        :native     {:query "SELECT * FROM checkins WHERE {{date}};"
                                     :template_tags {:date {:name "date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (data/id :checkins :date)]}}}
                        :parameters [(when dimension-param
                                       (merge {:target ["dimension" ["template-tag" "date"]]}
                                              dimension-param))]})
        :native :query)))

;; dimension (date/single)
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = '2016-07-01';"
  (expand-with-dimension-param {:type "date/single", :value "2016-07-01"}))

;; dimension (date/range)
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-07-01' AND '2016-08-01';"
  (expand-with-dimension-param {:type "date/range", :value "2016-07-01~2016-08-01"}))


;; dimension (date/month-year)
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-07-01' AND '2016-07-31';"
  (expand-with-dimension-param {:type "date/month-year", :value "2016-07"}))

;; dimension (date/quarter-year)
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-01-01' AND '2016-03-31';"
  (expand-with-dimension-param {:type "date/quarter-year", :value "Q1-2016"}))

;; relative date -- "yesterday"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = '2016-06-06';"
  (expand-with-dimension-param {:type "date/range", :value "yesterday"}))

;; relative date -- "past7days"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-05-31' AND '2016-06-06';"
  (expand-with-dimension-param {:type "date/range", :value "past7days"}))

;; relative date -- "past30days"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-05-08' AND '2016-06-06';"
  (expand-with-dimension-param {:type "date/range", :value "past30days"}))

;; relative date -- "thisweek"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-06-05' AND '2016-06-11';"
  (expand-with-dimension-param {:type "date/range", :value "thisweek"}))

;; relative date -- "thismonth"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-06-01' AND '2016-06-30';"
  (expand-with-dimension-param {:type "date/range", :value "thismonth"}))

;; relative date -- "thisyear"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-01-01' AND '2016-12-31';"
  (expand-with-dimension-param {:type "date/range", :value "thisyear"}))

;; relative date -- "lastweek"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-05-29' AND '2016-06-04';"
  (expand-with-dimension-param {:type "date/range", :value "lastweek"}))

;; relative date -- "lastmonth"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2016-05-01' AND '2016-05-31';"
  (expand-with-dimension-param {:type "date/range", :value "lastmonth"}))

;; relative date -- "lastyear"
(expect
  "SELECT * FROM checkins WHERE CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN '2015-01-01' AND '2015-12-31';"
  (expand-with-dimension-param {:type "date/range", :value "lastyear"}))

;; dimension with no value -- just replace with an always true clause (e.g. "WHERE 1 = 1")
(expect
  "SELECT * FROM checkins WHERE 1 = 1;"
  (expand-with-dimension-param nil))

;; dimension -- number
(expect
  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = 100;"
  (expand-with-dimension-param {:type "number", :value "100"}))

;; dimension -- text
(expect
  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = '100';"
  (expand-with-dimension-param {:type "text", :value "100"}))


;;; ------------------------------------------------------------ "REAL" END-TO-END-TESTS ------------------------------------------------------------

(defn- quote-name [identifier]
  (generic-sql/quote-name datasets/*driver* identifier))

(defn- checkins-identifier []
  (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id (data/id :checkins))]
    (str (when (seq schema)
           (str (quote-name schema) \.))
         (quote-name table-name))))

;; as with the MBQL parameters tests redshift and crate fail for unknown reasons; disable their tests for now
(def ^:private ^:const sql-parameters-engines
  (set/difference (engines-that-support :native-parameters) #{:redshift :crate}))

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
