(ns metabase.mbql.util-test
  (:require [clojure.test :as t]
            [metabase.mbql.util :as mbql.u]
            metabase.types))

(comment metabase.types/keep-me)

(t/deftest simplify-compound-filter-test
  (t/is (= [:= [:field 1 nil] 2]
           (mbql.u/simplify-compound-filter [:and [:= [:field 1 nil] 2]]))
        "can `simplify-compound-filter` fix `and` or `or` with only one arg?")
  (t/is (= [:and
            [:= [:field 1 nil] 2]
            [:= [:field 3 nil] 4]
            [:= [:field-id 5] 6]]
           (mbql.u/simplify-compound-filter [:and
                                             [:= [:field 1 nil] 2]
                                             [:and
                                              [:= [:field 3 nil] 4]
                                              [:and
                                               [:= [:field-id 5] 6]]]]))
        "can `simplify-compound-filter` unnest nested `and`s or `or`s?")
  (t/is (= [:and [:= [:field 1 nil] 2] [:= [:field 3 nil] 4]]
           (mbql.u/simplify-compound-filter [:and [:= [:field 1 nil] 2] [:= [:field 3 nil] 4] [:= [:field 1 nil] 2]]))
        "can `simplify-compound-filter` remove duplicates?")
  (t/is (= [:= [:field 1 nil] 2]
           (mbql.u/simplify-compound-filter [:not [:not [:= [:field 1 nil] 2]]]))
        "can `simplify-compound-filter` eliminate `not` inside a `not`?")
  (t/testing "removing empty/nil filter clauses"
    (t/is (= nil
             (mbql.u/simplify-compound-filter nil))
          "does `simplify-compound-filter` return `nil` for empty filter clauses?")

    (t/is (= nil
             (mbql.u/simplify-compound-filter [])))

    (t/is (= nil
             (mbql.u/simplify-compound-filter [nil nil nil])))

    (t/is (= nil
             (mbql.u/simplify-compound-filter [:and nil nil])))

    (t/is (= nil
             (mbql.u/simplify-compound-filter [:and nil [:and nil nil nil] nil])))
    (t/is (= [:= [:field 1 nil] 2]
             (mbql.u/simplify-compound-filter [:and nil [:and nil [:= [:field 1 nil] 2] nil] nil])))
    (t/is (= [:and
              [:= [:field 1 nil] 2]
              [:= [:field 3 nil] 4]
              [:= [:field-id 5] 6]
              [:= [:field-id 7] 8]
              [:= [:field-id 9] 10]]
             (mbql.u/simplify-compound-filter
              [:and
               nil
               [:= [:field 1 nil] 2]
               [:and
                [:= [:field 3 nil] 4]]
               nil
               [:and
                [:and
                 [:and
                  [:= [:field-id 5] 6]
                  nil
                  nil]
                 [:= [:field-id 7] 8]
                 [:= [:field-id 9] 10]]]]))))
  (t/is (= {:aggregation [[:share [:and
                                   [:= [:field 1 nil] 2]
                                   [:= [:field 3 nil] 4]
                                   [:= [:field-id 5] 6]
                                   [:= [:field-id 7] 8]
                                   [:= [:field-id 9] 10]]]]}
           (mbql.u/simplify-compound-filter
            {:aggregation [[:share [:and
                                    nil
                                    [:= [:field 1 nil] 2]
                                    [:and
                                     [:= [:field 3 nil] 4]]
                                    nil
                                    [:and
                                     [:and
                                      [:and
                                       [:= [:field-id 5] 6]
                                       nil
                                       nil]
                                      [:= [:field-id 7] 8]
                                      [:= [:field-id 9] 10]]]]]]}))
        "`simplify-compound-filter` should also work with more complex structures")
  (t/testing "Check that `simplify-compound-filter` can apply de Morgan's law on `:not`"
    (t/testing ":and clauses"
      (t/is (= [:or
                [:not [:= [:field 1 nil] 2]]
                [:not [:= [:field 2 nil] 3]]]
               (mbql.u/simplify-compound-filter [:not [:and
                                                       [:= [:field 1 nil] 2]
                                                       [:= [:field 2 nil] 3]]]))))
    (t/testing ":or clauses"
      (t/is (= [:and
                [:not [:= [:field 1 nil] 2]]
                [:not [:= [:field 2 nil] 3]]]
               (mbql.u/simplify-compound-filter [:not [:or
                                                       [:= [:field 1 nil] 2]
                                                       [:= [:field 2 nil] 3]]]))
            "Check that `simplify-compound-filter` can apply de Morgan's law on `:not` over `:or`")))
  (t/testing "check that `simplify-compound-filter` doesn't remove `nil` from filters where it's being used as the value"
    (t/is (= [:= [:field 1 nil] nil]
             (mbql.u/simplify-compound-filter [:= [:field 1 nil] nil])))
    (t/is (= [:= [:field 1 nil] nil]
             (mbql.u/simplify-compound-filter [:and nil [:= [:field 1 nil] nil]])))))

