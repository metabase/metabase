(ns metabase.query-processor.middleware.parameters.native.parse-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.parameters.native
             [interface :as i]
             [parse :as parse]]))

(def ^:private param (var-get #'parse/param))
(def ^:private optional (var-get #'parse/optional))

;; tests for tokenization
(expect
  [:param-begin "num_toucans" :end]
  (#'parse/tokenize "{{num_toucans}}"))

(expect
  [:optional-begin "AND num_toucans > " :param-begin "num_toucans" :end :end]
  (#'parse/tokenize "[[AND num_toucans > {{num_toucans}}]]"))

(expect
  [:end :param-begin :end :optional-begin]
  (#'parse/tokenize "}}{{]][["))

(expect
  ["SELECT * FROM toucanneries WHERE TRUE " :optional-begin "AND num_toucans > " :param-begin "num_toucans" :end :end]
  (#'parse/tokenize "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"))

(expect
  ["SELECT * FROM toucanneries WHERE TRUE " :optional-begin "AND num_toucans > " :param-begin "num_toucans" :end :end
   " " :optional-begin "AND total_birds > " :param-begin "total_birds" :end :end]
  (#'parse/tokenize
   "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"))

(expect
  ["select * from foo where bar=1"]
  (parse/parse "select * from foo where bar=1"))

(expect
  ["select * from foo where bar=" (i/->Param "baz")]
  (parse/parse "select * from foo where bar={{baz}}"))

(expect
  ["select * from foo " (i/->Optional ["where bar = " (i/->Param "baz") " "])]
  (parse/parse "select * from foo [[where bar = {{baz}} ]]"))

;; Multiple optional clauses
(expect
  ["select * from foo where bar1 = " (param "baz") " "
   (optional "and bar2 = " (param "baz")) " "
   (optional "and bar3 = " (param "baz")) " "
   (optional "and bar4 = " (param "baz"))]
  (parse/parse (str "select * from foo where bar1 = {{baz}} "
                       "[[and bar2 = {{baz}}]] "
                       "[[and bar3 = {{baz}}]] "
                       "[[and bar4 = {{baz}}]]")))

(expect
  ["select * from foobars "
   (optional " where foobars.id in (string_to_array(" (param "foobar_id") ", ',')::integer[]) ")]
  (parse/parse "select * from foobars [[ where foobars.id in (string_to_array({{foobar_id}}, ',')::integer[]) ]]"))

;; single square brackets shouldn't get parsed
(let [query (str "SELECT [test_data.checkins.venue_id] AS [venue_id], "
                 "       [test_data.checkins.user_id] AS [user_id], "
                 "       [test_data.checkins.id] AS [checkins_id] "
                 "FROM [test_data.checkins] "
                 "LIMIT 2")]
  (expect
    [query]
    (parse/parse query)))

(expect
  ["SELECT * FROM toucanneries WHERE TRUE "
   (optional "AND num_toucans > " (param "num_toucans"))
   " "
   (optional "AND total_birds > " (param "total_birds"))]
  (parse/parse
   "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"))

;; Valid syntax in PG -- shouldn't get parsed
(let [query "SELECT array_dims(1 || '[0:1]={2,3}'::int[])"]
  (expect
    [query]
    (parse/parse query)))

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
