(ns metabase.mbql.normalize-test
  (:require [clojure.set :as set]
            [clojure.test :refer :all]
            [metabase.mbql.normalize :as normalize]
            [metabase.util :as u]))

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
     {:order-by [[:desc [:field-literal "SALES/TAX" :type/Number]]]}}

    "modern :field clauses should get normalized"
    {[:field 2 {"temporal-unit" "day"}]
     [:field 2 {:temporal-unit :day}]

     [:field 2 {"binning" {"strategy" "default"}}]
     [:field 2 {:binning {:strategy :default}}]}))


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
      :query    {:source-query {:source-table 1, :aggregation :rows}}}}

    "Don't keywordize keys that aren't present in template tag maps"
    {{:database 1
      :type     :native
      :native   {:template-tags {"x" {}}}}

     {:database 1
      :type     :native
      :native   {:template-tags {"x" {}}}}}))



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
    (doseq [input [10 [:field 10 nil]]]
      (testing (pr-str (list 'wrap-implicit-field-id input))
        (is (= [:field 10 nil]
               (#'normalize/wrap-implicit-field-id input)))))
    (testing "Leave legacy clauses as-is; we'll replace them elsewhere"
      (is (= [:field-id 10]
             (#'normalize/wrap-implicit-field-id [:field-id 10]))))))

(deftest canonicalize-field-test
  (canonicalize-tests
    "If someone accidentally nests `:field` clauses, we should fix it for them."
    {{:query {:fields [[:field [:field 1 {:a 100, :b 200}] {:b 300}]]}}
     {:query {:fields [[:field 1 {:a 100, :b 300}]]}}

     {:query {:fields [[:field [:field [:field 1 {:a 100, :b 200}] {:b 300}] {:a 400, :c 500}]]}}
     {:query {:fields [[:field 1 {:a 400, :b 300, :c 500}]]}}}

    "We should remove empty options maps"
    {[:field 2 {}]
     [:field 2 nil]}))


;;; ------------------------------------------------ binning strategy ------------------------------------------------

(deftest canonicalize-binning-strategy-test
  (canonicalize-tests
    "make sure `binning-strategy` wraps implicit Field IDs"
    {{:query {:breakout [[:binning-strategy 10 :bin-width 2000]]}}
     {:query {:breakout [[:field 10 {:binning {:strategy :bin-width, :bin-width 2000}}]]}}}))


;;; -------------------------------------------------- aggregation ---------------------------------------------------

(deftest canonicalize-aggregations-test
  (canonicalize-tests
    "field ID should get wrapped in field-id and ags should be converted to multiple ag syntax"
    {{:query {:aggregation [:count 10]}}
     {:query {:aggregation [[:count [:field 10 nil]]]}}}

    "ag with no Field ID"
    {{:query {:aggregation [:count]}}
     {:query {:aggregation [[:count]]}}}

    "if already wrapped in field-id it's ok"
    {{:query {:aggregation [:count [:field-id 1000]]}}
     {:query {:aggregation [[:count [:field 1000 nil]]]}}}

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
     {:query {:aggregation [[:count [:field 10 nil]]]}}}

    "make sure for multiple aggregations we can handle `:count` that doesn't appear wrapped in brackets"
    {{:query {:aggregation [:count [:sum 10]]}}
     {:query {:aggregation [[:count] [:sum [:field 10 nil]]]}}}

    (str "this doesn't make sense, but make sure if someone specifies a `:rows` ag and another one we don't end up "
         "with a `nil` in the ags list")
    {{:query {:aggregation [:rows :count]}}
     {:query {:aggregation [[:count]]}}}

    "another stupid aggregation that we need to be able to handle"
    {{:query {:aggregation [:count :count]}}
     {:query {:aggregation [[:count] [:count]]}}}

    "a mix of unwrapped & wrapped should still work"
    {{:query {:aggregation [:count [:sum 10] [:count 20] :count]}}
     {:query {:aggregation [[:count] [:sum [:field 10 nil]] [:count [:field 20 nil]] [:count]]}}}

    "legacy `:named` aggregation clauses should get converted to `:aggregation-options`"
    {{:query {:aggregation [:named [:sum 10] "Sum *TEN*"]}}
     {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:display-name "Sum *TEN*"}]]}}

     {:query {:aggregation [:named [:sum 10] "Sum *TEN*" {:use-as-display-name? false}]}}
     {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:name "Sum *TEN*"}]]}}}

    "subclauses of `:aggregation-options` should get canonicalized correctly"
    {{:query {:aggregation [[:aggregation-options [:sum 10] {}]]}}
     {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {}]]}}}

    "make sure expression aggregations work correctly"
    {{:query {:aggregation [:+ [:sum 10] 2]}}
     {:query {:aggregation [[:+ [:sum [:field 10 nil]] 2]]}}

     {:query {:aggregation [:+ [:sum 10] [:* [:sum 20] [:sum 30]]]}}
     {:query {:aggregation [[:+ [:sum [:field 10 nil]] [:* [:sum [:field 20 nil]] [:sum [:field 30 nil]]]]]}}}

    "expression ags should handle varargs"
    {{:query {:aggregation [[:+ [:sum 10] [:sum 20] [:sum 30]]]}}
     {:query {:aggregation [[:+ [:sum [:field 10 nil]] [:sum [:field 20 nil]] [:sum [:field 30 nil]]]]}}}

    "METRICS shouldn't get canonicalized in some kind of wacky way"
    {{:query {:aggregation [:+ [:metric 1] 2]}}
     {:query {:aggregation [[:+ [:metric 1] 2]]}}}

    "can cumulative-count be handled with or without a Field?"
    {{:query {:aggregation [:cum-count]}}
     {:query {:aggregation [[:cum-count]]}}

     {:query {:aggregation [:cum-count 10]}}
     {:query {:aggregation [[:cum-count [:field 10 nil]]]}}}

    "should handle seqs without a problem"
    {{:query {:aggregation '([:min 1] [:min 2])}}
     {:query {:aggregation [[:min [:field 1 nil]] [:min [:field 2 nil]]]}}}

    "make sure canonicalization can handle aggregations with expressions where the Field normally goes"
    {{:query {:aggregation [[:sum [:* [:field-id 4] [:field-id 1]]]]}}
     {:query {:aggregation [[:sum [:* [:field 4 nil] [:field 1 nil]]]]}}

     {:query {:aggregation [[:sum [:* [:field 4 nil] [:field 1 nil]]]]}}
     {:query {:aggregation [[:sum [:* [:field 4 nil] [:field 1 nil]]]]}}}

    "Make sure `:case`  expressions get canonicalized correctly"
    {{:query {:aggregation [:sum [:case [[[:< [:field-id 37331] 2] 2] [[:< [:field-id 37331] 4] 1]]]]}}
     {:query {:aggregation [[:sum [:case [[[:< [:field 37331 nil] 2] 2] [[:< [:field 37331 nil] 4] 1]]]]]}}}

    ":percentile"
    {{:query {:aggregation [[:percentile [:field-id 37809] 0.9]]}}
     {:query {:aggregation [[:percentile [:field 37809 nil] 0.9]]}}}))


;;; ---------------------------------------------------- breakout ----------------------------------------------------

(deftest canonicalize-breakout-test
  (canonicalize-tests
    "implicit Field IDs should get wrapped in [:field-id] in :breakout"
    {{:query {:breakout [10]}}
     {:query {:breakout [[:field 10 nil]]}}

     {:query {:breakout [10 20]}}
     {:query {:breakout [[:field 10 nil] [:field 20 nil]]}}}

    "should handle seqs"
    {{:query {:breakout '(10 20)}}
     {:query {:breakout [[:field 10 nil] [:field 20 nil]]}}

     {:query {:breakout [[:field-id 1000]]}}
     {:query {:breakout [[:field 1000 nil]]}}

     {:query {:breakout [[:field 1000 nil]]}}
     {:query {:breakout [[:field 1000 nil]]}}}))


;;; ----------------------------------------------------- fields -----------------------------------------------------

(deftest canonicalize-fields-test
  (canonicalize-tests
    "implicit Field IDs should get wrapped in [:field-id] in :fields"
    {{:query {:fields [10]}}
     {:query {:fields [[:field 10 nil]]}}

     {:query {:fields [10 20]}}
     {:query {:fields [[:field 10 nil] [:field 20 nil]]}}

     {:query {:fields [[:field-id 1000]]}}
     {:query {:fields [[:field 1000 nil]]}}}

    "should handle seqs"
    {{:query {:fields '(10 20)}}
     {:query {:fields [[:field 10 nil] [:field 20 nil]]}}}))


;;; ----------------------------------------------------- filter -----------------------------------------------------

(deftest canonicalize-filter-test
  (canonicalize-tests
    "implicit Field IDs should get wrapped in [:field-id] in filters"
    {{:query {:filter [:= 10 20]}}
     {:query {:filter [:= [:field 10 nil] 20]}}

     {:query {:filter [:and [:= 10 20] [:= 20 30]]}}
     {:query {:filter [:and [:= [:field 10 nil] 20] [:= [:field 20 nil] 30]]}}

     {:query {:filter [:between 10 20 30]}}
     {:query {:filter [:between [:field 10 nil] 20 30]}}}

    "`:inside` filters should get implict Field IDs for the first two args"
    {{:query {:filter [:inside 1 2 90 -90 90 -90]}}
     {:query {:filter [:inside [:field 1 nil] [:field 2 nil] 90 -90 90 -90]}}}

    "compound filters with only one arg should get automatically de-compounded"
    {{:query {:filter [:and [:= 100 2]]}}
     {:query {:filter [:= [:field 100 nil] 2]}}

     {:query {:filter [:or [:= 100 2]]}}
     {:query {:filter [:= [:field 100 nil] 2]}}}

    "compound filters should \"pull-up\" any args that are the same compound filter"
    {{:query {:filter [:and
                       [:and
                        [:= [:field-id 100] 1]
                        [:= [:field-id 200] 2]]
                       [:and
                        [:= [:field-id 300] 3]
                        [:= [:field-id 400] 4]]]}}
     {:query {:filter [:and
                       [:= [:field 100 nil] 1]
                       [:= [:field 200 nil] 2]
                       [:= [:field 300 nil] 3]
                       [:= [:field 400 nil] 4]]}}

     {:query {:filter [:and
                       [:> [:field-id 4] 1]
                       [:is-null [:field-id 7]]
                       [:and
                        [:= [:field-id 5] "abc"]
                        [:between [:field-id 9] 0 25]]]}}
     {:query {:filter [:and
                       [:> [:field 4 nil] 1]
                       [:is-null [:field 7 nil]]
                       [:= [:field 5 nil] "abc"]
                       [:between [:field 9 nil] 0 25]]}}

     {:query {:filter [:or
                       [:or
                        [:= 100 1]
                        [:= 200 2]]
                       [:or
                        [:= [:field-id 300] 3]
                        [:= [:field-id 400] 4]]]}}
     {:query {:filter [:or
                       [:= [:field 100 nil] 1]
                       [:= [:field 200 nil] 2]
                       [:= [:field 300 nil] 3]
                       [:= [:field 400 nil] 4]]}}

     {:query {:filter [:or
                       [:> [:field-id 4] 1]
                       [:is-null [:field-id 7]]
                       [:or
                        [:= [:field-id 5] "abc"]
                        [:between [:field-id 9] 0 25]]]}}
     {:query {:filter [:or
                       [:> [:field 4 nil] 1]
                       [:is-null [:field 7 nil]]
                       [:= [:field 5 nil] "abc"]
                       [:between [:field 9 nil] 0 25]]}}}

    "not inside of a not should get elimated entirely"
    {{:query {:filter [:not [:not [:= [:field-id 100] 1]]]}}
     {:query {:filter [:= [:field 100 nil] 1]}}}

    "make sure we don't overwrite options if specified"
    {{:query {:filter [:contains 10 "ABC" {:case-sensitive false}]}}
     {:query {:filter [:contains [:field 10 nil] "ABC" {:case-sensitive false}]}}}

    "or for time-interval options"
    {[:time-interval 10 -30 :day {:include-current true}]
     [:time-interval [:field 10 nil] -30 :day {:include-current true}]}

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
                  [:time-interval [:field 6851 nil] -365 :day {}]]}}}

    "should handle seqs"
    {{:query {:filter '(:and
                        [:= 100 1]
                        [:= 200 2])}}
     {:query {:filter [:and [:= [:field 100 nil] 1] [:= [:field 200 nil] 2]]}}}

    "if you put a `:datetime-field` inside a `:time-interval` we should fix it for you"
    {{:query {:filter [:time-interval [:datetime-field [:field-id 8] :month] -30 :day]}}
     {:query {:filter [:time-interval [:field 8 nil] -30 :day]}}}

    "fk-> clauses should get the field-id treatment"
    {{:query {:filter [:= [:fk-> 10 20] "ABC"]}}
     {:query {:filter [:= [:field 20 {:source-field 10}] "ABC"]}}}

    "as should datetime-field clauses..."
    {{:query {:filter [:= [:datetime-field 10 :day] "2018-09-05"]}}
     {:query {:filter [:= [:field 10 {:temporal-unit :day}] "2018-09-05"]}}}

    "MBQL 95 datetime-field clauses ([:datetime-field <field> :as <unit>]) should get converted to MBQL 2000"
    {{:query {:filter [:= [:datetime-field 10 :as :day] "2018-09-05"]}}
     {:query {:filter [:= [:field 10 {:temporal-unit :day}] "2018-09-05"]}}}

    "if someone is dumb and passes something like a field-literal inside a field-id, fix it for them."
    {{:query {:filter [:= [:field-id [:field-literal "my_field" "type/Number"]] 10]}}
     {:query {:filter [:= [:field "my_field" {:base-type "type/Number"}] 10]}}}

    "we should fix :field-ids inside :field-ids too"
    {{:query {:filter [:= [:field-id [:field-id 1]] 10]}}
     {:query {:filter [:= [:field 1 nil] 10]}}}

    "we should handle seqs no prob"
    {{:query {:filter '(:= 1 10)}}
     {:query {:filter [:= [:field 1 nil] 10]}}}))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

(deftest canonicalize-order-by-test
  (canonicalize-tests
    "ORDER BY: MBQL 95 [field direction] should get translated to MBQL 98+ [direction field]"
    {{:query {:order-by [[[:field-id 10] :asc]]}}
     {:query {:order-by [[:asc [:field 10 nil]]]}}}

    "MBQL 95 old order-by names should be handled"
    {{:query {:order-by [[10 :ascending]]}}
     {:query {:order-by [[:asc [:field 10 nil]]]}}}

    "field-id should be added if needed"
    {{:query {:order-by [[10 :asc]]}}
     {:query {:order-by [[:asc [:field 10 nil]]]}}

     {:query {:order-by [[:asc 10]]}}
     {:query {:order-by [[:asc [:field 10 nil]]]}}}


    "we should handle seqs no prob"
    {{:query {:order-by '((1 :ascending))}}
     {:query {:order-by [[:asc [:field 1 nil]]]}}}

    "duplicate order-by clauses should get removed"
    {{:query {:order-by [[:asc [:field-id 1]]
                         [:desc [:field-id 2]]
                         [:asc 1]]}}
     {:query {:order-by [[:asc [:field 1 nil]]
                         [:desc [:field 2 nil]]]}}}))


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
       :query {:breakout [[:field 1 nil] [:field 2 nil]]
               :fields   [[:field 2 nil] [:field 3 nil]]}}
      {:type  :query
       :query {:breakout [[:field 1 nil] [:field 2 nil]]
               :fields   [[:field 3 nil]]}}}

     "should work with FKs"
     {{:type  :query
       :query {:breakout [[:field 1 nil]
                          [:field 4 {:source-field 2}]]
               :fields   [[:field 4 {:source-field 2}]
                          [:field 3 nil]]}}
      {:type  :query
       :query {:breakout [[:field 1 nil]
                          [:field 4 {:source-field 2}]]
               :fields   [[:field 3 nil]]}}}

     "should work if the Field is bucketed in the breakout & in fields"
     {{:type  :query
       :query {:breakout [[:field 1 nil]
                          [:field 4 {:source-field 2, :temporal-unit :month}]]
               :fields   [[:field 4 {:source-field 2, :temporal-unit :month}]
                          [:field 3 nil]]}}
      {:type  :query
       :query {:breakout [[:field 1 nil]
                          [:field 4 {:source-field 2, :temporal-unit :month}]]
               :fields   [[:field 3 nil]]}}}

     "should work if the Field is bucketed in the breakout but not in fields"
     {{:type  :query
       :query {:breakout [[:field 1 nil]
                          [:field 4 {:source-field 2, :temporal-unit :month}]]
               :fields   [[:field 4 {:source-field 2}]
                          [:field 3 nil]]}}
      {:type  :query
       :query {:breakout [[:field 1 nil]
                          [:field 4 {:source-field 2, :temporal-unit :month}]]
               :fields   [[:field 3 nil]]}}}}))


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

