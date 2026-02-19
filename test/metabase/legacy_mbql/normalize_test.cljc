(ns metabase.legacy-mbql.normalize-test
  {:clj-kondo/config '{:linters {:deprecated-var {:level :off}}}}
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.set :as set]
   [clojure.test :refer [are deftest is testing]]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- tests [_f-symb f group->input->expected]
  (doseq [[group input->expected] group->input->expected]
    (testing group
      (doseq [[input expected] input->expected]
        (testing (str "\n" (pr-str (list f input)))
          (is (= expected
                 (f input))))))))

(defn- normalize-tests
  "Convenience for generating a bunch normalization tests. Args should alternate a [[t/testing]] context string and maps
  of input query -> expected normalized query."
  [& {:as group-and-input->expected-pairs}]
  (tests 'normalize #'mbql.normalize/normalize group-and-input->expected-pairs))

(deftest ^:parallel normalize-test
  (testing "Query type should get normalized"
    (is (= {:type :native}
           (mbql.normalize/normalize {:type "NATIVE"})))))

(deftest ^:parallel normalize-test-2
  (testing "native queries should NOT get normalized"
    (is (= {:type :native, :native {:query "SELECT COUNT(*) FROM CANS;"}}
           (mbql.normalize/normalize {:type "NATIVE", :native {"QUERY" "SELECT COUNT(*) FROM CANS;"}})))
    (let [query {:native {:query {:NAME        "FAKE_QUERY"
                                  :description "Theoretical fake query in a JSON-based query lang"}}}]
      (is (= query
             (mbql.normalize/normalize query))))))

(deftest ^:parallel normalize-test-3
  (testing "METRICS shouldn't get normalized in some kind of wacky way"
    (is (= {:aggregation [[:+ [:metric 10] 1]]}
           (mbql.normalize/normalize ::mbql.s/MBQLQuery {:aggregation ["+" ["METRIC" 10] 1]})))))

;; TODO (Tamas 2026-01-05): Remove this test once FE tests switch to using MBQL5
(deftest ^:parallel normalize-measure-test
  (testing "MEASURES shouldn't get normalized in some kind of wacky way"
    (is (= {:aggregation [[:+ [:measure 10] 1]]}
           (mbql.normalize/normalize ::mbql.s/MBQLQuery {:aggregation ["+" ["MEASURE" 10] 1]})))))

(deftest ^:parallel normalize-test-4
  (testing "Nor should SEGMENTS"
    (is (= {:filter [:= [:+ [:segment 10] 1] 10]}
           (mbql.normalize/normalize ::mbql.s/MBQLQuery {:filter ["=" ["+" ["SEGMENT" 10] 1] 10]})))))

(deftest ^:parallel normalize-test-5
  (testing "field literals should be exempt too"
    (is (= {:order-by [[:desc [:field "SALES_TAX" {:base-type :type/Number}]]]}
           (mbql.normalize/normalize ::mbql.s/MBQLQuery {:order-by [[:desc [:field-literal "SALES_TAX" :type/Number]]]})))))

(deftest ^:parallel normalize-test-6
  (testing "... but they should be converted to strings if passed in as a KW for some reason"
    (is (= {:order-by [[:desc [:field "SALES/TAX" {:base-type :type/Number}]]]}
           (mbql.normalize/normalize ::mbql.s/MBQLQuery {:order-by [[:desc ["field_literal" :SALES/TAX "type/Number"]]]})))))

(deftest ^:parallel normalize-test-7
  (testing "modern :field clauses should get normalized"
    (are [x expected] (= expected
                         (mbql.normalize/normalize ::mbql.s/field x))
      [:field 2 {"temporal-unit" "day"}]
      [:field 2 {:temporal-unit :day}]

      [:field 2 {"inherited-temporal-unit" "day"}]
      [:field 2 {:inherited-temporal-unit :day}]

      [:field 2 {"binning" {"strategy" "default"}}]
      [:field 2 {:binning {:strategy :default}}])))

(deftest ^:parallel normalize-test-8
  (testing ":value clauses should keep snake_case keys in the options (#23354)"
    (let [clause [:value "some value" {:some_key "some key value"}]]
      (is (= clause
             (mbql.normalize/normalize ::mbql.s/value [:value "some value" {:some_key "some key value"}]))))))

(deftest ^:parallel normalize-test-9
  (testing ":value clauses should keep snake_case keys in the type info args (#23354)"
    (is (= [:value "some value" {:base_type :type/Text}]
           (mbql.normalize/normalize ::mbql.s/value [:value "some value" {"base_type" "type/Text"}])))))

(deftest ^:parallel normalize-test-10
  (testing "nil options in aggregation and expression references should be removed"
    (is (= [:aggregation 0]
           (mbql.normalize/normalize ::mbql.s/aggregation [:aggregation 0 nil])
           (mbql.normalize/normalize ::mbql.s/aggregation [:aggregation 0 {}])))
    (is (= [:expression "CE"]
           (mbql.normalize/normalize ::mbql.s/expression [:expression "CE" nil])
           (mbql.normalize/normalize ::mbql.s/expression [:expression "CE" {}])))))

(deftest ^:parallel normalize-aggregations-test
  (normalize-tests
   "Legacy 'rows' aggregations"
   {{:query {"AGGREGATION" "ROWS"}}
    {:query {}}

    {:query {"AGGREGATION" ["ROWS"]}}
    {:query {}}}))

(deftest ^:parallel normalize-aggregations-test-2
  (normalize-tests
   "Other uppercase tokens"
   {{:query {"AGGREGATION" ["COUNT" 10]}}
    {:query {:aggregation [[:count [:field 10 nil]]]}}

    {:query {"AGGREGATION" [["COUNT" 10]]}}
    {:query {:aggregation [[:count [:field 10 nil]]]}}}))

(deftest ^:parallel normalize-aggregations-test-3
  (normalize-tests
   "make sure we normalize ag tokens properly when there's wacky MBQL 2 ag syntax"
   {{:query {:aggregation ["rows" "count"]}}
    {:query {:aggregation [[:count]]}}

    {:query {:aggregation ["count" "count"]}}
    {:query {:aggregation [[:count] [:count]]}}}))

(deftest ^:parallel normalize-aggregations-test-4
  (normalize-tests
   "don't normalize names of expression refs!"
   {{:query {:aggregation [["count"] ["count" ["expression" "ABCDEF"]]]}}
    {:query {:aggregation [[:count]
                           [:count [:expression "ABCDEF"]]]}}}))

(deftest ^:parallel normalize-aggregations-test-5
  (normalize-tests
   "make sure binning-strategy clauses get normalized the way we'd expect"
   {{:query {:breakout [["BINNING_STRATEGY" 10 "BIN-WIDTH" 2000]]}}
    {:query {:breakout [[:field 10 {:binning {:strategy :bin-width, :bin-width 2000}}]]}}}))

(deftest ^:parallel normalize-aggregations-test-6
  (normalize-tests
   "or field literals!"
   {{:query {:aggregation [["count"] ["count" ["field_literal" "ABCDEF" "type/Text"]]]}}
    {:query {:aggregation [[:count]
                           [:count [:field "ABCDEF" {:base-type :type/Text}]]]}}}))

(deftest ^:parallel normalize-aggregations-test-7
  (normalize-tests
   "event if you try your best to break things it should handle it"
   {{:query {:aggregation [["count"] ["sum" 10] ["count" 20] ["count"]]}}
    {:query {:aggregation [[:count]
                           [:sum   [:field 10 nil]]
                           [:count [:field 20 nil]]
                           [:count]]}}}))

(deftest ^:parallel normalize-aggregations-test-8
  (normalize-tests
   "try an ag that is named using legacy `:named` clause"
   {{:query {:aggregation ["named" ["SuM" 10] "My COOL AG"]}}
    {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:display-name "My COOL AG"}]]}}

    {:query {:aggregation ["named" ["SuM" 10] "My COOL AG" {:use-as-display-name? false}]}}
    {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:name "My COOL AG"}]]}}}))

(deftest ^:parallel normalize-aggregations-test-9
  (normalize-tests
   "try w/ `:aggregation-options`, the replacement for `:named`"
   {{:query {:aggregation ["aggregation_options" ["SuM" 10] {"display_name" "My COOL AG"}]}}
    {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:display-name "My COOL AG"}]]}}}))

(deftest ^:parallel normalize-aggregations-test-10
  (normalize-tests
   "try an expression ag"
   {{:query {:aggregation ["+" ["sum" 10] ["*" ["SUM" 20] 3]]}}
    {:query {:aggregation [[:+
                            [:sum [:field 10 nil]]
                            [:* [:sum [:field 20 nil]] 3]]]}}}))

(deftest ^:parallel normalize-aggregations-test-11
  (normalize-tests
   "expression ags should handle varargs"
   {{:query {:aggregation ["+" ["sum" 10] ["SUM" 20] ["sum" 30]]}}
    {:query {:aggregation [[:+
                            [:sum [:field 10 nil]]
                            [:sum [:field 20 nil]]
                            [:sum [:field 30 nil]]]]}}}))

