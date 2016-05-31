(ns metabase.query-processor.parameters-test
  (:require [clj-time.core :as t]
            [clj-time.format :as tf]
            [expectations :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.parameters :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.query-processor.parameters
  expand-date-range-param)

;; TODO: Casting of values into appropriate types (structured queries)

;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           NATIVE QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


;; basic parameter substitution
(expect
  {:database   1
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = 666"}}
  (expand-parameters {:database   1
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
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = 123 AND foo = 666"}}
  (expand-parameters {:database   1
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
   :type       :native
   :native     {:query "SELECT * FROM table WHERE foo=666 AND bar='yipee'"}}
  (expand-parameters {:database   1
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
     :type       :native
     :native     {:query (str "SELECT * FROM table WHERE date BETWEEN '" yesterday "' AND '" yesterday "'")}})
  (expand-parameters {:database   1
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
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = 123 "}}
  (expand-parameters {:database   1
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
  (expand-date-range-param nil {:target ["parameter" "foo"], :type "date", :value "2014-05-10,2014-05-16"}))

(expect
  [{:type "date", :target ["parameter" "foo:start"], :value (tf/unparse (tf/formatters :year-month-day) (t/yesterday))}
   {:type "date", :target ["parameter" "foo:end"], :value (tf/unparse (tf/formatters :year-month-day) (t/yesterday))}]
  (expand-date-range-param nil {:target ["parameter" "foo"], :type "date", :value "yesterday"}))

;; TODO: test for value escaping to prevent sql injection

;; incomplete clauses are removed (but unmatched individual variables are untouched)
(expect
  {:database   1
   :type       :native
   :native     {:query "SELECT * FROM table WHERE id = {{foo}}"}}
  (expand-parameters {:database   1
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE id = {{foo}}"}}))

(expect
  {:database   1
   :type       :native
   :native     {:query "SELECT * FROM table WHERE "}}
  (expand-parameters {:database   1
                      :type       :native
                      :native     {:query "SELECT * FROM table WHERE <id = {{foo}}>"}}))

(expect
  {:database   1
   :type       :native
   :native     {:query "SELECT * FROM table "}}
  (expand-parameters {:database   1
                      :type       :native
                      :native     {:query "SELECT * FROM table [[WHERE id = {{foo}}]]"}}))

;; when only part of an outer-clause is substituted we remove the entire outer-clause
(expect
  {:database   1
   :type       :native
   :native     {:query "SELECT * FROM table "}}
  (expand-parameters {:database   1
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
                                    :value  "2014-05-10,2014-05-16"}]}))