(t/deftest add-order-by-clause-test
  (t/testing "can we add an order-by clause to a query?"
    (t/is (= {:source-table 1, :order-by [[:asc [:field 10 nil]]]}
             (mbql.u/add-order-by-clause {:source-table 1} [:asc [:field 10 nil]])))

    (t/is (= {:source-table 1
              :order-by     [[:asc [:field 10 nil]]
                             [:asc [:field 20 nil]]]}
             (mbql.u/add-order-by-clause {:source-table 1
                                          :order-by     [[:asc [:field 10 nil]]]}
                                         [:asc [:field 20 nil]]))))

  (t/testing "duplicate clauses should get ignored"
    (t/is (= {:source-table 1
              :order-by     [[:asc [:field 10 nil]]]}
             (mbql.u/add-order-by-clause {:source-table 1
                                          :order-by     [[:asc [:field 10 nil]]]}
                                         [:asc [:field 10 nil]]))))

  (t/testing "as should clauses that reference the same Field"
    (t/is (= {:source-table 1
              :order-by     [[:asc [:field 10 nil]]]}
             (mbql.u/add-order-by-clause {:source-table 1
                                          :order-by     [[:asc [:field 10 nil]]]}
                                         [:desc [:field 10 nil]])))

    (t/testing "fields with different amounts of wrapping (plain field vs datetime-field)"
      (t/is (= {:source-table 1
                :order-by     [[:asc [:field 10 nil]]]}
               (mbql.u/add-order-by-clause {:source-table 1
                                            :order-by     [[:asc [:field 10 nil]]]}
                                           [:asc [:field 10 {:temporal-unit :day}]]))))))

(t/deftest combine-filter-clauses-test
  (t/is (= [:and [:= [:field 1 nil] 100] [:= [:field 2 nil] 200]]
           (mbql.u/combine-filter-clauses
            [:= [:field 1 nil] 100]
            [:= [:field 2 nil] 200]))
        "Should be able to combine non-compound clauses")
  (t/is (= [:and
            [:= [:field 1 nil] 100]
            [:= [:field 2 nil] 200]
            [:= [:field 3 nil] 300]]
           (mbql.u/combine-filter-clauses
            [:= [:field 1 nil] 100]
            [:and
             [:= [:field 2 nil] 200]
             [:= [:field 3 nil] 300]]))
        "Should be able to combine into an exisiting compound clause")
  (t/is (= [:and
            [:= [:field 1 nil] 100]
            [:= [:field 2 nil] 200]
            [:= [:field 3 nil] 300]
            [:= [:field 4 nil] 300]]
           (mbql.u/combine-filter-clauses
            [:and
             [:= [:field 1 nil] 100]
             [:= [:field 2 nil] 200]]
            [:and
             [:= [:field 3 nil] 300]
             [:= [:field 4 nil] 300]]))
        "Should be able to combine multiple compound clauses"))

(t/deftest add-filter-clause-test
  (t/is (= {:database 1
            :type     :query
            :query    {:source-table 1
                       :filter       [:and [:= [:field 1 nil] 100] [:= [:field 2 nil] 200]]}}
           (mbql.u/add-filter-clause
            {:database 1
             :type     :query
             :query    {:source-table 1
                        :filter       [:= [:field 1 nil] 100]}}
            [:= [:field 2 nil] 200]))
        "Should be able to add a filter clause to a query"))