(deftest ^:parallel normalize-aggregations-test-12
  (normalize-tests
   "expression references should be exempt too"
   {{:query {:order-by [[:desc [:expression "SALES_TAX"]]]}}
    {:query {:order-by [[:desc [:expression "SALES_TAX"]]]}}}))

(deftest ^:parallel normalize-aggregations-test-13
  (normalize-tests
   "... but they should be converted to strings if passed in as a KW for some reason. Make sure we preserve namespace!"
   {{:query {:order-by [[:desc ["expression" :SALES/TAX]]]}}
    {:query {:order-by [[:desc [:expression "SALES/TAX"]]]}}}))

(deftest ^:parallel normalize-aggregations-test-14
  (normalize-tests
   "case"
   {{:query
     {:aggregation
      ["sum"
       ["case"
        [[[">" ["field-id" 12] 10] 10]
         [[">" ["field-id" 12] 100] ["field-id" 1]]
         [["=" ["field-id" 2] 1] "foo"]]
        {:default ["field-id" 2]}]]}}
    {:query
     {:aggregation
      [[:sum
        [:case
         [[[:> [:field 12 nil] 10] 10]
          [[:> [:field 12 nil] 100] [:field 1 nil]]
          [[:= [:field 2 nil] 1] "foo"]]
         {:default [:field 2 nil]}]]]}}}))

(deftest ^:parallel normalize-aggregations-test-15
  (normalize-tests
   "various other new ag types"
   {{:query {:aggregation ["median" ["field-id" 13]]}}
    {:query {:aggregation [[:median [:field 13 nil]]]}}

    {:query {:aggregation ["var" ["field-id" 13]]}}
    {:query {:aggregation [[:var [:field 13 nil]]]}}

    {:query {:aggregation ["percentile" ["field-id" 13] 0.9]}}
    {:query {:aggregation [[:percentile [:field 13 nil] 0.9]]}}}))

(deftest ^:parallel normalize-order-by-test
  (normalize-tests
   "does order-by get properly normalized?"
   {{:query {"ORDER_BY" [[10 "ASC"]]}}
    {:query {:order-by [[:asc [:field 10 nil]]]}}

    {:query {"ORDER_BY" [["ASC" 10]]}}
    {:query {:order-by [[:asc [:field 10 nil]]]}}

    {:query {"ORDER_BY" [[["field_id" 10] "ASC"]]}}
    {:query {:order-by [[:asc [:field 10 nil]]]}}

    {:query {"ORDER_BY" [["DESC" ["field_id" 10]]]}}
    {:query {:order-by [[:desc [:field 10 nil]]]}}}))

(deftest ^:parallel normalize-filter-test
  (normalize-tests
   "the unit & amount in time interval clauses should get normalized"
   {{:query {"FILTER" ["time-interval" 10 "current" "day"]}}
    {:query {:filter [:time-interval [:field 10 nil] :current :day]}}}))

(deftest ^:parallel normalize-filter-test-2
  (normalize-tests
   "but amount should not get normalized if it's an integer"
   {{:query {"FILTER" ["time-interval" 10 -10 "day"]}}
    {:query {:filter [:time-interval [:field 10 nil] -10 :day]}}}))

(deftest ^:parallel normalize-filter-test-3
  (normalize-tests
   "relative-time-interval is correctly normalized"
   {{:query {"FILTER" ["relative-time-interval" 1 10 "week" -10 "week"]}}
    {:query {:filter [:relative-time-interval [:field 1 nil] 10 :week -10 :week]}}}))

(deftest ^:parallel normalize-filter-test-4
  (normalize-tests
   "make sure we support time-interval options"
   {["TIME_INTERVAL" 10 -30 "DAY" {"include_current" true}]
    [:time-interval [:field 10 nil] -30 :day {:include-current true}]}))

(deftest ^:parallel normalize-filter-test-5
  (normalize-tests
   "the unit in relative datetime clauses should get normalized"
   {{:query {"FILTER" ["=" [:field-id 10] ["RELATIVE_DATETIME" -31 "DAY"]]}}
    {:query {:filter [:= [:field 10 nil] [:relative-datetime -31 :day]]}}}))

(deftest ^:parallel normalize-filter-test-6
  (normalize-tests
   "should work if we do [:relative-datetime :current] as well"
   {{:query {"FILTER" ["=" [:field-id 10] ["RELATIVE_DATETIME" "CURRENT"]]}}
    {:query {:filter [:= [:field 10 nil] [:relative-datetime :current]]}}}))

(deftest ^:parallel normalize-filter-test-7
  (normalize-tests
   "and in datetime-field clauses (MBQL 3+)"
   {{:query {"FILTER" ["=" [:datetime-field ["field_id" 10] "day"] "2018-09-05"]}}
    {:query {:filter [:= [:field 10 {:temporal-unit :day}] "2018-09-05"]}}}))

(deftest ^:parallel normalize-filter-test-8
  (normalize-tests
   "(or in long-since-deprecated MBQL 2 format)"
   {{:query {"FILTER" ["=" [:datetime-field 10 "as" "day"] "2018-09-05"]}}
    {:query {:filter [:= [:field 10 {:temporal-unit :day}] "2018-09-05"]}}}))

(deftest ^:parallel normalize-filter-test-9
  (normalize-tests
   "if string filters have an options map that should get normalized"
   {{:query {"FILTER" ["starts_with" 10 "ABC" {"case_sensitive" true}]}}
    {:query {:filter [:starts-with [:field 10 nil] "ABC" {:case-sensitive true}]}}}))

(deftest ^:parallel normalize-parmaeters-test
  (normalize-tests
   "make sure we're not running around trying to normalize the type in native query params"
   {{:type       :native
     :parameters [{:type   "date/range"
                   :target [:dimension [:template-tag "checkin_date"] {:stage-number -2}]
                   :value  "2015-04-01~2015-05-01"}]}
    {:type       :native
     :parameters [{:type   :date/range
                   :target [:dimension [:template-tag "checkin_date"] {:stage-number -2}]
                   :value  "2015-04-01~2015-05-01"}]}}))

(deftest ^:parallel normalize-parmaeters-test-2
  (normalize-tests
   "`:parameters` `:type` should get normalized, but `:value` should not."
   {{:type       "native"
     :parameters [{:type   "text"
                   :target ["dimension" ["template-tag" "names_list"]]
                   :value  ["BBQ" "Bakery" "Bar"]}]}
    {:type       :native
     :parameters [{:type   :text
                   :target [:dimension [:template-tag "names_list"]]
                   :value  ["BBQ" "Bakery" "Bar"]}]}}))

(deftest ^:parallel normalize-parmaeters-test-3
  (normalize-tests
   "make sure normalization doesn't try to parse value as an MBQL clause"
   {{:type       "native"
     :parameters [{:type   "text"
                   :target ["dimension" ["template-tag" "names_list"]]
                   :value  ["=" 10 20]}]}
    {:type       :native
     :parameters [{:type   :text
                   :target [:dimension [:template-tag "names_list"]]
                   :value  ["=" 10 20]}]}}))

(defn- query-with-template-tags
  [template-tags]
  {:type   :native
   :native {:query         "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
            :template-tags template-tags}})

(deftest ^:parallel normalize-template-tags-test
  (normalize-tests
   "`:template-tags` key should get normalized"
   {{:type   :native
     :native {:query          "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
              "template_tags" {"checkin_date" {:name         "checkin_date"
                                               :display-name "Checkin Date"
                                               :type         :dimension
                                               :dimension    [:field 14 nil]}}}}
    {:type   :native
     :native {:query         "SELECT COUNT(*) FROM \"PUBLIC\".\"CHECKINS\" WHERE {{checkin_date}}"
              :template-tags {"checkin_date" {:name         "checkin_date"
                                              :display-name "Checkin Date"
                                              :type         :dimension
                                              :dimension    [:field 14 nil]
                                              :widget-type  :category}}}}}))

(deftest ^:parallel normalize-template-tags-test-2
  (normalize-tests
   "Don't try to normalize template-tag name/display name. Names should get converted to strings."
   {(query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display_name "looks/like-a-keyword"
                      :type         :dimension
                      :dimension    [:field 14 nil]}})
    (query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "looks/like-a-keyword"
                      :type         :dimension
                      :dimension    [:field 14 nil]
                      :widget-type  :category}})

    (query-with-template-tags
     {:checkin_date {:name         :checkin_date
                     :display-name "Checkin Date"
                     :type         :dimension
                     :dimension    [:field 14 nil]}})
    (query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field 14 nil]
                      :widget-type  :category}})}))

(deftest ^:parallel normalize-template-tags-test-3
  (normalize-tests
   "Actually, `:name` should just get copied over from the map key if it's missing or different"
   {(query-with-template-tags
     {"checkin_date" {:display_name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field 14 nil]}})
    (query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field 14 nil]
                      :widget-type  :category}})

    (query-with-template-tags
     {"checkin_date" {:name         "something_else"
                      :display_name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field 14 nil]}})
    (query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field 14 nil]
                      :widget-type  :category}})}))

