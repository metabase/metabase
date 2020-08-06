(ns metabase.mbql.util-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
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

;; can we use `match` to find the instances of a clause?
(expect
 [[:field-id 10]
  [:field-id 20]]
 (mbql.u/match {:query {:filter [:=
                                 [:field-id 10]
                                 [:field-id 20]]}}
   [:field-id & _]))

;; is `match` nice enought to automatically wrap raw keywords in appropriate patterns for us?
(expect
  [[:field-id 1]
   [:field-id 2]
   [:field-id 3]]
  (mbql.u/match {:fields [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]}
    :field-id))

;; if we pass a set of keywords, will that generate an appropriate pattern to match multiple clauses as well?
(expect
  [[:field-id 1]
   [:field-id 2]
   [:field-id 3]
   [:datetime-field [:field-id 4]]]
  (mbql.u/match {:fields [[:field-id 1]
                          [:fk-> [:field-id 2] [:field-id 3]]
                          [:datetime-field [:field-id 4]]]}
    #{:field-id :datetime-field}))

;; `match` shouldn't include subclauses of matches
(expect
  [[:field-id 1]
   [:fk-> [:field-id 2] [:field-id 3]]]
  (mbql.u/match [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]
    [(:or :field-id :fk->) & _]))

(expect
  [[:field-id 10]
   [:field-id 20]]
  (mbql.u/match {:query {:filter [:=
                                  [:field-id 10]
                                  [:field-id 20]]}}
    [(:or :field-id :+ :-) & _]))

;; can we use some of the cool features of pattern matching?
(def ^:private a-query
  {:breakout [[:field-id 10]
              [:field-id 20]
              [:field-literal "Wow"]]
   :fields   [[:fk->
               [:field-id 30]
               [:field-id 40]]]})

;; can we use the optional `result` parameter to find return something other than the whole clause?
(expect
  [41]
  ;; return just the dest IDs of Fields in a fk-> clause
  (mbql.u/match a-query
    [:fk-> _ [:field-id dest-id]] (inc dest-id)))

(expect
  [10 20]
  (mbql.u/match (:breakout a-query) [:field-id id] id))

;; match should return `nil` if there are no matches so you don't need to call `seq`
(expect
  nil
  (mbql.u/match {} [:datetime-field _ unit] unit))

;; if pattern is just a raw keyword `match` should be kind enough to turn it into a pattern for you
(expect
  [[:field-id 1]
   [:field-id 2]]
  (mbql.u/match {:fields [[:field-id 1] [:datetime-field [:field-id 2] :day]]}
    :field-id))

;; can we `:guard` a pattern?
(expect
  [[:field-id 2]]
  (let [a-field-id 2]
    (mbql.u/match {:fields [[:field-id 1] [:field-id 2]]}
      [:field-id (id :guard (partial = a-field-id))])))

;; ok, if for some reason we can't use `:guard` in the pattern will `match` filter out nil results?
(expect
  [2]
  (mbql.u/match {:fields [[:field-id 1] [:field-id 2]]}
    [:field-id id]
    (when (= id 2)
      id)))

;; Ok, if we want to use predicates but still return the whole match, can we use the anaphoric `&match` symbol to
;; return the whole thing?
(def ^:private another-query
  {:fields [[:field-id 1]
            [:datetime-field [:field-id 2] :day]
            [:datetime-field [:fk-> [:field-id 3] [:field-id 4]] :month]]})

(expect
  [[:field-id 1]
   [:field-id 2]
   [:field-id 3]
   [:field-id 4]]
  (let [some-pred? (constantly true)]
    (mbql.u/match another-query
      :field-id
      (when some-pred?
        &match))))

;; can we use the anaphoric `&parents` symbol to examine the parents of the collection? let's see if we can match
;; `:field-id` clauses that are inside `:datetime-field` clauses, regardless of whether something else wraps them
(expect
  [[:field-id 2]
   [:field-id 3]
   [:field-id 4]]
  (mbql.u/match another-query
    :field-id
    (when (contains? (set &parents) :datetime-field)
      &match)))

;; can we match using a CLASS?
(expect
  [#inst "2018-10-08T00:00:00.000-00:00"]
  (mbql.u/match [[:field-id 1]
                 [:field-id 2]
                 #inst "2018-10-08"
                 4000]
    java.util.Date))

;; can we match using a PREDICATE?
(expect
  [4000 5000]
  ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses
  (mbql.u/match {:filter [:and
                          [:= [:field-id 1] 4000]
                          [:= [:field-id 2] 5000]]}
    integer?
    (when (= := (last &parents))
      &match)))

;; how can we use predicates not named by a symbol?
(expect
  [1 4000 2 5000]
  (mbql.u/match {:filter [:and
                          [:= [:field-id 1] 4000]
                          [:= [:field-id 2] 5000]]}
    (&match :guard #(integer? %))))

;; can we use a predicate and bind the match at the same time?
(expect
  [2 4001 3 5001]
  (mbql.u/match {:filter [:and
                          [:= [:field-id 1] 4000]
                          [:= [:field-id 2] 5000]]}
    (i :guard #(integer? %))
    (inc i)))

;; can we match against a map?
(expect
  ["card__1847"]
  (let [x {:source-table "card__1847"}]
    (mbql.u/match x
      (m :guard (every-pred map? (comp string? :source-table)))
      (:source-table m))))

;; how about a sequence of maps?
(expect
  ["card__1847"]
  (let [x [{:source-table "card__1847"}]]
    (mbql.u/match x
      (m :guard (every-pred map? (comp string? :source-table)))
      (:source-table m))))

;; can we use `recur` inside a pattern?
(expect
  [[0 :month]]
  (mbql.u/match {:filter [:time-interval [:field-id 1] :current :month]}
    [:time-interval field :current unit] (recur [:time-interval field 0 unit])
    [:time-interval _     n        unit] [n unit]))

;; can we short-circut a match to prevent recursive matching?
(expect
  [10]
  (mbql.u/match [[:field-id 10]
                 [:datetime-field [:field-id 20] :day]]
    [:field-id id] id
    [_ [:field-id & _] & _] nil))

;; can we use a list with a :guard clause?
(expect
  [10 20]
  (mbql.u/match {:query {:filter [:=
                                  [:field-id 10]
                                  [:field-id 20]]}}
    (id :guard int?) id))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    replace                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; can we use `replace` to replace a specific clause?
(expect
  {:breakout [[:datetime-field [:field-id 10] :day]
              [:datetime-field [:field-id 20] :day]
              [:field-literal "Wow"]]
   :fields   [[:fk->
               [:datetime-field [:field-id 30] :day]
               [:datetime-field [:field-id 40] :day]]]}
  (mbql.u/replace a-query [:field-id id]
                  [:datetime-field [:field-id id] :day]))

;; can we wrap the pattern in a map to restrict what gets replaced?
(expect
  {:breakout [[:datetime-field [:field-id 10] :day]
              [:datetime-field [:field-id 20] :day]
              [:field-literal "Wow"]]
   :fields   [[:fk-> [:field-id 30] [:field-id 40]]]}
  (mbql.u/replace-in a-query [:breakout] [:field-id id]
    [:datetime-field [:field-id id] :day]))

;; can we use multiple patterns at the same time?!
(expect
  {:breakout [[:field-id 10] [:field-id 20] {:name "Wow"}], :fields [30]}
  (mbql.u/replace a-query
    [:fk-> [:field-id field-id] _] field-id
    [:field-literal field-name]    {:name field-name}))

;; can we use `replace` to replace the ID of the dest Field in fk-> clauses?
(expect
  {:breakout [[:field-id 10]
              [:field-id 20]
              [:field-literal "Wow"]]
   :fields   [[:fk-> [:field-id 30] [:field-id 100]]]}
  (mbql.u/replace a-query [:fk-> source [:field-id 40]]
    [:fk-> source [:field-id 100]]))

;; can we use `replace` to fix `fk->` clauses where both args are unwrapped IDs?
(expect
  {:query {:fields [[:fk-> [:field-id 1] [:field-id 2]]
                    [:fk-> [:field-id 3] [:field-id 4]]]}}
  (mbql.u/replace-in
      {:query {:fields [[:fk-> 1 2]
                        [:fk-> [:field-id 3] [:field-id 4]]]}}
      [:query :fields]
    [:fk-> (source :guard integer?) (dest :guard integer?)]
    [:fk-> [:field-id source] [:field-id dest]]))

;; does `replace` accept a raw keyword as the pattern the way `match` does?
(expect
  {:fields ["WOW"
            [:datetime-field "WOW" :day]
            [:datetime-field [:fk-> "WOW" "WOW"] :month]]}
  (mbql.u/replace another-query :field-id "WOW"))

;; does `replace` accept a set of keywords the way `match` does?
(expect
  {:fields ["WOW" "WOW" "WOW"]}
  (mbql.u/replace another-query #{:datetime-field :field-id} "WOW"))

;; can we use the anaphor `&match` to look at the entire match?
(expect
  {:fields [[:field-id 1]
            [:magical-field
             [:datetime-field [:field-id 2] :day]]
            [:magical-field
             [:datetime-field [:fk-> [:field-id 3] [:field-id 4]] :month]]]}
  (mbql.u/replace another-query :datetime-field [:magical-field &match]))

;; can we use the anaphor `&parents` to look at the parents of the match?
(expect
  {:fields
   [[:field-id 1]
    [:datetime-field "WOW" :day]
    [:datetime-field [:fk-> "WOW" "WOW"] :month]]}
  ;; replace field ID clauses that are inside a datetime-field clause
  (mbql.u/replace another-query :field-id
    (if (contains? (set &parents) :datetime-field)
      "WOW"
      &match)))

;; can we replace using a CLASS?
(expect
  [[:field-id 1]
   [:field-id 2]
   [:timestamp #inst "2018-10-08T00:00:00.000-00:00"]
   4000]
  (mbql.u/replace [[:field-id 1]
                   [:field-id 2]
                   #inst "2018-10-08"
                   4000]
      java.util.Date
      [:timestamp &match]))

;; can we replace using a PREDICATE?
(expect
  {:filter [:and [:= [:field-id nil] 4000.0] [:= [:field-id nil] 5000.0]]}
  ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses and make them FLOATS
  (mbql.u/replace {:filter [:and
                            [:= [:field-id 1] 4000]
                            [:= [:field-id 2] 5000]]}
      integer?
      (when (= := (last &parents))
        (float &match))))

;; can we do fancy stuff like remove all the filters that use datetime fields from a query?
;;
;; (NOTE: this example doesn't take into account the fact that [:binning-strategy ...] can wrap a `:datetime-field`,
;; so it's only appropriate for drivers that don't support binning (e.g. GA). Also the driver QP will need to be
;; written to handle the nils in a filter clause appropriately.)
(expect
  [:and nil [:= [:field-id 100] 20]]
  (mbql.u/replace [:and
                   [:=
                    [:datetime-field [:field-literal "ga:date"] :day]
                    [:absolute-datetime #inst "2016-11-08T00:00:00.000-00:00" :day]]
                   [:= [:field-id 100] 20]]
    [_ [:datetime-field & _] & _] nil))

;; can we use short-circuting patterns to do something tricky like only replace `:field-id` clauses that aren't
;; wrapped by other clauses?
(expect
  [[:datetime-field [:field-id 10] :day]
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
      [:datetime-field &match :day])))


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


;; can we add an order-by clause to a query?
(expect
  {:source-table 1, :order-by [[:asc [:field-id 10]]]}
  (mbql.u/add-order-by-clause {:source-table 1} [:asc [:field-id 10]]))

(expect
  {:source-table 1
   :order-by     [[:asc [:field-id 10]]
                  [:asc [:field-id 20]]]}
  (mbql.u/add-order-by-clause {:source-table 1
                               :order-by     [[:asc [:field-id 10]]]}
                              [:asc [:field-id 20]]))

;; duplicate clauses should get ignored
(expect
  {:source-table 1
   :order-by     [[:asc [:field-id 10]]]}
  (mbql.u/add-order-by-clause {:source-table 1
                               :order-by     [[:asc [:field-id 10]]]}
                              [:asc [:field-id 10]]))

;; as should clauses that reference the same Field
(expect
  {:source-table 1
   :order-by     [[:asc [:field-id 10]]]}
  (mbql.u/add-order-by-clause {:source-table 1
                               :order-by     [[:asc [:field-id 10]]]}
                              [:desc [:field-id 10]]))

(expect
 {:source-table 1
  :order-by     [[:asc [:field-id 10]]]}
 (mbql.u/add-order-by-clause {:source-table 1
                              :order-by     [[:asc [:field-id 10]]]}
                             [:asc [:datetime-field [:field-id 10] :day]]))

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

;;; ---------------------------------------------- aggregation-at-index ----------------------------------------------

(def ^:private query-with-some-nesting
  {:database 1
   :type     :query
   :query    {:source-query {:source-table 1
                             :aggregation  [[:stddev [:field-id 1]]
                                            [:min [:field-id 1]]]}
              :aggregation  [[:avg [:field-id 1]]
                             [:max [:field-id 1]]]}})

(expect
  [:avg [:field-id 1]]
  (mbql.u/aggregation-at-index query-with-some-nesting 0))

(expect
  [:max [:field-id 1]]
  (mbql.u/aggregation-at-index query-with-some-nesting 1))

(expect
  [:avg [:field-id 1]]
  (mbql.u/aggregation-at-index query-with-some-nesting 0 0))

(expect
  [:stddev [:field-id 1]]
  (mbql.u/aggregation-at-index query-with-some-nesting 0 1))

(expect
  [:min [:field-id 1]]
  (mbql.u/aggregation-at-index query-with-some-nesting 1 1))


;;; --------------------------------- Unique names & transforming ags to have names ----------------------------------

;; can we generate unique names?
(expect
  ["count" "sum" "count_2" "count_3"]
  (mbql.u/uniquify-names ["count" "sum" "count" "count"]))

(expect
 [[:aggregation-options [:count] {:name "count"}]
  [:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
  [:aggregation-options [:count] {:name "count_2"}]
  [:aggregation-options [:count] {:name "count_3"}]]
 (mbql.u/uniquify-named-aggregations
  [[:aggregation-options [:count] {:name "count"}]
   [:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
   [:aggregation-options [:count] {:name "count"}]
   [:aggregation-options [:count] {:name "count"}]]))

;; what if we try to trick it by using a name it would have generated?
(expect
 ["count" "count_2" "count_2_2"]
 (mbql.u/uniquify-names ["count" "count" "count_2"]))

(expect
 [[:aggregation-options [:count] {:name "count"}]
  [:aggregation-options [:count] {:name "count_2"}]
  [:aggregation-options [:count] {:name "count_2_2"}]]
 (mbql.u/uniquify-named-aggregations
  [[:aggregation-options [:count] {:name "count"}]
   [:aggregation-options [:count] {:name "count"}]
   [:aggregation-options [:count] {:name "count_2"}]]))

;; for wacky DBMSes like SQLServer that return blank column names sometimes let's make sure we handle those without
;; exploding
(expect
  ["" "_2"]
  (mbql.u/uniquify-names ["" ""]))

;; can we wrap all of our aggregation clauses in `:named` clauses?
(defn- simple-ag->name [[ag-name]]
  (name ag-name))

(expect
 [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
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
    [:min [:field-id 1]]]))

;; we shouldn't change the name of ones that are already named
(expect
 [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
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
    [:min [:field-id 1]]]))

;; ok, can we do the same thing as the tests above but make those names *unique* at the same time?
(expect
 [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}  ]
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
     [:min [:field-id 1]]]))

(expect
 [[:aggregation-options [:sum [:field-id 1]]   {:name "sum"}]
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
    [:min [:field-id 1]]]))

;; if `:aggregation-options` only specifies `:display-name` it should still a new `:name`.
;; `pre-alias-and-uniquify-aggregations` shouldn't stomp over display name
(expect
 [[:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
  [:aggregation-options [:sum [:field-id 1]] {:name "sum_2"}]
  [:aggregation-options [:sum [:field-id 1]] {:display-name "Sum of Field 1", :name "sum_3"}]]
 (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
   [[:sum [:field-id 1]]
    [:sum [:field-id 1]]
    [:aggregation-options [:sum [:field-id 1]] {:display-name "Sum of Field 1"}]]))

;; if both are specified, `display-name` should still be propogated
(expect
 [[:aggregation-options [:sum [:field-id 1]] {:name "sum"}]
  [:aggregation-options [:sum [:field-id 1]] {:name "sum_2"}]
  [:aggregation-options [:sum [:field-id 1]] {:name "sum_2_2", :display-name "Sum of Field 1"}]]
 (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
   [[:sum [:field-id 1]]
    [:sum [:field-id 1]]
    [:aggregation-options [:sum [:field-id 1]] {:name "sum_2", :display-name "Sum of Field 1"}]]))

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

;; should return `:limit` if set
(expect
 10
 (mbql.u/query->max-rows-limit
  {:database 1, :type :query, :query {:source-table 1, :limit 10}}))

;; should return `:page` items if set
(expect
  5
  (mbql.u/query->max-rows-limit
   {:database 1, :type :query, :query {:source-table 1, :page {:page 1, :items 5}}}))

;; if `:max-results` is set return that
(expect
  15
  (mbql.u/query->max-rows-limit
   {:database 1, :type :query, :query {:source-table 1}, :constraints {:max-results 15}}))

;; if `:max-results-bare-rows` is set AND query has no aggregations, return that
(expect
  10
  (mbql.u/query->max-rows-limit
   {:database 1, :type :query, :query {:source-table 1}, :constraints {:max-results 5, :max-results-bare-rows 10}}))

(expect
  10
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :native
    :native      {:query "SELECT * FROM my_table"}
    :constraints {:max-results 5, :max-results-bare-rows 10}}))

;; if `:max-results-bare-rows` is set but query has aggregations, return `:max-results` instead
(expect
  5
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :query
    :query       {:source-table 1, :aggregation [[:count]]}
    :constraints {:max-results 5, :max-results-bare-rows 10}}))

;; if both `:limit` and `:page` are set (not sure makes sense), return the smaller of the two
(expect
  5
  (mbql.u/query->max-rows-limit
   {:database 1, :type :query, :query {:source-table 1, :limit 10, :page {:page 1, :items 5}}}))

(expect
  5
  (mbql.u/query->max-rows-limit
   {:database 1, :type :query, :query {:source-table 1, :limit 5, :page {:page 1, :items 10}}}))

;; if both `:limit` and `:constraints` are set, prefer the smaller of the two
(expect
  5
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :query
    :query       {:source-table 1, :limit 5}
    :constraints {:max-results 10}}))

(expect
  10
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :query
    :query       {:source-table 1, :limit 15}
    :constraints {:max-results 10}}))

;; since this query doesn't have an aggregation we should be using `max-results-bare-rows`
(expect
  5
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :query
    :query       {:source-table 1, :limit 10}
    :constraints {:max-results 15, :max-results-bare-rows 5}}))

;; add an aggregation, and `:max-results` is used instead; since `:limit` is lower, return that
(expect
  10
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :query
    :query       {:source-table 1, :limit 10, :aggregation [[:count]]}
    :constraints {:max-results 15, :max-results-bare-rows 5}}))

;; if nothing is set return `nil`
(expect
  nil
  (mbql.u/query->max-rows-limit
   {:database    1
    :type        :query
    :query       {:source-table 1}}))

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

(expect
  (mbql.u/datetime-arithmetics? [:+ [:field-id 13] [:interval -1 :month]]))

(expect
  (mbql.u/datetime-arithmetics? [:datetime-field [:joined-field "a" [:field-id 1]] :month]))

(expect
  false
  (mbql.u/datetime-arithmetics? [:+ [:field-id 13] 3]))

(expect
  (mbql.u/expression-with-name {:database 1
                                :type     :query
                                :query    {:expressions  {:two [:+ 1 1]}
                                           :source-table 1}}
                               "two"))

;; Make sure `expression-with-name` knows how to reach into the parent query if need be
(expect
  (mbql.u/expression-with-name {:database 1
                                :type     :query
                                :query    {:source-query {:expressions  {:two [:+ 1 1]}
                                                          :source-table 1}}}
                               "two"))