(t/deftest desugar-time-interval-test
  (t/is (= [:between
            [:field 1 {:temporal-unit :month}]
            [:relative-datetime 1 :month]
            [:relative-datetime 2 :month]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 2 :month]))
        "`time-interval` with value > 1 or < -1 should generate a `between` clause")
  (t/is (= [:between
            [:field 1 {:temporal-unit :month}]
            [:relative-datetime 0 :month]
            [:relative-datetime 2 :month]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 2 :month {:include-current true}]))
        "test the `include-current` option -- interval should start or end at `0` instead of `1`")
  (t/is (= [:=
            [:field 1 {:temporal-unit :month}]
            [:relative-datetime 1 :month]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 1 :month]))
        "`time-interval` with value = 1 should generate an `=` clause")
  (t/is (= [:=
            [:field 1 {:temporal-unit :week}]
            [:relative-datetime -1 :week]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] -1 :week]))
        "`time-interval` with value = -1 should generate an `=` clause")
  (t/testing "`include-current` option"
    (t/is (= [:between
              [:field 1 {:temporal-unit :month}]
              [:relative-datetime 0 :month]
              [:relative-datetime 1 :month]]
             (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 1 :month {:include-current true}]))
          "interval with value = 1 should generate a `between` clause")
    (t/is (= [:between
              [:field 1 {:temporal-unit :day}]
              [:relative-datetime -1 :day]
              [:relative-datetime 0 :day]]
             (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] -1 :day {:include-current true}]))
          "`include-current` option -- interval with value = 1 should generate a `between` clause"))
  (t/is (= [:=
            [:field 1 {:temporal-unit :week}]
            [:relative-datetime 0 :week]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] :current :week]))
        "keywords like `:current` should work correctly"))

(t/deftest desugar-relative-datetime-with-current-test
  (t/testing "when comparing `:relative-datetime`to `:field`, it should take the temporal unit of the `:field`"
    (t/is (= [:=
              [:field 1 {:temporal-unit :minute}]
              [:relative-datetime 0 :minute]]
             (mbql.u/desugar-filter-clause
              [:=
               [:field 1 {:temporal-unit :minute}]
               [:relative-datetime :current]]))))
  (t/testing "otherwise it should just get a unit of `:default`"
    (t/is (= [:=
              [:field 1 nil]
              [:relative-datetime 0 :default]]
             (mbql.u/desugar-filter-clause
              [:=
               [:field 1 nil]
               [:relative-datetime :current]]))))
  (t/testing "we should be able to handle datetime fields even if they are nested inside another clause"
    (t/is (= [:=
              [:field 1 {:temporal-unit :week, :binning {:strategy :default}}]
              [:relative-datetime 0 :week]]
             (mbql.u/desugar-filter-clause
              [:=
               [:field 1 {:temporal-unit :week, :binning {:strategy :default}}]
               [:relative-datetime :current]])))))

(t/deftest desugar-other-filter-clauses-test
  (t/testing "desugaring := and :!= with extra args"
    (t/is (= [:or
              [:= [:field 1 nil] 2]
              [:= [:field 1 nil] 3]
              [:= [:field 1 nil] 4]
              [:= [:field 1 nil] 5]]
             (mbql.u/desugar-filter-clause [:= [:field 1 nil] 2 3 4 5]))
          "= with extra args should get converted to or")
    (t/is (= [:and
              [:!= [:field 1 nil] 2]
              [:!= [:field 1 nil] 3]
              [:!= [:field 1 nil] 4]
              [:!= [:field 1 nil] 5]]
             (mbql.u/desugar-filter-clause [:!= [:field 1 nil] 2 3 4 5]))
          "!= with extra args should get converted to or"))
  (t/testing "desugaring :inside"
    (t/is (= [:and
              [:between [:field 1 nil] -10.0 10.0]
              [:between [:field 2 nil] -20.0 20.0]]
             (mbql.u/desugar-filter-clause [:inside [:field 1 nil] [:field 2 nil] 10.0 -20.0 -10.0 20.0]))))
  (t/testing "desugaring :is-null"
    (t/is (= [:= [:field 1 nil] nil]
             (mbql.u/desugar-filter-clause [:is-null [:field 1 nil]]))))
  (t/testing "desugaring :not-null"
    (t/is (= [:!= [:field 1 nil] nil]
             (mbql.u/desugar-filter-clause [:not-null [:field 1 nil]]))))
  (t/testing "desugaring :is-empty"
    (t/is (= [:or [:= [:field 1 nil] nil]
              [:= [:field 1 nil] ""]]
             (mbql.u/desugar-filter-clause [:is-empty [:field 1 nil]]))))
  (t/testing "desugaring :not-empty"
    (t/is (= [:and [:!= [:field 1 nil] nil]
              [:!= [:field 1 nil] ""]]
             (mbql.u/desugar-filter-clause [:not-empty [:field 1 nil]])))))

