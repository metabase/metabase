(ns metabase.mbql.normalize-test
  (:require [clojure
             [set :as set]
             [test :refer :all]]
            [expectations :refer [expect]]
            [metabase.mbql.normalize :as normalize]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                NORMALIZE TOKENS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Query type should get normalized
(expect
  {:type :native}
  (#'normalize/normalize-tokens {:type "NATIVE"}))

;; native queries should NOT get normalized
(expect
  {:type :native, :native {:query "SELECT COUNT(*) FROM CANS;"}}
  (#'normalize/normalize-tokens {:type "NATIVE", :native {"QUERY" "SELECT COUNT(*) FROM CANS;"}}))

(expect
  {:native {:query {:NAME        "FAKE_QUERY"
                    :description "Theoretical fake query in a JSON-based query lang"}}}
  (#'normalize/normalize-tokens {:native {:query {:NAME        "FAKE_QUERY"
                                                  :description "Theoretical fake query in a JSON-based query lang"}}}))

;; METRICS shouldn't get normalized in some kind of wacky way
(expect
  {:aggregation [:+ [:metric 10] 1]}
  (#'normalize/normalize-tokens {:aggregation ["+" ["METRIC" 10] 1]}))

;; Nor should SEGMENTS
(expect
  {:filter [:= [:+ [:segment 10] 1] 10]}
  (#'normalize/normalize-tokens {:filter ["=" ["+" ["SEGMENT" 10] 1] 10]}))

;; are expression names exempt from lisp-casing/lower-casing?
(expect
  {:query {:expressions {:sales_tax [:- [:field-id 10] [:field-id 20]]}}}
  (#'normalize/normalize-tokens {"query" {"expressions" {:sales_tax ["-" ["field-id" 10] ["field-id" 20]]}}}))

;; expression references should be exempt too
(expect
  {:order-by [[:desc [:expression "SALES_TAX"]]]}
  (#'normalize/normalize-tokens {:order-by [[:desc [:expression "SALES_TAX"]]]}) )

;; ... but they should be converted to strings if passed in as a KW for some reason. Make sure we preserve namespace!
(expect
  {:order-by [[:desc [:expression "SALES/TAX"]]]}
  (#'normalize/normalize-tokens {:order-by [[:desc ["expression" :SALES/TAX]]]}))

;; field literals should be exempt too
(expect
  {:order-by [[:desc [:field-literal "SALES_TAX" :type/Number]]]}
  (#'normalize/normalize-tokens {:order-by [[:desc [:field-literal "SALES_TAX" :type/Number]]]}) )

;; ... but they should be converted to strings if passed in as a KW for some reason
(expect
  {:order-by [[:desc [:field-literal "SALES/TAX" :type/Number]]]}
  (#'normalize/normalize-tokens {:order-by [[:desc ["field_literal" :SALES/TAX "type/Number"]]]}))


;;; -------------------------------------------------- aggregation ---------------------------------------------------

(expect
  {:query {:aggregation :rows}}
  (#'normalize/normalize-tokens {:query {"AGGREGATION" "ROWS"}}))

(expect
  {:query {:aggregation [:rows]}}
  (#'normalize/normalize-tokens {:query {"AGGREGATION" ["ROWS"]}}))

(expect
 {:query {:aggregation [:count 10]}}
 (#'normalize/normalize-tokens {:query {"AGGREGATION" ["COUNT" 10]}}))

(expect
  {:query {:aggregation [[:count 10]]}}
  (#'normalize/normalize-tokens {:query {"AGGREGATION" [["COUNT" 10]]}}))

;; make sure we normalize ag tokens properly when there's wacky MBQL 95 ag syntax
(expect
  {:query {:aggregation [:rows :count]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["rows" "count"]}}))

(expect
  {:query {:aggregation [:count :count]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["count" "count"]}}))

;; don't normalize names of expression refs!
(expect
  {:query {:aggregation [:count [:count [:expression "ABCDEF"]]]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["count" ["count" ["expression" "ABCDEF"]]]}}))

;; make sure binning-strategy clauses get normalized the way we'd expect
(expect
  {:query {:breakout [[:binning-strategy 10 :bin-width 2000]]}}
  (#'normalize/normalize-tokens {:query {:breakout [["BINNING_STRATEGY" 10 "BIN-WIDTH" 2000]]}}))

;; or field literals!
(expect
  {:query {:aggregation [:count [:count [:field-literal "ABCDEF" :type/Text]]]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["count" ["count" ["field_literal" "ABCDEF" "type/Text"]]]}}))

;; event if you try your best to break things it should handle it
(expect
  {:query {:aggregation [:count [:sum 10] [:count 20] :count]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["count" ["sum" 10] ["count" 20] "count"]}}))

;; try an ag that is named using legacy `:named` clause
(expect
  {:query {:aggregation [:named [:sum 10] "My COOL AG"]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["named" ["SuM" 10] "My COOL AG"]}}))

(expect
  {:query {:aggregation [:named [:sum 10] "My COOL AG" {:use-as-display-name? false}]}}
  (#'normalize/normalize-tokens
   {:query {:aggregation ["named" ["SuM" 10] "My COOL AG" {:use-as-display-name? false}]}}))

;; try w/ `:aggregation-options`, the replacement for `:named`
(expect
 {:query {:aggregation [:aggregation-options [:sum 10] {:display-name "My COOL AG"}]}}
 (#'normalize/normalize-tokens
  {:query {:aggregation ["aggregation_options" ["SuM" 10] {"display_name" "My COOL AG"}]}}))

;; try an expression ag
(expect
 {:query {:aggregation [:+ [:sum 10] [:* [:sum 20] 3]]}}
 (#'normalize/normalize-tokens {:query {:aggregation ["+" ["sum" 10] ["*" ["SUM" 20] 3]]}}))

;; expression ags should handle varargs
(expect
  {:query {:aggregation [:+ [:sum 10] [:sum 20] [:sum 30]]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["+" ["sum" 10] ["SUM" 20] ["sum" 30]]}}))

;; expression ags should handle datetime arithemtics
(expect
  {:query {:expressions {:prev_month [:+ [:field-id 13] [:interval -1 :month]]}}}
  (#'normalize/normalize-tokens {:query {:expressions {:prev_month ["+" ["field-id" 13]
                                                                    ["interval" -1 "month"]]}}}))

(expect
  {:query {:expressions {:prev_month [:- [:field-id 13] [:interval 1 :month] [:interval 1 :day]]}}}
  (#'normalize/normalize-tokens {:query {:expressions {:prev_month ["-" ["field-id" 13]
                                                                    ["interval" 1 "month"]
                                                                    ["interval" 1 "day"]]}}}))

;; case
(expect
  {:query {:aggregation [:sum [:case [[[:> [:field-id 12] 10] 10]
                                     [[:> [:field-id 12] 100] [:field-id 1]]
                                     [[:= [:field-id 2] 1] "foo"]]
                               {:default [:field-id 2]}]]}}
  (#'normalize/normalize-tokens {:query {:aggregation ["sum" ["case" [[[">" ["field-id" 12] 10] 10]
                                                                      [[">" ["field-id" 12] 100] ["field-id" 1]]
                                                                     [["=" ["field-id" 2] 1] "foo"]]
                                                              {:default ["field-id" 2]}]]}}))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

;; does order-by get properly normalized?
(expect
  {:query {:order-by [[10 :asc]]}}
  (#'normalize/normalize-tokens {:query {"ORDER_BY" [[10 "ASC"]]}}))

(expect
  {:query {:order-by [[:asc 10]]}}
  (#'normalize/normalize-tokens {:query {"ORDER_BY" [["ASC" 10]]}}))

(expect
  {:query {:order-by [[[:field-id 10] :asc]]}}
  (#'normalize/normalize-tokens {:query {"ORDER_BY" [[["field_id" 10] "ASC"]]}}))

(expect
  {:query {:order-by [[:desc [:field-id 10]]]}}
  (#'normalize/normalize-tokens {:query {"ORDER_BY" [["DESC" ["field_id" 10]]]}}))


;;; ----------------------------------------------------- filter -----------------------------------------------------

;; the unit & amount in time interval clauses should get normalized
(expect
  {:query {:filter [:time-interval 10 :current :day]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["time-interval" 10 "current" "day"]}}))

;; but amount should not get normalized if it's an integer
(expect
  {:query {:filter [:time-interval 10 -10 :day]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["time-interval" 10 -10 "day"]}}))

;; make sure we support time-interval options
(expect
  [:time-interval 10 -30 :day {:include-current true}]
  (#'normalize/normalize-tokens ["TIME_INTERVAL" 10 -30 "DAY" {"include_current" true}]))

;; the unit in relative datetime clauses should get normalized
(expect
  {:query {:filter [:= [:field-id 10] [:relative-datetime -31 :day]]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["=" [:field-id 10] ["RELATIVE_DATETIME" -31 "DAY"]]}}))

;; should work if we do [:relative-datetime :current] as well
(expect
  {:query {:filter [:= [:field-id 10] [:relative-datetime :current]]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["=" [:field-id 10] ["RELATIVE_DATETIME" "CURRENT"]]}}))

;; and in datetime-field clauses (MBQL 98+)
(expect
  {:query {:filter [:= [:datetime-field [:field-id 10] :day] "2018-09-05"]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["=" [:datetime-field ["field_id" 10] "day"] "2018-09-05"]}}))

;; (or in long-since-deprecated MBQL 95 format)
(expect
  {:query {:filter [:= [:datetime-field 10 :as :day] "2018-09-05"]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["=" [:datetime-field 10 "as" "day"] "2018-09-05"]}}))

;; if string filters have an options map that should get normalized
(expect
  {:query {:filter [:starts-with 10 "ABC" {:case-sensitive true}]}}
  (#'normalize/normalize-tokens {:query {"FILTER" ["starts_with" 10 "ABC" {"case_sensitive" true}]}}))


;;; --------------------------------------------------- parameters ---------------------------------------------------

;; make sure we're not running around trying to normalize the type in native query params
(expect
  {:type       :native
   :parameters [{:type   :date/range
                 :target [:dimension [:template-tag "checkin_date"]]
                 :value  "2015-04-01~2015-05-01"}]}
  (#'normalize/normalize-tokens {:type       :native
                                 :parameters [{:type   "date/range"
                                               :target [:dimension [:template-tag "checkin_date"]]
                                               :value  "2015-04-01~2015-05-01"}]}))

;; oh yeah, also we don't want to go around trying to normalize template-tag names
(expect
  {:type   :native
   :native {:query         "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
            :template-tags {"checkin_date" {:name         "checkin_date"
                                            :display-name "Checkin Date"
                                            :type         :dimension
                                            :dimension    [:field-id 14]}}}}
  (#'normalize/normalize-tokens
   {:type   "native"
    :native {:query         "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
             :template_tags {:checkin_date {:name         "checkin_date"
                                            :display_name "Checkin Date"
                                            :type         :dimension
                                            :dimension    ["field-id" 14]}}}}))

;; native template tags `:type` should get normalized
(expect
  {:native {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
            :template-tags {"names_list" {:name         "names_list"
                                          :display-name "Names List"
                                          :type         :dimension
                                          :dimension    [:field-id 49]}}}}
  (#'normalize/normalize-tokens
   {:native {:query          "SELECT * FROM CATEGORIES WHERE {{names_list}}"
             "template_tags" {:names_list {:name         "names_list"
                                           :display_name "Names List"
                                           :type         "dimension"
                                           :dimension    ["field-id" 49]}}}}))

;; `:parameters` `:type` should get normalized, but `:value` should not.
(expect
  {:type       :native
   :parameters [{:type   :text
                 :target [:dimension [:template-tag "names_list"]]
                 :value  ["BBQ" "Bakery" "Bar"]}]}
  (#'normalize/normalize-tokens
   {:type       "native"
    :parameters [{:type   "text"
                  :target ["dimension" ["template-tag" "names_list"]]
                  :value  ["BBQ" "Bakery" "Bar"]}]}))

;; make sure normalization doesn't try to parse value as an MBQL clause
(expect
  {:type       :native
   :parameters [{:type   :text
                 :target [:dimension [:template-tag "names_list"]]
                 :value  ["=" 10 20]}]}
  (#'normalize/normalize-tokens
   {:type       "native"
    :parameters [{:type   "text"
                  :target ["dimension" ["template-tag" "names_list"]]
                  :value  ["=" 10 20]}]}))

;;; ------------------------------------------------- source queries -------------------------------------------------

;; Make sure token normalization works correctly on source queries
(expect
  {:database 4
   :type     :query
   :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                             :template-tags {"category" {:name         "category"
                                                         :display-name "Category"
                                                         :type         :text
                                                         :required     true
                                                         :default      "Widget"}}}}}
  (#'normalize/normalize-tokens
   {:database 4
    :type     :query
    :query    {"source_query" {:native         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                               "template_tags" {:category {:name         "category"
                                                           :display-name "Category"
                                                           :type         "text"
                                                           :required     true
                                                           :default      "Widget"}}}}}))

(expect
  {:database 4,
   :type     :query,
   :query    {:source-query {:source-table 1, :aggregation :rows}}}
  (#'normalize/normalize-tokens
   {:database 4
    :type     :query
    :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}}))


;;; ----------------------------------------------------- joins ------------------------------------------------------

;; do entries in the `:joins` clause get normalized?
(expect
  {:database 4
   :type     :query
   :query    {:source-table 1
              :joins        [{:source-table 2
                              :alias        "my/table"
                              :strategy     :left-join
                              :fields       :all}]}}
  (#'normalize/normalize-tokens
   {:database 4
    :type     :query
    :query    {"source_table" 1
               "Joins"        [{"source_table" 2
                                "alias"        :my/table
                                "strategy"     "left-join"
                                "fields"       "all"}]}}))

;; what about with a sequence of :fields?
(expect
  {:database 4
   :type     :query
   :query    {:source-table 1
              :joins        [{:fields [[:field-id 1]
                                       [:field-literal "MY_FIELD" :type/Integer]]}]}}
  (#'normalize/normalize-tokens
   {:database 4
    :type     :query
    :query    {"source_table" 1
               "joins"        [{"fields" [["field_id" 1] ["field_literal" :MY_FIELD "type/Integer"]]}]}}))

(deftest normalize-source-query-in-joins-test
  (testing "does a `:source-query` in `:joins` get normalized?"
    (letfn [(query-with-joins [joins]
              {:database 4
               :type     :query
               :query    {:source-table 1
                          :joins        joins}})]
      (testing "MBQL source query in :joins"
        (is (= (query-with-joins [{:source-query {:source-table 2}
                                   :fields       [[:field-id 1]
                                                  [:field-literal "MY_FIELD" :type/Integer]]}])
               (#'normalize/normalize-tokens
                (query-with-joins [{"source_query" {"source_table" 2}
                                    "fields"       [["field_id" 1]
                                                    ["field_literal" :MY_FIELD "type/Integer"]]}])))))
      (testing "native source query in :joins"
        (testing "string source query"
          (is (= (query-with-joins [{:source-query {:native "SELECT *"}}])
                 (#'normalize/normalize-tokens
                  (query-with-joins [{"source_query" {"NATIVE" "SELECT *"}}])))))
        (testing "map source query"
          (is (= (query-with-joins [{:source-query {:native {"this_is_a_native_query" "TRUE"}}}])
                 (#'normalize/normalize-tokens
                  (query-with-joins [{"source_query" {"NATIVE" {"this_is_a_native_query" "TRUE"}}}])))))))))

;; do `:joins` inside a nested query get normalized?
(expect
  {:database 4
   :type     :query
   :query    {:source-query {:source-table 1
                             :joins        [{:strategy :right-join
                                             :fields   [[:field-id 1]
                                                        [:field-literal "MY_FIELD" :type/Integer]]}]}}}
  (#'normalize/normalize-tokens
   {:database 4
    :type     :query
    :query    {"source_query"
               {"source_table" 1
                "joins"
                [{"strategy" "right-join"
                  "fields"   [["field_id" 1] ["field_literal" :MY_FIELD "type/Integer"]]}]}}}))


;;; ----------------------------------------------------- other ------------------------------------------------------

;; Does the QueryExecution context get normalized?
(expect
  {:context :json-download}
  (#'normalize/normalize-tokens {:context "json-download"}))

;; if `:context` is `nil` it's not our problem
(expect
  {:context nil}
  (#'normalize/normalize-tokens {:context nil}))

(deftest params-normalization-test
  (is (= {:native {:query  "SELECT * FROM venues WHERE name = ?"
                   :params ["Red Medicine"]}}
         (#'normalize/normalize-tokens
          {:native {:query  "SELECT * FROM venues WHERE name = ?"
                    :params ["Red Medicine"]}}))
      ":native :params shouldn't get normalized."))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  CANONICALIZE                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Does our `wrap-implict-field-id` fn work?
(expect
 [:field-id 10]
 (#'normalize/wrap-implicit-field-id 10))

(expect
  [:field-id 10]
  (#'normalize/wrap-implicit-field-id [:field-id 10]))

;; make sure `binning-strategy` wraps implicit Field IDs
(expect
  {:query {:breakout [[:binning-strategy [:field-id 10] :bin-width 2000]]}}
  (#'normalize/canonicalize {:query {:breakout [[:binning-strategy 10 :bin-width 2000]]}}))


;;; -------------------------------------------------- aggregation ---------------------------------------------------

;; Do aggregations get canonicalized properly?
;; field ID should get wrapped in field-id and ags should be converted to multiple ag syntax
(expect
 {:query {:aggregation [[:count [:field-id 10]]]}}
 (#'normalize/canonicalize {:query {:aggregation [:count 10]}}))

;; ag with no Field ID
(expect
  {:query {:aggregation [[:count]]}}
  (#'normalize/canonicalize {:query {:aggregation [:count]}}))

;; if already wrapped in field-id it's ok
(expect
  {:query {:aggregation [[:count [:field-id 1000]]]}}
  (#'normalize/canonicalize {:query {:aggregation [:count [:field-id 1000]]}}))

;; ags in the canonicalized format should pass thru ok
(expect
  {:query {:aggregation [[:metric "ga:sessions"] [:metric "ga:1dayUsers"]]}}
  (#'normalize/canonicalize
   {:query {:aggregation [[:metric "ga:sessions"] [:metric "ga:1dayUsers"]]}}))

;; :rows aggregation type, being deprecated since FOREVER, should just get removed
(expect
  {:query {:aggregation []}}
  (#'normalize/canonicalize {:query {:aggregation [:rows]}}))

(expect
  {:query {:aggregation []}}
  (#'normalize/canonicalize {:query {:aggregation :rows}}))

;; if just a single aggregation is supplied it should always be converted to new-style multiple-aggregation syntax
(expect
  {:query {:aggregation [[:count]]}}
  (#'normalize/canonicalize {:query {:aggregation :count}}))

;; make sure we handle single :count with :field-id correctly
(expect
  {:query {:aggregation [[:count [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:aggregation [:count [:field-id 10]]}}))

;; make sure for multiple aggregations we can handle `:count` that doesn't appear wrapped in brackets
(expect
  {:query {:aggregation [[:count] [:sum [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:aggregation [:count [:sum 10]]}}))

;; this doesn't make sense, but make sure if someone specifies a `:rows` ag and another one we don't end up with a
;; `nil` in the ags list
(expect
  {:query {:aggregation [[:count]]}}
  (#'normalize/canonicalize {:query {:aggregation [:rows :count]}}))

;; another stupid aggregation that we need to be able to handle
(expect
  {:query {:aggregation [[:count] [:count]]}}
  (#'normalize/canonicalize {:query {:aggregation [:count :count]}}))

;; a mix of unwrapped & wrapped should still work
(expect
  {:query {:aggregation [[:count] [:sum [:field-id 10]] [:count [:field-id 20]] [:count]]}}
  (#'normalize/canonicalize {:query {:aggregation [:count [:sum 10] [:count 20] :count]}}))

;; legacy `:named` aggregation clauses should get converted to `:aggregation-options`
(expect
 {:query {:aggregation [[:aggregation-options [:sum [:field-id 10]] {:display-name "Sum *TEN*"}]]}}
 (#'normalize/canonicalize {:query {:aggregation [:named [:sum 10] "Sum *TEN*"]}}))

(expect
 {:query {:aggregation [[:aggregation-options [:sum [:field-id 10]] {:name "Sum *TEN*"}]]}}
 (#'normalize/canonicalize {:query {:aggregation [:named [:sum 10] "Sum *TEN*" {:use-as-display-name? false}]}}))

;; subclauses of `:aggregation-options` should get canonicalized correctly
(expect
 {:query {:aggregation [[:aggregation-options] [:sum [:field-id 10]]]}}
 (#'normalize/canonicalize {:query {:aggregation [:aggregation-options [:sum 10] {}]}}))

;; make sure expression aggregations work correctly
(expect
 {:query {:aggregation [[:+ [:sum [:field-id 10]] 2]]}}
 (#'normalize/canonicalize {:query {:aggregation [:+ [:sum 10] 2]}}))

(expect
  {:query {:aggregation [[:+ [:sum [:field-id 10]] [:* [:sum [:field-id 20]] [:sum [:field-id 30]]]]]}}
  (#'normalize/canonicalize {:query {:aggregation [:+ [:sum 10] [:* [:sum 20] [:sum 30]]]}}))

;; expression ags should handle varargs
(expect
  {:query {:aggregation [[:+ [:sum [:field-id 10]] [:sum [:field-id 20]] [:sum [:field-id 30]]]]}}
  (#'normalize/canonicalize {:query {:aggregation [[:+ [:sum 10] [:sum 20] [:sum 30]]]}}))

;; METRICS shouldn't get canonicalized in some kind of wacky way
(expect
  {:query {:aggregation [[:+ [:metric 1] 2]]}}
  (#'normalize/canonicalize {:query {:aggregation [:+ [:metric 1] 2]}}))

;; can cumulative-count be handled with or without a Field?
(expect
  {:query {:aggregation [[:cum-count]]}}
  (#'normalize/canonicalize {:query {:aggregation [:cum-count]}}))

(expect
  {:query {:aggregation [[:cum-count [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:aggregation [:cum-count 10]}}))

;; should handle seqs without a problem
(expect
  {:query {:aggregation [[:min [:field-id 1]] [:min [:field-id 2]]]}}
  (#'normalize/canonicalize {:query {:aggregation '([:min 1] [:min 2])}}))

;; make sure canonicalization can handle aggregations with expressions where the Field normally goes
(expect
  {:query {:aggregation [[:sum [:* [:field-id 4] [:field-id 1]]]]}}
  (#'normalize/canonicalize
   {:query {:aggregation [[:sum [:* [:field-id 4] [:field-id 1]]]]}}))


;;; ---------------------------------------------------- breakout ----------------------------------------------------

;; implicit Field IDs should get wrapped in [:field-id] in :breakout
(expect
  {:query {:breakout [[:field-id 10]]}}
  (#'normalize/canonicalize {:query {:breakout [10]}}))

(expect
  {:query {:breakout [[:field-id 10] [:field-id 20]]}}
  (#'normalize/canonicalize {:query {:breakout [10 20]}}))

;; should handle seqs
(expect
  {:query {:breakout [[:field-id 10] [:field-id 20]]}}
  (#'normalize/canonicalize {:query {:breakout '(10 20)}}))

(expect
  {:query {:breakout [[:field-id 1000]]}}
  (#'normalize/canonicalize {:query {:breakout [[:field-id 1000]]}}))


;;; ----------------------------------------------------- fields -----------------------------------------------------

(expect
  {:query {:fields [[:field-id 10]]}}
  (#'normalize/canonicalize {:query {:fields [10]}}))

;; implicit Field IDs should get wrapped in [:field-id] in :fields
(expect
  {:query {:fields [[:field-id 10] [:field-id 20]]}}
  (#'normalize/canonicalize {:query {:fields [10 20]}}))

(expect
  {:query {:fields [[:field-id 1000]]}}
  (#'normalize/canonicalize {:query {:fields [[:field-id 1000]]}}))

;; should handle seqs
(expect
  {:query {:fields [[:field-id 10] [:field-id 20]]}}
  (#'normalize/canonicalize {:query {:fields '(10 20)}}))


;;; ----------------------------------------------------- filter -----------------------------------------------------

;; implicit Field IDs should get wrapped in [:field-id] in filters
(expect
  {:query {:filter [:= [:field-id 10] 20]}}
  (#'normalize/canonicalize {:query {:filter [:= 10 20]}}))

(expect
  {:query {:filter [:and [:= [:field-id 10] 20] [:= [:field-id 20] 30]]}}
  (#'normalize/canonicalize {:query {:filter [:and [:= 10 20] [:= 20 30]]}}))

(expect
  {:query {:filter [:between [:field-id 10] 20 30]}}
  (#'normalize/canonicalize {:query {:filter [:between 10 20 30]}}))

;; `:inside` filters should get implict Field IDs for the first two args
(expect
  {:query {:filter [:inside [:field-id 1] [:field-id 2] 90 -90 90 -90]}}
  (#'normalize/canonicalize {:query {:filter [:inside 1 2 90 -90 90 -90]}}))

;; compound filters with only one arg should get automatically de-compounded
(expect
  {:query {:filter [:= [:field-id 100] 2]}}
  (#'normalize/canonicalize {:query {:filter [:and [:= 100 2]]}}))

(expect
  {:query {:filter [:= [:field-id 100] 2]}}
  (#'normalize/canonicalize {:query {:filter [:or [:= 100 2]]}}))

;; compound filters should "pull-up" any args that are the same compound filter
(expect
  {:query {:filter [:and
                    [:= [:field-id 100] 1]
                    [:= [:field-id 200] 2]
                    [:= [:field-id 300] 3]
                    [:= [:field-id 400] 4]]}}
  (#'normalize/canonicalize {:query {:filter [:and
                                              [:and
                                               [:= [:field-id 100] 1]
                                               [:= [:field-id 200] 2]]
                                              [:and
                                               [:= [:field-id 300] 3]
                                               [:= [:field-id 400] 4]]]}}))
(expect
  {:query {:filter [:and
                    [:> [:field-id 4] 1]
                    [:is-null [:field-id 7]]
                    [:= [:field-id 5] "abc"]
                    [:between [:field-id 9] 0 25]]}}
  (#'normalize/canonicalize {:query {:filter [:and
                                              [:> [:field-id 4] 1]
                                              [:is-null [:field-id 7]]
                                              [:and
                                               [:= [:field-id 5] "abc"]
                                               [:between [:field-id 9] 0 25]]]}}))

(expect
  {:query {:filter [:or
                    [:= [:field-id 100] 1]
                    [:= [:field-id 200] 2]
                    [:= [:field-id 300] 3]
                    [:= [:field-id 400] 4]]}}
  (#'normalize/canonicalize {:query {:filter [:or
                                              [:or
                                               [:= 100 1]
                                               [:= 200 2]]
                                              [:or
                                               [:= [:field-id 300] 3]
                                               [:= [:field-id 400] 4]]]}}))

(expect
  {:query {:filter [:or
                    [:> [:field-id 4] 1]
                    [:is-null [:field-id 7]]
                    [:= [:field-id 5] "abc"]
                    [:between [:field-id 9] 0 25]]}}
  (#'normalize/canonicalize {:query {:filter [:or
                                              [:> [:field-id 4] 1]
                                              [:is-null [:field-id 7]]
                                              [:or
                                               [:= [:field-id 5] "abc"]
                                               [:between [:field-id 9] 0 25]]]}}))

;; not inside of a not should get elimated entirely
(expect
  {:query {:filter [:= [:field-id 100] 1]}}
  (#'normalize/canonicalize {:query {:filter [:not [:not [:= [:field-id 100] 1]]]}}))

;; make sure we don't overwrite options if specified
(expect
  {:query {:filter [:contains [:field-id 10] "ABC" {:case-sensitive false}]}}
  (#'normalize/canonicalize {:query {:filter [:contains 10 "ABC" {:case-sensitive false}]}}))

;; or for time-interval options
(expect
  [:time-interval 10 -30 :day {:include-current true}]
  (#'normalize/canonicalize [:time-interval 10 -30 :day {:include-current true}]))

;; make sure empty filter clauses don't explode in canonicalize
(expect
  {:database 1, :type :query, :query {:filter []}}
  (#'normalize/canonicalize
   {:database 1
    :type     :query
    :query    {:filter []}}))

;; make sure we can handle GA segments
(expect
  {:database 1,
   :type     :query
   :query    {:filter
              [:and
               [:segment "gaid:-11"]
               [:time-interval [:field-id 6851] -365 :day {}]]}}
  (#'normalize/canonicalize
   {:database 1
    :type     :query
    :query    {:filter [:and
                        [:segment "gaid:-11"]
                        [:time-interval [:field-id 6851] -365 :day {}]]}}))

;; should handle seqs
(expect
  {:query {:filter [:and [:= [:field-id 100] 1] [:= [:field-id 200] 2]]}}
  (#'normalize/canonicalize {:query {:filter '(:and
                                               [:= 100 1]
                                               [:= 200 2])}}))

;; if you put a `:datetime-field` inside a `:time-interval` we should fix it for you
(expect
  {:query {:filter [:time-interval [:field-id 8] -30 :day]}}
  (#'normalize/canonicalize {:query {:filter [:time-interval [:datetime-field [:field-id 8] :month] -30 :day]}}))

;; fk-> clauses should get the field-id treatment
(expect
  {:query {:filter [:= [:fk-> [:field-id 10] [:field-id 20]] "ABC"]}}
  (#'normalize/canonicalize {:query {:filter [:= [:fk-> 10 20] "ABC"]}}))

;; as should datetime-field clauses...
(expect
  {:query {:filter [:= [:datetime-field [:field-id 10] :day] "2018-09-05"]}}
  (#'normalize/canonicalize {:query {:filter [:= [:datetime-field 10 :day] "2018-09-05"]}}))

;; MBQL 95 datetime-field clauses ([:datetime-field <field> :as <unit>]) should get converted to MBQL 2000
(expect
  {:query {:filter [:= [:datetime-field [:field-id 10] :day] "2018-09-05"]}}
  (#'normalize/canonicalize {:query {:filter [:= [:datetime-field 10 :as :day] "2018-09-05"]}}))

;; if someone is dumb and passes something like a field-literal inside a field-id, fix it for them.
(expect
  {:query {:filter [:= [:field-literal "my_field" "type/Number"] 10]}}
  (#'normalize/canonicalize {:query {:filter [:= [:field-id [:field-literal "my_field" "type/Number"]] 10]}}))

;; we should fix :field-ids inside :field-ids too
(expect
  {:query {:filter [:= [:field-id 1] 10]}}
  (#'normalize/canonicalize {:query {:filter [:= [:field-id [:field-id 1]] 10]}}))

;; we should handle seqs no prob
(expect
  {:query {:filter [:= [:field-id 1] 10]}}
  (#'normalize/canonicalize {:query {:filter '(:= 1 10)}}))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

;; ORDER BY: MBQL 95 [field direction] should get translated to MBQL 98+ [direction field]
(expect
  {:query {:order-by [[:asc [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:order-by [[[:field-id 10] :asc]]}}))

;; MBQL 95 old order-by names should be handled
(expect
  {:query {:order-by [[:asc [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:order-by [[10 :ascending]]}}))

;; field-id should be added if needed
(expect
  {:query {:order-by [[:asc [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:order-by [[10 :asc]]}}))

(expect
  {:query {:order-by [[:asc [:field-id 10]]]}}
  (#'normalize/canonicalize {:query {:order-by [[:asc 10]]}}))

;; we should handle seqs no prob
(expect
  {:query {:order-by [[:asc [:field-id 1]]]}}
  (#'normalize/canonicalize {:query {:order-by '((1 :ascending))}}))

;; duplicate order-by clauses should get removed
(expect
  {:query {:order-by [[:asc [:field-id 1]]
                      [:desc [:field-id 2]]]}}
  (#'normalize/canonicalize {:query {:order-by [[:asc [:field-id 1]]
                                                [:desc [:field-id 2]]
                                                [:asc 1]]}}))


;;; ------------------------------------------------- source queries -------------------------------------------------

;; Make sure canonicalization works correctly on source queries
(expect
  {:database 4
   :type     :query
   :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                             :template-tags {"category" {:name         "category"
                                                         :display-name "Category"
                                                         :type         :text
                                                         :required     true
                                                         :default      "Widget"}}}}}
  ;; nothing to really do here
  (#'normalize/canonicalize
   {:database 4
    :type     :query
    :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                              :template-tags {"category" {:name         "category"
                                                          :display-name "Category"
                                                          :type         :text
                                                          :required     true
                                                          :default      "Widget"}}}}}))

;; make sure we recursively canonicalize source queries
(expect
  {:database 4
   :type     :query
   :query    {:source-query {:source-table 1, :aggregation []}}}
  (#'normalize/canonicalize
   {:database 4
    :type     :query
    :query    {:source-query {:source-table 1, :aggregation :rows}}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          WHOLE-QUERY TRANSFORMATIONS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; If you specify a field in a breakout and in the Fields clause, we should go ahead and remove it from the Fields
;; clause, because it is (obviously) implied that you should get that Field back.
(expect
  {:type  :query
   :query {:breakout [[:field-id 1] [:field-id 2]]
           :fields   [[:field-id 3]]}}
  (#'normalize/perform-whole-query-transformations
   {:type  :query
    :query {:breakout [[:field-id 1] [:field-id 2]]
            :fields   [[:field-id 2] [:field-id 3]]}}))

;; should work with FKs
(expect
  {:type  :query
   :query {:breakout [[:field-id 1]
                      [:fk-> [:field-id 2] [:field-id 4]]]
           :fields   [[:field-id 3]]}}
  (#'normalize/perform-whole-query-transformations
   {:type  :query
    :query {:breakout [[:field-id 1]
                       [:fk-> [:field-id 2] [:field-id 4]]]
            :fields   [[:fk-> [:field-id 2] [:field-id 4]]
                       [:field-id 3]]}}))

;; should work if the Field is bucketed in the breakout & in fields
(expect
  {:type  :query
   :query {:breakout [[:field-id 1]
                      [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
           :fields   [[:field-id 3]]}}
  (#'normalize/perform-whole-query-transformations
   {:type  :query
    :query {:breakout [[:field-id 1]
                       [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
            :fields   [[:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]
                       [:field-id 3]]}}))

;; should work if the Field is bucketed in the breakout but not in fields
(expect
  {:type  :query
   :query {:breakout [[:field-id 1]
                      [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
           :fields   [[:field-id 3]]}}
  (#'normalize/perform-whole-query-transformations
   {:type  :query
    :query {:breakout [[:field-id 1]
                       [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
            :fields   [[:fk-> [:field-id 2] [:field-id 4]]
                       [:field-id 3]]}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              REMOVE EMPTY CLAUSES                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; empty sequences should get removed
(expect
  {:y [100]}
  (#'normalize/remove-empty-clauses {:x [], :y [100]}))

;; nil values should get removed
(expect
  {:y 100}
  (#'normalize/remove-empty-clauses {:x nil, :y 100}))

;; sequences containing only nil should get removed
(expect
  {:a [nil 100]}
  (#'normalize/remove-empty-clauses {:a [nil 100], :b [nil nil]}))

;; empty maps should get removed
(expect
  {:a {:b 100}}
  (#'normalize/remove-empty-clauses {:a {:b 100}, :c {}}))

(expect
  {:a {:b 100}}
  (#'normalize/remove-empty-clauses {:a {:b 100}, :c {:d nil}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; With an ugly MBQL 95 query, does everything get normalized nicely?
(expect
  {:type :query
   :query  {:source-table 10
            :breakout     [[:field-id 10] [:field-id 20]]
            :filter       [:= [:field-id 10] [:datetime-field [:field-id 20] :day]]
            :order-by     [[:desc [:field-id 10]]]}}
  (normalize/normalize {:type  "query"
                        :query {"source_table" 10
                                "AGGREGATION"  "ROWS"
                                "breakout"     [10 20]
                                "filter"       ["and" ["=" 10 ["datetime-field" 20 "as" "day"]]]
                                "order-by"     [[10 "desc"]]}}))

;; let's try doing the full normalization on a native query w/ params
(expect
  {:native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                :template-tags {"names_list" {:name         "names_list"
                                              :display-name "Names List"
                                              :type         :dimension
                                              :dimension    [:field-id 49]}}}
   :parameters [{:type   :text
                 :target [:dimension [:template-tag "names_list"]]
                 :value  ["BBQ" "Bakery" "Bar"]}]}
  (normalize/normalize
   {:native     {:query          "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                 "template_tags" {:names_list {:name         "names_list"
                                               :display_name "Names List"
                                               :type         "dimension"
                                               :dimension    ["field-id" 49]}}}
    :parameters [{:type   "text"
                  :target ["dimension" ["template-tag" "names_list"]]
                  :value  ["BBQ" "Bakery" "Bar"]}]}))

;; let's try normalizing a big query with SEGMENTS
(expect
  {:database 1
   :type     :query
   :query    {:source-table 2
              :filter       [:and
                             [:= [:field-id 3] "Toucan-friendly"]
                             [:segment 4]
                             [:segment 5]]}}
  (normalize/normalize
   {:database 1
    :type     :query
    :query    {:source-table 2
               :filter       ["AND"
                              ["=" 3 "Toucan-friendly"]
                              ["SEGMENT" 4]
                              ["SEGMENT" 5]]}}))

;; make sure source queries get normalized properly!
(expect
  {:database 4
   :type     :query
   :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                             :template-tags {"category" {:name         "category"
                                                         :display-name "Category"
                                                         :type         :text
                                                         :required     true
                                                         :default      "Widget"}}}}}
  (normalize/normalize
   {:database 4
    :type     :query
    :query    {"source_query" {:native         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                               "template_tags" {:category {:name         "category"
                                                           :display-name "Category"
                                                           :type         "text"
                                                           :required     true
                                                           :default      "Widget"}}}}}))

;; make sure `rows` queries get removed
(expect
  {:database 4,
   :type     :query,
   :query    {:source-query {:source-table 1}}}
  (normalize/normalize
   {:database 4
    :type     :query
    :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}}))

;; make sure that parameters get normalized/canonicalized correctly. value should not get normalized, but type should;
;; target should do canonicalization for MBQL clauses
(expect
  {:type       :query,
   :query      {:source-table 1}
   :parameters [{:type :id, :target [:dimension [:fk-> [:field-id 3265] [:field-id 4575]]], :value ["field-id"]}
                {:type :date/all-options, :target [:dimension [:field-id 3270]], :value "thismonth"}]}
  (normalize/normalize
   {:type       :query
    :query      {:source-table 1}
    :parameters [{:type "id", :target ["dimension" ["fk->" 3265 4575]], :value ["field-id"]}
                 {:type "date/all-options", :target ["dimension" ["field-id" 3270]], :value "thismonth"}]}))

;; make sure `:source-metadata` gets normalized the way we'd expect:

;; 1. Type names should get converted to keywords
(expect
  {:query {:source-metadata
           [{:name         "name"
             :display_name "Name"
             :base_type    :type/Text
             :special_type :type/Name
             :fingerprint  {:global {:distinct-count 100}
                            :type   {:type/Text {:percent-json   0.0
                                                 :percent-url    0.0
                                                 :percent-email  0.0
                                                 :average-length 15.63}}}}]}}
  (normalize/normalize
   {:query {:source-metadata [{:name         "name"
                               :display_name "Name"
                               :description  nil
                               :base_type    "type/Text"
                               :special_type "type/Name"
                               :fingerprint  {"global" {"distinct-count" 100}
                                              "type"   {"type/Text" {"percent-json"   0.0
                                                                     "percent-url"    0.0
                                                                     "percent-email"  0.0
                                                                     "average-length" 15.63}}}}]}}))

;; 2. if `:source-metadata` is at the top-level, it should get moved to the correct location inside the 'inner' MBQL
;; query
(expect
  {:query {:source-metadata
           [{:name         "name"
             :display_name "Name"
             :base_type    :type/Text
             :special_type :type/Name
             :fingerprint  {:global {:distinct-count 100}
                            :type   {:type/Text {:percent-json   0.0
                                                 :percent-url    0.0
                                                 :percent-email  0.0
                                                 :average-length 15.63}}}}]}}
  (normalize/normalize
   {:source-metadata [{:name         "name"
                       :display_name "Name"
                       :description  nil
                       :base_type    "type/Text"
                       :special_type "type/Name"
                       :fingerprint  {"global" {"distinct-count" 100}
                                      "type"   {"type/Text" {"percent-json"   0.0
                                                             "percent-url"    0.0
                                                             "percent-email"  0.0
                                                             "average-length" 15.63}}}}]}))

(deftest normalize-nil-values-in-native-maps-test
  (testing "nil values in native query maps (e.g. MongoDB queries) should not get removed during normalization"
    (testing "keys in native query maps should not get normalized"
      (let [native-query        {:projections [:count]
                                 :query       [{"$project" {"price" "$price"}}
                                               {"$match" {"price" {"$eq" 1}}}
                                               {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                               {"$sort" {"_id" 1}}
                                               {"$project" {"_id" false, "count" true}}]
                                 :collection  "venues"}
            native-source-query (set/rename-keys native-query {:query :native})]
        (doseq [[message query] {"top-level native query"
                                 {:native native-query}

                                 "native source query"
                                 {:query {:source-query native-source-query}}

                                 "native source query in join"
                                 {:query {:joins [{:source-query native-source-query}]}}}]
          (testing message
            (is (= query
                   (normalize/normalize query)))))))))
