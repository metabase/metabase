(ns metabase.mbql.util-test
  (:require [clojure.test :refer :all]
            [metabase.mbql.util :as mbql.u]
            metabase.types))

;; fool cljr-refactor/the linter so it doesn't try to remove the unused dep on `metabase.types`
(comment metabase.types/keep-me)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     match                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-match-test
  (testing "can we use `match` to find the instances of a clause?"
    (is (= [[:field 10 nil]
            [:field 20 nil]]
           (mbql.u/match {:query {:filter [:=
                                           [:field 10 nil]
                                           [:field 20 nil]]}}
             [:field & _])))))

(deftest match-keywords-test
  (testing "is `match` nice enought to automatically wrap raw keywords in appropriate patterns for us?"
    (is (= [[:field 1 nil]]
           (mbql.u/match {:fields [[:field 1 nil] [:expression "wow"]]}
             :field)))))

(deftest match-set-of-keywords-tes
  (testing "if we pass a set of keywords, will that generate an appropriate pattern to match multiple clauses as well?"
    (is (= [[:field 1 nil]
            [:field 3 {:source-field 2}]
            [:expression "wow"]]
           (mbql.u/match {:fields [[:field 1 nil]
                                   [:something-else "ok"]
                                   [:field 3 {:source-field 2}]
                                   [:expression "wow"]]}
             #{:field :expression})))))

(deftest match-dont-include-subclauses-test
  (testing "`match` shouldn't include subclauses of matches"
    (is (= [[:field 1 nil]
            [:field 3 {:source-field 2}]]
           (mbql.u/match [[:field 1 nil] [:field 3 {:source-field 2}]]
             [(:or :field) & _])))

    (is (= [[:field 10 nil]
            [:field 20 nil]]
           (mbql.u/match {:query {:filter [:=
                                           [:field 10 nil]
                                           [:field 20 nil]]}}
             [(:or :field :+ :-) & _])))))

;; can we use some of the cool features of pattern matching?
(def ^:private a-query
  {:breakout [[:field 10 nil]
              [:field 20 nil]
              [:field "Wow" {:base-type :type/*}]]
   :fields   [[:field 40 {:source-field 30}]]})

(deftest match-result-paramater-test
  (testing "can we use the optional `result` parameter to find return something other than the whole clause?"
    (is (= [41]
           ;; return just the dest IDs of Fields in a fk-> clause
           (mbql.u/match a-query
             [:field dest-id {:source-field (_ :guard integer?)}] (inc dest-id))))

    (is (= [10 20]
           (mbql.u/match (:breakout a-query) [:field id nil] id)))))

(deftest match-return-nil-for-empty-sequences-test
  (testing "match should return `nil` if there are no matches so you don't need to call `seq`"
    (is (= nil
           (mbql.u/match {} [:field _ _] :minute)))))

(deftest match-guard-test
  (testing "can we `:guard` a pattern?"
    (is (= [[:field 2 nil]]
           (let [a-field-id 2]
             (mbql.u/match {:fields [[:field 1 nil] [:field 2 nil]]}
               [:field (id :guard (partial = a-field-id)) _])))))

  (testing "ok, if for some reason we can't use `:guard` in the pattern will `match` filter out nil results?"
    (is (= [2]
           (mbql.u/match {:fields [[:field 1 nil] [:field 2 nil]]}
             [:field id _]
             (when (= id 2)
               id))))))

(def ^:private another-query
  {:fields [[:field 1 nil]
            [:field 2 {:temporal-unit :day}]
            [:field 4 {:source-field 3, :temporal-unit :month}]]})

(deftest match-&match-test
  (testing (str "Ok, if we want to use predicates but still return the whole match, can we use the anaphoric `&match` "
                "symbol to return the whole thing?")
    (is (= [[:field 1 nil]
            [:field 2 {:temporal-unit :day}]
            [:field 4 {:source-field 3, :temporal-unit :month}]]
           (let [some-pred? (constantly true)]
             (mbql.u/match another-query
               :field
               (when some-pred?
                 &match)))))))

(deftest match-&parents-test
  (testing "can we use the anaphoric `&parents` symbol to examine the parents of the collection?"
    (is (= [[:field 1 nil]]
           (mbql.u/match {:filter [[:time-interval [:field 1 nil] :current :month]
                                   [:= [:field 2 nil] "wow"]]}
             :field
             (when (contains? (set &parents) :time-interval)
               &match))))))

(deftest match-by-class-test
  (testing "can we match using a CLASS?"
    (is (= [#inst "2018-10-08T00:00:00.000-00:00"]
           (mbql.u/match [[:field 1 nil]
                          [:field 2 nil]
                          #inst "2018-10-08"
                          4000]
             java.util.Date)))))

(deftest match-by-predicate-test
  (testing "can we match using a PREDICATE?"
    (is (= [4000 5000]
           ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses
           (mbql.u/match {:filter [:and
                                   [:= [:field 1 nil] 4000]
                                   [:= [:field 2 nil] 5000]]}
             integer?
             (when (= := (last &parents))
               &match)))))

  (testing "how can we use predicates not named by a symbol?"
    (is (= [1 4000 2 5000]
           (mbql.u/match {:filter [:and
                                   [:= [:field 1 nil] 4000]
                                   [:= [:field 2 nil] 5000]]}
             (&match :guard #(integer? %))))))

  (testing "can we use a predicate and bind the match at the same time?"
    (is (= [2 4001 3 5001]
           (mbql.u/match {:filter [:and
                                   [:= [:field 1 nil] 4000]
                                   [:= [:field 2 nil] 5000]]}
             (i :guard #(integer? %))
             (inc i))))))

(deftest match-map-test
  (testing "can we match against a map?"
    (is (= ["card__1847"]
           (let [x {:source-table "card__1847"}]
             (mbql.u/match x
               (m :guard (every-pred map? (comp string? :source-table)))
               (:source-table m)))))))

(deftest match-sequence-of-maps-test
  (testing "how about a sequence of maps?"
    (is (= ["card__1847"]
           (let [x [{:source-table "card__1847"}]]
             (mbql.u/match x
               (m :guard (every-pred map? (comp string? :source-table)))
               (:source-table m)))))))

(deftest match-recur-inside-pattern-test
  (testing "can we use `recur` inside a pattern?"
    (is (= [[0 :month]]
           (mbql.u/match {:filter [:time-interval [:field 1 nil] :current :month]}
             [:time-interval field :current unit] (recur [:time-interval field 0 unit])
             [:time-interval _     n        unit] [n unit])))))

(deftest match-short-circut-test
  (testing "can we short-circut a match to prevent recursive matching?"
    (is (= [10]
           (mbql.u/match [[:field 10 nil]
                          [:field 20 {:temporal-unit :day}]]
             [:field id nil] id
             [_ [:field-id & _] & _] nil)))))

(deftest match-list-with-guard-clause-test
  (testing "can we use a list with a :guard clause?"
    (is (= [10 20]
           (mbql.u/match {:query {:filter [:=
                                           [:field 10 nil]
                                           [:field 20 nil]]}}
             (id :guard int?) id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    replace                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-replace-test
  (testing "can we use `replace` to replace a specific clause?"
    (is (= {:breakout [[:field 10 {:temporal-unit :day}]
                       [:field 20 {:temporal-unit :day}]
                       [:field "Wow" {:base-type :type/*}]]
            :fields   [[:field 40 {:source-field 30}]]}
           (mbql.u/replace a-query
             [:field id nil]
             [:field id {:temporal-unit :day}])))))

(deftest basic-replace-in-test
  (testing "can we wrap the pattern in a map to restrict what gets replaced?"
    (is (= {:breakout [[:field 10 {:temporal-unit :day}]
                       [:field 20 {:temporal-unit :day}]
                       [:field "Wow" {:base-type :type/*}]]
            :fields   [[:field 40 {:source-field 30}]]}
           (mbql.u/replace-in a-query [:breakout]
             [:field (id :guard integer?) nil]
             [:field id {:temporal-unit :day}])))))

(deftest replace-multiple-patterns-test
  (testing "can we use multiple patterns at the same time?!"
    (is (= {:breakout [[:field 10 {:temporal-unit :day}]
                       [:field 20 {:temporal-unit :day}]
                       [:field "Wow" {:base-type :type/*, :temporal-unit :month}]]
            :fields   [[:field 40 {:source-field 30}]]}
           (mbql.u/replace-in a-query [:breakout]
             [:field (id :guard integer?) nil]
             [:field id {:temporal-unit :day}]

             [:field (id :guard string?) opts]
             [:field id (assoc opts :temporal-unit :month)])))))

(deftest replace-field-ids-test
  (testing "can we use `replace` to replace the ID of the Field in :field clauses?"
    (is (= {:breakout [[:field 10 nil]
                       [:field 20 nil]
                       [:field "Wow" {:base-type :type/*}]]
            :fields   [[:field 100 {:source-field 30}]]}
           (mbql.u/replace a-query
             [:field 40 opts]
             [:field 100 opts])))))

(deftest replace-fix-bad-mbql-test
  (testing "can we use `replace` to fix (legacy) `fk->` clauses where both args are unwrapped IDs?"
    (is (= {:query {:fields [[:fk-> [:field 1 nil] [:field 2 nil]]
                             [:fk-> [:field 3 nil] [:field 4 nil]]]}}
           (mbql.u/replace-in
            {:query {:fields [[:fk-> 1 2]
                              [:fk-> [:field 3 nil] [:field 4 nil]]]}}
            [:query :fields]
            [:fk-> (source :guard integer?) (dest :guard integer?)]
            [:fk-> [:field source nil] [:field dest nil]])))))

(deftest replace-raw-keyword-patterns-test
  (testing "does `replace` accept a raw keyword as the pattern the way `match` does?"
    (is (= {:fields ["WOW" "WOW" "WOW"]}
           (mbql.u/replace another-query :field "WOW")))))

(deftest replace-set-of-keywords-test
  (testing "does `replace` accept a set of keywords the way `match` does?"
    (is (= {:fields ["WOW" "WOW" "WOW"]}
           (mbql.u/replace another-query #{:field :field-id} "WOW")))))

(deftest replace-&match-test
  (testing "can we use the anaphor `&match` to look at the entire match?"
    (is (= {:fields [[:field 1 nil]
                     [:magical-field [:field 2 {:temporal-unit :day}]]
                     [:magical-field [:field 4 {:source-field 3, :temporal-unit :month}]]]}
           (mbql.u/replace another-query [:field _ (_ :guard :temporal-unit)] [:magical-field &match])))))

(deftest replace-&parents-test
  (testing "can we use the anaphor `&parents` to look at the parents of the match?"
    (is (= {:fields [[:a "WOW"]
                     [:b 200]]}
           ;; replace field ID clauses that are inside a datetime-field clause
           (mbql.u/replace {:fields [[:a [:b 100]]
                                     [:b 200]]}
             :b
             (if (contains? (set &parents) :a)
               "WOW"
               &match))))))

(deftest replace-by-class-test
  (testing "can we replace using a CLASS?"
    (is (= [[:field 1 nil]
            [:field 2 nil]
            [:timestamp #inst "2018-10-08T00:00:00.000-00:00"]
            4000]
           (mbql.u/replace [[:field 1 nil]
                            [:field 2 nil]
                            #inst "2018-10-08"
                            4000]
                           java.util.Date
                           [:timestamp &match])))))

(deftest replace-by-predicate-test
  (testing "can we replace using a PREDICATE?"
    (is (= {:filter [:and
                     [:= [:field nil nil] 4000.0]
                     [:= [:field nil nil] 5000.0]]}
           ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses and make them FLOATS
           (mbql.u/replace {:filter [:and
                                     [:= [:field 1 nil] 4000]
                                     [:= [:field 2 nil] 5000]]}
             integer?
             (when (= := (last &parents))
               (float &match)))))))

(deftest complex-replace-test
  (testing "can we do fancy stuff like remove all the filters that use datetime fields from a query?"
    (is (= [:and nil [:= [:field 100 nil] 20]]
           (mbql.u/replace [:and
                            [:=
                             [:field "ga:date" {:temporal-unit :day}]
                             [:absolute-datetime #inst "2016-11-08T00:00:00.000-00:00" :day]]
                            [:= [:field 100 nil] 20]]
             [_ [:field _ (_ :guard :temporal-unit)] & _] nil)))))

(deftest replace-short-circut-test
  (testing (str "can we use short-circuting patterns to do something tricky like only replace `:field-id` clauses that "
                "aren't wrapped by other clauses?")
    (is (= [[:field 10 {:temporal-unit :day}]
            [:field 20 {:temporal-unit :month}]
            [:field 30 nil]]
           (let [id-is-datetime-field? #{10}]
             (mbql.u/replace [[:field 10 nil]
                              [:field 20 {:temporal-unit :month}]
                              [:field 30 nil]]
                             ;; don't replace anything that's already wrapping a `field-id`
                             [_ [:field-id & _] & _]
                             &match

                             [:field (id :guard id-is-datetime-field?) opts]
                             [:field id (assoc opts :temporal-unit :day)]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Other Fns                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest simplify-compound-filter-test
  (is (= [:= [:field 1 nil] 2]
         (mbql.u/simplify-compound-filter [:and [:= [:field 1 nil] 2]]))
      "can `simplify-compound-filter` fix `and` or `or` with only one arg?")
  (is (= [:and
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
  (is (= [:and [:= [:field 1 nil] 2] [:= [:field 3 nil] 4]]
         (mbql.u/simplify-compound-filter [:and [:= [:field 1 nil] 2] [:= [:field 3 nil] 4] [:= [:field 1 nil] 2]]))
      "can `simplify-compound-filter` remove duplicates?")
  (is (= [:= [:field 1 nil] 2]
         (mbql.u/simplify-compound-filter [:not [:not [:= [:field 1 nil] 2]]]))
      "can `simplify-compound-filter` eliminate `not` inside a `not`?")
  (testing "removing empty/nil filter clauses"
    (is (= nil
           (mbql.u/simplify-compound-filter nil))
        "does `simplify-compound-filter` return `nil` for empty filter clauses?")

    (is (= nil
           (mbql.u/simplify-compound-filter [])))

    (is (= nil
           (mbql.u/simplify-compound-filter [nil nil nil])))

    (is (= nil
           (mbql.u/simplify-compound-filter [:and nil nil])))

    (is (= nil
           (mbql.u/simplify-compound-filter [:and nil [:and nil nil nil] nil])))
    (is (= [:= [:field 1 nil] 2]
           (mbql.u/simplify-compound-filter [:and nil [:and nil [:= [:field 1 nil] 2] nil] nil])))
    (is (= [:and
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
  (is (= {:aggregation [[:share [:and
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
  (testing "Check that `simplify-compound-filter` can apply de Morgan's law on `:not`"
    (testing ":and clauses"
      (is (= [:or
              [:not [:= [:field 1 nil] 2]]
              [:not [:= [:field 2 nil] 3]]]
             (mbql.u/simplify-compound-filter [:not [:and
                                                     [:= [:field 1 nil] 2]
                                                     [:= [:field 2 nil] 3]]]))))
    (testing ":or clauses"
      (is (= [:and
              [:not [:= [:field 1 nil] 2]]
              [:not [:= [:field 2 nil] 3]]]
             (mbql.u/simplify-compound-filter [:not [:or
                                                     [:= [:field 1 nil] 2]
                                                     [:= [:field 2 nil] 3]]]))
          "Check that `simplify-compound-filter` can apply de Morgan's law on `:not` over `:or`")))
  (testing "check that `simplify-compound-filter` doesn't remove `nil` from filters where it's being used as the value"
    (is (= [:= [:field 1 nil] nil]
           (mbql.u/simplify-compound-filter [:= [:field 1 nil] nil])))
    (is (= [:= [:field 1 nil] nil]
           (mbql.u/simplify-compound-filter [:and nil [:= [:field 1 nil] nil]])))))


(deftest add-order-by-clause-test
  (testing "can we add an order-by clause to a query?"
    (is (= {:source-table 1, :order-by [[:asc [:field 10 nil]]]}
           (mbql.u/add-order-by-clause {:source-table 1} [:asc [:field 10 nil]])))

    (is (= {:source-table 1
            :order-by     [[:asc [:field 10 nil]]
                           [:asc [:field 20 nil]]]}
           (mbql.u/add-order-by-clause {:source-table 1
                                        :order-by     [[:asc [:field 10 nil]]]}
                                       [:asc [:field 20 nil]]))))

  (testing "duplicate clauses should get ignored"
    (is (= {:source-table 1
            :order-by     [[:asc [:field 10 nil]]]}
           (mbql.u/add-order-by-clause {:source-table 1
                                        :order-by     [[:asc [:field 10 nil]]]}
                                       [:asc [:field 10 nil]]))))

  (testing "as should clauses that reference the same Field"
    (is (= {:source-table 1
            :order-by     [[:asc [:field 10 nil]]]}
           (mbql.u/add-order-by-clause {:source-table 1
                                        :order-by     [[:asc [:field 10 nil]]]}
                                       [:desc [:field 10 nil]])))

    (testing "fields with different amounts of wrapping (plain field vs datetime-field)"
      (is (= {:source-table 1
              :order-by     [[:asc [:field 10 nil]]]}
             (mbql.u/add-order-by-clause {:source-table 1
                                          :order-by     [[:asc [:field 10 nil]]]}
                                         [:asc [:field 10 {:temporal-unit :day}]]))))))

(deftest combine-filter-clauses-test
  (is (= [:and [:= [:field 1 nil] 100] [:= [:field 2 nil] 200]]
         (mbql.u/combine-filter-clauses
          [:= [:field 1 nil] 100]
          [:= [:field 2 nil] 200]))
      "Should be able to combine non-compound clauses")
  (is (= [:and
          [:= [:field 1 nil] 100]
          [:= [:field 2 nil] 200]
          [:= [:field 3 nil] 300]]
         (mbql.u/combine-filter-clauses
          [:= [:field 1 nil] 100]
          [:and
           [:= [:field 2 nil] 200]
           [:= [:field 3 nil] 300]]))
      "Should be able to combine into an exisiting compound clause")
  (is (= [:and
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

(deftest add-filter-clause-test
  (is (= {:database 1
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

(deftest desugar-time-interval-test
  (is (= [:between
          [:field 1 {:temporal-unit :month}]
          [:relative-datetime 1 :month]
          [:relative-datetime 2 :month]]
         (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 2 :month]))
      "`time-interval` with value > 1 or < -1 should generate a `between` clause")
  (is (= [:between
          [:field 1 {:temporal-unit :month}]
          [:relative-datetime 0 :month]
          [:relative-datetime 2 :month]]
         (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 2 :month {:include-current true}]))
      "test the `include-current` option -- interval should start or end at `0` instead of `1`")
  (is (= [:=
          [:field 1 {:temporal-unit :month}]
          [:relative-datetime 1 :month]]
         (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 1 :month]))
      "`time-interval` with value = 1 should generate an `=` clause")
  (is (= [:=
          [:field 1 {:temporal-unit :week}]
          [:relative-datetime -1 :week]]
         (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] -1 :week]))
      "`time-interval` with value = -1 should generate an `=` clause")
  (testing "`include-current` option"
    (is (= [:between
            [:field 1 {:temporal-unit :month}]
            [:relative-datetime 0 :month]
            [:relative-datetime 1 :month]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] 1 :month {:include-current true}]))
        "interval with value = 1 should generate a `between` clause")
    (is (= [:between
            [:field 1 {:temporal-unit :day}]
            [:relative-datetime -1 :day]
            [:relative-datetime 0 :day]]
           (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] -1 :day {:include-current true}]))
        "`include-current` option -- interval with value = 1 should generate a `between` clause"))
  (is (= [:=
          [:field 1 {:temporal-unit :week}]
          [:relative-datetime 0 :week]]
         (mbql.u/desugar-filter-clause [:time-interval [:field 1 nil] :current :week]))
      "keywords like `:current` should work correctly"))

(deftest desugar-relative-datetime-with-current-test
  (testing "when comparing `:relative-datetime`to `:field`, it should take the temporal unit of the `:field`"
    (is (= [:=
            [:field 1 {:temporal-unit :minute}]
            [:relative-datetime 0 :minute]]
           (mbql.u/desugar-filter-clause
            [:=
             [:field 1 {:temporal-unit :minute}]
             [:relative-datetime :current]]))))
  (testing "otherwise it should just get a unit of `:default`"
    (is (= [:=
            [:field 1 nil]
            [:relative-datetime 0 :default]]
           (mbql.u/desugar-filter-clause
            [:=
             [:field 1 nil]
             [:relative-datetime :current]]))))
  (testing "we should be able to handle datetime fields even if they are nested inside another clause"
    (is (= [:=
            [:field 1 {:temporal-unit :week, :binning {:strategy :default}}]
            [:relative-datetime 0 :week]]
           (mbql.u/desugar-filter-clause
            [:=
             [:field 1 {:temporal-unit :week, :binning {:strategy :default}}]
             [:relative-datetime :current]])))))

(deftest desugar-other-filter-clauses-test
  (testing "desugaring := and :!= with extra args"
    (is (= [:or
            [:= [:field 1 nil] 2]
            [:= [:field 1 nil] 3]
            [:= [:field 1 nil] 4]
            [:= [:field 1 nil] 5]]
           (mbql.u/desugar-filter-clause [:= [:field 1 nil] 2 3 4 5]))
        "= with extra args should get converted to or")
    (is (= [:and
            [:!= [:field 1 nil] 2]
            [:!= [:field 1 nil] 3]
            [:!= [:field 1 nil] 4]
            [:!= [:field 1 nil] 5]]
           (mbql.u/desugar-filter-clause [:!= [:field 1 nil] 2 3 4 5]))
        "!= with extra args should get converted to or"))
  (testing "desugaring :inside"
    (is (= [:and
            [:between [:field 1 nil] -10.0 10.0]
            [:between [:field 2 nil] -20.0 20.0]]
           (mbql.u/desugar-filter-clause [:inside [:field 1 nil] [:field 2 nil] 10.0 -20.0 -10.0 20.0]))))
  (testing "desugaring :is-null"
    (is (= [:= [:field 1 nil] nil]
           (mbql.u/desugar-filter-clause [:is-null [:field 1 nil]]))))
  (testing "desugaring :not-null"
    (is (= [:!= [:field 1 nil] nil]
           (mbql.u/desugar-filter-clause [:not-null [:field 1 nil]]))))
  (testing "desugaring :is-empty"
    (is (= [:or [:= [:field 1 nil] nil]
                [:= [:field 1 nil] ""]]
           (mbql.u/desugar-filter-clause [:is-empty [:field 1 nil]]))))
  (testing "desugaring :not-empty"
    (is (= [:and [:!= [:field 1 nil] nil]
                 [:!= [:field 1 nil] ""]]
           (mbql.u/desugar-filter-clause [:not-empty [:field 1 nil]])))))

(deftest desugar-does-not-contain-test
  (testing "desugaring does-not-contain without options"
    (is (= [:not [:contains [:field 1 nil] "ABC"]]
           (mbql.u/desugar-filter-clause [:does-not-contain [:field 1 nil] "ABC"]))))
  (testing "desugaring does-not-contain *with* options"
    (is (= [:not [:contains [:field 1 nil] "ABC" {:case-sensitive false}]]
           (mbql.u/desugar-filter-clause [:does-not-contain [:field 1 nil] "ABC" {:case-sensitive false}])))))

(deftest negate-simple-filter-clause-test
  (testing :=
    (is (= [:!= [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:= [:field 1 nil] 10]))))
  (testing :!=
    (is (= [:= [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:!= [:field 1 nil] 10]))))
  (testing :>
    (is (= [:<= [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:> [:field 1 nil] 10]))))
  (testing :<
    (is (= [:>= [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:< [:field 1 nil] 10]))))
  (testing :>=
    (is (= [:< [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:>= [:field 1 nil] 10]))))
  (testing :<=
    (is (= [:> [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:<= [:field 1 nil] 10]))))
  (testing :between
    (is (= [:or
            [:< [:field 1 nil] 10]
            [:> [:field 1 nil] 20]]
           (mbql.u/negate-filter-clause [:between [:field 1 nil] 10 20]))))
  (testing :contains
    (is (= [:not [:contains [:field 1 nil] "ABC"]]
           (mbql.u/negate-filter-clause [:contains [:field 1 nil] "ABC"]))))
  (testing :starts-with
    (is (= [:not [:starts-with [:field 1 nil] "ABC"]]
           (mbql.u/negate-filter-clause [:starts-with [:field 1 nil] "ABC"]))))
  (testing :ends-with
    (is (= [:not [:ends-with [:field 1 nil] "ABC"]]
           (mbql.u/negate-filter-clause [:ends-with [:field 1 nil] "ABC"])))))

(deftest negate-compund-filter-clause-test
  (testing :not
    (is (= [:= [:field 1 nil] 10]
           (mbql.u/negate-filter-clause [:not [:= [:field 1 nil] 10]]))
        "negating `:not` should simply unwrap the clause"))
  (testing :and
    (is (= [:or
            [:!= [:field 1 nil] 10]
            [:!= [:field 2 nil] 20]]
           (mbql.u/negate-filter-clause
            [:and
             [:= [:field 1 nil] 10]
             [:= [:field 2 nil] 20]]))))
  (testing :or
    (is (= [:and
            [:= [:field 1 nil] 10]
            [:= [:field 2 nil] 20]]
           (mbql.u/negate-filter-clause
            [:or
             [:!= [:field 1 nil] 10]
             [:!= [:field 2 nil] 20]])))))

(deftest negate-syntactic-sugar-filter-clause-test
  (testing "= with extra args"
    (is (= [:and
            [:!= [:field 1 nil] 10]
            [:!= [:field 1 nil] 20]
            [:!= [:field 1 nil] 30]]
           (mbql.u/negate-filter-clause [:= [:field 1 nil] 10 20 30]))))
  (testing "!= with extra args"
    (is (= [:or
            [:= [:field 1 nil] 10]
            [:= [:field 1 nil] 20]
            [:= [:field 1 nil] 30]]
           (mbql.u/negate-filter-clause [:!= [:field 1 nil] 10 20 30]))))
  (testing :time-interval
    (is (= [:!=
            [:field 1 {:temporal-unit :week}]
            [:relative-datetime 0 :week]]
           (mbql.u/negate-filter-clause [:time-interval [:field 1 nil] :current :week]))))
  (testing :is-null
    (is (= [:!= [:field 1 nil] nil]
           (mbql.u/negate-filter-clause [:is-null [:field 1 nil]]))))
  (testing :not-null
    (is (= [:= [:field 1 nil] nil]
           (mbql.u/negate-filter-clause [:not-null [:field 1 nil]]))))
  (testing :inside
    (is (= [:or
            [:< [:field 1 nil] -10.0]
            [:> [:field 1 nil] 10.0]
            [:< [:field 2 nil] -20.0]
            [:> [:field 2 nil] 20.0]]
           (mbql.u/negate-filter-clause
            [:inside [:field 1 nil] [:field 2 nil] 10.0 -20.0 -10.0 20.0])))))

(deftest join->source-table-id-test
  (let [join {:strategy  :left-join
              :condition [:=
                             [:field 48 nil]
                          [:field 44 {:join-alias "products"}]]
              :alias     "products"}]
    (is (= 5
           (mbql.u/join->source-table-id (assoc join :source-table 5))))
    (is (= 5
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

(deftest aggregation-at-index-test
  (doseq [[input expected] {[0]   [:avg [:field 1 nil]]
                            [1]   [:max [:field 1 nil]]
                            [0 0] [:avg [:field 1 nil]]
                            [0 1] [:stddev [:field 1 nil]]
                            [1 1] [:min [:field 1 nil]]}]
    (testing (pr-str (cons 'aggregation-at-index input))
      (is (= expected
             (apply mbql.u/aggregation-at-index query-with-some-nesting input))))))


;;; --------------------------------- Unique names & transforming ags to have names ----------------------------------

(deftest uniquify-names
  (testing "can we generate unique names?"
    (is (= ["count" "sum" "count_2" "count_3"]
           (mbql.u/uniquify-names ["count" "sum" "count" "count"]))))

  (testing "what if we try to trick it by using a name it would have generated?"
    (is (= ["count" "count_2" "count_2_2"]
           (mbql.u/uniquify-names ["count" "count" "count_2"]))))

  (testing (str "for wacky DBMSes like SQL Server that return blank column names sometimes let's make sure we handle "
                "those without exploding")
    (is (= ["" "_2"]
           (mbql.u/uniquify-names ["" ""])))))

(deftest uniquify-named-aggregations-test
  (is (= [[:aggregation-options [:count] {:name "count"}]
          [:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
          [:aggregation-options [:count] {:name "count_2"}]
          [:aggregation-options [:count] {:name "count_3"}]]
         (mbql.u/uniquify-named-aggregations
          [[:aggregation-options [:count] {:name "count"}]
           [:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
           [:aggregation-options [:count] {:name "count"}]
           [:aggregation-options [:count] {:name "count"}]])))

  (testing "what if we try to trick it by using a name it would have generated?"
    (is (= [[:aggregation-options [:count] {:name "count"}]
            [:aggregation-options [:count] {:name "count_2"}]
            [:aggregation-options [:count] {:name "count_2_2"}]]
           (mbql.u/uniquify-named-aggregations
            [[:aggregation-options [:count] {:name "count"}]
             [:aggregation-options [:count] {:name "count"}]
             [:aggregation-options [:count] {:name "count_2"}]])))))

(deftest pre-alias-aggregations-test
  (letfn [(simple-ag->name [[ag-name]]
            (name ag-name))]
    (testing "can we wrap all of our aggregation clauses in `:named` clauses?"
      (is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
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

    (testing "we shouldn't change the name of ones that are already named"
      (is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
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


    (testing "ok, can we do the same thing as the tests above but make those names *unique* at the same time?"
      (is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}  ]
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

      (is (= [[:aggregation-options [:sum [:field 1 nil]]   {:name "sum"}]
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

    (testing (str "if `:aggregation-options` only specifies `:display-name` it should still a new `:name`. "
                  "`pre-alias-and-uniquify-aggregations` shouldn't stomp over display name")
      (is (= [[:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
              [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2"}]
              [:aggregation-options [:sum [:field 1 nil]] {:display-name "Sum of Field 1", :name "sum_3"}]]
             (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
               [[:sum [:field 1 nil]]
                [:sum [:field 1 nil]]
                [:aggregation-options [:sum [:field 1 nil]] {:display-name "Sum of Field 1"}]])))

      (testing "if both are specified, `display-name` should still be propagated"
        (is (= [[:aggregation-options [:sum [:field 1 nil]] {:name "sum"}]
                [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2"}]
                [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2_2", :display-name "Sum of Field 1"}]]
               (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
                 [[:sum [:field 1 nil]]
                  [:sum [:field 1 nil]]
                  [:aggregation-options [:sum [:field 1 nil]] {:name "sum_2", :display-name "Sum of Field 1"}]])))))))

(deftest unique-name-generator-test
  (testing "Can we get a simple unique name generator"
    (is (= ["count" "sum" "count_2" "count_2_2"]
           (map (mbql.u/unique-name-generator) ["count" "sum" "count" "count_2"]))))
  (testing "Can we get an idempotent unique name generator"
    (is (= ["count" "sum" "count" "count_2"]
           (map (mbql.u/unique-name-generator) [:x :y :x :z] ["count" "sum" "count" "count_2"]))))
  (testing "Can the same object have multiple aliases"
    (is (= ["count" "sum" "count" "count_2"]
           (map (mbql.u/unique-name-generator) [:x :y :x :x] ["count" "sum" "count" "count_2"])))))


;;; --------------------------------------------- query->max-rows-limit ----------------------------------------------

(deftest query->max-rows-limit-test
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
    (testing group
      (doseq [[query expected] query->expected]
        (testing (pr-str (list 'query->max-rows-limit query))
          (is (= expected
                 (mbql.u/query->max-rows-limit query))))))))

(deftest datetime-arithmetics?-test
  (is (mbql.u/datetime-arithmetics?
       [:+ [:field-id 13] [:interval -1 :month]]))
  (is (mbql.u/datetime-arithmetics?
       [:field "a" {:temporal-unit :month}]))
  (is (not (mbql.u/datetime-arithmetics?
            [:+ [:field-id 13] 3]))))

(deftest expression-with-name-test
  (is (= [:+ 1 1]
         (mbql.u/expression-with-name {:expressions  {:two [:+ 1 1]}
                                       :source-table 1}
                                      "two")))

  (testing "Make sure `expression-with-name` knows how to reach into the parent query if need be"
    (is (= [:+ 1 1]
           (mbql.u/expression-with-name {:source-query {:expressions  {:two [:+ 1 1]}
                                                        :source-table 1}}
                                        "two")))))

(deftest update-field-options-test
  (is (= [:field 1 {:wow true}]
         (mbql.u/update-field-options [:field 1 nil] assoc :wow true)
         (mbql.u/update-field-options [:field 1 {}] assoc :wow true)
         (mbql.u/update-field-options [:field 1 {:wow false}] assoc :wow true)))

  (is (= [:field 1 {:a 1, :b 2}]
         (mbql.u/update-field-options [:field 1 {:a 1}] assoc :b 2)))

  (testing "Should remove empty options"
    (is (= [:field 1 nil]
           (mbql.u/update-field-options [:field 1 {:a 1}] dissoc :a))))

  (testing "Should normalize the clause"
    [:field 1 nil]
    (mbql.u/update-field-options [:field 1 {:a {:b 1}}] assoc-in [:a :b] nil)))
