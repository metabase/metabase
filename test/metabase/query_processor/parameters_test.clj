(ns metabase.query-processor.parameters-test
  (:require [clj-time.core :as t]
            [clj-time.format :as tf]
            [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.parameters :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.query-processor.parameters
  absolute-date->range expand-date-range-param relative-date->range)

(expect {:end "2016-03-31", :start "2016-01-01"} (absolute-date->range "Q1-2016"))
(expect {:end "2016-02-29", :start "2016-02-01"} (absolute-date->range "2016-02"))
(expect {:end "2016-04-18", :start "2016-04-18"} (absolute-date->range "2016-04-18"))
(expect {:end "2016-04-23", :start "2016-04-18"} (absolute-date->range "2016-04-18~2016-04-23"))

;; we hard code "now" to a specific point in time so that we can control the test output
(defn- test-relative [value]
  (with-redefs-fn {#'clj-time.core/now (fn [] (t/date-time 2016 06 07 12 0 0))}
    #(relative-date->range value nil)))

(expect {:end "2016-06-06", :start "2016-05-31"} (test-relative "past7days"))
(expect {:end "2016-06-06", :start "2016-05-08"} (test-relative "past30days"))
(expect {:end "2016-06-11", :start "2016-06-05"} (test-relative "thisweek"))
(expect {:end "2016-06-30", :start "2016-06-01"} (test-relative "thismonth"))
(expect {:end "2016-12-31", :start "2016-01-01"} (test-relative "thisyear"))
(expect {:end "2016-06-04", :start "2016-05-29"} (test-relative "lastweek"))
(expect {:end "2016-05-31", :start "2016-05-01"} (test-relative "lastmonth"))
(expect {:end "2015-12-31", :start "2015-01-01"} (test-relative "lastyear"))
(expect {:end "2016-06-06", :start "2016-06-06"} (test-relative "yesterday"))
(expect {:end "2016-06-07", :start "2016-06-07"} (test-relative "today"))

;; TODO: Casting of values into appropriate types (structured queries)
;; TODO: test for value escaping to prevent sql injection (native queries)

;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           NATIVE QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+

(defrecord NativeParametersDriver []
  clojure.lang.Named
  (getName [_] "NativeParametersDriver"))

(extend NativeParametersDriver
  driver/IDriver
  {:features (constantly #{:native-parameters})})

(defrecord NonParametersDriver []
  clojure.lang.Named
  (getName [_] "NonParametersDriver"))

(extend NonParametersDriver
  driver/IDriver
  {:features (constantly #{})})

;; basic parameter substitution
(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = 666"}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE id = {{foo}}"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["parameter" "foo"]
                                    :value  "666"}]}))

;; independent subclause substitution
(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = 123 AND foo = 666"}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE id = 123 <AND foo = {{foo}}>"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["parameter" "foo"]
                                    :value  "666"}]}))

;; multi-clause substitution (subclauses are joined by SQL "AND")
(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table WHERE foo=666 AND bar='yipee'"}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table [[WHERE <foo={{foo}}> <bar='{{bar}}'>]]"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["parameter" "foo"]
                                    :value  "666"}
                                   {:hash   "def456"
                                    :name   "bar"
                                    :type   "category"
                                    :target ["parameter" "bar"]
                                    :value  "yipee"}]}))

;; date range substitution
(expect
  (let [yesterday (tf/unparse (tf/formatters :year-month-day) (t/yesterday))]
    {:database   1
     :driver     (NativeParametersDriver.)
     :type       :native
     :native     {:query (str "SELECT * FROM table WHERE date BETWEEN '" yesterday "' AND '" yesterday "'")}})
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE date BETWEEN '{{foo:start}}' AND '{{foo:end}}'"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["parameter" "foo"]
                                    :value  "yesterday"}]}))

;; if target is not appropriate then parameter is skipped
(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = 123 "}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE id = 123 <AND foo = {{foo}}>"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field" 123]]
                                    :value  "666"}]}))

;; date range calculations
(expect
  [{:type "date", :target ["parameter" "foo:start"], :value "2014-05-10"}
   {:type "date", :target ["parameter" "foo:end"], :value "2014-05-16"}]
  (expand-date-range-param nil {:target ["parameter" "foo"], :type "date", :value "2014-05-10~2014-05-16"}))

(expect
  [{:type "date", :target ["parameter" "foo:start"], :value (tf/unparse (tf/formatters :year-month-day) (t/yesterday))}
   {:type "date", :target ["parameter" "foo:end"], :value (tf/unparse (tf/formatters :year-month-day) (t/yesterday))}]
  (expand-date-range-param nil {:target ["parameter" "foo"], :type "date", :value "yesterday"}))

;; if driver doesn't support :native-parameters then we skip any substitutions
(expect
  {:database   1
   :driver     (NonParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table [[WHERE <foo={{foo}}> <bar='{{bar}}'>]]"}}
  (expand-parameters {:database   1
                      :driver     (NonParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table [[WHERE <foo={{foo}}> <bar='{{bar}}'>]]"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["parameter" "foo"]
                                    :value  "666"}]}))

;; incomplete clauses are removed (but unmatched individual variables are untouched)
(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = {{foo}}"}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE id = {{foo}}"}}))

(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table WHERE "}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE <id = {{foo}}>"}}))

(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table "}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table [[WHERE id = {{foo}}]]"}}))

;; when only part of an outer-clause is substituted we remove the entire outer-clause
(expect
  {:database   1
   :driver     (NativeParametersDriver.)
   :type       :native
   :native     {:query "SELECT * FROM table "}}
  (expand-parameters {:database   1
                      :driver     (NativeParametersDriver.)
                      :type       :native
                      :native     {:query "SELECT * FROM table [[WHERE <id = {{foo}}> <blah={{blah}}>]]"}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["parameter" "foo"]
                                    :value  "666"}]}))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


;; adding a simple parameter
(expect
  {:database   1
   :type       :query
   :query      {:aggregation ["rows"]
                :filter      ["=" ["field-id" 123] "666"]
                :breakout    [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:aggregation ["rows"]
                                   :breakout    [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "666"}]}))

;; multiple filters are conjoined by an "AND"
(expect
  {:database   1
   :type       :query
   :query      {:aggregation ["rows"]
                :filter      ["AND" ["AND" ["AND" ["=" 456 12]] ["=" ["field-id" 123] "666"]] ["=" ["field-id" 456] "999"]]
                :breakout    [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:aggregation ["rows"]
                                   :filter      ["AND" ["=" 456 12]]
                                   :breakout    [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "666"}
                                   {:hash   "def456"
                                    :name   "bar"
                                    :type   "category"
                                    :target ["dimension" ["field-id" 456]]
                                    :value  "999"}]}))

;; date range parameters
(expect
  {:database   1
   :type       :query
   :query      {:aggregation ["rows"]
                :filter      ["TIME_INTERVAL" ["field-id" 123] -30 "day"]
                :breakout    [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:aggregation ["rows"]
                                   :breakout    [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "past30days"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:aggregation ["rows"]
                :filter      ["=" ["field-id" 123] ["relative_datetime" -1 "day"]]
                :breakout    [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:aggregation ["rows"]
                                   :breakout    [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "yesterday"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:aggregation ["rows"]
                :filter      ["BETWEEN" ["field-id" 123] "2014-05-10" "2014-05-16"]
                :breakout    [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:aggregation ["rows"]
                                   :breakout    [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "2014-05-10~2014-05-16"}]}))