(deftest remove-empty-options-from-field-clause-test
  (tests 'remove-empty-clauses #'normalize/remove-empty-clauses
    {"We should remove empty options maps"
     {[:field 2 {}]
      [:field 2 nil]

      [:field 2 {:binning {}}]
      [:field 2 nil]}

     "We should remove nil keys from options maps"
     {[:field 2 {:join-alias nil}]
      [:field 2 nil]

      [:field 2 {:binning {:strategy nil}}]
      [:field 2 nil]}

     "Don't remove false values from options map"
     {[:field 2 {:x false}]
      [:field 2 {:x false}]}

     "Remove empty sequences from options map"
     {[:field 2 {:x []}]
      [:field 2 nil]

      [:field 2 {:x [{:y nil}]}]
      [:field 2 nil]}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest e2e-mbql-95-query-test
  (testing "With an ugly MBQL 95 query, does everything get normalized nicely?"
    (is (= {:type  :query
            :query {:source-table 10
                    :breakout     [[:field 10 nil] [:field 20 nil]]
                    :filter       [:= [:field 10 nil] [:field 20 {:temporal-unit :day}]]
                    :order-by     [[:desc [:field 10 nil]]]}}
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
                                                       :dimension    [:field 49 nil]}}}
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
                                      [:= [:field 3 nil] "Toucan-friendly"]
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
    (is (= {:database 4
            :type     :query
            :query    {:source-query {:source-table 1}}}
           (normalize/normalize
            {:database 4
             :type     :query
             :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}})))))