(deftest ^:parallel normalize-template-tags-test-4
  (normalize-tests
   "`:type` should get normalized"
   {(query-with-template-tags
     {:names_list {:name         "names_list"
                   :display_name "Names List"
                   :type         "dimension"
                   :dimension    ["field-id" 49]}})
    (query-with-template-tags
     {"names_list" {:name         "names_list"
                    :display-name "Names List"
                    :type         :dimension
                    :dimension    [:field 49 nil]
                    :widget-type  :category}})}))

(deftest ^:parallel normalize-template-tags-test-5
  (normalize-tests
   "`:widget-type` should get normalized"
   {(query-with-template-tags
     {:names_list {:name         "names_list"
                   :display_name "Names List"
                   :type         "dimension"
                   :widget-type  "string/="
                   :dimension    ["field-id" 49]}})
    (query-with-template-tags
     {"names_list" {:name         "names_list"
                    :display-name "Names List"
                    :type         :dimension
                    :widget-type  :string/=
                    :dimension    [:field 49 nil]}})}))

(deftest ^:parallel normalize-template-tags-test-6
  (normalize-tests
   "`:dimension` should get normalized"
   ;; doesn't get converted to `:field` here because that happens during the canonicalization step.
   {(query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display_name "Checkin Date"
                      :type         :dimension
                      :dimension    ["field_id" 14]}})
    (query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field 14 nil]
                      :widget-type  :category}})}))

(deftest ^:parallel normalize-template-tags-test-7
  (normalize-tests
   "Don't normalize `:default` values"
   {(query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :widget-type  :string/=
                      :dimension    [:field 1 nil]
                      :default      ["a" "b"]}})
    (query-with-template-tags
     {"checkin_date" {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :widget-type  :string/=
                      :dimension    [:field 1 nil]
                      :default      ["a" "b"]}})}))

(deftest ^:parallel normalize-template-tags-test-8
  (normalize-tests
   "Don't keywordize keys that aren't present in template tag maps"
   {{:database 1
     :type     :native
     :native   {:template-tags {"x" {}}}}

    ;; `:name` still gets copied over from the map key.
    {:database 1
     :type     :native
     :native   {:template-tags {"x" {:name "x"}}}}}))

(deftest ^:parallel normalize-template-tags-test-9
  (normalize-tests
   ":dimension (Field filter) template tags with no :widget-type should get :category as a default type (#20643)"
   {{:database 1
     :type     :native
     :native   {:template-tags {"x" {:name "x", :type :dimension}}}}
    {:database 1
     :type     :native
     :native   {:template-tags {"x" {:name        "x"
                                     :type        :dimension
                                     :widget-type :category}}}}
    ;; don't add if there's already an existing `:widget-type`
    {:database 1
     :type     :native
     :native   {:template-tags {"x" {:name        "x"
                                     :type        :dimension
                                     :widget-type :string/=}}}}
    {:database 1
     :type     :native
     :native   {:template-tags {"x" {:name        "x"
                                     :type        :dimension
                                     :widget-type :string/=}}}}
    ;; don't add if this isn't a Field filter (`:type` is not `:dimension`)
    {:database 1
     :type     :native
     :native   {:template-tags {"x" {:name "x"
                                     :type :nonsense}}}}
    {:database 1
     :type     :native
     :native   {:template-tags {"x" {:name "x"
                                     :type :nonsense}}}}}))

(deftest ^:parallel normalize-source-queries-test
  (normalize-tests
   "Make sure token normalization works correctly on source queries"
   {{:database 4
     :type     :query
     :query    {"source_query" {:native         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                "template_tags" {:category {:name         "category"
                                                            :display-name "Category"
                                                            :type         "text"
                                                            :required     true
                                                            :default      "Widget"}}}}}
    {:database 4
     :type     :query
     :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                               :template-tags {"category" {:name         "category"
                                                           :display-name "Category"
                                                           :type         :text
                                                           :required     true
                                                           :default      "Widget"}}}}}

    {:database 4
     :type     :query
     :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}}
    {:database 4
     :type     :query
     :query    {:source-query {:source-table 1}}}}))

(deftest ^:parallel normalize-joins-test
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
                                :fields       :all}]}}}))

(deftest ^:parallel normalize-joins-test-2
  (normalize-tests
   "what about with a sequence of :fields?"
   {{:database 4
     :type     :query
     :query    {"source_table" 1
                "joins"        [{"fields" [["field_id" 1] ["field_literal" :MY_FIELD "type/Integer"]]}]}}
    {:database 4
     :type     :query
     :query    {:source-table 1
                :joins        [{:fields [[:field 1 nil]
                                         [:field "MY_FIELD" {:base-type :type/Integer}]]}]}}}))

(deftest ^:parallel normalize-joins-test-3
  (normalize-tests
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
                                               :fields   [[:field 1 nil]
                                                          [:field "MY_FIELD" {:base-type :type/Integer}]]}]}}}}))

(deftest ^:parallel normalize-source-query-in-joins-test
  (testing "does a `:source-query` in `:joins` get normalized?"
    (letfn [(query-with-joins [joins]
              {:database 4
               :type     :query
               :query    {:source-table 1
                          :joins        joins}})]
      (testing "MBQL source query in :joins"
        (is (= (query-with-joins [{:source-query {:source-table 2}
                                   :fields       [[:field 1 nil]
                                                  [:field "MY_FIELD" {:base-type :type/Integer}]]}])
               (#'mbql.normalize/normalize
                (query-with-joins [{"source_query" {"source_table" 2}
                                    "fields"       [["field_id" 1]
                                                    ["field_literal" :MY_FIELD "type/Integer"]]}])))))
      (testing "native source query in :joins"
        (testing "string source query"
          (is (= (query-with-joins [{:source-query {:native "SELECT *"}}])
                 (#'mbql.normalize/normalize
                  (query-with-joins [{"source_query" {"NATIVE" "SELECT *"}}])))))
        (testing "map source query"
          (is (= (query-with-joins [{:source-query {:native {"this_is_a_native_query" "TRUE"}}}])
                 (#'mbql.normalize/normalize
                  (query-with-joins [{"source_query" {"NATIVE" {"this_is_a_native_query" "TRUE"}}}])))))))))

(deftest ^:parallel params-normalization-test
  (normalize-tests
   ":native :params shouldn't get normalized."
   {{:native {:query  "SELECT * FROM venues WHERE name = ?"
              :params ["Red Medicine"]}}
    {:native {:query  "SELECT * FROM venues WHERE name = ?"
              :params ["Red Medicine"]}}}))

(deftest ^:parallel normalize-projections-test
  (normalize-tests
   "Native :projections shouldn't get normalized."
   {{:type   :native
     :native {:projections ["_id" "name" "category_id" "latitude" "longitude" "price"]}}
    {:type   :native
     :native {:projections ["_id" "name" "category_id" "latitude" "longitude" "price"]}}}))

;; this is also covered
(deftest ^:parallel normalize-expressions-test
  (normalize-tests
   "Expression names should get normalized to strings."
   {{:query {"expressions" {:abc ["+" 1 2]}, :fields [["expression" :abc]]}}
    {:query {:expressions {"abc" [:+ 1 2]}, :fields [[:expression "abc"]]}}}))

(deftest ^:parallel normalize-expressions-test-2
  (normalize-tests
   "are expression names exempt from lisp-casing/lower-casing?"
   {{"query" {"expressions" {:sales_tax ["-" ["field-id" 10] ["field-id" 20]]}}}
    {:query {:expressions {"sales_tax" [:- [:field 10 nil] [:field 20 nil]]}}}}))

(deftest ^:parallel normalize-expressions-test-3
  (normalize-tests
   "expressions should handle datetime arithemtics"
   {{:query {:expressions {:prev_month ["+" ["field-id" 13] ["interval" -1 "month"]]}}}
    {:query {:expressions {"prev_month" [:+ [:field 13 nil] [:interval -1 :month]]}}}

    {:query {:expressions {:prev_month ["-" ["field-id" 13] ["interval" 1 "month"] ["interval" 1 "day"]]}}}
    {:query {:expressions {"prev_month" [:- [:field 13 nil] [:interval 1 :month] [:interval 1 :day]]}}}

    {:query {:expressions {:datetime-diff ["datetime-diff" ["field" 1 nil] ["field" 2 nil] "month"]}}}
    {:query {:expressions {"datetime-diff" [:datetime-diff [:field 1 nil] [:field 2 nil] :month]}}}

    {:query {:expressions {:datetime-add ["datetime-add" ["field" 1 nil] 1 "month"]}}}
    {:query {:expressions {"datetime-add" [:datetime-add [:field 1 nil] 1 :month]}}}

    {:query {:expressions {:datetime-subtract ["datetime-subtract" ["field" 1 nil] 1 "month"]}}}
    {:query {:expressions {"datetime-subtract" [:datetime-subtract [:field 1 nil] 1 :month]}}}}))

