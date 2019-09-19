(ns metabase.query-processor.middleware.parameters.native.parse-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.parameters.native
             [interface :as i]
             [parse :as parse]]))

(expect
  ["select * from foo where bar=1"]
  (parse/parse "select * from foo where bar=1"))

(expect
  ["select * from foo where bar=" (i/->Param "baz")]
  (parse/parse "select * from foo where bar={{baz}}"))

(expect
  ["select * from foo " (i/->Optional ["where bar = " (i/->Param "baz") " "])]
  (parse/parse "select * from foo [[where bar = {{baz}} ]]"))

;; Multiple optional clauses, all present
(expect
  ["select * from foo where bar1 = ? and bar2 = ? and bar3 = ? and bar4 = ?"]
  (parse/parse (str "select * from foo where bar1 = {{baz}} "
                       "[[and bar2 = {{baz}}]] "
                       "[[and bar3 = {{baz}}]] "
                       "[[and bar4 = {{baz}}]]")))

;; Multiple optional clauses, none present
(expect
  ["select * from foo where bar1 = ?"]
  (parse/parse (str "select * from foo where bar1 = {{baz}} "
                       "[[and bar2 = {{none}}]] "
                       "[[and bar3 = {{none}}]] "
                       "[[and bar4 = {{none}}]]")))

(expect
  {:query "select * from foobars  where foobars.id in (string_to_array(?, ',')::integer[])"
   :params ["foo"]}
  (parse/parse "select * from foobars [[ where foobars.id in (string_to_array({{foobar_id}}, ',')::integer[]) ]]"))

(expect
  {:query (str "SELECT [test_data.checkins.venue_id] AS [venue_id], "
               "       [test_data.checkins.user_id] AS [user_id], "
               "       [test_data.checkins.id] AS [checkins_id] "
               "FROM [test_data.checkins] "
               "LIMIT 2")
   :params []}
  (parse/parse (str "SELECT [test_data.checkins.venue_id] AS [venue_id], "
                       "       [test_data.checkins.user_id] AS [user_id], "
                       "       [test_data.checkins.id] AS [checkins_id] "
                       "FROM [test_data.checkins] "
                       "LIMIT 2")))

;; Valid syntax in PG
(expect
  {:query "SELECT array_dims(1 || '[0:1]={2,3}'::int[])"
   :params []}
  (parse/parse "SELECT array_dims(1 || '[0:1]={2,3}'::int[])"))

;; Testing that invalid/unterminated template params/clauses throw an exception
(expect
  IllegalArgumentException
  (parse/parse "select * from foo [[where bar = {{baz}} "))

(expect
  IllegalArgumentException
  (parse/parse "select * from foo [[where bar = {{baz]]"))

(expect
  IllegalArgumentException
  (parse/parse "select * from foo {{bar}} {{baz"))

(expect
  IllegalArgumentException
  (parse/parse "select * from foo [[clause 1 {{bar}}]] [[clause 2"))