(t/deftest desugar-does-not-contain-test
  (t/testing "desugaring does-not-contain without options"
    (t/is (= [:not [:contains [:field 1 nil] "ABC"]]
             (mbql.u/desugar-filter-clause [:does-not-contain [:field 1 nil] "ABC"]))))
  (t/testing "desugaring does-not-contain *with* options"
    (t/is (= [:not [:contains [:field 1 nil] "ABC" {:case-sensitive false}]]
             (mbql.u/desugar-filter-clause [:does-not-contain [:field 1 nil] "ABC" {:case-sensitive false}])))))

(t/deftest negate-simple-filter-clause-test
  (t/testing :=
    (t/is (= [:!= [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:= [:field 1 nil] 10]))))
  (t/testing :!=
    (t/is (= [:= [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:!= [:field 1 nil] 10]))))
  (t/testing :>
    (t/is (= [:<= [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:> [:field 1 nil] 10]))))
  (t/testing :<
    (t/is (= [:>= [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:< [:field 1 nil] 10]))))
  (t/testing :>=
    (t/is (= [:< [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:>= [:field 1 nil] 10]))))
  (t/testing :<=
    (t/is (= [:> [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:<= [:field 1 nil] 10]))))
  (t/testing :between
    (t/is (= [:or
              [:< [:field 1 nil] 10]
              [:> [:field 1 nil] 20]]
             (mbql.u/negate-filter-clause [:between [:field 1 nil] 10 20]))))
  (t/testing :contains
    (t/is (= [:not [:contains [:field 1 nil] "ABC"]]
             (mbql.u/negate-filter-clause [:contains [:field 1 nil] "ABC"]))))
  (t/testing :starts-with
    (t/is (= [:not [:starts-with [:field 1 nil] "ABC"]]
             (mbql.u/negate-filter-clause [:starts-with [:field 1 nil] "ABC"]))))
  (t/testing :ends-with
    (t/is (= [:not [:ends-with [:field 1 nil] "ABC"]]
             (mbql.u/negate-filter-clause [:ends-with [:field 1 nil] "ABC"])))))

(t/deftest negate-compund-filter-clause-test
  (t/testing :not
    (t/is (= [:= [:field 1 nil] 10]
             (mbql.u/negate-filter-clause [:not [:= [:field 1 nil] 10]]))
          "negating `:not` should simply unwrap the clause"))
  (t/testing :and
    (t/is (= [:or
              [:!= [:field 1 nil] 10]
              [:!= [:field 2 nil] 20]]
             (mbql.u/negate-filter-clause
              [:and
               [:= [:field 1 nil] 10]
               [:= [:field 2 nil] 20]]))))
  (t/testing :or
    (t/is (= [:and
              [:= [:field 1 nil] 10]
              [:= [:field 2 nil] 20]]
             (mbql.u/negate-filter-clause
              [:or
               [:!= [:field 1 nil] 10]
               [:!= [:field 2 nil] 20]])))))