(deftest ^:parallel normalize-expressions-test-4
  (normalize-tests
   "expressions handle namespaced keywords correctly"
   {{:query {"expressions" {:abc/def ["+" 1 2]}, :fields [["expression" :abc/def]]}}
    {:query {:expressions {"abc/def" [:+ 1 2]}, :fields [[:expression "abc/def"]]}}}))

(deftest ^:parallel normalize-expressions-test-5
  (normalize-tests
   "expression refs can have opts (#33528)"
   {{:query {:expressions {"abc" [+ 1 2]}, :fields [[:expression "abc" {"base-type" "type/Number"}]]}}
    {:query {:expressions {"abc" [+ 1 2]}, :fields [[:expression "abc" {:base-type :type/Number}]]}}}))

(deftest ^:parallel normalize-expressions-test-6
  (normalize-tests
   "expressions can be a literal :value"
   {{:query
     {:expressions {"abc" [:value 123 {"base-type" "type/Integer"}]}
      :fields [[:expression "abc" {"base-type" "type/Integer"}]]}}
    {:query
     {:expressions {"abc" [:value 123 {:base_type :type/Integer}]}
      :fields [[:expression "abc" {:base-type :type/Integer}]]}}}))

(deftest ^:parallel canonicalize-field-test
  (normalize-tests
   "If someone accidentally nests `:field` clauses, we should fix it for them."
   {{:query {:fields [[:field [:field 1 {:a 100, :b 200}] {:b 300}]]}}
    {:query {:fields [[:field 1 {:a 100, :b 300}]]}}

    {:query {:fields [[:field [:field [:field 1 {:a 100, :b 200}] {:b 300}] {:a 400, :c 500}]]}}
    {:query {:fields [[:field 1 {:a 400, :b 300, :c 500}]]}}}))

(deftest ^:parallel canonicalize-field-test-2
  (normalize-tests
   "We should remove empty options maps"
   {[:field 2 {}]
    [:field 2 nil]}))

(deftest ^:parallel canonicalize-substring-test
  (normalize-tests
   "substring index 0 -> 1"
   {[:substring "foo" 0 1]
    [:substring "foo" 1 1]}))

(deftest ^:parallel canonicalize-binning-strategy-test
  (normalize-tests
   "make sure `binning-strategy` wraps implicit Field IDs"
   {{:query {:breakout [[:binning-strategy 10 :bin-width 2000]]}}
    {:query {:breakout [[:field 10 {:binning {:strategy :bin-width, :bin-width 2000}}]]}}}))

(deftest ^:parallel canonicalize-binning-strategy-test-2
  (normalize-tests
   "make sure `binning-strategy` wraps implicit Field IDs"
   {{:query {:breakout [[:binning-strategy 10 :bin-width 2000 {:a :b}]]}}
    {:query {:breakout [[:field 10 {:binning {:strategy :bin-width, :bin-width 2000, :a :b}}]]}}}))