(deftest e2e-parameters-test
  (testing (str "make sure that parameters get normalized/canonicalized correctly. value should not get normalized, "
                "but type should; target should do canonicalization for MBQL clauses")
    (is (= {:type       :query
            :query      {:source-table 1}
            :parameters [{:type :id, :target [:dimension [:field 4575 {:source-field 3265}]], :value ["field-id"]}
                         {:type :date/all-options, :target [:dimension [:field 3270 nil]], :value "thismonth"}]}
           (normalize/normalize
            {:type       :query
             :query      {:source-table 1}
             :parameters [{:type "id", :target ["dimension" ["fk->" 3265 4575]], :value ["field-id"]}
                          {:type "date/all-options", :target ["dimension" ["field-id" 3270]], :value "thismonth"}]})))))

(deftest e2e-source-metadata-test
  (testing "make sure `:source-metadata` gets normalized the way we'd expect:"
    (testing "1. Type names should get converted to keywords"
      (is (= {:query {:source-metadata
                      [{:name          "name"
                        :display_name  "Name"
                        :base_type     :type/Text
                        :semantic_type :type/Name
                        :fingerprint   {:global {:distinct-count 100}
                                        :type   {:type/Text {:percent-json   0.0
                                                             :percent-url    0.0
                                                             :percent-email  0.0
                                                             :average-length 15.63}}}}]}}
             (normalize/normalize
              {:query {:source-metadata [{:name          "name"
                                          :display_name  "Name"
                                          :description   nil
                                          :base_type     "type/Text"
                                          :semantic_type "type/Name"
                                          :fingerprint   {"global" {"distinct-count" 100}
                                                          "type"   {"type/Text" {"percent-json"   0.0
                                                                                 "percent-url"    0.0
                                                                                 "percent-email"  0.0
                                                                                 "average-length" 15.63}}}}]}}))))

    (testing (str "2. if `:source-metadata` is at the top-level, it should get moved to the correct location inside "
                  "the 'inner' MBQL query")
      (is (= {:query {:source-metadata
                      [{:name          "name"
                        :display_name  "Name"
                        :base_type     :type/Text
                        :semantic_type :type/Name
                        :fingerprint   {:global {:distinct-count 100}
                                        :type   {:type/Text {:percent-json   0.0
                                                             :percent-url    0.0
                                                             :percent-email  0.0
                                                             :average-length 15.63}}}}]}}
             (normalize/normalize
              {:source-metadata [{:name          "name"
                                  :display_name  "Name"
                                  :description   nil
                                  :base_type     "type/Text"
                                  :semantic_type "type/Name"
                                  :fingerprint   {"global" {"distinct-count" 100}
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
                             [:> [:field 4 nil] 1]
                             [:is-empty [:field 7 nil]]
                             [:= [:field 5 nil] "abc"]
                             [:between [:field 9 nil] 0 25]]}}
           (#'normalize/canonicalize {:query {:filter [:and
                                                       [:> [:field-id 4] 1]
                                                       [:is-empty [:field-id 7]]
                                                       [:and
                                                        [:= [:field-id 5] "abc"]
                                                        [:between [:field-id 9] 0 25]]]}})))))