(t/deftest negate-syntactic-sugar-filter-clause-test
  (t/testing "= with extra args"
    (t/is (= [:and
              [:!= [:field 1 nil] 10]
              [:!= [:field 1 nil] 20]
              [:!= [:field 1 nil] 30]]
             (mbql.u/negate-filter-clause [:= [:field 1 nil] 10 20 30]))))
  (t/testing "!= with extra args"
    (t/is (= [:or
              [:= [:field 1 nil] 10]
              [:= [:field 1 nil] 20]
              [:= [:field 1 nil] 30]]
             (mbql.u/negate-filter-clause [:!= [:field 1 nil] 10 20 30]))))
  (t/testing :time-interval
    (t/is (= [:!=
              [:field 1 {:temporal-unit :week}]
              [:relative-datetime 0 :week]]
             (mbql.u/negate-filter-clause [:time-interval [:field 1 nil] :current :week]))))
  (t/testing :is-null
    (t/is (= [:!= [:field 1 nil] nil]
             (mbql.u/negate-filter-clause [:is-null [:field 1 nil]]))))
  (t/testing :not-null
    (t/is (= [:= [:field 1 nil] nil]
             (mbql.u/negate-filter-clause [:not-null [:field 1 nil]]))))
  (t/testing :inside
    (t/is (= [:or
              [:< [:field 1 nil] -10.0]
              [:> [:field 1 nil] 10.0]
              [:< [:field 2 nil] -20.0]
              [:> [:field 2 nil] 20.0]]
             (mbql.u/negate-filter-clause
              [:inside [:field 1 nil] [:field 2 nil] 10.0 -20.0 -10.0 20.0])))))

(t/deftest join->source-table-id-test
  (let [join {:strategy  :left-join
              :condition [:=
                          [:field 48 nil]
                          [:field 44 {:join-alias "products"}]]
              :alias     "products"}]
    (t/is (= 5
             (mbql.u/join->source-table-id (assoc join :source-table 5))))
    (t/is (= 5
             (mbql.u/join->source-table-id (assoc join :source-query {:source-table 5}))))))


;;; ---------------------------------------------- aggregation-at-index ----------------------------------------------

(def ^:private query-with-some-nesting
  {:database 1
   :type     :query
   :query    {:source-query {:source-table 1
                             :aggregation  [[:stddev [:field 1 nil]]
                                            [:min [:field 1 nil]]]}
              :aggregation  [[:avg [:field 1 nil]]
                             [:max [:field 1 nil]]]}})

