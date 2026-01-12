(ns metabase.legacy-mbql.schema-test
  (:require
   #?@(:clj
       ([java-time.api :as t]))
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli :as mu]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel temporal-literal-test
  (testing "Make sure our schema validates temporal literal clauses correctly"
    (doseq [[schema-var cases] {::mbql.s/TemporalLiteral       [[true "00:00:00"]
                                                                [true "00:00:00Z"]
                                                                [true "00:00:00+00:00"]
                                                                [true "2022-01-01"]
                                                                [true "2022-01-01T00:00:00"]
                                                                [true "2022-01-01T00:00:00+00:00"]
                                                                [true "2022-01-01T00:00:00Z"]
                                                                [true "2022-01-01 00:00:00"]
                                                                [false "a string"]]
                                ::mbql.s/DateOrDatetimeLiteral [[false "00:00:00"]
                                                                [false "00:00:00Z"]
                                                                [false "00:00:00+00:00"]
                                                                [true "2022-01-01"]
                                                                [true "2022-01-01T00:00:00"]
                                                                [true "2022-01-01T00:00:00+00:00"]
                                                                [true "2022-01-01T00:00:00Z"]
                                                                [true "2022-01-01 00:00:00"]
                                                                [false "a string"]]
                                ::mbql.s/TimeLiteral           [[true "00:00:00"]
                                                                [true "00:00:00Z"]
                                                                [true "00:00:00+00:00"]
                                                                [false "2022-01-01"]
                                                                [false "2022-01-01T00:00:00"]
                                                                [false "2022-01-01T00:00:00+00:00"]
                                                                [false "2022-01-01T00:00:00Z"]
                                                                [false "2022-01-01 00:00:00"]
                                                                [false "a string"]]}
            [expected clause] cases]
      (testing (pr-str schema-var clause)
        (is (= expected
               (mr/validate schema-var clause)))))))

(deftest ^:parallel field-clause-test
  (testing "Make sure our schema validates `:field` clauses correctly"
    (doseq [[clause expected] {[:field 1 nil]                                                          true
                               [:field 1 {}]                                                           false
                               [:field 1 {:x true}]                                                    true
                               [:field 1 2]                                                            false
                               [:field "wow" nil]                                                      false
                               [:field "wow" {}]                                                       false
                               [:field "wow" 1]                                                        false
                               [:field "wow" {:base-type :type/Integer}]                               true
                               [:field "wow" {:base-type 100}]                                         false
                               [:field "wow" {:base-type :type/Integer, :temporal-unit :month}]        true
                               [:field "wow" {:base-type :type/Date, :temporal-unit :month}]           true
                               [:field "wow" {:base-type :type/DateTimeWithTZ, :temporal-unit :month}] true
                               [:field "wow" {:base-type :type/Time, :temporal-unit :month}]           false
                               [:field 1 {:binning {:strategy :num-bins}}]                             false
                               [:field 1 {:binning {:strategy :num-bins, :num-bins 1}}]                true
                               [:field 1 {:binning {:strategy :num-bins, :num-bins 1.5}}]              false
                               [:field 1 {:binning {:strategy :num-bins, :num-bins -1}}]               false
                               [:field 1 {:binning {:strategy :default}}]                              true
                               [:field 1 {:binning {:strategy :fake}}]                                 false}]
      (testing (pr-str clause)
        (is (= expected
               (mr/validate ::mbql.s/field clause)))))))

(deftest ^:parallel validate-template-tag-names-test
  (testing "template tags with mismatched keys/`:names` in definition should be disallowed\n"
    (let [correct-query {:database 1
                         :type     :native
                         :native   {:query         "SELECT * FROM table WHERE id = {{foo}}"
                                    :template-tags {"foo" {:id           "abc123"
                                                           :name         "foo"
                                                           :display-name "foo"
                                                           :type         :text}}}}
          bad-query     (assoc-in correct-query [:native :template-tags "foo" :name] "filter")]
      (testing (str "correct-query " (pr-str correct-query))
        (is (not (me/humanize (mr/explain ::mbql.s/Query correct-query))))
        (is (mr/validate ::mbql.s/Query correct-query)))
      (testing (str "bad-query " (pr-str bad-query))
        (is (me/humanize (mr/explain ::mbql.s/Query bad-query)))
        (is (= {:native {:template-tags ["keys in template tag map must match the :name of their values"]}}
               (me/humanize (mr/explain ::mbql.s/Query bad-query))))))))