(deftest modernize-fields-test
  (testing "some extra tests for Field clause canonicalization to the modern `:field` clause."
    (doseq [[form expected] {[:=
                              [:datetime-field [:joined-field "source" [:field-id 100]] :month]
                              "2021-02-18"]
                             [:= [:field 100 {:join-alias "source", :temporal-unit :month}] "2021-02-18"]

                             [:binning-strategy [:field-id 1] :default]
                             [:field 1 {:binning {:strategy :default}}]

                             [:binning-strategy [:field 1] :bin-width]
                             [:field 1 {:binning {:strategy :bin-width}}]}]
      (testing (u/pprint-to-str form)
        (is (= expected
               (#'normalize/canonicalize-mbql-clauses form)))))))

(deftest modernize-fields-e2e-test
  (testing "Should be able to modernize legacy MBQL '95 Field clauses"
    (is (= {:database 1
            :type     :query
            :query    {:source-table 3
                       :breakout     [[:field 11 {:temporal-unit :month}]]
                       :aggregation  [[:count]]}}
           (normalize/normalize
            {:database 1
             :type     :query
             :query    {:source-table 3
                        :breakout     [[:datetime-field 11 :month]]
                        :aggregation  [[:count]]}}))))

  (testing "Fixes for stuff like old-style breakout with a single clause should still work with the new `:field` clause"
    (is (= {:database 1
            :type     :query
            :query    {:filter       [:> [:field "count" {:base-type :type/Integer}] 5]
                       :source-query {:source-table 2
                                      :aggregation  [[:count]]
                                      :breakout     [[:field 3 {:temporal-unit :month, :source-field 4}]]}}}
           (normalize/normalize
            {:database 1
             :type     :query
             :query    {:filter       [:> [:field "count" {:base-type :type/Integer}] 5]
                        :source-query {:source-table 2
                                       :aggregation  [[:count]]
                                       :breakout     [:field 3 {:temporal-unit :month, :source-field 4}]}}})))))

(deftest normalize-fragment-test
  (testing "normalize-fragment"
    (testing "shouldn't try to do anything crazy non-standard MBQL clauses like `:dimension` (from automagic dashboards)"
      (is (= [:time-interval [:dimension "JoinDate"] -30 :day]
             (normalize/normalize-fragment [:query :filter]
               ["time-interval" ["dimension" "JoinDate"] -30 "day"]))))

    (testing "should be able to modernize Fields anywhere we find them"
      (is (= [[:> [:field 1 nil] 3]
              [:and
               [:= [:field 2 nil] 2]
               [:segment 1]]
              [:metric 1]]
             (normalize/normalize-fragment nil
               [[:> [:field-id 1] 3]
                ["and" [:= ["FIELD-ID" 2] 2]
                 ["segment" 1]]
                [:metric 1]]))))

    (testing "Should be able to modern Field options anywhere"
      (is (= [:field 2 {:temporal-unit :day}]
             (normalize/normalize-fragment nil
               [:field 2 {"temporal-unit" "day"}]))))))

(deftest normalize-source-metadata-test
  (testing "normalize-source-metadata"
    (testing "should convert legacy field_refs to modern `:field` clauses"
      (is (= {:field_ref [:field 1 {:temporal-unit :month}]}
             (normalize/normalize-source-metadata
              {:field_ref ["datetime-field" ["field-id" 1] "month"]}))))
    (testing "should correctly keywordize Field options"
      (is (= {:field_ref [:field 1 {:temporal-unit :month}]}
             (normalize/normalize-source-metadata
              {:field_ref ["field" 1 {:temporal-unit "month"}]}))))))

(deftest do-not-normalize-fingerprints-test
  (testing "Numbers in fingerprints shouldn't get normalized"
    (let [fingerprint {:global {:distinct-count 1, :nil% 0}
                       :type   {:type/Number {:min 1
                                              :q1  1
                                              :q3  1
                                              :max 1
                                              :sd  0
                                              :avg 1}}}]
      (is (= fingerprint
             (normalize/normalize fingerprint)))
      (let [query {:query
                   {:source-query
                    {:native     "SELECT USER_ID FROM ORDERS LIMIT 1"
                     :parameters [{:type   :category
                                   :target [:variable [:template-tag "sandbox"]]
                                   :value  "1"}]}
                    :database        1
                    :source-metadata [{:name          "USER_ID"
                                       :display_name  "USER_ID"
                                       :base_type     :type/Integer
                                       :field_ref     [:field "USER_ID" {:base-type :type/Integer}]
                                       :fingerprint   fingerprint}]}}]
        (is (= query
               (normalize/normalize query)))))))

(deftest error-messages-test
  (testing "Normalization error messages should be sane"
    (let [bad-query {:database 1
                     :type     :native
                     :native   {:template-tags {100 [:field-id "WOW"]}}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Error normalizing query"
           (normalize/normalize bad-query)))
      (let [e (try
                (normalize/normalize bad-query)
                nil
                (catch Throwable e
                  e))]
        (testing "Should have meaningful ex-data"
          (is (instance? clojure.lang.ExceptionInfo e))
          (is (= {:query bad-query}
                 (ex-data e))))
        (testing "\nParent exception(s) should be even more specific"
          (let [cause (some-> ^Throwable e .getCause)]
            (is (= "Error normalizing form."
                   (.getMessage cause)))
            (is (= {:form       bad-query
                    :path       []
                    :special-fn nil}
                   (ex-data cause)))))))))
