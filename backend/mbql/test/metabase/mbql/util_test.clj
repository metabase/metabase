(ns metabase.mbql.util-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.mbql.util :as mbql.u]
            metabase.types))

;; fool cljr-refactor/the linter so it doesn't try to remove the unused dep on `metabase.types`
(comment metabase.types/keep-me)

(deftest relative-date-test
  (let [t (t/zoned-date-time "2019-06-14T00:00:00.000Z[UTC]")]
    (doseq [[unit n expected] [[:second  5 "2019-06-14T00:00:05Z[UTC]"]
                               [:minute  5 "2019-06-14T00:05:00Z[UTC]"]
                               [:hour    5 "2019-06-14T05:00:00Z[UTC]"]
                               [:day     5 "2019-06-19T00:00:00Z[UTC]"]
                               [:week    5 "2019-07-19T00:00:00Z[UTC]"]
                               [:month   5 "2019-11-14T00:00:00Z[UTC]"]
                               [:quarter 5 "2020-09-14T00:00:00Z[UTC]"]
                               [:year    5 "2024-06-14T00:00:00Z[UTC]"]]]
      (is (= (t/zoned-date-time expected)
             (mbql.u/relative-date unit n t))
          (format "%s plus %d %ss should be %s" t n unit expected)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     match                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-match-test
  (testing "can we use `match` to find the instances of a clause?"
    (is (= [[:field-id 10]
            [:field-id 20]]
           (mbql.u/match {:query {:filter [:=
                                           [:field-id 10]
                                           [:field-id 20]]}}
             [:field-id & _])))))

(deftest match-keywords-test
  (testing "is `match` nice enought to automatically wrap raw keywords in appropriate patterns for us?"
    (is (= [[:field-id 1]
            [:field-id 2]
            [:field-id 3]]
           (mbql.u/match {:fields [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]}
             :field-id)))

    (is (= [[:field-id 1]
            [:field-id 2]]
           (mbql.u/match {:fields [[:field-id 1] [:datetime-field [:field-id 2] :day]]}
             :field-id)))))

(deftest match-set-of-keywords-tes
  (testing "if we pass a set of keywords, will that generate an appropriate pattern to match multiple clauses as well?"
    (is (= [[:field-id 1]
            [:field-id 2]
            [:field-id 3]
            [:datetime-field [:field-id 4]]]
           (mbql.u/match {:fields [[:field-id 1]
                                   [:fk-> [:field-id 2] [:field-id 3]]
                                   [:datetime-field [:field-id 4]]]}
             #{:field-id :datetime-field})))))

(deftest match-dont-include-subclauses-test
  (testing "`match` shouldn't include subclauses of matches"
    (is (= [[:field-id 1]
            [:fk-> [:field-id 2] [:field-id 3]]]
           (mbql.u/match [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]
             [(:or :field-id :fk->) & _])))

    (is (= [[:field-id 10]
            [:field-id 20]]
           (mbql.u/match {:query {:filter [:=
                                           [:field-id 10]
                                           [:field-id 20]]}}
             [(:or :field-id :+ :-) & _])))))

;; can we use some of the cool features of pattern matching?
(def ^:private a-query
  {:breakout [[:field-id 10]
              [:field-id 20]
              [:field-literal "Wow"]]
   :fields   [[:fk->
               [:field-id 30]
               [:field-id 40]]]})

(deftest match-result-paramater-test
  (testing "can we use the optional `result` parameter to find return something other than the whole clause?"
    (is (= [41]
           ;; return just the dest IDs of Fields in a fk-> clause
           (mbql.u/match a-query
             [:fk-> _ [:field-id dest-id]] (inc dest-id))))

    (is (= [10 20]
           (mbql.u/match (:breakout a-query) [:field-id id] id)))))

(deftest match-return-nil-for-empty-sequences-test
  (testing "match should return `nil` if there are no matches so you don't need to call `seq`"
    (is (= nil
           (mbql.u/match {} [:datetime-field _ unit] unit)))))

(deftest match-guard-test
  (testing "can we `:guard` a pattern?"
    (is (= [[:field-id 2]]
           (let [a-field-id 2]
             (mbql.u/match {:fields [[:field-id 1] [:field-id 2]]}
               [:field-id (id :guard (partial = a-field-id))])))))

  (testing "ok, if for some reason we can't use `:guard` in the pattern will `match` filter out nil results?"
    (is (= [2]
           (mbql.u/match {:fields [[:field-id 1] [:field-id 2]]}
             [:field-id id]
             (when (= id 2)
               id))))))

(def ^:private another-query
  {:fields [[:field-id 1]
            [:datetime-field [:field-id 2] :day]
            [:datetime-field [:fk-> [:field-id 3] [:field-id 4]] :month]]})

(deftest match-&match-test
  (testing (str "Ok, if we want to use predicates but still return the whole match, can we use the anaphoric `&match` "
                "symbol to return the whole thing?")
    (is (= [[:field-id 1]
            [:field-id 2]
            [:field-id 3]
            [:field-id 4]]
           (let [some-pred? (constantly true)]
             (mbql.u/match another-query
               :field-id
               (when some-pred?
                 &match)))))))

(deftest match-&parents-test
  (testing (str "can we use the anaphoric `&parents` symbol to examine the parents of the collection? let's see if we "
                "can match `:field-id` clauses that are inside `:datetime-field` clauses, regardless of whether "
                "something else wraps them")
    (is (= [[:field-id 2]
            [:field-id 3]
            [:field-id 4]]
           (mbql.u/match another-query
             :field-id
             (when (contains? (set &parents) :datetime-field)
               &match))))))

(deftest match-by-class-test
  (testing "can we match using a CLASS?"
    (is (= [#inst "2018-10-08T00:00:00.000-00:00"]
           (mbql.u/match [[:field-id 1]
                          [:field-id 2]
                          #inst "2018-10-08"
                          4000]
             java.util.Date)))))

(deftest match-by-predicate-test
  (testing "can we match using a PREDICATE?"
    (is (= [4000 5000]
           ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses
           (mbql.u/match {:filter [:and
                                   [:= [:field-id 1] 4000]
                                   [:= [:field-id 2] 5000]]}
             integer?
             (when (= := (last &parents))
               &match)))))

  (testing "how can we use predicates not named by a symbol?"
    (is (= [1 4000 2 5000]
           (mbql.u/match {:filter [:and
                                   [:= [:field-id 1] 4000]
                                   [:= [:field-id 2] 5000]]}
             (&match :guard #(integer? %))))))

  (testing "can we use a predicate and bind the match at the same time?"
    (is (= [2 4001 3 5001]
           (mbql.u/match {:filter [:and
                                   [:= [:field-id 1] 4000]
                                   [:= [:field-id 2] 5000]]}
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
           (mbql.u/match {:filter [:time-interval [:field-id 1] :current :month]}
             [:time-interval field :current unit] (recur [:time-interval field 0 unit])
             [:time-interval _     n        unit] [n unit])))))

(deftest match-short-circut-test
  (testing "can we short-circut a match to prevent recursive matching?"
    (is (= [10]
           (mbql.u/match [[:field-id 10]
                          [:datetime-field [:field-id 20] :day]]
             [:field-id id] id
             [_ [:field-id & _] & _] nil)))))

(deftest match-list-with-guard-clause-test
  (testing "can we use a list with a :guard clause?"
    (is (= [10 20]
           (mbql.u/match {:query {:filter [:=
                                           [:field-id 10]
                                           [:field-id 20]]}}
             (id :guard int?) id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    replace                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-replace-test
  (testing "can we use `replace` to replace a specific clause?"
    (is (= {:breakout [[:datetime-field [:field-id 10] :day]
                       [:datetime-field [:field-id 20] :day]
                       [:field-literal "Wow"]]
            :fields   [[:fk->
                        [:datetime-field [:field-id 30] :day]
                        [:datetime-field [:field-id 40] :day]]]}
           (mbql.u/replace a-query [:field-id id]
                           [:datetime-field [:field-id id] :day])))))

(deftest basic-replace-in-test
  (testing "can we wrap the pattern in a map to restrict what gets replaced?"
    (is (= {:breakout [[:datetime-field [:field-id 10] :day]
                       [:datetime-field [:field-id 20] :day]
                       [:field-literal "Wow"]]
            :fields   [[:fk-> [:field-id 30] [:field-id 40]]]}
           (mbql.u/replace-in a-query [:breakout] [:field-id id]
                              [:datetime-field [:field-id id] :day])))))

(deftest replace-multiple-patterns-test
  (testing "can we use multiple patterns at the same time?!"
    (is (= {:breakout [[:field-id 10] [:field-id 20] {:name "Wow"}], :fields [30]}
           (mbql.u/replace a-query
                           [:fk-> [:field-id field-id] _] field-id
                           [:field-literal field-name]    {:name field-name})))))

(deftest replace-field-ids-test
  (testing "can we use `replace` to replace the ID of the dest Field in fk-> clauses?"
    (is (= {:breakout [[:field-id 10]
                       [:field-id 20]
                       [:field-literal "Wow"]]
            :fields   [[:fk-> [:field-id 30] [:field-id 100]]]}
           (mbql.u/replace a-query [:fk-> source [:field-id 40]]
                           [:fk-> source [:field-id 100]])))))

(deftest replace-fix-bad-mbql-test
  (testing "can we use `replace` to fix `fk->` clauses where both args are unwrapped IDs?"
    (is (= {:query {:fields [[:fk-> [:field-id 1] [:field-id 2]]
                             [:fk-> [:field-id 3] [:field-id 4]]]}}
           (mbql.u/replace-in
            {:query {:fields [[:fk-> 1 2]
                              [:fk-> [:field-id 3] [:field-id 4]]]}}
            [:query :fields]
            [:fk-> (source :guard integer?) (dest :guard integer?)]
            [:fk-> [:field-id source] [:field-id dest]])))))

(deftest replace-raw-keyword-patterns-test
  (testing "does `replace` accept a raw keyword as the pattern the way `match` does?"
    (is (= {:fields ["WOW"
                     [:datetime-field "WOW" :day]
                     [:datetime-field [:fk-> "WOW" "WOW"] :month]]}
           (mbql.u/replace another-query :field-id "WOW")))))

(deftest replace-set-of-keywords-test
  (testing "does `replace` accept a set of keywords the way `match` does?"
    (is (= {:fields ["WOW" "WOW" "WOW"]}
           (mbql.u/replace another-query #{:datetime-field :field-id} "WOW")))))

(deftest replace-&match-test
  (testing "can we use the anaphor `&match` to look at the entire match?"
    (is (= {:fields [[:field-id 1]
                     [:magical-field
                      [:datetime-field [:field-id 2] :day]]
                     [:magical-field
                      [:datetime-field [:fk-> [:field-id 3] [:field-id 4]] :month]]]}
           (mbql.u/replace another-query :datetime-field [:magical-field &match])))))

(deftest replace-&parents-test
  (testing "can we use the anaphor `&parents` to look at the parents of the match?"
    (is (= {:fields
            [[:field-id 1]
             [:datetime-field "WOW" :day]
             [:datetime-field [:fk-> "WOW" "WOW"] :month]]}
           ;; replace field ID clauses that are inside a datetime-field clause
           (mbql.u/replace another-query :field-id
                           (if (contains? (set &parents) :datetime-field)
                             "WOW"
                             &match))))))

(deftest replace-by-class-test
  (testing "can we replace using a CLASS?"
    (is (= [[:field-id 1]
            [:field-id 2]
            [:timestamp #inst "2018-10-08T00:00:00.000-00:00"]
            4000]
           (mbql.u/replace [[:field-id 1]
                            [:field-id 2]
                            #inst "2018-10-08"
                            4000]
                           java.util.Date
                           [:timestamp &match])))))

(deftest replace-by-predicate-test
  (testing "can we replace using a PREDICATE?"
    (is (= {:filter [:and [:= [:field-id nil] 4000.0] [:= [:field-id nil] 5000.0]]}
           ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses and make them FLOATS
           (mbql.u/replace {:filter [:and
                                     [:= [:field-id 1] 4000]
                                     [:= [:field-id 2] 5000]]}
                           integer?
                           (when (= := (last &parents))
                             (float &match)))))))

(deftest complex-replace-test
  (testing "can we do fancy stuff like remove all the filters that use datetime fields from a query?"
    ;; (NOTE: this example doesn't take into account the fact that [:binning-strategy ...] can wrap a `:datetime-field`,
    ;; so it's only appropriate for drivers that don't support binning (e.g. GA). Also the driver QP will need to be
    ;; written to handle the nils in a filter clause appropriately.)
    (is (= [:and nil [:= [:field-id 100] 20]]
           (mbql.u/replace [:and
                            [:=
                             [:datetime-field [:field-literal "ga:date"] :day]
                             [:absolute-datetime #inst "2016-11-08T00:00:00.000-00:00" :day]]
                            [:= [:field-id 100] 20]]
             [_ [:datetime-field & _] & _] nil)))))

(deftest replace-short-circut-test
  (testing (str "can we use short-circuting patterns to do something tricky like only replace `:field-id` clauses that "
                "aren't wrapped by other clauses?")
    (is (= [[:datetime-field [:field-id 10] :day]
            [:datetime-field [:field-id 20] :month]
            [:field-id 30]]
           (let [id-is-datetime-field? #{10}]
             (mbql.u/replace [[:field-id 10]
                              [:datetime-field [:field-id 20] :month]
                              [:field-id 30]]
                             ;; don't replace anything that's already wrapping a `field-id`
                             [_ [:field-id & _] & _]
                             &match

                             [:field-id (_ :guard id-is-datetime-field?)]
                             [:datetime-field &match :day]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Other Fns                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest simplify-compound-filter-test
  (is (= [:= [:field-id 1] 2]
         (mbql.u/simplify-compound-filter [:and [:= [:field-id 1] 2]]))
      "can `simplify-compound-filter` fix `and` or `or` with only one arg?")
  (is (= [:and
          [:= [:field-id 1] 2]
          [:= [:field-id 3] 4]
          [:= [:field-id 5] 6]]
         (mbql.u/simplify-compound-filter [:and
                                           [:= [:field-id 1] 2]
                                           [:and
                                            [:= [:field-id 3] 4]
                                            [:and
                                             [:= [:field-id 5] 6]]]]))
      "can `simplify-compound-filter` unnest nested `and`s or `or`s?")
  (is (= [:and [:= [:field-id 1] 2] [:= [:field-id 3] 4]]
         (mbql.u/simplify-compound-filter [:and [:= [:field-id 1] 2] [:= [:field-id 3] 4] [:= [:field-id 1] 2]]))
      "can `simplify-compound-filter` remove duplicates?")
  (is (= [:= [:field-id 1] 2]
         (mbql.u/simplify-compound-filter [:not [:not [:= [:field-id 1] 2]]]))
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
    (is (= [:= [:field-id 1] 2]
           (mbql.u/simplify-compound-filter [:and nil [:and nil [:= [:field-id 1] 2] nil] nil])))
    (is (= [:and
            [:= [:field-id 1] 2]
            [:= [:field-id 3] 4]
            [:= [:field-id 5] 6]
            [:= [:field-id 7] 8]
            [:= [:field-id 9] 10]]
           (mbql.u/simplify-compound-filter
            [:and
             nil
             [:= [:field-id 1] 2]
             [:and
              [:= [:field-id 3] 4]]
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
                                 [:= [:field-id 1] 2]
                                 [:= [:field-id 3] 4]
                                 [:= [:field-id 5] 6]
                                 [:= [:field-id 7] 8]
                                 [:= [:field-id 9] 10]]]]}
         (mbql.u/simplify-compound-filter
          {:aggregation [[:share [:and
                                  nil
                                  [:= [:field-id 1] 2]
                                  [:and
                                   [:= [:field-id 3] 4]]
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
              [:not [:= [:field-id 1] 2]]
              [:not [:= [:field-id 2] 3]]]
             (mbql.u/simplify-compound-filter [:not [:and
                                                     [:= [:field-id 1] 2]
                                                     [:= [:field-id 2] 3]]]))))
    (testing ":or clauses"
      (is (= [:and
              [:not [:= [:field-id 1] 2]]
              [:not [:= [:field-id 2] 3]]]
             (mbql.u/simplify-compound-filter [:not [:or
                                                     [:= [:field-id 1] 2]
                                                     [:= [:field-id 2] 3]]]))
          "Check that `simplify-compound-filter` can apply de Morgan's law on `:not` over `:or`")))
  (testing "check that `simplify-compound-filter` doesn't remove `nil` from filters where it's being used as the value"
    (is (= [:= [:field-id 1] nil]
           (mbql.u/simplify-compound-filter [:= [:field-id 1] nil])))
    (is (= [:= [:field-id 1] nil]
           (mbql.u/simplify-compound-filter [:and nil [:= [:field-id 1] nil]])))))


(deftest add-order-by-clause-test
  (testing "can we add an order-by clause to a query?"
    (is (= {:source-table 1, :order-by [[:asc [:field-id 10]]]}
           (mbql.u/add-order-by-clause {:source-table 1} [:asc [:field-id 10]])))

    (is (= {:source-table 1
            :order-by     [[:asc [:field-id 10]]
                           [:asc [:field-id 20]]]}
           (mbql.u/add-order-by-clause {:source-table 1
                                        :order-by     [[:asc [:field-id 10]]]}
                                       [:asc [:field-id 20]]))))

  (testing "duplicate clauses should get ignored"
    (is (= {:source-table 1
            :order-by     [[:asc [:field-id 10]]]}
           (mbql.u/add-order-by-clause {:source-table 1
                                        :order-by     [[:asc [:field-id 10]]]}
                                       [:asc [:field-id 10]]))))

  (testing "as should clauses that reference the same Field"
    (is (= {:source-table 1
            :order-by     [[:asc [:field-id 10]]]}
           (mbql.u/add-order-by-clause {:source-table 1
                                        :order-by     [[:asc [:field-id 10]]]}
                                       [:desc [:field-id 10]])))

    (testing "fields with different amounts of wrapping (plain field vs datetime-field)"
      (is (= {:source-table 1
              :order-by     [[:asc [:field-id 10]]]}
             (mbql.u/add-order-by-clause {:source-table 1
                                          :order-by     [[:asc [:field-id 10]]]}
                                         [:asc [:datetime-field [:field-id 10] :day]]))))))

(deftest combine-filter-clauses-test
  (is (= [:and [:= [:field-id 1] 100] [:= [:field-id 2] 200]]
         (mbql.u/combine-filter-clauses
          [:= [:field-id 1] 100]
          [:= [:field-id 2] 200]))
      "Should be able to combine non-compound clauses")
  (is (= [:and
          [:= [:field-id 1] 100]
          [:= [:field-id 2] 200]
          [:= [:field-id 3] 300]]
         (mbql.u/combine-filter-clauses
          [:= [:field-id 1] 100]
          [:and
           [:= [:field-id 2] 200]
           [:= [:field-id 3] 300]]))
      "Should be able to combine into an exisiting compound clause")
  (is (= [:and
          [:= [:field-id 1] 100]
          [:= [:field-id 2] 200]
          [:= [:field-id 3] 300]
          [:= [:field-id 4] 300]]
         (mbql.u/combine-filter-clauses
          [:and
           [:= [:field-id 1] 100]
           [:= [:field-id 2] 200]]
          [:and
           [:= [:field-id 3] 300]
           [:= [:field-id 4] 300]]))
      "Should be able to combine multiple compound clauses"))

(deftest add-filter-clause-test
  (is (= {:database 1
          :type     :query
          :query    {:source-table 1
                     :filter       [:and [:= [:field-id 1] 100] [:= [:field-id 2] 200]]}}
         (mbql.u/add-filter-clause
          {:database 1
           :type     :query
           :query    {:source-table 1
                      :filter       [:= [:field-id 1] 100]}}
          [:= [:field-id 2] 200]))
      "Should be able to add a filter clause to a query"))

(deftest desugar-time-interval-test
  (is (= [:between
          [:datetime-field [:field-id 1] :month]
          [:relative-datetime 1 :month]
          [:relative-datetime 2 :month]]
         (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] 2 :month]))
      "`time-interval` with value > 1 or < -1 should generate a `between` clause")
  (is (= [:between
          [:datetime-field [:field-id 1] :month]
          [:relative-datetime 0 :month]
          [:relative-datetime 2 :month]]
         (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] 2 :month {:include-current true}]))
      "test the `include-current` option -- interval should start or end at `0` instead of `1`")
  (is (= [:=
          [:datetime-field [:field-id 1] :month]
          [:relative-datetime 1 :month]]
         (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] 1 :month]))
      "`time-interval` with value = 1 should generate an `=` clause")
  (is (= [:=
          [:datetime-field [:field-id 1] :week]
          [:relative-datetime -1 :week]]
         (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] -1 :week]))
      "`time-interval` with value = -1 should generate an `=` clause")
  (testing "`include-current` option"
    (is (= [:between
            [:datetime-field [:field-id 1] :month]
            [:relative-datetime 0 :month]
            [:relative-datetime 1 :month]]
           (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] 1 :month {:include-current true}]))
        "interval with value = 1 should generate a `between` clause")
    (is (= [:between
            [:datetime-field [:field-id 1] :day]
            [:relative-datetime -1 :day]
            [:relative-datetime 0 :day]]
           (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] -1 :day {:include-current true}]))
        "`include-current` option -- interval with value = 1 should generate a `between` clause"))
  (is (= [:=
          [:datetime-field [:field-id 1] :week]
          [:relative-datetime 0 :week]]
         (mbql.u/desugar-filter-clause [:time-interval [:field-id 1] :current :week]))
      "keywords like `:current` should work correctly"))

(deftest desugar-relative-datetime-with-current-test
  (is (= [:=
          [:datetime-field [:field-id 1] :minute]
          [:relative-datetime 0 :minute]]
         (mbql.u/desugar-filter-clause
          [:=
           [:datetime-field [:field-id 1] :minute]
           [:relative-datetime :current]]))
      "when comparing `:relative-datetime`to `:datetime-field`, it should take the unit of the `:datetime-field`")
  (is (= [:=
          [:field-id 1]
          [:relative-datetime 0 :default]]
         (mbql.u/desugar-filter-clause
          [:=
           [:field-id 1]
           [:relative-datetime :current]]))
      "otherwise it should just get a unit of `:default`")
  (is (= [:=
          [:binning-strategy [:datetime-field [:field-id 1] :week] :default]
          [:relative-datetime 0 :week]]
         (mbql.u/desugar-filter-clause
          [:=
           [:binning-strategy [:datetime-field [:field-id 1] :week] :default]
           [:relative-datetime :current]]))
      "we should be able to handle datetime fields even if they are nested inside another clause"))

(deftest desugar-other-filter-clauses-test
  (testing "desugaring := and :!= with extra args"
    (is (= [:or
            [:= [:field-id 1] 2]
            [:= [:field-id 1] 3]
            [:= [:field-id 1] 4]
            [:= [:field-id 1] 5]]
           (mbql.u/desugar-filter-clause [:= [:field-id 1] 2 3 4 5]))
        "= with extra args should get converted to or")
    (is (= [:and
            [:!= [:field-id 1] 2]
            [:!= [:field-id 1] 3]
            [:!= [:field-id 1] 4]
            [:!= [:field-id 1] 5]]
           (mbql.u/desugar-filter-clause [:!= [:field-id 1] 2 3 4 5]))
        "!= with extra args should get converted to or"))
  (testing "desugaring :inside"
    (is (= [:and
            [:between [:field-id 1] -10.0 10.0]
            [:between [:field-id 2] -20.0 20.0]]
           (mbql.u/desugar-filter-clause [:inside [:field-id 1] [:field-id 2] 10.0 -20.0 -10.0 20.0]))))
  (testing "desugaring :is-null"
    (is (= [:= [:field-id 1] nil]
           (mbql.u/desugar-filter-clause [:is-null [:field-id 1]]))))
  (testing "desugaring :not-null"
    (is (= [:!= [:field-id 1] nil]
           (mbql.u/desugar-filter-clause [:not-null [:field-id 1]]))))
  (testing "desugaring :is-empty"
    (is (= [:or [:= [:field-id 1] nil]
                [:= [:field-id 1] ""]]
           (mbql.u/desugar-filter-clause [:is-empty [:field-id 1]]))))
  (testing "desugaring :not-empty"
    (is (= [:and [:!= [:field-id 1] nil]
                 [:!= [:field-id 1] ""]]
           (mbql.u/desugar-filter-clause [:not-empty [:field-id 1]])))))

(deftest desugar-does-not-contain-test
  (testing "desugaring does-not-contain without options"
    (is (= [:not [:contains [:field-id 1] "ABC"]]
           (mbql.u/desugar-filter-clause [:does-not-contain [:field-id 1] "ABC"]))))
  (testing "desugaring does-not-contain *with* options"
    (is (= [:not [:contains [:field-id 1] "ABC" {:case-sensitive false}]]
           (mbql.u/desugar-filter-clause [:does-not-contain [:field-id 1] "ABC" {:case-sensitive false}])))))

(deftest negate-simple-filter-clause-test
  (testing :=
    (is (= [:!= [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:= [:field-id 1] 10]))))
  (testing :!=
    (is (= [:= [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:!= [:field-id 1] 10]))))
  (testing :>
    (is (= [:<= [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:> [:field-id 1] 10]))))
  (testing :<
    (is (= [:>= [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:< [:field-id 1] 10]))))
  (testing :>=
    (is (= [:< [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:>= [:field-id 1] 10]))))
  (testing :<=
    (is (= [:> [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:<= [:field-id 1] 10]))))
  (testing :between
    (is (= [:or
            [:< [:field-id 1] 10]
            [:> [:field-id 1] 20]]
           (mbql.u/negate-filter-clause [:between [:field-id 1] 10 20]))))
  (testing :contains
    (is (= [:not [:contains [:field-id 1] "ABC"]]
           (mbql.u/negate-filter-clause [:contains [:field-id 1] "ABC"]))))
  (testing :starts-with
    (is (= [:not [:starts-with [:field-id 1] "ABC"]]
           (mbql.u/negate-filter-clause [:starts-with [:field-id 1] "ABC"]))))
  (testing :ends-with
    (is (= [:not [:ends-with [:field-id 1] "ABC"]]
           (mbql.u/negate-filter-clause [:ends-with [:field-id 1] "ABC"])))))

(deftest negate-compund-filter-clause-test
  (testing :not
    (is (= [:= [:field-id 1] 10]
           (mbql.u/negate-filter-clause [:not [:= [:field-id 1] 10]]))
        "negating `:not` should simply unwrap the clause"))
  (testing :and
    (is (= [:or
            [:!= [:field-id 1] 10]
            [:!= [:field-id 2] 20]]
           (mbql.u/negate-filter-clause
            [:and
             [:= [:field-id 1] 10]
             [:= [:field-id 2] 20]]))))
  (testing :or
    (is (= [:and
            [:= [:field-id 1] 10]
            [:= [:field-id 2] 20]]
           (mbql.u/negate-filter-clause
            [:or
             [:!= [:field-id 1] 10]
             [:!= [:field-id 2] 20]])))))

(deftest negate-syntactic-sugar-filter-clause-test
  (testing "= with extra args"
    (is (= [:and
            [:!= [:field-id 1] 10]
            [:!= [:field-id 1] 20]
            [:!= [:field-id 1] 30]]
           (mbql.u/negate-filter-clause [:= [:field-id 1] 10 20 30]))))
  (testing "!= with extra args"
    (is (= [:or
            [:= [:field-id 1] 10]
            [:= [:field-id 1] 20]
            [:= [:field-id 1] 30]]
           (mbql.u/negate-filter-clause [:!= [:field-id 1] 10 20 30]))))
  (testing :time-interval
    (is (= [:!=
            [:datetime-field [:field-id 1] :week]
            [:relative-datetime 0 :week]]
           (mbql.u/negate-filter-clause [:time-interval [:field-id 1] :current :week]))))
  (testing :is-null
    (is (= [:!= [:field-id 1] nil]
           (mbql.u/negate-filter-clause [:is-null [:field-id 1]]))))
  (testing :not-null
    (is (= [:= [:field-id 1] nil]
           (mbql.u/negate-filter-clause [:not-null [:field-id 1]]))))
  (testing :inside
    (is (= [:or
            [:< [:field-id 1] -10.0]
            [:> [:field-id 1] 10.0]
            [:< [:field-id 2] -20.0]
            [:> [:field-id 2] 20.0]]
           (mbql.u/negate-filter-clause
            [:inside [:field-id 1] [:field-id 2] 10.0 -20.0 -10.0 20.0])))))

(deftest join->source-table-id-test
  (let [join {:strategy     :left-join
               :condition    [:=
                              [:field-id 48]
                              [:joined-field "products" [:field-id 44]]]
               :alias        "products"}]
    (is (= 5
           (mbql.u/join->source-table-id (assoc join :source-table 5))))
    (is (= 5
           (mbql.u/join->source-table-id (assoc join :source-query {:source-table 5}))))))


;;; ---------------------------------------------- aggregation-at-index ----------------------------------------------

(def ^:private query-with-some-nesting
  {:database 1
   :type     :query
   :query    {:source-query {:source-table 1
                             :aggregation  [[:stddev [:field-id 1]]
                                            [:min [:field-id 1]]]}
              :aggregation  [[:avg [:field-id 1]]
                             [:max [:field-id 1]]]}})

(deftest aggregation-at-index-test
  (doseq [[input expected] {[0]   [:avg [:field-id 1]]
                            [1]   [:max [:field-id 1]]
                            [0 0] [:avg [:field-id 1]]
                            [0 1] [:stddev [:field-id 1]]
                            [1 1] [:min [:field-id 1]]}]
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
          [:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
          [:aggregation-options [:count] {:name "count_2"}]
          [:aggregation-options [:count] {:name "count_3"}]]
         (mbql.u/uniquify-named-aggregations
          [[:aggregation-options [:count] {:name "count"}]
           [:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
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
      (is (= [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
              [:aggregation-options [:count [:field-id 1]] {:name "count"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
              [:aggregation-options [:avg [:field-id 1]]   {:name "avg"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
              [:aggregation-options [:min [:field-id 1]]   {:name "min"}]]
             (mbql.u/pre-alias-aggregations simple-ag->name
               [[:sum [:field-id 1]]
                [:count [:field-id 1]]
                [:sum [:field-id 1]]
                [:avg [:field-id 1]]
                [:sum [:field-id 1]]
                [:min [:field-id 1]]]))))

    (testing "we shouldn't change the name of ones that are already named"
      (is (= [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
              [:aggregation-options [:count [:field-id 1]] {:name "count"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
              [:aggregation-options [:avg [:field-id 1]]   {:name "avg"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum_2"}]
              [:aggregation-options [:min [:field-id 1]]   {:name "min"}]]
             (mbql.u/pre-alias-aggregations simple-ag->name
               [[:sum [:field-id 1]]
                [:count [:field-id 1]]
                [:sum [:field-id 1]]
                [:avg [:field-id 1]]
                [:aggregation-options [:sum [:field-id 1]] {:name "sum_2"}]
                [:min [:field-id 1]]]))))


    (testing "ok, can we do the same thing as the tests above but make those names *unique* at the same time?"
      (is (= [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}  ]
              [:aggregation-options [:count [:field-id 1]] {:name "count"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum_2"}]
              [:aggregation-options [:avg [:field-id 1]]   {:name "avg"}  ]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum_3"}]
              [:aggregation-options [:min [:field-id 1]]   {:name "min"}  ]]
             (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
               [[:sum [:field-id 1]]
                [:count [:field-id 1]]
                [:sum [:field-id 1]]
                [:avg [:field-id 1]]
                [:sum [:field-id 1]]
                [:min [:field-id 1]]])))

      (is (= [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
              [:aggregation-options [:count [:field-id 1]] {:name "count"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum_2"}]
              [:aggregation-options [:avg [:field-id 1]]   {:name "avg"}]
              [:aggregation-options [:sum [:field-id 1]]   {:name "sum_2_2"}]
              [:aggregation-options [:min [:field-id 1]]   {:name "min"}]]
             (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
               [[:sum [:field-id 1]]
                [:count [:field-id 1]]
                [:sum [:field-id 1]]
                [:avg [:field-id 1]]
                [:aggregation-options [:sum [:field-id 1]] {:name "sum_2"}]
                [:min [:field-id 1]]]))))

    (testing (str "if `:aggregation-options` only specifies `:display-name` it should still a new `:name`. "
                  "`pre-alias-and-uniquify-aggregations` shouldn't stomp over display name")
      (is (= [[:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
              [:aggregation-options [:sum [:field-id 1]] {:name "sum_2"}]
              [:aggregation-options [:sum [:field-id 1]] {:display-name "Sum of Field 1", :name "sum_3"}]]
             (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
               [[:sum [:field-id 1]]
                [:sum [:field-id 1]]
                [:aggregation-options [:sum [:field-id 1]] {:display-name "Sum of Field 1"}]])))

      (testing "if both are specified, `display-name` should still be propagated"
        (is (= [[:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
                [:aggregation-options [:sum [:field-id 1]] {:name "sum_2"}]
                [:aggregation-options [:sum [:field-id 1]] {:name "sum_2_2", :display-name "Sum of Field 1"}]]
               (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
                 [[:sum [:field-id 1]]
                  [:sum [:field-id 1]]
                  [:aggregation-options [:sum [:field-id 1]] {:name "sum_2", :display-name "Sum of Field 1"}]])))))))

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

(deftest joined-field-test
  (is (= [:joined-field "a" [:field-id 10]]
         (mbql.u/->joined-field "a" [:field-id 10])))

  (is (= [:joined-field "a" [:field-literal "ABC" :type/Integer]]
         (mbql.u/->joined-field "a" [:field-literal "ABC" :type/Integer])))

  (is (= [:datetime-field [:joined-field "a" [:field-id 1]] :month]
         (mbql.u/->joined-field "a" [:datetime-field [:field-id 1] :month])))

  (testing "We should throw an Exception if the Field already has an alias"
    (is (thrown? Exception
                 (mbql.u/->joined-field "a" [:joined-field "a" [:field-id 1]])))

    (is (thrown? Exception
                 (mbql.u/->joined-field "a" [:datetime-field [:joined-field "a" [:field-id 1]] :month])))))

(deftest datetime-arithmetics?-test
  (is (mbql.u/datetime-arithmetics?
       [:+ [:field-id 13] [:interval -1 :month]]))
  (is (mbql.u/datetime-arithmetics?
       [:datetime-field [:joined-field "a" [:field-id 1]] :month]))
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

(deftest field-clause->id-or-literal-test
  (doseq [[input expected] {[:field-id 1]                        1
                            [:field-literal "foo" :type/Integer] "foo"
                            [:expression "foo"]                  "foo"}]
    (testing (pr-str (list 'field-clause->id-or-literal input))
      (is (= expected
             (mbql.u/field-clause->id-or-literal input))))))