(deftest ^:parallel coalesce-aggregation-test
  (testing "should be able to nest aggregation functions within a coalesce"
    (let [query {:database 1
                 :type :query
                 :query
                 {:source-table 5
                  :aggregation
                  [[:aggregation-options
                    [:/
                     [:sum [:field 42 {:base-type :type/Float}]]
                     [:coalesce [:sum [:field 36 {:base-type :type/Float}]] 1]]
                    {:name "Avg discount", :display-name "Avg discount"}]]}
                 :parameters []}]
      (is (not (me/humanize (mr/explain ::mbql.s/Query query)))))))

(deftest ^:parallel year-of-era-test
  (testing "year-of-era aggregations should be recognized"
    (let [query {:database 1
                 :type :query
                 :query
                 {:source-table 5
                  :aggregation [[:count]]
                  :breakout [[:field 49 {:base-type :type/Date, :temporal-unit :year-of-era, :source-field 43}]]}
                 :parameters []}]
      (is (not (me/humanize (mr/explain ::mbql.s/Query query)))))))

(deftest ^:parallel aggregation-reference-test
  (are [schema] (nil? (me/humanize (mr/explain schema [:aggregation 0])))
    ::mbql.s/aggregation
    ::mbql.s/Reference))

(deftest ^:parallel native-query-test
  (let [parameter-dimension    [:dimension [:template-tag "date_range"]]
        template-tag-dimension [:field 2 nil]]
    (is (nil? (me/humanize (mr/explain ::mbql.s/dimension parameter-dimension))))
    (is (nil? (me/humanize (mr/explain ::mbql.s/field template-tag-dimension))))
    (let [parameter    {:type   :date/range
                        :name   "created_at"
                        :target parameter-dimension
                        :value  "past1weeks"}
          template-tag {:name         "date_range"
                        :display-name "Date Range"
                        :type         :dimension
                        :widget-type  :date/all-options
                        :dimension    template-tag-dimension}]
      (is (nil? (me/humanize (mr/explain ::lib.schema.parameter/parameter parameter))))
      (is (nil? (me/humanize (mr/explain ::mbql.s/TemplateTag template-tag))))
      (let [query {:database 1
                   :type     :native
                   :native   {:query         (str/join \newline  ["SELECT dayname(\"TIMESTAMP\") as \"day\""
                                                                  "FROM checkins"
                                                                  "[[WHERE {{date_range}}]]"
                                                                  "ORDER BY \"TIMESTAMP\" ASC"
                                                                  " LIMIT 1"])
                              :template-tags {"date_range" template-tag}
                              :parameters    [parameter]}}]
        (is (nil? (me/humanize (mr/explain ::mbql.s/Query query))))))))

(deftest ^:parallel value-test
  (let [value [:value
               "192.168.1.1"
               {:base_type         :type/IPAddress
                :effective_type    :type/IPAddress
                :coercion_strategy nil
                :semantic_type     :type/IPAddress
                :database_type     "inet"
                :name              "ip"}]]
    (are [schema] (not (me/humanize (mr/explain schema value)))
      ::mbql.s/value
      ::mbql.s/EqualityComparable
      [:or ::mbql.s/absolute-datetime ::mbql.s/value])))

(deftest ^:parallel expression-value-wrapped-literals-test
  (are [value] (not (me/humanize (mr/explain ::mbql.s/MBQLQuery
                                             {:source-table 1, :expressions {"expr" [:value value nil]}})))
    ""
    "192.168.1.1"
    "2025-03-11"
    -1
    0
    1
    1.23
    true
    false))

;; Allowed in #67203 and above
(deftest ^:parallel expression-unwrapped-literals-test
  (are [value] (mr/validate ::mbql.s/MBQLQuery {:source-table 1, :expressions {"expr" value}})
    ""
    "192.168.1.1"
    "2025-03-11"
    -1
    0
    1
    1.23
    true
    false))