(deftest ^:parallel canonicalize-aggregations-test
  (normalize-tests
   "field ID should get wrapped in field-id and ags should be converted to multiple ag syntax"
   {{:query {:aggregation [:count 10]}} {:query {:aggregation [[:count [:field 10 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-2
  (normalize-tests
   "ag with no Field ID"
   {{:query {:aggregation [:count]}} {:query {:aggregation [[:count]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-3
  (normalize-tests
   "if already wrapped in field-id it's ok"
   {{:query {:aggregation [:count [:field-id 1000]]}} {:query {:aggregation [[:count [:field 1000 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-4
  (normalize-tests
   ":rows aggregation type, being deprecated since FOREVER, should just get removed"
   {{:query {:aggregation [:rows]}}
    {:query {}}

    {:query {:aggregation :rows}}
    {:query {}}}))

(deftest ^:parallel canonicalize-aggregations-test-5
  (normalize-tests
   "if just a single aggregation is supplied it should always be converted to new-style multiple-aggregation syntax"
   {{:query {:aggregation :count}} {:query {:aggregation [[:count]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-6
  (normalize-tests
   "make sure we handle single :count with :field-id correctly"
   {{:query {:aggregation [:count [:field-id 10]]}} {:query {:aggregation [[:count [:field 10 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-7
  (normalize-tests
   "make sure for multiple aggregations we can handle `:count` that doesn't appear wrapped in brackets"
   {{:query {:aggregation [[:count] [:sum 10]]}}
    {:query {:aggregation [[:count] [:sum [:field 10 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-8
  (normalize-tests
   (str "this doesn't make sense, but make sure if someone specifies a `:rows` ag and another one we don't end up "
        "with a `nil` in the ags list")
   {{:query {:aggregation [:rows :count]}} {:query {:aggregation [[:count]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-9
  (normalize-tests
   "another stupid aggregation that we need to be able to handle"
   {{:query {:aggregation [:count :count]}} {:query {:aggregation [[:count] [:count]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-10
  (normalize-tests
   "legacy `:named` aggregation clauses should get converted to `:aggregation-options`"
   {{:query {:aggregation [:named [:sum 10] "Sum *TEN*"]}}
    {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:display-name "Sum *TEN*"}]]}}

    {:query {:aggregation [:named [:sum 10] "Sum *TEN*" {:use-as-display-name? false}]}}
    {:query {:aggregation [[:aggregation-options [:sum [:field 10 nil]] {:name "Sum *TEN*"}]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-11
  (normalize-tests
   "subclauses of `:aggregation-options` should get canonicalized correctly; unwrap :aggregation-options with empty options"
   {{:query {:aggregation [[:aggregation-options [:sum 10] {}]]}}
    {:query {:aggregation [[:sum [:field 10 nil]]]}}

    {:query {:aggregation [[:aggregation-options [:sum 10] nil]]}}
    {:query {:aggregation [[:sum [:field 10 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-12
  (normalize-tests
   "make sure expression aggregations work correctly"
   {{:query {:aggregation [:+ [:sum 10] 2]}}
    {:query {:aggregation [[:+ [:sum [:field 10 nil]] 2]]}}

    {:query {:aggregation [:+ [:sum 10] [:* [:sum 20] [:sum 30]]]}}
    {:query {:aggregation [[:+ [:sum [:field 10 nil]] [:* [:sum [:field 20 nil]] [:sum [:field 30 nil]]]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-13
  (normalize-tests
   "expression ags should handle varargs"
   {{:query {:aggregation [[:+ [:sum 10] [:sum 20] [:sum 30]]]}}
    {:query {:aggregation [[:+ [:sum [:field 10 nil]] [:sum [:field 20 nil]] [:sum [:field 30 nil]]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-14
  (normalize-tests
   "METRICS shouldn't get canonicalized in some kind of wacky way"
   {{:query {:aggregation [:+ [:metric 1] 2]}} {:query {:aggregation [[:+ [:metric 1] 2]]}}}))

;; TODO (Tamas 2026-01-05): Remove this test once FE tests switch to using MBQL5
(deftest ^:parallel canonicalize-aggregations-measure-test
  (normalize-tests
   "MEASURES shouldn't get canonicalized in some kind of wacky way"
   {{:query {:aggregation [:+ [:measure 1] 2]}} {:query {:aggregation [[:+ [:measure 1] 2]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-15
  (normalize-tests
   "can cumulative-count be handled with or without a Field?"
   {{:query {:aggregation [:cum-count]}}
    {:query {:aggregation [[:cum-count]]}}

    {:query {:aggregation [:cum-count 10]}}
    {:query {:aggregation [[:cum-count [:field 10 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-16
  (normalize-tests
   "should handle seqs without a problem"
   {{:query {:aggregation '([:min 1] [:min 2])}}
    {:query {:aggregation [[:min [:field 1 nil]] [:min [:field 2 nil]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-17
  (normalize-tests
   "make sure canonicalization can handle aggregations with expressions where the Field normally goes"
   {{:query {:aggregation [[:sum [:* [:field-id 4] [:field-id 1]]]]}}
    {:query {:aggregation [[:sum [:* [:field 4 nil] [:field 1 nil]]]]}}

    {:query {:aggregation [[:sum [:* [:field 4 nil] [:field 1 nil]]]]}}
    {:query {:aggregation [[:sum [:* [:field 4 nil] [:field 1 nil]]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-18
  (normalize-tests
   "Make sure `:case`  expressions get canonicalized correctly"
   {{:query {:aggregation [:sum [:case [[[:< [:field-id 37331] 2] 2] [[:< [:field-id 37331] 4] 1]]]]}}
    {:query {:aggregation [[:sum [:case [[[:< [:field 37331 nil] 2] 2] [[:< [:field 37331 nil] 4] 1]]]]]}}}))

(deftest ^:parallel canonicalize-aggregations-test-19
  (normalize-tests
   ":percentile"
   {{:query {:aggregation [[:percentile [:field-id 37809] 0.9]]}}
    {:query {:aggregation [[:percentile [:field 37809 nil] 0.9]]}}}))

(deftest ^:parallel canonicalize-breakout-test
  (normalize-tests
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

(deftest ^:parallel canonicalize-expressions-test
  (normalize-tests
   "expressions can xbe a literal :value"
   {{:query {:expressions {"abc" [:value false {:base_type :type/Boolean}]}
             :fields      [[:expression "abc" {:base-type :type/Boolean}]]}}
    {:query {:expressions {"abc" [:value false {:base_type :type/Boolean}]}
             :fields      [[:expression "abc" {:base-type :type/Boolean}]]}}}))

(deftest ^:parallel canonicalize-fields-test
  (normalize-tests
   "implicit Field IDs should get wrapped in [:field-id] in :fields"
   {{:query {:fields [10]}}
    {:query {:fields [[:field 10 nil]]}}

    {:query {:fields [10 20]}}
    {:query {:fields [[:field 10 nil] [:field 20 nil]]}}

    {:query {:fields [[:field-id 1000]]}}
    {:query {:fields [[:field 1000 nil]]}}}))

(deftest ^:parallel canonicalize-fields-test-2
  (normalize-tests
   "should handle seqs"
   {{:query {:fields '(10 20)}}
    {:query {:fields [[:field 10 nil] [:field 20 nil]]}}}))

(deftest ^:parallel canonicalize-filter-test
  (normalize-tests
   "implicit Field IDs should get wrapped in [:field-id] in filters"
   {{:query {:filter [:= 10 20]}} {:query {:filter [:= [:field 10 nil] 20]}}
    {:query {:filter [:and [:= 10 20] [:= 20 30]]}}
    {:query {:filter [:and [:= [:field 10 nil] 20] [:= [:field 20 nil] 30]]}}
    {:query {:filter [:between 10 20 30]}} {:query {:filter [:between [:field 10 nil] 20 30]}}}))

(deftest ^:parallel canonicalize-filter-test-2
  (normalize-tests
   "`:inside` filters should get implict Field IDs for the first two args"
   {{:query {:filter [:inside 1 2 90 -90 90 -90]}}
    {:query {:filter [:inside [:field 1 nil] [:field 2 nil] 90 -90 90 -90]}}}))

(deftest ^:parallel canonicalize-filter-test-3
  (normalize-tests
   "compound filters with only one arg should get automatically de-compounded"
   {{:query {:filter [:and [:= 100 2]]}} {:query {:filter [:= [:field 100 nil] 2]}}
    {:query {:filter [:or [:= 100 2]]}} {:query {:filter [:= [:field 100 nil] 2]}}}))

(deftest ^:parallel canonicalize-filter-test-4
  (normalize-tests
   "compound filters should \"pull-up\" any args that are the same compound filter"
   {{:query
     {:filter
      [:and [:and [:= [:field-id 100] 1] [:= [:field-id 200] 2]] [:and [:= [:field-id 300] 3] [:= [:field-id 400] 4]]]}}
    {:query
     {:filter [:and [:= [:field 100 nil] 1] [:= [:field 200 nil] 2] [:= [:field 300 nil] 3] [:= [:field 400 nil] 4]]}}

    {:query
     {:filter
      [:and
       [:> [:field-id 4] 1]
       [:is-null [:field-id 7]]
       [:and [:= [:field-id 5] "abc"] [:between [:field-id 9] 0 25]]]}}
    {:query
     {:filter
      [:and [:> [:field 4 nil] 1] [:is-null [:field 7 nil]] [:= [:field 5 nil] "abc"] [:between [:field 9 nil] 0 25]]}}

    {:query {:filter [:or [:or [:= 100 1] [:= 200 2]] [:or [:= [:field-id 300] 3] [:= [:field-id 400] 4]]]}}
    {:query
     {:filter [:or [:= [:field 100 nil] 1] [:= [:field 200 nil] 2] [:= [:field 300 nil] 3] [:= [:field 400 nil] 4]]}}

    {:query
     {:filter
      [:or [:> [:field-id 4] 1] [:is-null [:field-id 7]] [:or [:= [:field-id 5] "abc"] [:between [:field-id 9] 0 25]]]}}
    {:query
     {:filter
      [:or [:> [:field 4 nil] 1] [:is-null [:field 7 nil]] [:= [:field 5 nil] "abc"] [:between [:field 9 nil] 0 25]]}}}))

(deftest ^:parallel canonicalize-filter-test-5
  (normalize-tests
   "not inside of a not should get elimated entirely"
   {{:query {:filter [:not [:not [:= [:field-id 100] 1]]]}}
    {:query {:filter [:= [:field 100 nil] 1]}}

    {:query {:filter [:not [:not [:not [:not [:= [:field-id 100] 1]]]]]}}
    {:query {:filter [:= [:field 100 nil] 1]}}}))

(deftest ^:parallel canonicalize-filter-test-6
  (normalize-tests
   "make sure we don't overwrite options if specified"
   {{:query {:filter [:contains 10 "ABC" {:case-sensitive false}]}}
    {:query {:filter [:contains [:field 10 nil] "ABC" {:case-sensitive false}]}}}))

(deftest ^:parallel canonicalize-filter-test-7
  (normalize-tests
   "or for time-interval options"
   {[:time-interval 10 -30 :day {:include-current true}]
    [:time-interval [:field 10 nil] -30 :day {:include-current true}]}))

(deftest ^:parallel canonicalize-filter-test-8
  (normalize-tests
   "make sure empty filter clauses don't explode in canonicalize"
   {{:database 1, :type :query, :query {:source-table 1, :filter []}}
    {:database 1, :type :query, :query {:source-table 1}}}))

(deftest ^:parallel canonicalize-filter-test-9
  (normalize-tests
   "make sure we can handle GA segments"
   {{:database 1
     :type :query
     :query {:filter [:and [:segment "gaid:-11"] [:time-interval [:field-id 6851] -365 :day {}]]}}
    {:database 1
     :type :query
     :query {:filter [:and [:segment "gaid:-11"] [:time-interval [:field 6851 nil] -365 :day {}]]}}}))

(deftest ^:parallel canonicalize-filter-test-10
  (normalize-tests
   "should handle seqs"
   {{:query {:filter '(:and [:= 100 1] [:= 200 2])}}
    {:query {:filter [:and
                      [:= [:field 100 nil] 1]
                      [:= [:field 200 nil] 2]]}}}))

(deftest ^:parallel canonicalize-filter-test-11
  (normalize-tests
   "if you put a `:datetime-field` inside a `:time-interval` we should fix it for you"
   {{:query {:filter [:time-interval [:datetime-field [:field-id 8] :month] -30 :day]}}
    {:query {:filter [:time-interval [:field 8 nil] -30 :day]}}}))

(deftest ^:parallel canonicalize-filter-test-12
  (normalize-tests
   "MBQL ≤ 3 fk-> clauses should get normalized to MBQL 4"
   {{:query {:filter [:= [:fk-> 10 20] "ABC"]}}
    {:query {:filter [:= [:field 20 {:source-field 10}] "ABC"]}}

    {:query {:fields [["fk->" ["field" 101 nil] ["field" 294 nil]]]}}
    {:query {:fields [[:field 294 {:source-field 101}]]}}}))

(deftest ^:parallel canonicalize-filter-test-13
  (normalize-tests
   "as should datetime-field clauses..."
   {{:query {:filter [:= [:datetime-field 10 :day] "2018-09-05"]}}
    {:query {:filter [:= [:field 10 {:temporal-unit :day}] "2018-09-05"]}}}))

(deftest ^:parallel canonicalize-filter-test-14
  (normalize-tests
   "MBQL 2 datetime-field clauses ([:datetime-field <field> :as <unit>]) should get converted to MBQL 4"
   {{:query {:filter [:= [:datetime-field 10 :as :day] "2018-09-05"]}}
    {:query {:filter [:= [:field 10 {:temporal-unit :day}] "2018-09-05"]}}}))

(deftest ^:parallel canonicalize-filter-test-15
  (normalize-tests
   "if someone is dumb and passes something like a field-literal inside a field-id, fix it for them."
   {{:query {:filter [:= [:field-id [:field-literal "my_field" "type/Number"]] 10]}}
    {:query {:filter [:= [:field "my_field" {:base-type :type/Number}] 10]}}}))

(deftest ^:parallel canonicalize-filter-test-16
  (normalize-tests
   "we should fix :field-ids inside :field-ids too"
   {{:query {:filter [:= [:field-id [:field-id 1]] 10]}} {:query {:filter [:= [:field 1 nil] 10]}}}))

(deftest ^:parallel canonicalize-filter-test-17
  (normalize-tests
   "we should handle seqs no prob"
   {{:query {:filter '(:= 1 10)}} {:query {:filter [:= [:field 1 nil] 10]}}}))

;;; ---------------------------------------------------- order-by ----------------------------------------------------

(deftest ^:parallel canonicalize-order-by-test
  (normalize-tests
   "ORDER BY: MBQL 2 [field direction] should get translated to MBQL 3+ [direction field]"
   {{:query {:order-by [[[:field-id 10] :asc]]}}
    {:query {:order-by [[:asc [:field 10 nil]]]}}}

   "MBQL 2 old order-by names should be handled"
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

(deftest ^:parallel canonicalize-source-queries-test
  (normalize-tests
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
     :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                               :template-tags {"category" {:name         "category"
                                                           :display-name "Category"
                                                           :type         :text
                                                           :required     true
                                                           :default      "Widget"}}}}}}))

(deftest ^:parallel canonicalize-source-queries-test-2
  (normalize-tests
   "make sure we recursively canonicalize source queries"
   {{:database 4
     :type     :query
     :query    {:source-query {:source-table 1, :aggregation :rows}}}
    {:database 4
     :type     :query
     :query    {:source-query {:source-table 1}}}}))

(deftest ^:parallel whole-query-transformations-test-1
  (normalize-tests
   (str
    "If you specify a field in a breakout and in the Fields clause, we should go ahead and remove it from the "
    "Fields clause, because it is (obviously) implied that you should get that Field back.")
   {{:type :query, :query {:breakout [[:field 1 nil] [:field 2 nil]], :fields [[:field 2 nil] [:field 3 nil]]}}
    {:type :query, :query {:breakout [[:field 1 nil] [:field 2 nil]], :fields [[:field 3 nil]]}}}))

(deftest ^:parallel whole-query-transformations-test-2
  (normalize-tests
   "should work with FKs"
   {{:type  :query
     :query {:breakout [[:field 1 nil]
                        [:field 4 {:source-field 2}]]
             :fields   [[:field 4 {:source-field 2}]
                        [:field 3 nil]]}}
    {:type  :query
     :query {:breakout [[:field 1 nil]
                        [:field 4 {:source-field 2}]]
             :fields   [[:field 3 nil]]}}}))

(deftest ^:parallel whole-query-transformations-test-3
  (normalize-tests
   "should work if the Field is bucketed in the breakout & in fields"
   {{:type  :query
     :query {:breakout [[:field 1 nil] [:field 4 {:source-field 2, :temporal-unit :month}]]
             :fields   [[:field 4 {:source-field 2, :temporal-unit :month}] [:field 3 nil]]}}
    {:type  :query
     :query {:breakout [[:field 1 nil] [:field 4 {:source-field 2, :temporal-unit :month}]], :fields [[:field 3 nil]]}}}))

(deftest ^:parallel whole-query-transformations-test-4
  (normalize-tests
   "should work if the Field is bucketed in the breakout but not in fields"
   {{:type :query
     :query
     {:breakout [[:field 1 nil] [:field 4 {:source-field 2, :temporal-unit :month}]]
      :fields   [[:field 4 {:source-field 2}] [:field 3 nil]]}}
    {:type  :query
     :query {:breakout [[:field 1 nil]
                        [:field 4 {:source-field 2, :temporal-unit :month}]]
             :fields   [[:field 3 nil]]}}}))

(deftest ^:parallel replace-relative-date-filters-test
  (normalize-tests
   "date range in the past"
   {[:between [:+ [:field 1 nil] [:interval 7 :year]] [:relative-datetime -30 :day] [:relative-datetime 0 :day]]
    [:relative-time-interval [:field 1 nil] -30 :day -7 :year]}))

(deftest ^:parallel replace-relative-date-filters-test-2
  (normalize-tests
   "date range in the future"
   {[:between [:+ [:field 1 nil] [:interval -7 :year]] [:relative-datetime 0 :day] [:relative-datetime 30 :day]]
    [:relative-time-interval [:field 1 nil] 30 :day 7 :year]}))

(deftest ^:parallel replace-relative-date-filters-test-3
  (normalize-tests
   "date range that is not entirely in the past or in the future should be skipped"
   {[:between [:+ [:field 1 nil] [:interval -7 :year]] [:relative-datetime -5 :day] [:relative-datetime 30 :day]]
    [:between [:+ [:field 1 nil] [:interval -7 :year]] [:relative-datetime -5 :day] [:relative-datetime 30 :day]]}))

(deftest ^:parallel replace-relative-date-filters-test-4
  (normalize-tests
   "date range with different units for start and end of the interval should be skipped"
   {[:between [:+ [:field 1 nil] [:interval -7 :year]] [:relative-datetime 0 :day] [:relative-datetime 30 :quarter]]
    [:between [:+ [:field 1 nil] [:interval -7 :year]] [:relative-datetime 0 :day] [:relative-datetime 30 :quarter]]}))

(deftest ^:parallel replace-exclude-date-filters-test
  (normalize-tests
   {"`:hour-of-day`"
    {[:!= [:field 1 {:temporal-unit :hour-of-day}] 0 23]
     [:!= [:get-hour [:field 1 nil]] 0 23]}

    "`:day-of-week`"
    {[:!= [:field 1 {:temporal-unit :day-of-week}] "2024-12-02" "2024-12-08"]
     [:!= [:get-day-of-week [:field 1 nil] :iso] 1 7]}

    "`:month-of-year`"
    {[:!= [:field 1 {:temporal-unit :month-of-year}] "2024-01-02" "2024-12-08"]
     [:!= [:get-month [:field 1 nil]] 1 12]}

    "`:quarter-of-year`"
    {[:!= [:field 1 {:temporal-unit :quarter-of-year}] "2024-01-02" "2024-12-08"]
     [:!= [:get-quarter [:field 1 nil]] 1 4]}

    "field options should be preserved"
    {[:!= [:field 1 {:base-type :type/DateTime :temporal-unit :hour-of-day}] 10]
     [:!= [:get-hour [:field 1 {:base-type :type/DateTime}]] 10]}

    "filters with invalid dates should be ignored"
    {[:!= [:field 1 {:temporal-unit :quarter-of-year}] "2024-01-99" "2024-12-08"]
     [:!= [:field 1 {:temporal-unit :quarter-of-year}] "2024-01-99" "2024-12-08"]}

    "filters with non-date string arguments should be ignored"
    {[:!= [:field 1 {:temporal-unit :quarter-of-year}] "2024-01-02" "abc"]
     [:!= [:field 1 {:temporal-unit :quarter-of-year}] "2024-01-02" "abc"]}}))

(deftest ^:parallel replace-legacy-filters-test
  (normalize-tests
   {"exclude date filters"
    {{:type  :query
      :query {:filter [:and
                       [:!= [:field 1 {:temporal-unit :hour-of-day}] 0 23]
                       [:!= [:field 1 {:temporal-unit :quarter-of-year}] "2024-01-02" "2024-12-08"]]}}
     {:type  :query
      :query {:filter [:and
                       [:!= [:get-hour [:field 1 nil]] 0 23]
                       [:!= [:get-quarter [:field 1 nil]] 1 4]]}}}}))

(deftest ^:parallel remove-empty-options-from-field-clause-test
  (is (= {:query {:fields [[:field 1 nil]
                           [:field 2 nil]]}}
         (mbql.normalize/normalize {:query {:fields [[:field 1 {}]
                                                     [:field 2 {}]]}}))))

(deftest ^:parallel e2e-mbql-2-query-test
  (testing "With an ugly MBQL 2 query, does everything get normalized nicely?"
    (is (= {:type  :query
            :query {:source-table 10
                    :breakout     [[:field 10 nil] [:field 20 nil]]
                    :filter       [:= [:field 10 nil] [:field 20 {:temporal-unit :day}]]
                    :order-by     [[:desc [:field 10 nil]]]}}
           (mbql.normalize/normalize {:type  "query"
                                      :query {"source_table" 10
                                              "AGGREGATION"  "ROWS"
                                              "breakout"     [10 20]
                                              "filter"       ["and" ["=" 10 ["datetime-field" 20 "as" "day"]]]
                                              "order-by"     [[10 "desc"]]}})
           (mbql.normalize/normalize {:type  "query"
                                      :query {"source_table" 10
                                              "AGGREGATION"  ["ROWS"]
                                              "breakout"     [10 20]
                                              "filter"       ["and" ["=" 10 ["datetime-field" 20 "as" "day"]]]
                                              "order-by"     [[10 "descending"]]}})))))

(deftest ^:parallel e2e-native-query-with-params-test
  (testing "let's try doing the full normalization on a native query w/ params"
    (is (= {:native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                         :template-tags {"names_list" {:name         "names_list"
                                                       :display-name "Names List"
                                                       :type         :dimension
                                                       :widget-type  :category
                                                       :dimension    [:field 49 nil]}}}
            :parameters [{:type   :text
                          :target [:dimension [:template-tag "names_list"]]
                          :value  ["BBQ" "Bakery" "Bar"]}]}
           (mbql.normalize/normalize
            {:native     {:query          "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                          "template_tags" {:names_list {:name         "names_list"
                                                        :display_name "Names List"
                                                        :type         "dimension"
                                                        :dimension    ["field-id" 49]}}}
             :parameters [{:type   "text"
                           :target ["dimension" ["template-tag" "names_list"]]
                           :value  ["BBQ" "Bakery" "Bar"]}]})))))

(deftest ^:parallel e2e-big-query-with-segments-test
  (testing "let's try normalizing a big query with SEGMENTS"
    (is (= {:database 1
            :type     :query
            :query    {:source-table 2
                       :filter       [:and
                                      [:= [:field 3 nil] "Toucan-friendly"]
                                      [:segment 4]
                                      [:segment 5]]}}
           (mbql.normalize/normalize
            {:database 1
             :type     :query
             :query    {:source-table 2
                        :filter       ["AND"
                                       ["=" 3 "Toucan-friendly"]
                                       ["SEGMENT" 4]
                                       ["SEGMENT" 5]]}})))))

(deftest ^:parallel e2e-source-queries-test
  (testing "make sure source queries get normalized properly!"
    (is (= {:database 4
            :type     :query
            :query    {:source-query {:native        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                      :template-tags {"category" {:name         "category"
                                                                  :display-name "Category"
                                                                  :type         :text
                                                                  :required     true
                                                                  :default      "Widget"}}}}}
           (mbql.normalize/normalize
            {:database 4
             :type     :query
             :query    {"source_query" {:native         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                        "template_tags" {:category {:name         "category"
                                                                    :display-name "Category"
                                                                    :type         "text"
                                                                    :required     true
                                                                    :default      "Widget"}}}}})))))

(deftest ^:parallel e2e-rows-aggregation-test
  (testing "make sure `rows` aggregations get removed"
    (is (= {:database 4
            :type     :query
            :query    {:source-query {:source-table 1}}}
           (mbql.normalize/normalize
            {:database 4
             :type     :query
             :query    {"source_query" {"source_table" 1, "aggregation" "rows"}}})))))

(deftest ^:parallel e2e-parameters-test
  (testing (str "make sure that parameters get normalized/canonicalized correctly. value should not get normalized, "
                "but type should; target should do canonicalization for MBQL clauses")
    (is (= {:type       :query
            :query      {:source-table 1}
            :parameters [{:type :id, :target [:dimension [:field 4575 {:source-field 3265}]], :value ["field-id"]}
                         {:type :date/all-options, :target [:dimension [:field 3270 nil]], :value "thismonth"}]}
           (mbql.normalize/normalize
            {:type       :query
             :query      {:source-table 1}
             :parameters [{:type "id", :target ["dimension" ["fk->" 3265 4575]], :value ["field-id"]}
                          {:type "date/all-options", :target ["dimension" ["field-id" 3270]], :value "thismonth"}]})))))

(deftest ^:parallel e2e-parameters-test-2
  (testing "Make sure default values do not get normalized"
    (is (= {:database 1
            ;;                       tag name not normalized
            :native {:template-tags {"name" {:id "1f56330b-3dcb-75a3-8f3d-5c2c2792b749"
                                             :name "name"
                                             :display-name "Name"
                                             :type :dimension
                                             :dimension [:field 14 nil]  ;; field normalized
                                             :widget-type :string/=      ;; widget-type normalize
                                             :default ["Hudson Borer"]}} ;; default values not keyworded
                     :query "select * from PEOPLE where {{name}}"}
            :type :native}
           (mbql.normalize/normalize
            {:database 1
             :native {:template-tags {"name" {:id "1f56330b-3dcb-75a3-8f3d-5c2c2792b749"
                                              :name "name"
                                              :display-name "Name"
                                              :type "dimension"
                                              :dimension ["field" 14 nil]
                                              :widget-type "string/="
                                              :default ["Hudson Borer"]}}
                      :query "select * from PEOPLE where {{name}}"}
             :type "native"
             :parameters []})))))

(deftest ^:parallel e2e-source-metadata-test
  (testing "make sure `:source-metadata` gets normalized the way we'd expect:"
    (testing "1. Type names should get converted to keywords"
      (is (= {:query {:source-metadata
                      [{:name          "name"
                        :display_name  "Name"
                        :description   nil
                        :base_type     :type/Text
                        :semantic_type :type/Name
                        :fingerprint   {:global {:distinct-count 100}
                                        :type   {:type/Text {:percent-json   0.0
                                                             :percent-url    0.0
                                                             :percent-email  0.0
                                                             :average-length 15.63}}}}]}}
             (mbql.normalize/normalize
              {:query {:source-metadata [{:name          "name"
                                          :display_name  "Name"
                                          :description   nil
                                          :base_type     "type/Text"
                                          :semantic_type "type/Name"
                                          :fingerprint   {"global" {"distinct-count" 100}
                                                          "type"   {"type/Text" {"percent-json"   0.0
                                                                                 "percent-url"    0.0
                                                                                 "percent-email"  0.0
                                                                                 "average-length" 15.63}}}}]}}))))))

(deftest ^:parallel e2e-source-metadata-test-2
  (testing "make sure `:source-metadata` gets normalized the way we'd expect:"
    (testing (str "2. if `:source-metadata` is at the top-level, it should get moved to the correct location inside "
                  "the 'inner' MBQL query")
      (is (= {:query {:source-metadata
                      [{:name          "name"
                        :display_name  "Name"
                        :description   nil
                        :base_type     :type/Text
                        :semantic_type :type/Name
                        :fingerprint   {:global {:distinct-count 100}
                                        :type   {:type/Text {:percent-json   0.0
                                                             :percent-url    0.0
                                                             :percent-email  0.0
                                                             :average-length 15.63}}}}]}}
             (mbql.normalize/normalize
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

(deftest ^:parallel normalize-nil-values-in-native-maps-test
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
                           (mbql.normalize/normalize query)))))))]

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

(deftest ^:parallel empty-test
  (testing "test a query with :is-empty"
    (is (= {:query {:filter [:and
                             [:> [:field 4 nil] 1]
                             [:is-empty [:field 7 nil]]
                             [:= [:field 5 nil] "abc"]
                             [:between [:field 9 nil] 0 25]]}}
           (#'mbql.normalize/normalize {:query {:filter [:and
                                                         [:> [:field-id 4] 1]
                                                         [:is-empty [:field-id 7]]
                                                         [:and
                                                          [:= [:field-id 5] "abc"]
                                                          [:between [:field-id 9] 0 25]]]}})))))

(deftest ^:parallel modernize-fields-test
  (testing "some extra tests for Field clause canonicalization to the modern `:field` clause."
    (doseq [[form expected] {[:=
                              [:datetime-field [:joined-field "source" [:field-id 100]] :month]
                              "2021-02-18"]
                             [:= [:field 100 {:join-alias "source", :temporal-unit :month}] "2021-02-18"]

                             [:binning-strategy [:field-id 1] :default]
                             [:field 1 {:binning {:strategy :default}}]

                             [:binning-strategy [:field 1] :bin-width]
                             [:field 1 {:binning {:strategy :bin-width}}]}]
      (testing (pr-str form)
        (is (= expected
               (#'mbql.normalize/normalize form)))))))

(deftest ^:parallel modernize-fields-e2e-test
  (testing "Should be able to modernize legacy MBQL '95 Field clauses"
    (is (= {:database 1
            :type     :query
            :query    {:source-table 3
                       :breakout     [[:field 11 {:temporal-unit :month}]]
                       :aggregation  [[:count]]}}
           (mbql.normalize/normalize
            {:database 1
             :type     :query
             :query    {:source-table 3
                        :breakout     [[:datetime-field 11 :month]]
                        :aggregation  [[:count]]}})))))

(deftest ^:parallel modernize-fields-e2e-test-2
  (testing "Fixes for stuff like old-style breakout with a single clause should still work with the new `:field` clause"
    (is (= {:database 1
            :type     :query
            :query    {:filter       [:> [:field "count" {:base-type :type/Integer}] 5]
                       :source-query {:source-table 2
                                      :aggregation  [[:count]]
                                      :breakout     [[:field 3 {:temporal-unit :month, :source-field 4}]]}}}
           (mbql.normalize/normalize
            {:database 1
             :type     :query
             :query    {:filter       [:> [:field "count" {:base-type :type/Integer}] 5]
                        :source-query {:source-table 2
                                       :aggregation  [[:count]]
                                       :breakout     [:field 3 {:temporal-unit :month, :source-field 4}]}}})))))

(deftest ^:parallel normalize-breakout-test
  (are [breakouts expected] (= {:database 1
                                :type     :query
                                :query    {:breakout expected}}
                               (mbql.normalize/normalize
                                {:database 1
                                 :type     :query
                                 :query    {:breakout breakouts}}))
    1                             [[:field 1 nil]]
    [1]                           [[:field 1 nil]]
    [:field-id 1]                 [[:field 1 nil]]
    [[:field-id 1]]               [[:field 1 nil]]
    [:field 1 nil]                [[:field 1 nil]]
    [[:field 1 nil]]              [[:field 1 nil]]
    [1 2]                         [[:field 1 nil] [:field 2 nil]]
    [[:field-id 1] [:field-id 2]] [[:field 1 nil] [:field 2 nil]]))

(deftest ^:parallel normalize-by-schema-test
  (testing "normalize with an explicit schema"
    (is (= [:time-interval [:field 1 nil] -30 :day]
           (mbql.normalize/normalize ::mbql.s/Filter ["time-interval" ["field-id" 1] -30 "day"])))))

(deftest ^:parallel normalize-by-schema-test-2
  (testing "normalize with an explicit schema"
    (testing "should be able to modernize Fields anywhere we find them"
      (is (= [[:> [:field 1 nil] 3]
              [:and
               [:= [:field 2 nil] 2]
               [:segment 1]]
              [:metric 1]]
             (mbql.normalize/normalize [:sequential ::mbql.s/Filter]
                                       [[:> [:field-id 1] 3]
                                        ["and" [:= ["FIELD-ID" 2] 2]
                                         ["segment" 1]]
                                        [:metric 1]]))))))

(deftest ^:parallel normalize-by-schema-test-3
  (testing "normalize with an explicit schema"
    (testing "Should be able to modern Field options anywhere"
      (is (= [:field 2 {:temporal-unit :day}]
             (mbql.normalize/normalize ::mbql.s/field [:field 2 {"temporal-unit" "day"}]))))))

(deftest ^:parallel normalize-filter-by-schema-test
  (is (= [:!=
          [:expression "expr" {:base-type :type/Date}]
          [:field 66302 {:base-type :type/DateTime}]]
         (mbql.normalize/normalize
          ::mbql.s/Filter
          ["!="
           [:expression "expr" {:base-type :type/Date}]
           [:field 66302 {:base-type :type/DateTime}]]))))

(deftest ^:parallel do-not-normalize-fingerprints-test
  (testing "Numbers in fingerprints shouldn't get normalized"
    (let [fingerprint {:global {:distinct-count 1, :nil% 0}
                       :type   {:type/Number {:min 1
                                              :q1  1
                                              :q3  1
                                              :max 1
                                              :sd  0
                                              :avg 1}}}]
      (is (= fingerprint
             (mbql.normalize/normalize ::lib.schema.metadata.fingerprint/fingerprint fingerprint)))
      (doseq [path [[:query :source-metadata]
                    [:metabase-enterprise.sandbox.query-processor.middleware.sandboxing/original-metadata]
                    [:info :metadata/model-metadata]
                    [:query :joins 0 :source-metadata]]]
        (testing (pr-str path)
          (let [query (-> {:query
                           {:source-query
                            {:native     "SELECT USER_ID FROM ORDERS LIMIT 1"
                             :parameters [{:type   :category
                                           :target [:variable [:template-tag "sandbox"]]
                                           :value  "1"}]}
                            :joins    [{:alias "A"}]
                            :database 1}}
                          (assoc-in path [{:name         "USER_ID"
                                           :display_name "USER_ID"
                                           :base_type    :type/Integer
                                           :field_ref    [:field "USER_ID" {:base-type :type/Integer}]
                                           :fingerprint  fingerprint}]))]
            (is (= query
                   (mbql.normalize/normalize query)))))))))

(deftest ^:parallel remove-unsuitable-temporal-units-test
  (testing "Ignore unsuitable temporal units (such as bucketing a Date by minute) rather than erroring (#16485)"
    ;; this query is with legacy MBQL syntax. It's just copied directly from the original issue
    (let [query {:query {:filter ["<"
                                  ["datetime-field" ["field-literal" "date_seen" "type/Date"] "minute"]
                                  "2021-05-01T12:30:00"]}}]
      (is (= {:query {:filter [:<
                               [:field "date_seen" {:base-type :type/Date}]
                               "2021-05-01T12:30:00"]}}
             (mbql.normalize/normalize query))))))

(deftest ^:parallel normalize-aggregation-ref-test
  (are [clause] (= {:database 1
                    :type     :query
                    :query    {:order-by [[:asc [:aggregation 0]]]}}
                   (mbql.normalize/normalize
                    {:database 1
                     :type     :query
                     :query    {:order-by [[:asc clause]]}}))
    [:aggregation 0 nil]
    [:aggregation 0 {}]
    [:aggregation 0]))

(deftest ^:parallel dont-remove-nil-parameter-values-test
  (testing "The FE code is extremely dumb and will consider parameters to be changed (haveParametersChanged) if we strip out value: nil"
    (let [query {:type       :native
                 :database   1
                 :parameters [{:id     "d98c3875-e0f1-9270-d36a-5b729eef938e"
                               :target [:dimension [:template-tag "category"]]
                               :type   :category
                               :value  nil}]}]
      (is (=? {:parameters [{:id     "d98c3875-e0f1-9270-d36a-5b729eef938e"
                             :value  nil}]}
              (mbql.normalize/normalize query))))))

(deftest ^:parallel dont-normalize-actions-row-test
  (doseq [k [:create-row :update-row]]
    (testing k
      (let [query {:database   1
                   :type       :query
                   :query      {:source-table 2}
                   k {"x" 1, "y" {"z" 2}, "a" nil}}]
        (is (= query
               (mbql.normalize/normalize query)))))))

(deftest ^:parallel normalize-offset-test
  (is (=? [:offset
           {:effective-type :type/Float, :lib/uuid string?}
           [:field
            1
            {:base-type :type/Float, :effective-type :type/Float}]
           -1]
          (mbql.normalize/normalize
           ::mbql.s/offset
           ["offset"
            {"effective-type" "type/Float"}
            ["field"
             1
             {"base-type" "type/Float", "effective-type" "type/Float"}]
            -1]))))

(deftest ^:parallel normalize-legacy-filters-test
  (is (= {:database 1
          :type     :query
          :query    {:filter [:and
                              [:!= [:get-hour [:field 1 nil]] 0 23]
                              [:between [:field 1 nil] "2024-10-05" "2024-12-08"]]}}
         (mbql.normalize/normalize {:database 1
                                    :type     :query
                                    :query    {:filter [:and
                                                        [:!= [:field 1 {:temporal-unit :hour-of-day}] 0 23]
                                                        [:between [:field 1 nil] "2024-10-05" "2024-12-08"]]}}))))

(deftest ^:parallel normalize-datetime-test
  (is (= [:datetime ""]
         (mbql.normalize/normalize [:datetime ""])))
  (testing "if we add other options, they are preserved (and don't break anything)"
    (is (= [:datetime "" {:x "x"}]
           (mbql.normalize/normalize [:datetime "" {"x" "x"}]))))
  (is (= [:datetime "" {:mode :iso}]
         (mbql.normalize/normalize [:datetime "" {:mode :iso}])
         (mbql.normalize/normalize [:datetime "" {:mode "iso"}])
         (mbql.normalize/normalize ["datetime" "" {"mode" "iso"}]))))

(deftest ^:parallel normalize-datetime-test-2
  (is (= [:datetime
          [:field "DATE_TIME" {:effective-type :type/*, :base-type :type/*}]
          {:mode :simple-bytes}]
         (mbql.normalize/normalize
          ["datetime"
           ["field" "DATE_TIME" {:effective-type "type/*", :base-type "type/*"}]
           {"mode" "simplebytes"}]))))

(deftest ^:parallel normalize-time-interval-test
  (testing (str "If you specify a `:temporal-unit` for the Field inside a `:time-interval`, remove it. The unit"
                " in `:time-interval` takes precedence.")
    (is (= [:time-interval [:field 1 nil] -10 :minute]
           (mbql.normalize/normalize ::mbql.s/time-interval [:time-interval [:field 1 {:temporal-unit :hour}] -10 :minute])))))

(deftest ^:parallel normalize-incomplete-field-refs-test
  (is (= {:database 1
          :type     :query
          :query    {:source-table 2
                     :fields       [[:field 3 nil]]
                     :order-by     [[:asc [:field 3 nil]]]}}
         (mbql.normalize/normalize {:database 1
                                    :type     "query"
                                    :query    {:source-table 2
                                               :fields       [["field" 3 nil]]
                                               :order-by     [[:asc ["field" 3]]
                                                              [:asc ["field" 3]]]}}))))

(deftest ^:parallel normalize-relative-datetime-test
  (testing "Fix incorrect :relative-datetime clauses that use the wrong key (e.g. :now) instead of :current"
    (is (= [:relative-datetime :current]
           (mbql.normalize/normalize '(:relative-datetime :now))
           (mbql.normalize/normalize '(:relative-datetime "now"))
           (mbql.normalize/normalize '(:relative-datetime "current"))))))

(deftest ^:parallel normalize-case-test
  (is (= [:case
          [[[:> [:field 3 nil] 0]
            [:field 3 nil]]] ; drop the extra 3rd arg in the subclause
          {:default [:field 5 nil]}]
         (mbql.normalize/normalize
          ["case"
           [[[">" ["field" 3 nil] 0]
             ["field" 3]
             nil]]
           {"default" ["field" 5 {}]}]))))

(deftest ^:parallel normalize-literal-strings-in-custom-aggregations-test
  (testing "Strings are allowed as arguments to a custom aggregation (#66199)"
    (is (= [:max "Literal String"]
           (mbql.normalize/normalize ["max" "Literal String"])))
    (is (= [:aggregation-options
            [:max "Literal String"]
            {:name         "foo"
             :display-name "Foo"}]
           (mbql.normalize/normalize
            ["aggregation-options"
             ["max" "Literal String"]
             {"name"         "foo"
              "display-name" "Foo"}])))))
