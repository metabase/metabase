(ns metabase.mbql.normalize-test
  (:require [clojure
             [set :as set]
             [test :refer :all]]
            [metabase.mbql.normalize :as normalize]))

(defn- tests {:style/indent 2} [f-symb f group->input->expected]
  (doseq [[group input->expected] group->input->expected]
    (testing group
      (doseq [[input expected] input->expected]
        (testing (str "\n" (pr-str (list f-symb input)))
          (is (= expected
                 (f input))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                NORMALIZE TOKENS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- normalize-tests {:style/indent 0} [& {:as group->input->expected}]
  (tests 'normalize-tokens #'normalize/normalize-tokens group->input->expected))

(deftest normalize-tokens-test
  (normalize-tests
    "Query type should get normalized"
    {{:type "NATIVE"}
     {:type :native}}

    "native queries should NOT get normalized"
    {{:type "NATIVE", :native {"QUERY" "SELECT COUNT(*) FROM CANS;"}}
     {:type :native, :native {:query "SELECT COUNT(*) FROM CANS;"}}

     {:native {:query {:NAME        "FAKE_QUERY"
                       :description "Theoretical fake query in a JSON-based query lang"}}}
     {:native {:query {:NAME        "FAKE_QUERY"
                       :description "Theoretical fake query in a JSON-based query lang"}}}}

    "METRICS shouldn't get normalized in some kind of wacky way"
    {{:aggregation ["+" ["METRIC" 10] 1]}
     {:aggregation [:+ [:metric 10] 1]}}

    "Nor should SEGMENTS"
    {{:filter ["=" ["+" ["SEGMENT" 10] 1] 10]}
     {:filter [:= [:+ [:segment 10] 1] 10]}}

    "are expression names exempt from lisp-casing/lower-casing?"
    {{"query" {"expressions" {:sales_tax ["-" ["field-id" 10] ["field-id" 20]]}}}
     {:query {:expressions {:sales_tax [:- [:field-id 10] [:field-id 20]]}}}}

    "expression references should be exempt too"
    {{:order-by [[:desc [:expression "SALES_TAX"]]]}
     {:order-by [[:desc [:expression "SALES_TAX"]]]}}

    "... but they should be converted to strings if passed in as a KW for some reason. Make sure we preserve namespace!"
    {{:order-by [[:desc ["expression" :SALES/TAX]]]}
     {:order-by [[:desc [:expression "SALES/TAX"]]]}}


    "field literals should be exempt too"
    {{:order-by [[:desc [:field-literal "SALES_TAX" :type/Number]]]}
     {:order-by [[:desc [:field-literal "SALES_TAX" :type/Number]]]}}


    "... but they should be converted to strings if passed in as a KW for some reason"
    {{:order-by [[:desc ["field_literal" :SALES/TAX "type/Number"]]]}
     {:order-by [[:desc [:field-literal "SALES/TAX" :type/Number]]]}}))


;;; -------------------------------------------------- aggregation ---------------------------------------------------

(deftest normalize-aggregations-test
  (normalize-tests
    "Legacy 'rows' aggregations"
    {{:query {"AGGREGATION" "ROWS"}}
     {:query {:aggregation :rows}}

     {:query {"AGGREGATION" ["ROWS"]}}
     {:query {:aggregation [:rows]}}}

    "Other uppercase tokens"
    {{:query {"AGGREGATION" ["COUNT" 10]}}
     {:query {:aggregation [:count 10]}}

     {:query {"AGGREGATION" [["COUNT" 10]]}}
     {:query {:aggregation [[:count 10]]}}}

    "make sure we normalize ag tokens properly when there's wacky MBQL 95 ag syntax"
    {{:query {:aggregation ["rows" "count"]}}
     {:query {:aggregation [:rows :count]}}

     {:query {:aggregation ["count" "count"]}}
     {:query {:aggregation [:count :count]}}}

    "don't normalize names of expression refs!"
    {{:query {:aggregation ["count" ["count" ["expression" "ABCDEF"]]]}}
     {:query {:aggregation [:count [:count [:expression "ABCDEF"]]]}}}

    "make sure binning-strategy clauses get normalized the way we'd expect"
    {{:query {:breakout [["BINNING_STRATEGY" 10 "BIN-WIDTH" 2000]]}}
     {:query {:breakout [[:binning-strategy 10 :bin-width 2000]]}}}

    "or field literals!"
    {{:query {:aggregation ["count" ["count" ["field_literal" "ABCDEF" "type/Text"]]]}}
     {:query {:aggregation [:count [:count [:field-literal "ABCDEF" :type/Text]]]}}}

    "event if you try your best to break things it should handle it"
    {{:query {:aggregation ["count" ["sum" 10] ["count" 20] "count"]}}
     {:query {:aggregation [:count [:sum 10] [:count 20] :count]}}}

    "try an ag that is named using legacy `:named` clause"
    {{:query {:aggregation ["named" ["SuM" 10] "My COOL AG"]}}
     {:query {:aggregation [:named [:sum 10] "My COOL AG"]}}

     {:query {:aggregation ["named" ["SuM" 10] "My COOL AG" {:use-as-display-name? false}]}}
     {:query {:aggregation [:named [:sum 10] "My COOL AG" {:use-as-display-name? false}]}}}

    "try w/ `:aggregation-options`, the replacement for `:named`"
    {{:query {:aggregation ["aggregation_options" ["SuM" 10] {"display_name" "My COOL AG"}]}}
     {:query {:aggregation [:aggregation-options [:sum 10] {:display-name "My COOL AG"}]}}}

    "try an expression ag"
    {{:query {:aggregation ["+" ["sum" 10] ["*" ["SUM" 20] 3]]}}
     {:query {:aggregation [:+ [:sum 10] [:* [:sum 20] 3]]}}}

    "expression ags should handle varargs"
    {{:query {:aggregation ["+" ["sum" 10] ["SUM" 20] ["sum" 30]]}}
     {:query {:aggregation [:+ [:sum 10] [:sum 20] [:sum 30]]}}}

    "expression ags should handle datetime arithemtics"
    {{:query {:expressions {:prev_month ["+" ["field-id" 13] ["interval" -1 "month"]]}}}
     {:query {:expressions {:prev_month [:+ [:field-id 13] [:interval -1 :month]]}}},

     {:query {:expressions {:prev_month ["-" ["field-id" 13] ["interval" 1 "month"] ["interval" 1 "day"]]}}}
     {:query {:expressions {:prev_month [:- [:field-id 13] [:interval 1 :month] [:interval 1 :day]]}}}}

    "case"
    {{:query {:aggregation ["sum" ["case"
                                   [[[">" ["field-id" 12] 10] 10]
                                    [[">" ["field-id" 12] 100] ["field-id" 1]]
                                    [["=" ["field-id" 2] 1] "foo"]]
                                   {:default ["field-id" 2]}]]}}
     {:query {:aggregation [:sum [:case
                                  [[[:> [:field-id 12] 10] 10]
                                   [[:> [:field-id 12] 100] [:field-id 1]]
                                   [[:= [:field-id 2] 1] "foo"]]
                                  {:default [:field-id 2]}]]}}}

    "various other new ag types"
    {{:query {:aggregation ["median" ["field-id" 13]]}}
     {:query {:aggregation [:median [:field-id 13]]}}

     {:query {:aggregation ["var" ["field-id" 13]]}}
     {:query {:aggregation [:var [:field-id 13]]}}

     {:query {:aggregation ["percentile" ["field-id" 13] 0.9]}}
     {:query {:aggregation [:percentile [:field-id 13] 0.9]}}}))



;;; ---------------------------------------------------- order-by ----------------------------------------------------

(deftest normalize-order-by-test
  (normalize-tests
    "does order-by get properly normalized?"
    {{:query {"ORDER_BY" [[10 "ASC"]]}}
     {:query {:order-by [[10 :asc]]}}

     {:query {"ORDER_BY" [["ASC" 10]]}}
     {:query {:order-by [[:asc 10]]}}

     {:query {"ORDER_BY" [[["field_id" 10] "ASC"]]}}
     {:query {:order-by [[[:field-id 10] :asc]]}}

     {:query {"ORDER_BY" [["DESC" ["field_id" 10]]]}}
     {:query {:order-by [[:desc [:field-id 10]]]}}}))


;;; ----------------------------------------------------- filter -----------------------------------------------------

(deftest normalize-filter-test
  (normalize-tests
    "the unit & amount in time interval clauses should get normalized"
    {{:query {"FILTER" ["time-interval" 10 "current" "day"]}}
     {:query {:filter [:time-interval 10 :current :day]}}}

    "but amount should not get normalized if it's an integer"
    {{:query {"FILTER" ["time-interval" 10 -10 "day"]}}
     {:query {:filter [:time-interval 10 -10 :day]}}}

    "make sure we support time-interval options"
    {["TIME_INTERVAL" 10 -30 "DAY" {"include_current" true}]
     [:time-interval 10 -30 :day {:include-current true}]}

    "the unit in relative datetime clauses should get normalized"
    {{:query {"FILTER" ["=" [:field-id 10] ["RELATIVE_DATETIME" -31 "DAY"]]}}
     {:query {:filter [:= [:field-id 10] [:relative-datetime -31 :day]]}}}

    "should work if we do [:relative-datetime :current] as well"
    {{:query {"FILTER" ["=" [:field-id 10] ["RELATIVE_DATETIME" "CURRENT"]]}}
     {:query {:filter [:= [:field-id 10] [:relative-datetime :current]]}}}

    "and in datetime-field clauses (MBQL 98+)"
    {{:query {"FILTER" ["=" [:datetime-field ["field_id" 10] "day"] "2018-09-05"]}}
     {:query {:filter [:= [:datetime-field [:field-id 10] :day] "2018-09-05"]}}}

    "(or in long-since-deprecated MBQL 95 format)"
    {{:query {"FILTER" ["=" [:datetime-field 10 "as" "day"] "2018-09-05"]}}
     {:query {:filter [:= [:datetime-field 10 :as :day] "2018-09-05"]}}}

    "if string filters have an options map that should get normalized"
    {{:query {"FILTER" ["starts_with" 10 "ABC" {"case_sensitive" true}]}}
     {:query {:filter [:starts-with 10 "ABC" {:case-sensitive true}]}}}))


;;; --------------------------------------------------- parameters ---------------------------------------------------

(deftest normalize-parmaeters-test
  (normalize-tests
    "make sure we're not running around trying to normalize the type in native query params"
    {{:type       :native
      :parameters [{:type   "date/range"
                    :target [:dimension [:template-tag "checkin_date"]]
                    :value  "2015-04-01~2015-05-01"}]}
     {:type       :native
      :parameters [{:type   :date/range
                    :target [:dimension [:template-tag "checkin_date"]]
                    :value  "2015-04-01~2015-05-01"}]}}

    "oh yeah, also we don't want to go around trying to normalize template-tag names"
    {{:type   "native"
      :native {:query         "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
               :template_tags {:checkin_date {:name         "checkin_date"
                                              :display_name "Checkin Date"
                                              :type         :dimension
                                              :dimension    ["field-id" 14]}}}}
     {:type   :native
      :native {:query         "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
               :template-tags {"checkin_date" {:name         "checkin_date"
                                               :display-name "Checkin Date"
                                               :type         :dimension
                                               :dimension    [:field-id 14]}}}}}

    "native template tags `:type` should get normalized"
    {{:native {:query          "SELECT * FROM CATEGORIES WHERE {{names_list}}"
               "template_tags" {:names_list {:name         "names_list"
                                             :display_name "Names List"
                                             :type         "dimension"
                                             :dimension    ["field-id" 49]}}}}
     {:native {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
               :template-tags {"names_list" {:name         "names_list"
                                             :display-name "Names List"
                                             :type         :dimension
                                             :dimension    [:field-id 49]}}}}}

    "`:parameters` `:type` should get normalized, but `:value` should not."
    {{:type       "native"
      :parameters [{:type   "text"
                    :target ["dimension" ["template-tag" "names_list"]]
                    :value  ["BBQ" "Bakery" "Bar"]}]}
     {:type       :native
      :parameters [{:type   :text
                    :target [:dimension [:template-tag "names_list"]]
                    :value  ["BBQ" "Bakery" "Bar"]}]}}


    "make sure normalization doesn't try to parse value as an MBQL clause"
    {{:type       "native"
      :parameters [{:type   "text"
                    :target ["dimension" ["template-tag" "names_list"]]
                    :value  ["=" 10 20]}]}
     {:type       :native
      :parameters [{:type   :text
                    :target [:dimension [:template-tag "names_list"]]
                    :value  ["=" 10 20]}]}}))


;;; ------------------------------------------------- source queries -------------------------------------------------

(deftest normalize-source-queries-test
  (normalize-tests
    "Make sure token normalization works correctly on source queries"
    {{:database 4
      :type     :query
      :query    {"source_query" {:native         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                                 "template_tags" {:category {:name         "category"
                                                             :display-name "Category"
                                                             :type         "text"
                                                             :required     true
                                                             :default      "Widget"}}}}}
     {:database 4
      :type     :query
      :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                                :template-tags {"category" {:name         "category"
                                                            :display-name "Category"
                                                            :type         :text
                                                            :required     true
                                                            :default      "Widget"}}}}}

     {:database 4
      :type     :query
      :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}}
     {:database 4,
      :type     :query
      :query    {:source-query {:source-table 1, :aggregation :rows}}}}))



;;; ----------------------------------------------------- joins ------------------------------------------------------

(deftest normalize-joins-test
  (normalize-tests
    "do entries in the `:joins` clause get normalized?"
    {{:database 4
      :type     :query
      :query    {"source_table" 1
                 "Joins"        [{"source_table" 2
                                  "alias"        :my/table
                                  "strategy"     "left-join"
                                  "fields"       "all"}]}}
     {:database 4
      :type     :query
      :query    {:source-table 1
                 :joins        [{:source-table 2
                                 :alias        "my/table"
                                 :strategy     :left-join
                                 :fields       :all}]}}}

    "what about with a sequence of :fields?"
    {{:database 4
      :type     :query
      :query    {"source_table" 1
                 "joins"        [{"fields" [["field_id" 1] ["field_literal" :MY_FIELD "type/Integer"]]}]}}
     {:database 4
      :type     :query
      :query    {:source-table 1
                 :joins        [{:fields [[:field-id 1]
                                          [:field-literal "MY_FIELD" :type/Integer]]}]}}}

    "do `:joins` inside a nested query get normalized?"
    {{:database 4
      :type     :query
      :query    {"source_query"
                 {"source_table" 1
                  "joins"
                  [{"strategy" "right-join"
                    "fields"   [["field_id" 1] ["field_literal" :MY_FIELD "type/Integer"]]}]}}}
     {:database 4
      :type     :query
      :query    {:source-query {:source-table 1
                                :joins        [{:strategy :right-join
                                                :fields   [[:field-id 1]
                                                           [:field-literal "MY_FIELD" :type/Integer]]}]}}}}))

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


;;; ----------------------------------------------------- other ------------------------------------------------------

(deftest normalize-execution-context-test
  (normalize-tests
    "Does the QueryExecution context get normalized?"
    {{:context "json-download"}
     {:context :json-download}}

    "if `:context` is `nil` it's not our problem"
    {{:context nil}
     {:context nil}}))

(deftest params-normalization-test
  (normalize-tests
    ":native :params shouldn't get normalized."
    {{:native {:query  "SELECT * FROM venues WHERE name = ?"
               :params ["Red Medicine"]}}
     {:native {:query  "SELECT * FROM venues WHERE name = ?"
               :params ["Red Medicine"]}}}))

(deftest normalize-projections-test
  (normalize-tests
    "Native :projections shouldn't get normalized."
    {{:type   :native
      :native {:projections ["_id" "name" "category_id" "latitude" "longitude" "price"]}}
     {:type   :native
      :native {:projections ["_id" "name" "category_id" "latitude" "longitude" "price"]}}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  CANONICALIZE                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- canonicalize-tests {:style/indent 0} [& {:as group->input->expected}]
  (tests 'canonicalize #'normalize/canonicalize group->input->expected))

(deftest wrap-implicit-field-id-test
  (testing "Does our `wrap-implict-field-id` fn work?"
    (doseq [input [10 [:field-id 10]]]
      (testing (pr-str (list 'wrap-implicit-field-id input))
        (is (= [:field-id 10]
               (#'normalize/wrap-implicit-field-id input)))))))


;;; ------------------------------------------------ binning strategy ------------------------------------------------

(deftest canonicalize-binning-strategy-test
  (canonicalize-tests
   "make sure `binning-strategy` wraps implicit Field IDs"
   {{:query {:breakout [[:binning-strategy 10 :bin-width 2000]]}}
    {:query {:breakout [[:binning-strategy [:field-id 10] :bin-width 2000]]}}}))


;;; -------------------------------------------------- aggregation ---------------------------------------------------

(deftest canonicalize-aggregations-test
  (canonicalize-tests
    "field ID should get wrapped in field-id and ags should be converted to multiple ag syntax"
    {{:query {:aggregation [:count 10]}}
     {:query {:aggregation [[:count [:field-id 10]]]}}}

    "ag with no Field ID"
    {{:query {:aggregation [:count]}}
     {:query {:aggregation [[:count]]}}}

    "if already wrapped in field-id it's ok"
    {{:query {:aggregation [:count [:field-id 1000]]}}
     {:query {:aggregation [[:count [:field-id 1000]]]}}}

    "ags in the canonicalized format should pass thru ok"
    {{:query {:aggregation [[:metric "ga:sessions"] [:metric "ga:1dayUsers"]]}}
     {:query {:aggregation [[:metric "ga:sessions"] [:metric "ga:1dayUsers"]]}}}

    ":rows aggregation type, being deprecated since FOREVER, should just get removed"
    {{:query {:aggregation [:rows]}}
     {:query {:aggregation []}}

     {:query {:aggregation :rows}}
     {:query {:aggregation []}}}

    "if just a single aggregation is supplied it should always be converted to new-style multiple-aggregation syntax"
    {{:query {:aggregation :count}}
     {:query {:aggregation [[:count]]}}}

    "make sure we handle single :count with :field-id correctly"
    {{:query {:aggregation [:count [:field-id 10]]}}
     {:query {:aggregation [[:count [:field-id 10]]]}}}

    "make sure for multiple aggregations we can handle `:count` that doesn't appear wrapped in brackets"
    {{:query {:aggregation [:count [:sum 10]]}}
     {:query {:aggregation [[:count] [:sum [:field-id 10]]]}}}

    (str "this doesn't make sense, but make sure if someone specifies a `:rows` ag and another one we don't end up "
         "with a `nil` in the ags list")
    {{:query {:aggregation [:rows :count]}}
     {:query {:aggregation [[:count]]}}}

    "another stupid aggregation that we need to be able to handle"
    {{:query {:aggregation [:count :count]}}
     {:query {:aggregation [[:count] [:count]]}}}

    "a mix of unwrapped & wrapped should still work"
    {{:query {:aggregation [:count [:sum 10] [:count 20] :count]}}
     {:query {:aggregation [[:count] [:sum [:field-id 10]] [:count [:field-id 20]] [:count]]}}}

    "legacy `:named` aggregation clauses should get converted to `:aggregation-options`"
    {{:query {:aggregation [:named [:sum 10] "Sum *TEN*"]}}
     {:query {:aggregation [[:aggregation-options [:sum [:field-id 10]] {:display-name "Sum *TEN*"}]]}}

     {:query {:aggregation [:named [:sum 10] "Sum *TEN*" {:use-as-display-name? false}]}}
     {:query {:aggregation [[:aggregation-options [:sum [:field-id 10]] {:name "Sum *TEN*"}]]}}}

    "subclauses of `:aggregation-options` should get canonicalized correctly"
    {{:query {:aggregation [:aggregation-options [:sum 10] {}]}}
     {:query {:aggregation [[:aggregation-options] [:sum [:field-id 10]]]}}}

    "make sure expression aggregations work correctly"
    {{:query {:aggregation [:+ [:sum 10] 2]}}
     {:query {:aggregation [[:+ [:sum [:field-id 10]] 2]]}}

     {:query {:aggregation [:+ [:sum 10] [:* [:sum 20] [:sum 30]]]}}
     {:query {:aggregation [[:+ [:sum [:field-id 10]] [:* [:sum [:field-id 20]] [:sum [:field-id 30]]]]]}}}

    "expression ags should handle varargs"
    {{:query {:aggregation [[:+ [:sum 10] [:sum 20] [:sum 30]]]}}
     {:query {:aggregation [[:+ [:sum [:field-id 10]] [:sum [:field-id 20]] [:sum [:field-id 30]]]]}}}

    "METRICS shouldn't get canonicalized in some kind of wacky way"
    {{:query {:aggregation [:+ [:metric 1] 2]}}
     {:query {:aggregation [[:+ [:metric 1] 2]]}}}

    "can cumulative-count be handled with or without a Field?"
    {{:query {:aggregation [:cum-count]}}
     {:query {:aggregation [[:cum-count]]}}

     {:query {:aggregation [:cum-count 10]}}
     {:query {:aggregation [[:cum-count [:field-id 10]]]}}}

    "should handle seqs without a problem"
    {{:query {:aggregation '([:min 1] [:min 2])}}
     {:query {:aggregation [[:min [:field-id 1]] [:min [:field-id 2]]]}}}

    "make sure canonicalization can handle aggregations with expressions where the Field normally goes"
    {{:query {:aggregation [[:sum [:* [:field-id 4] [:field-id 1]]]]}}
     {:query {:aggregation [[:sum [:* [:field-id 4] [:field-id 1]]]]}}}))


;;; ---------------------------------------------------- breakout ----------------------------------------------------

(deftest canonicalize-breakout-test
  (canonicalize-tests
    "implicit Field IDs should get wrapped in [:field-id] in :breakout"
    {{:query {:breakout [10]}}
     {:query {:breakout [[:field-id 10]]}}

     {:query {:breakout [10 20]}}
     {:query {:breakout [[:field-id 10] [:field-id 20]]}}}

    "should handle seqs"
    {{:query {:breakout '(10 20)}}
     {:query {:breakout [[:field-id 10] [:field-id 20]]}}

     {:query {:breakout [[:field-id 1000]]}}
     {:query {:breakout [[:field-id 1000]]}}}))


;;; ----------------------------------------------------- fields -----------------------------------------------------

(deftest canonicalize-fields-test
  (canonicalize-tests
    "implicit Field IDs should get wrapped in [:field-id] in :fields"
    {{:query {:fields [10]}}
     {:query {:fields [[:field-id 10]]}}

     {:query {:fields [10 20]}}
     {:query {:fields [[:field-id 10] [:field-id 20]]}}

     {:query {:fields [[:field-id 1000]]}}
     {:query {:fields [[:field-id 1000]]}}}

    "should handle seqs"
    {{:query {:fields '(10 20)}}
     {:query {:fields [[:field-id 10] [:field-id 20]]}}}))


;;; ----------------------------------------------------- filter -----------------------------------------------------

(deftest canonicalize-filter-test
  (canonicalize-tests
    "implicit Field IDs should get wrapped in [:field-id] in filters"
    {{:query {:filter [:= 10 20]}}
     {:query {:filter [:= [:field-id 10] 20]}}

     {:query {:filter [:and [:= 10 20] [:= 20 30]]}}
     {:query {:filter [:and [:= [:field-id 10] 20] [:= [:field-id 20] 30]]}}

     {:query {:filter [:between 10 20 30]}}
     {:query {:filter [:between [:field-id 10] 20 30]}}}

    "`:inside` filters should get implict Field IDs for the first two args"
    {{:query {:filter [:inside 1 2 90 -90 90 -90]}}
     {:query {:filter [:inside [:field-id 1] [:field-id 2] 90 -90 90 -90]}}}

    "compound filters with only one arg should get automatically de-compounded"
    {{:query {:filter [:and [:= 100 2]]}}
     {:query {:filter [:= [:field-id 100] 2]}}

     {:query {:filter [:or [:= 100 2]]}}
     {:query {:filter [:= [:field-id 100] 2]}}}

    "compound filters should \"pull-up\" any args that are the same compound filter"
    {{:query {:filter [:and
                       [:and
                        [:= [:field-id 100] 1]
                        [:= [:field-id 200] 2]]
                       [:and
                        [:= [:field-id 300] 3]
                        [:= [:field-id 400] 4]]]}}
     {:query {:filter [:and
                       [:= [:field-id 100] 1]
                       [:= [:field-id 200] 2]
                       [:= [:field-id 300] 3]
                       [:= [:field-id 400] 4]]}}

     {:query {:filter [:and
                       [:> [:field-id 4] 1]
                       [:is-null [:field-id 7]]
                       [:and
                        [:= [:field-id 5] "abc"]
                        [:between [:field-id 9] 0 25]]]}}
     {:query {:filter [:and
                       [:> [:field-id 4] 1]
                       [:is-null [:field-id 7]]
                       [:= [:field-id 5] "abc"]
                       [:between [:field-id 9] 0 25]]}}

     {:query {:filter [:or
                       [:or
                        [:= 100 1]
                        [:= 200 2]]
                       [:or
                        [:= [:field-id 300] 3]
                        [:= [:field-id 400] 4]]]}}
     {:query {:filter [:or
                       [:= [:field-id 100] 1]
                       [:= [:field-id 200] 2]
                       [:= [:field-id 300] 3]
                       [:= [:field-id 400] 4]]}}

     {:query {:filter [:or
                       [:> [:field-id 4] 1]
                       [:is-null [:field-id 7]]
                       [:or
                        [:= [:field-id 5] "abc"]
                        [:between [:field-id 9] 0 25]]]}}
     {:query {:filter [:or
                       [:> [:field-id 4] 1]
                       [:is-null [:field-id 7]]
                       [:= [:field-id 5] "abc"]
                       [:between [:field-id 9] 0 25]]}}}

    "not inside of a not should get elimated entirely"
    {{:query {:filter [:not [:not [:= [:field-id 100] 1]]]}}
     {:query {:filter [:= [:field-id 100] 1]}}}

    "make sure we don't overwrite options if specified"
    {{:query {:filter [:contains 10 "ABC" {:case-sensitive false}]}}
     {:query {:filter [:contains [:field-id 10] "ABC" {:case-sensitive false}]}}}

    "or for time-interval options"
    {[:time-interval 10 -30 :day {:include-current true}]
     [:time-interval 10 -30 :day {:include-current true}]}

    "make sure empty filter clauses don't explode in canonicalize"
    {{:database 1, :type :query, :query {:filter []}}
     {:database 1, :type :query, :query {:filter []}}}

    "make sure we can handle GA segments"
    {{:database 1
      :type     :query
      :query    {:filter [:and
                          [:segment "gaid:-11"]
                          [:time-interval [:field-id 6851] -365 :day {}]]}}
     {:database 1,
      :type     :query
      :query    {:filter
                 [:and
                  [:segment "gaid:-11"]
                  [:time-interval [:field-id 6851] -365 :day {}]]}}}

    "should handle seqs"
    {{:query {:filter '(:and
                        [:= 100 1]
                        [:= 200 2])}}
     {:query {:filter [:and [:= [:field-id 100] 1] [:= [:field-id 200] 2]]}}}

    "if you put a `:datetime-field` inside a `:time-interval` we should fix it for you"
    {{:query {:filter [:time-interval [:datetime-field [:field-id 8] :month] -30 :day]}}
     {:query {:filter [:time-interval [:field-id 8] -30 :day]}}}

    "fk-> clauses should get the field-id treatment"
    {{:query {:filter [:= [:fk-> 10 20] "ABC"]}}
     {:query {:filter [:= [:fk-> [:field-id 10] [:field-id 20]] "ABC"]}}}

    "as should datetime-field clauses..."
    {{:query {:filter [:= [:datetime-field 10 :day] "2018-09-05"]}}
     {:query {:filter [:= [:datetime-field [:field-id 10] :day] "2018-09-05"]}}}

    "MBQL 95 datetime-field clauses ([:datetime-field <field> :as <unit>]) should get converted to MBQL 2000"
    {{:query {:filter [:= [:datetime-field 10 :as :day] "2018-09-05"]}}
     {:query {:filter [:= [:datetime-field [:field-id 10] :day] "2018-09-05"]}}}

    "if someone is dumb and passes something like a field-literal inside a field-id, fix it for them."
    {{:query {:filter [:= [:field-id [:field-literal "my_field" "type/Number"]] 10]}}
     {:query {:filter [:= [:field-literal "my_field" "type/Number"] 10]}}}

    "we should fix :field-ids inside :field-ids too"
    {{:query {:filter [:= [:field-id [:field-id 1]] 10]}}
     {:query {:filter [:= [:field-id 1] 10]}}}

    "we should handle seqs no prob"
    {{:query {:filter '(:= 1 10)}}
     {:query {:filter [:= [:field-id 1] 10]}}}))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

(deftest canonicalize-order-by-test
  (canonicalize-tests
    "ORDER BY: MBQL 95 [field direction] should get translated to MBQL 98+ [direction field]"
    {{:query {:order-by [[[:field-id 10] :asc]]}}
     {:query {:order-by [[:asc [:field-id 10]]]}}}

    "MBQL 95 old order-by names should be handled"
    {{:query {:order-by [[10 :ascending]]}}
     {:query {:order-by [[:asc [:field-id 10]]]}}}

    "field-id should be added if needed"
    {{:query {:order-by [[10 :asc]]}}
     {:query {:order-by [[:asc [:field-id 10]]]}}

     {:query {:order-by [[:asc 10]]}}
     {:query {:order-by [[:asc [:field-id 10]]]}}}


    "we should handle seqs no prob"
    {{:query {:order-by '((1 :ascending))}}
     {:query {:order-by [[:asc [:field-id 1]]]}}}

    "duplicate order-by clauses should get removed"
    {{:query {:order-by [[:asc [:field-id 1]]
                         [:desc [:field-id 2]]
                         [:asc 1]]}}
     {:query {:order-by [[:asc [:field-id 1]]
                         [:desc [:field-id 2]]]}}}))


;;; ------------------------------------------------- source queries -------------------------------------------------

(deftest canonicalize-source-queries-test
  (canonicalize-tests
    "Make sure canonicalization works correctly on source queries"
    {{:database 4
      :type     :query
      :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                :template-tags {"category" {:name         "category"
                                                            :display-name "Category"
                                                            :type         :text
                                                            :required     true
                                                            :default      "Widget"}}}}}
     {:database 4
      :type     :query
      :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10",
                                :template-tags {"category" {:name         "category"
                                                            :display-name "Category"
                                                            :type         :text
                                                            :required     true
                                                            :default      "Widget"}}}}}}

    "make sure we recursively canonicalize source queries"
    {{:database 4
      :type     :query
      :query    {:source-query {:source-table 1, :aggregation :rows}}}
     {:database 4
      :type     :query
      :query    {:source-query {:source-table 1, :aggregation []}}}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          WHOLE-QUERY TRANSFORMATIONS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest whole-query-transformations-test
  (tests 'perform-whole-query-transformations #'normalize/perform-whole-query-transformations
    {(str "If you specify a field in a breakout and in the Fields clause, we should go ahead and remove it from the "
          "Fields clause, because it is (obviously) implied that you should get that Field back.")
     {{:type  :query
       :query {:breakout [[:field-id 1] [:field-id 2]]
               :fields   [[:field-id 2] [:field-id 3]]}}
      {:type  :query
       :query {:breakout [[:field-id 1] [:field-id 2]]
               :fields   [[:field-id 3]]}}}

     "should work with FKs"
     {{:type  :query
       :query {:breakout [[:field-id 1]
                          [:fk-> [:field-id 2] [:field-id 4]]]
               :fields   [[:fk-> [:field-id 2] [:field-id 4]]
                          [:field-id 3]]}}
      {:type  :query
       :query {:breakout [[:field-id 1]
                          [:fk-> [:field-id 2] [:field-id 4]]]
               :fields   [[:field-id 3]]}}}

     "should work if the Field is bucketed in the breakout & in fields"
     {{:type  :query
       :query {:breakout [[:field-id 1]
                          [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
               :fields   [[:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]
                          [:field-id 3]]}}
      {:type  :query
       :query {:breakout [[:field-id 1]
                          [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
               :fields   [[:field-id 3]]}}}

     "should work if the Field is bucketed in the breakout but not in fields"
     {{:type  :query
       :query {:breakout [[:field-id 1]
                          [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
               :fields   [[:fk-> [:field-id 2] [:field-id 4]]
                          [:field-id 3]]}}
      {:type  :query
       :query {:breakout [[:field-id 1]
                          [:datetime-field [:fk-> [:field-id 2] [:field-id 4]] :month]]
               :fields   [[:field-id 3]]}}}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              REMOVE EMPTY CLAUSES                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest remove-empty-clauses-test
  (tests 'remove-empty-clauses #'normalize/remove-empty-clauses
    {"empty sequences should get removed"
     {{:x [], :y [100]}
      {:y [100]}}

     "nil values should get removed"
     {{:x nil, :y 100}
      {:y 100}}

     "sequences containing only nil should get removed"
     {{:a [nil 100], :b [nil nil]}
      {:a [nil 100]}}

     "empty maps should get removed"
     {{:a {:b 100}, :c {}}
      {:a {:b 100}}

      {:a {:b 100}, :c {:d nil}}
      {:a {:b 100}}}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest e2e-mbql-95-query-test
  (testing "With an ugly MBQL 95 query, does everything get normalized nicely?"
    (is (= {:type  :query
            :query {:source-table 10
                    :breakout     [[:field-id 10] [:field-id 20]]
                    :filter       [:= [:field-id 10] [:datetime-field [:field-id 20] :day]]
                    :order-by     [[:desc [:field-id 10]]]}}
           (normalize/normalize {:type  "query"
                                 :query {"source_table" 10
                                         "AGGREGATION"  "ROWS"
                                         "breakout"     [10 20]
                                         "filter"       ["and" ["=" 10 ["datetime-field" 20 "as" "day"]]]
                                         "order-by"     [[10 "desc"]]}})))))

(deftest e2e-native-query-with-params-test
  (testing "let's try doing the full normalization on a native query w/ params"
    (is (= {:native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
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
                           :value  ["BBQ" "Bakery" "Bar"]}]})))))

(deftest e2e-big-query-with-segments-test
  (testing "let's try normalizing a big query with SEGMENTS"
    (is (= {:database 1
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
                                       ["SEGMENT" 5]]}})))))

(deftest e2e-source-queries-test
  (testing "make sure source queries get normalized properly!"
    (is (= {:database 4
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
                                                                    :default      "Widget"}}}}})))))

(deftest e2e-rows-aggregation-test
  (testing "make sure `rows` aggregations get removed"
    (is (= {:database 4,
            :type     :query,
            :query    {:source-query {:source-table 1}}}
           (normalize/normalize
            {:database 4
             :type     :query
             :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}})))))

(deftest e2e-parameters-test
  (testing (str "make sure that parameters get normalized/canonicalized correctly. value should not get normalized, "
                "but type should; target should do canonicalization for MBQL clauses")
    (is (= {:type       :query,
            :query      {:source-table 1}
            :parameters [{:type :id, :target [:dimension [:fk-> [:field-id 3265] [:field-id 4575]]], :value ["field-id"]}
                         {:type :date/all-options, :target [:dimension [:field-id 3270]], :value "thismonth"}]}
           (normalize/normalize
            {:type       :query
             :query      {:source-table 1}
             :parameters [{:type "id", :target ["dimension" ["fk->" 3265 4575]], :value ["field-id"]}
                          {:type "date/all-options", :target ["dimension" ["field-id" 3270]], :value "thismonth"}]})))))

(deftest e2e-source-metadata-test
  (testing "make sure `:source-metadata` gets normalized the way we'd expect:"
    (testing "1. Type names should get converted to keywords"
      (is (= {:query {:source-metadata
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
                                                                                "average-length" 15.63}}}}]}}))))

    (testing (str "2. if `:source-metadata` is at the top-level, it should get moved to the correct location inside "
                  "the 'inner' MBQL query")
      (is (= {:query {:source-metadata
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
                                                                        "average-length" 15.63}}}}]}))))))

(deftest normalize-nil-values-in-native-maps-test
  (testing "nil values in native query maps (e.g. MongoDB queries) should not get removed during normalization.\n"
    (letfn [(test-normalization [native-query]
              (let [native-source-query (set/rename-keys native-query {:query :native})]
                (doseq [[message query] {"top-level native query"
                                         {:native native-query}

                                         "native source query"
                                         {:query {:source-query native-source-query}}

                                         "native source query in join"
                                         {:query {:joins [{:source-query native-source-query}]}}}]
                  (testing (str "\n" message)
                    (is (= query
                           (normalize/normalize query)))))))]

      (testing "Keys in native query maps should not get normalized"
        (test-normalization
         {:projections [:count]
          :query       [{"$project" {"price" "$price"}}
                        {"$match" {"price" {"$eq" 1}}}
                        {"$group" {"_id" nil, "count" {"$sum" 1}}}
                        {"$sort" {"_id" 1}}
                        {"$project" {"_id" false, "count" true}}]
          :collection  "venues"}))

      (testing "`nil` values inside native :params shouldn't get removed"
        (test-normalization {:query "SELECT ?" :params [nil]})))))

(deftest empty-test
  (testing "test a query with :is-empty"
    (is (= {:query {:filter [:and
                             [:> [:field-id 4] 1]
                             [:is-empty [:field-id 7]]
                             [:= [:field-id 5] "abc"]
                             [:between [:field-id 9] 0 25]]}}
           (#'normalize/canonicalize {:query {:filter [:and
                                                       [:> [:field-id 4] 1]
                                                       [:is-empty [:field-id 7]]
                                                       [:and
                                                        [:= [:field-id 5] "abc"]
                                                        [:between [:field-id 9] 0 25]]]}})))))