(deftest ^:parallel or-test
  (are [schema expected] (= expected
                            (mu.humanize/humanize (mr/explain schema [:value "192.168.1.1" {:base_type :type/FK}])))
    ::mbql.s/absolute-datetime
    "not an :absolute-datetime clause"

    [:or ::mbql.s/absolute-datetime]
    "not an :absolute-datetime clause"

    ::mbql.s/value
    [nil nil {:base_type "Not a valid base type: :type/FK"}]

    [:or ::mbql.s/value]
    [nil nil {:base_type "Not a valid base type: :type/FK"}]

    [:or ::mbql.s/absolute-datetime :string ::mbql.s/value]
    ["not an :absolute-datetime clause"
     "should be a string"
     [nil nil {:base_type "Not a valid base type: :type/FK"}]]))

(deftest ^:parallel relative-datetime-temporal-arithmetic-test
  (are [schema x] (not (me/humanize (mr/explain schema x)))
    ::mbql.s/Addable [:relative-datetime -1 :month]
    ::mbql.s/Addable [:interval -2 :month]
    ::mbql.s/+       [:+ [:relative-datetime -1 :month] [:interval -2 :month]]))

(deftest ^:parallel filter-test
  (are [x] (nil? (me/humanize (mr/explain ::mbql.s/Filter x)))
    [:value true nil]
    [:value false nil]
    [:expression "boolexpr"]
    [:field 1 nil]
    [:segment 1]
    [:and [:expression "bool1"] [:expression "bool2"]]
    [:or  [:expression "bool1"] [:expression "bool2"]]))

(deftest ^:parallel emptyable-filter-test
  (are [x] (not (me/humanize (mr/explain ::mbql.s/Filter x)))
    [:is-empty ""]
    [:is-empty "A"]
    [:is-empty [:field 1 nil]]
    [:is-empty [:ltrim "A"]]
    [:is-empty [:ltrim [:field 1 nil]]]
    [:not-empty ""]
    [:not-empty "A"]
    [:not-empty [:field 1 nil]]
    [:not-empty [:ltrim "A"]]
    [:not-empty [:ltrim [:field 1 nil]]]))

(deftest ^:parallel field-with-empty-name-test
  (testing "We need to support fields with empty names, this is legal in SQL Server (QUE-1418)"
    ;; we should support field names with only whitespace as well.
    (doseq [field-name [""
                        " "]
            :let [field-ref [:field field-name {:base-type :type/Text}]]]
      (testing (pr-str field-ref)
        (are [schema] (not (me/humanize (mr/explain schema field-ref)))
          ::mbql.s/Reference
          ::mbql.s/field)))))

(deftest ^:parallel datetime-schema-test
  (doseq [expr [[:datetime ""]
                [:datetime "" {}]
                [:datetime "" {:mode :iso}]
                [:datetime 10 {:mode :unix-seconds}]]]
    (is (mr/validate ::mbql.s/datetime expr))))