(t/deftest aggregation-at-index-test
  (doseq [[input expected] {[0]   [:avg [:field 1 nil]]
                            [1]   [:max [:field 1 nil]]
                            [0 0] [:avg [:field 1 nil]]
                            [0 1] [:stddev [:field 1 nil]]
                            [1 1] [:min [:field 1 nil]]}]
    (t/testing (pr-str (cons 'aggregation-at-index input))
      (t/is (= expected
               (apply mbql.u/aggregation-at-index query-with-some-nesting input))))))


;;; --------------------------------- Unique names & transforming ags to have names ----------------------------------

(t/deftest uniquify-names
  (t/testing "can we generate unique names?"
    (t/is (= ["count" "sum" "count_2" "count_3"]
             (mbql.u/uniquify-names ["count" "sum" "count" "count"]))))

  (t/testing "what if we try to trick it by using a name it would have generated?"
    (t/is (= ["count" "count_2" "count_2_2"]
             (mbql.u/uniquify-names ["count" "count" "count_2"]))))

  (t/testing (str "for wacky DBMSes like SQL Server that return blank column names sometimes let's make sure we handle "
                "those without exploding")
    (t/is (= ["" "_2"]
             (mbql.u/uniquify-names ["" ""])))))

(t/deftest uniquify-named-aggregations-test
  (t/is (= [[:aggregation-options [:count] {:name "count"}]
            [:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
            [:aggregation-options [:count] {:name "count_2"}]
            [:aggregation-options [:count] {:name "count_3"}]]
           (mbql.u/uniquify-named-aggregations
            [[:aggregation-options [:count] {:name "count"}]
             [:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
             [:aggregation-options [:count] {:name "count"}]
             [:aggregation-options [:count] {:name "count"}]])))

  (t/testing "what if we try to trick it by using a name it would have generated?"
    (t/is (= [[:aggregation-options [:count] {:name "count"}]
              [:aggregation-options [:count] {:name "count_2"}]
              [:aggregation-options [:count] {:name "count_2_2"}]]
             (mbql.u/uniquify-named-aggregations
              [[:aggregation-options [:count] {:name "count"}]
               [:aggregation-options [:count] {:name "count"}]
               [:aggregation-options [:count] {:name "count_2"}]])))))

(t/deftest pre-alias-aggregations-test
  (letfn [(simple-ag->name [[ag-name]]
            (name ag-name))]
    (t/testing "can we wrap all of our aggregation clauses in `:named` clauses?"
      (t/is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
                [:aggregation-options [:count [:field 1 nil]] {:name "count"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
                [:aggregation-options [:avg [:field 1 nil]]   {:name "avg"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
                [:aggregation-options [:min [:field 1 nil]]   {:name "min"}]]
               (mbql.u/pre-alias-aggregations simple-ag->name
                 [[:sum [:field 1 nil]]
                  [:count [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:avg [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:min [:field 1 nil]]]))))

    (t/testing "we shouldn't change the name of ones that are already named"
      (t/is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
                [:aggregation-options [:count [:field 1 nil]] {:name "count"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
                [:aggregation-options [:avg [:field 1 nil]]   {:name "avg"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum_2"}]
                [:aggregation-options [:min [:field 1 nil]]   {:name "min"}]]
               (mbql.u/pre-alias-aggregations simple-ag->name
                 [[:sum [:field 1 nil]]
                  [:count [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:avg [:field 1 nil]]
                  [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2"}]
                  [:min [:field 1 nil]]]))))


    (t/testing "ok, can we do the same thing as the tests above but make those names *unique* at the same time?"
      (t/is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}  ]
                [:aggregation-options [:count [:field 1 nil]] {:name "count"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum_2"}]
                [:aggregation-options [:avg [:field 1 nil]]   {:name "avg"}  ]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum_3"}]
                [:aggregation-options [:min [:field 1 nil]]   {:name "min"}  ]]
               (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
                 [[:sum [:field 1 nil]]
                  [:count [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:avg [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:min [:field 1 nil]]])))

      (t/is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
                [:aggregation-options [:count [:field 1 nil]] {:name "count"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum_2"}]
                [:aggregation-options [:avg [:field 1 nil]]   {:name "avg"}]
                [:aggregation-options [:sum [:field 1 nil]]   {:name "sum_2_2"}]
                [:aggregation-options [:min [:field 1 nil]]   {:name "min"}]]
               (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
                 [[:sum [:field 1 nil]]
                  [:count [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:avg [:field 1 nil]]
                  [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2"}]
                  [:min [:field 1 nil]]]))))

    (t/testing (str "if `:aggregation-options` only specifies `:display-name` it should still a new `:name`. "
                  "`pre-alias-and-uniquify-aggregations` shouldn't stomp over display name")
      (t/is (= [[:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
                [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2"}]
                [:aggregation-options [:sum [:field 1 nil]] {:display-name "Sum of Field 1", :name "sum_3"}]]
               (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
                 [[:sum [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:aggregation-options [:sum [:field 1 nil]] {:display-name "Sum of Field 1"}]])))

      (t/testing "if both are specified, `display-name` should still be propagated"
        (t/is (= [[:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
                  [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2"}]
                  [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2_2", :display-name "Sum of Field 1"}]]
                 (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
                   [[:sum [:field 1 nil]]
                    [:sum [:field 1 nil]]
                    [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2", :display-name "Sum of Field 1"}]])))))))

(t/deftest unique-name-generator-test
  (t/testing "Can we get a simple unique name generator"
    (t/is (= ["count" "sum" "count_2" "count_2_2"]
             (map (mbql.u/unique-name-generator) ["count" "sum" "count" "count_2"]))))
  (t/testing "Can we get an idempotent unique name generator"
    (t/is (= ["count" "sum" "count" "count_2"]
             (map (mbql.u/unique-name-generator) [:x :y :x :z] ["count" "sum" "count" "count_2"]))))
  (t/testing "Can the same object have multiple aliases"
    (t/is (= ["count" "sum" "count" "count_2"]
             (map (mbql.u/unique-name-generator) [:x :y :x :x] ["count" "sum" "count" "count_2"])))))


;;; --------------------------------------------- query->max-rows-limit ----------------------------------------------

(t/deftest query->max-rows-limit-test
  (doseq [[group query->expected]
          {"should return `:limit` if set"
           {{:database 1, :type :query, :query {:source-table 1, :limit 10}} 10}

           "should return `:page` items if set"
           {{:database 1, :type :query, :query {:source-table 1, :page {:page 1, :items 5}}} 5}

           "if `:max-results` is set return that"
           {{:database 1, :type :query, :query {:source-table 1}, :constraints {:max-results 15}} 15}

           "if `:max-results-bare-rows` is set AND query has no aggregations, return that"
           {{:database    1
             :type        :query
             :query       {:source-table 1}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 10
            {:database    1
             :type        :native
             :native      {:query "SELECT * FROM my_table"}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 10}

           "if `:max-results-bare-rows` is set but query has aggregations, return `:max-results` instead"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :aggregation [[:count]]}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 5}

           "if both `:limit` and `:page` are set (not sure makes sense), return the smaller of the two"
           {{:database 1, :type :query, :query {:source-table 1, :limit 10, :page {:page 1, :items 5}}} 5
            {:database 1, :type :query, :query {:source-table 1, :limit 5, :page {:page 1, :items 10}}} 5}

           "if both `:limit` and `:constraints` are set, prefer the smaller of the two"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 5}
             :constraints {:max-results 10}} 5

            {:database    1
             :type        :query
             :query       {:source-table 1, :limit 15}
             :constraints {:max-results 10}} 10}

           "since this query doesn't have an aggregation we should be using `max-results-bare-rows`"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 10}
             :constraints {:max-results 15, :max-results-bare-rows 5}} 5}

           "add an aggregation, and `:max-results` is used instead; since `:limit` is lower, return that"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 10, :aggregation [[:count]]}
             :constraints {:max-results 15, :max-results-bare-rows 5}} 10}

           "if nothing is set return `nil`"
           {{:database 1
             :type     :query
             :query    {:source-table 1}} nil}} ]
    (t/testing group
      (doseq [[query expected] query->expected]
        (t/testing (pr-str (list 'query->max-rows-limit query))
          (t/is (= expected
                   (mbql.u/query->max-rows-limit query))))))))

(t/deftest datetime-arithmetics?-test
  (t/is (mbql.u/datetime-arithmetics?
         [:+ [:field-id 13] [:interval -1 :month]]))
  (t/is (mbql.u/datetime-arithmetics?
         [:field "a" {:temporal-unit :month}]))
  (t/is (not (mbql.u/datetime-arithmetics?
              [:+ [:field-id 13] 3]))))

(t/deftest expression-with-name-test
  (t/is (= [:+ 1 1]
           (mbql.u/expression-with-name {:expressions  {:two [:+ 1 1]}
                                         :source-table 1}
                                        "two")))

  (t/testing "Make sure `expression-with-name` knows how to reach into the parent query if need be"
    (t/is (= [:+ 1 1]
             (mbql.u/expression-with-name {:source-query {:expressions  {:two [:+ 1 1]}
                                                          :source-table 1}}
                                          "two")))))

(t/deftest update-field-options-test
  (t/is (= [:field 1 {:wow true}]
           (mbql.u/update-field-options [:field 1 nil] assoc :wow true)
           (mbql.u/update-field-options [:field 1 {}] assoc :wow true)
           (mbql.u/update-field-options [:field 1 {:wow false}] assoc :wow true)))

  (t/is (= [:field 1 {:a 1, :b 2}]
           (mbql.u/update-field-options [:field 1 {:a 1}] assoc :b 2)))

  (t/testing "Should remove empty options"
    (t/is (= [:field 1 nil]
             (mbql.u/update-field-options [:field 1 {:a 1}] dissoc :a))))

  (t/testing "Should normalize the clause"
    [:field 1 nil]
    (mbql.u/update-field-options [:field 1 {:a {:b 1}}] assoc-in [:a :b] nil)))