(deftest ^:parallel normalize-source-metadata-test
  (testing "normalize-source-metadata"
    (testing "should convert legacy field_refs to modern `:field` clauses"
      (is (= {:field_ref [:field 1 {:temporal-unit :month}], :base_type :type/*}
             (lib/normalize ::mbql.s/legacy-column-metadata
                            {:field_ref ["datetime-field" ["field-id" 1] "month"]}))))
    (testing "should correctly keywordize Field options"
      (is (= {:field_ref [:field 1 {:temporal-unit :month}], :base_type :type/*}
             (lib/normalize ::mbql.s/legacy-column-metadata
                            {:field_ref ["field" 1 {:temporal-unit "month"}]}))))))

(deftest ^:parallel do-not-normalize-fingerprints-test
  (let [col {:fingerprint {:global {:distinct-count 200, :nil% 0}
                           :type   {:type/DateTime {:earliest "2016-04-26T19:29:55.147Z"
                                                    :latest   "2019-04-15T13:34:19.931Z"}}}}]
    (is (= (assoc col :base_type :type/*)
           (lib/normalize ::mbql.s/legacy-column-metadata col)))))

(deftest ^:parallel normalize-evil-source-metadata-test
  (testing "Fix really messed up fingerprints with lower-cased type names (only in prod) (#63397)"
    (mu/disable-enforcement
      (is (= {:base_type   :type/*
              :fingerprint {:global {:distinct-count 418, :nil% 0.0}
                            :type
                            {:type/Text
                             {:percent-json 0.0, :percent-url 0.0, :percent-email 0.0, :percent-state 0.0, :average-length 13.26388888888889}}}}
             (lib/normalize
              ::mbql.s/legacy-column-metadata
              {:fingerprint
               {:global {:distinct-count 418, :nil% 0.0}
                :type
                {:type/text
                 {:percent-json 0.0, :percent-url 0.0, :percent-email 0.0, :percent-state 0.0, :average-length 13.26388888888889}}}}))))))

(deftest ^:parallel lib-normalize-legacy-field-ref-test
  (is (= [:field 100 nil]
         (lib/normalize ::mbql.s/field ["field" 100 {"temporal-unit" nil, "lib/uuid" "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"}]))))

(deftest ^:parallel lib-normalize-legacy-expression-ref-test
  (is (= [:expression "X"]
         (lib/normalize ::mbql.s/expression ["expression" "X" {"temporal-unit" nil, "lib/uuid" "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"}])))
  (is (= [:expression "X" {:temporal-unit :day}]
         (lib/normalize ::mbql.s/expression ["expression" "X" {"temporal-unit" "day", "lib/uuid" "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"}]))))

(deftest ^:parallel lib-normalize-legacy-binning-info-test
  (is (= {:base_type    :type/*
          :binning_info {:binning_strategy :num-bins
                         :num-bins         100
                         :strategy         :num-bins}
          :display_name "X"
          :name         "X"}
         ;; populate `:strategy` if we only have `:binning_strategy`
         (lib/normalize ::mbql.s/legacy-column-metadata {:name         "X"
                                                         :binning_info {"binning_strategy" "num-bins", "num-bins" 100}})
         ;; prefer `:strategy` over `:binning_strategy` if they conflict
         (lib/normalize ::mbql.s/legacy-column-metadata {:name         "X"
                                                         :binning_info {"binning_strategy" "default"
                                                                        "strategy"         "num-bins"
                                                                        "num-bins"         100}}))))

(deftest ^:parallel remove-inner-ident-test
  (testing "Remove deprecated keys like :model/inner_ident automatically (GIT-8399)"
    (is (= {:base_type :type/*, :name "X", :display_name "X"}
           (lib/normalize ::mbql.s/legacy-column-metadata {:name "X", :model/inner_ident "wow"})))))

(deftest ^:parallel normalize-aggregation-inside-non-aggregation-function-test
  (is (= [:concat "$" [:round [:sum [:field "cost_per_customer" {:base-type :type/Decimal}]]]]
         (lib/normalize
          ::mbql.s/Aggregation
          ["concat" "$" ["round" ["sum" ["field" "cost_per_customer" {"base-type" "type/Decimal"}]]]])))
  (is (= [:aggregation-options
          [:concat "$" [:round [:sum [:field "cost_per_customer" {:base-type :type/Decimal}]]]]
          {:name "Sum", :display-name "Sum"}]
         (lib/normalize
          ::mbql.s/Aggregation
          ["aggregation-options"
           ["concat" "$" ["round" ["sum" ["field" "cost_per_customer" {"base-type" "type/Decimal"}]]]]
           {"name" "Sum", "display-name" "Sum"}]))))

(deftest ^:parallel normalize-widget-type-test
  (is (= :category
         (lib/normalize ::mbql.s/WidgetType "category/=")))
  (is (= {:widget-type  :category
          :id           "e8b0b767-0f02-b640-5de3-128e7f7fd71e"
          :name         "device_category"
          :display-name "Device category"
          :type         :dimension
          :dimension    [:field 298221 nil]
          :default      nil}
         (lib/normalize
          ::mbql.s/TemplateTag
          {"id"           "e8b0b767-0f02-b640-5de3-128e7f7fd71e"
           "name"         "device_category"
           "display-name" "Device category"
           "type"         "dimension"
           "dimension"    ["field" 298221 nil]
           "widget-type"  "category/="
           "default"      nil}))))

(deftest ^:parallel normalize-text-clause-test
  (is (= [:text
          [:floor
           [:/ [:avg [:field 11476 {:base-type :type/Integer}]] 60]]]
         (lib/normalize ::mbql.s/ExpressionArg ["text" ["floor" ["/" ["avg" ["field" 11476 {"base-type" "type/Integer"}]] 60]]]))))

(deftest ^:parallel normalize-hairball-aggregation-expression-test
  (let [expr ["aggregation-options"
              ["concat"
               ["text" ["floor" ["/" ["avg" ["field" 11476 {"base-type" "type/Integer"}]] 60]]]
               ":"
               ["substring"
                ["concat"
                 "0"
                 ["text"
                  ["floor"
                   ["-"
                    ["avg" ["field" 11476 {"base-type" "type/Integer"}]]
                    ["*" ["floor" ["/" ["avg" ["field" 11476 {"base-type" "type/Integer"}]] 60]] 60]]]]]
                ["-"
                 ["+"
                  1
                  ["length"
                   ["concat"
                    "0"
                    ["text"
                     ["floor"
                      ["-"
                       ["avg" ["field" 11476 {"base-type" "type/Integer"}]]
                       ["*" ["floor" ["/" ["avg" ["field" 11476 {"base-type" "type/Integer"}]] 60]] 60]]]]]]]
                 2]
                2]]
              {"name" "Min+sec", "display-name" "Min+sec"}]
        normalized (lib/normalize ::mbql.s/Aggregation expr)]
    (is (= [:aggregation-options
            [:concat
             [:text
              [:floor
               [:/ [:avg [:field 11476 {:base-type :type/Integer}]] 60]]]
             ":"
             [:substring
              [:concat
               "0"
               [:text
                [:floor
                 [:-
                  [:avg [:field 11476 {:base-type :type/Integer}]]
                  [:*
                   [:floor
                    [:/ [:avg [:field 11476 {:base-type :type/Integer}]] 60]]
                   60]]]]]
              [:-
               [:+
                1
                [:length
                 [:concat
                  "0"
                  [:text
                   [:floor
                    [:-
                     [:avg [:field 11476 {:base-type :type/Integer}]]
                     [:*
                      [:floor
                       [:/
                        [:avg [:field 11476 {:base-type :type/Integer}]]
                        60]]
                      60]]]]]]]
               2]
              2]]
            {:name "Min+sec", :display-name "Min+sec"}]
           normalized))
    (is (mr/validate ::mbql.s/Aggregation normalized))))

(deftest ^:parallel normalize-aggregation-options-with-nil-options-test
  (testing "nil options in :aggregation-options should get normalized to an empty map"
    (let [normalized (lib/normalize ::mbql.s/aggregation-options [:aggregation-options [:count] nil])]
      (is (= [:aggregation-options [:count] {}]
             normalized))
      (is (mr/validate ::mbql.s/aggregation-options normalized))))
  (testing "::Aggregation itself should unwrap :aggregation-options with an empty options map"
    (is (= [:count]
           (lib/normalize ::mbql.s/Aggregation [:aggregation-options [:count] nil])
           (lib/normalize ::mbql.s/Aggregation [:aggregation-options [:count] {}])))))

(deftest ^:parallel normalize-template-tag-options-test
  (testing "template tag `:options` should get normalized correctly"
    (let [normalized (lib/normalize
                      ::mbql.s/TemplateTag
                      {"type"         "dimension"
                       "name"         "owner_name"
                       "id"           "d14f7964-4de7-4d0a-905c-2d2799e87db7"
                       "display-name" "Owner Name"
                       "default"      nil
                       "dimension"    ["field" 28486 nil]
                       "widget-type"  "string/contains"
                       "options"      {"case-sensitive" false}})]
      (is (= {:default      nil
              :dimension    [:field 28486 nil]
              :display-name "Owner Name"
              :id           "d14f7964-4de7-4d0a-905c-2d2799e87db7"
              :name         "owner_name"
              :options      {:case-sensitive false}
              :type         :dimension
              :widget-type  :string/contains}
             normalized))
      (is (mr/validate ::mbql.s/TemplateTag normalized)))))

(deftest ^:parallel automatically-remove-expression-idents-during-normalization-test
  (is (= {:type     :query
          :database 3
          :query    {:expressions  {"Organizer fees should be" 0.5}
                     :source-table 310}}
         (lib/normalize
          ::mbql.s/Query
          {"database" 3
           "type"     "query"
           "query"    {"source-table"      310
                       "expressions"       {"Organizer fees should be" 0.5}
                       "expression-idents" {"Organizer fees should be"
                                            "expression_9CRGGaQ6ASwsIRouX0ID0@0__Organizer fees should be"}}}))))

(deftest ^:parallel allow-raw-literals-as-expressions-tst
  (doseq [[message xs] {"Raw numeric literals"            [10 10.5]
                        "Raw string literals"             ["X"]
                        "Raw boolean literals"            [true false]
                        #?(:clj "Raw JVM temporal types") #?(:clj [(t/local-date "2025-12-18")
                                                                   (t/local-date-time "2025-12-18T12:57:00")
                                                                   (t/offset-date-time "2025-12-18T12:57:00-08:00")
                                                                   (t/zoned-date-time "2025-12-18T12:57:00-08:00[US/Pacific]")
                                                                   (t/local-time "12:57:00")
                                                                   (t/offset-time "12:57:00-08:00")
                                                                   (t/instant (t/zoned-date-time "2025-12-18T12:57:00-08:00[US/Pacific]"))])}
          x            xs]
    (testing (str message " should be allowed as expressions (x =" (pr-str x) ")")
      (let [query {:type     :query
                   :database 3
                   :query    {:expressions  {"Organizer fees should be" x}
                              :source-table 310}}]
        (is (mr/validate ::mbql.s/Query query))))))

(deftest ^:parallel case-if-aggregation-expression-test
  (doseq [clause [:if :case]]
    (testing (str clause " should be allowed as an aggregation expression if it contains an aggregation")
      (let [normalized (lib/normalize
                        ::mbql.s/Aggregation
                        [(name clause)
                         [[["="
                            ["sum-where"
                             ["field" 781 {"base-type" "type/Float"}]
                             ["=" ["expression" "Paid" {"base-type" "type/Boolean"}] true]]
                            0]
                           0]]
                         {"default"
                          ["/"
                           ["sum-where"
                            ["field" 755 {"base-type" "type/Float"}]
                            ["=" ["expression" "Refund" {"base-type" "type/Boolean"}] true]]
                           ["sum-where"
                            ["field" 781 {"base-type" "type/Float"}]
                            ["=" ["expression" "Paid" {"base-type" "type/Boolean"}] true]]]}])]
        (is (= [clause
                [[[:=
                   [:sum-where
                    [:field 781 {:base-type :type/Float}]
                    [:= [:expression "Paid" {:base-type :type/Boolean}] true]]
                   0]
                  0]]
                {:default
                 [:/
                  [:sum-where
                   [:field 755 {:base-type :type/Float}]
                   [:= [:expression "Refund" {:base-type :type/Boolean}] true]]
                  [:sum-where
                   [:field 781 {:base-type :type/Float}]
                   [:= [:expression "Paid" {:base-type :type/Boolean}] true]]]}]
               normalized))
        (is (mr/validate ::mbql.s/Aggregation normalized))))))

(deftest ^:parallel allow-coalesce-as-datetime-expression-test
  (let [normalized (lib/normalize
                    ::mbql.s/datetime-diff
                    ["datetime-diff"
                     ["coalesce"
                      ["field" 191303 {"base-type" "type/DateTimeWithLocalTZ"}]
                      ["field" 191302 {"base-type" "type/DateTimeWithLocalTZ"}]]
                     ["coalesce"
                      ["field" 191332 {"base-type" "type/DateTimeWithLocalTZ"}]
                      ["field" 191333 {"base-type" "type/DateTimeWithLocalTZ"}]]
                     "minute"])]
    (is (= [:datetime-diff
            [:coalesce
             [:field 191303 {:base-type :type/DateTimeWithLocalTZ}]
             [:field 191302 {:base-type :type/DateTimeWithLocalTZ}]]
            [:coalesce
             [:field 191332 {:base-type :type/DateTimeWithLocalTZ}]
             [:field 191333 {:base-type :type/DateTimeWithLocalTZ}]]
            :minute]
           normalized))
    (is (mr/validate ::mbql.s/datetime-diff normalized))))

(deftest ^:parallel allow-if-and-case-as-datetime-expression-test
  (doseq [clause [:if :case]]
    (testing (str clause " should be allowed as an aggregation expression if it contains an aggregation")
      (let [normalized (lib/normalize
                        ::mbql.s/DateTimeExpressionArg
                        [(name clause)
                         [[["="
                            ["sum-where"
                             ["field" 781 {"base-type" "type/Float"}]
                             ["=" ["expression" "Paid" {"base-type" "type/Boolean"}] true]]
                            0]
                           0]]
                         {"default"
                          ["/"
                           ["sum-where"
                            ["field" 755 {"base-type" "type/Float"}]
                            ["=" ["expression" "Refund" {"base-type" "type/Boolean"}] true]]
                           ["sum-where"
                            ["field" 781 {"base-type" "type/Float"}]
                            ["=" ["expression" "Paid" {"base-type" "type/Boolean"}] true]]]}])]
        (is (= [clause
                [[[:=
                   [:sum-where
                    [:field 781 {:base-type :type/Float}]
                    [:= [:expression "Paid" {:base-type :type/Boolean}] true]]
                   0]
                  0]]
                {:default
                 [:/
                  [:sum-where
                   [:field 755 {:base-type :type/Float}]
                   [:= [:expression "Refund" {:base-type :type/Boolean}] true]]
                  [:sum-where
                   [:field 781 {:base-type :type/Float}]
                   [:= [:expression "Paid" {:base-type :type/Boolean}] true]]]}]
               normalized))
        (is (mr/validate ::mbql.s/DateTimeExpressionArg normalized))))))

(deftest ^:parallel normalize-unwrapped-field-id-test
  (is (= [:sum [:field 10 nil]]
         (lib/normalize ::mbql.s/sum [:sum 10]))))

(deftest ^:parallel allow-aggregation-refs-inside-expressions-test
  (let [expr ["concat"
              "We saw a change of "
              ["aggregation" 1 {"base-type" "type/Integer", "name" "Ag 1"}] "%."]
        normalized (lib/normalize ::mbql.s/concat expr)]
    (is (= [:concat
            "We saw a change of "
            [:aggregation 1 {:base-type :type/Integer, :name "Ag 1"}] "%."]
           normalized))
    (is (mr/validate ::mbql.s/concat normalized))))

(deftest ^:parallel allow-aggregation-refs-inside-aggregations-test
  (let [ags        [["concat"
                     "We saw a change of "
                     ["aggregation" 1 {"base-type" "type/Integer"}] "%."]
                    ["round"
                     ["*"
                      ["avg"
                       ["/"
                        ["field" "rating_change" {"base-type" "type/Decimal"}]
                        ["field" "first_rating" {"base-type" "type/Integer"}]]]
                      100]]]
        normalized (lib/normalize ::mbql.s/Aggregations ags)]
    (is (= [[:concat
             "We saw a change of "
             [:aggregation 1 {:base-type :type/Integer}] "%."]
            [:round
             [:*
              [:avg
               [:/
                [:field "rating_change" {:base-type :type/Decimal}]
                [:field "first_rating" {:base-type :type/Integer}]]]
              100]]]
           normalized))
    (is (mr/validate ::mbql.s/Aggregations normalized))))

(deftest ^:parallel is-null-not-null-arbitrary-expressions-test
  (testing "is-null and not-null should allow arbitrary expressions"
    (doseq [clause [:is-null
                    :not-null]]
      (let [schema     (keyword "metabase.legacy-mbql.schema" (name clause))
            expr       [(name clause)
                        ["="
                         ["field" 620 {"base-type" "type/Text"}]
                         false]]
            normalized (lib/normalize schema expr)]
        (is (= [clause
                [:=
                 [:field 620 {:base-type :type/Text}]
                 false]]
               normalized))
        (is (mr/validate schema normalized))))))

(deftest ^:parallel allow-temporal-args-for-minus-test
  (let [expr       ["-"
                    ["date" ["now"]]
                    ["expression" "Last_Date_Active" {"base-type" "type/DateTimeWithLocalTZ"}]]
        normalized (lib/normalize ::mbql.s/- expr)]
    (is (= [:-
            [:date [:now]]
            [:expression "Last_Date_Active" {:base-type :type/DateTimeWithLocalTZ}]]
           normalized))
    (is (mr/validate ::mbql.s/- normalized))))
