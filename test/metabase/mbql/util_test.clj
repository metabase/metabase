(ns metabase.mbql.util-test
  (:require [expectations :refer [expect]]
            [metabase.mbql.util :as mbql.u]))

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

;; can `simplify-compound-filter` fix `and` or `or` with only one arg?
(expect
  [:= [:field-id 1] 2]
  (mbql.u/simplify-compound-filter [:and [:= [:field-id 1] 2]]))

;; can `simplify-compound-filter` unnest nested `and`s or `or`s?
(expect
  [:and
   [:= [:field-id 1] 2]
   [:= [:field-id 3] 4]
   [:= [:field-id 5] 6]]
  (mbql.u/simplify-compound-filter [:and
                                    [:= [:field-id 1] 2]
                                    [:and
                                     [:= [:field-id 3] 4]
                                     [:and
                                      [:= [:field-id 5] 6]]]]))

;; can `simplify-compound-filter` remove duplicates?
(expect
  [:and [:= [:field-id 1] 2] [:= [:field-id 3] 4]]
  (mbql.u/simplify-compound-filter [:and [:= [:field-id 1] 2] [:= [:field-id 3] 4] [:= [:field-id 1] 2]]))

;; can `simplify-compound-filter` eliminate `not` inside a `not`?
(expect
  [:= [:field-id 1] 2]
  (mbql.u/simplify-compound-filter [:not [:not [:= [:field-id 1] 2]]]))

;; does `simplify-compound-filter` return `nil` for empty filter clauses?
(expect
  nil
  (mbql.u/simplify-compound-filter nil))

(expect
  nil
  (mbql.u/simplify-compound-filter []))

(expect
  nil
  (mbql.u/simplify-compound-filter [nil nil nil]))

(expect
  nil
  (mbql.u/simplify-compound-filter [:and nil nil]))

(expect
  nil
  (mbql.u/simplify-compound-filter [:and nil [:and nil nil nil] nil]))

;; can `simplify-compound-filter` eliminate `nil` inside compound filters?
(expect
  [:= [:field-id 1] 2]
  (mbql.u/simplify-compound-filter [:and nil [:and nil [:= [:field-id 1] 2] nil] nil]))

(expect
  [:and
   [:= [:field-id 1] 2]
   [:= [:field-id 3] 4]
   [:= [:field-id 5] 6]
   [:= [:field-id 7] 8]
   [:= [:field-id 9] 10]]
  (mbql.u/simplify-compound-filter [:and
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
                                      [:= [:field-id 9] 10]]]]))

;; can we add an order-by clause to a query?
(expect
  {:database 1, :type :query, :query {:source-table 1, :order-by [[:asc [:field-id 10]]]}}
  (mbql.u/add-order-by-clause {:database 1, :type :query, :query {:source-table 1}} [:asc [:field-id 10]]))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :order-by     [[:asc [:field-id 10]]
                             [:asc [:field-id 20]]]}}
  (mbql.u/add-order-by-clause {:database 1
                               :type     :query
                               :query    {:source-table 1
                                          :order-by     [[:asc [:field-id 10]]]}}
                              [:asc [:field-id 20]]))

;; duplicate clauses should get ignored
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :order-by     [[:asc [:field-id 10]]]}}
  (mbql.u/add-order-by-clause {:database 1
                               :type     :query
                               :query    {:source-table 1
                                          :order-by     [[:asc [:field-id 10]]]}}
                              [:asc [:field-id 10]]))

;; as should clauses that reference the same Field
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :order-by     [[:asc [:field-id 10]]]}}
  (mbql.u/add-order-by-clause {:database 1
                               :type     :query
                               :query    {:source-table 1
                                          :order-by     [[:asc [:field-id 10]]]}}
                              [:desc [:field-id 10]]))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :order-by     [[:asc [:field-id 10]]]}}
  (mbql.u/add-order-by-clause {:database 1
                               :type     :query
                               :query    {:source-table 1
                                          :order-by     [[:asc [:field-id 10]]]}}
                              [:asc [:datetime-field [:field-id 10] :day]]))

;; Check that `simplify-compound-filter` can apply de Morgan's law on `:not` over `:and`
(expect
  [:or
   [:not [:= [:field-id 1] 2]]
   [:not [:= [:field-id 2] 3]]]
  (mbql.u/simplify-compound-filter [:not [:and
                                          [:= [:field-id 1] 2]
                                          [:= [:field-id 2] 3]]]))

;; Check that `simplify-compound-filter` can apply de Morgan's law on `:not` over `:or`
(expect
  [:and
   [:not [:= [:field-id 1] 2]]
   [:not [:= [:field-id 2] 3]]]
  (mbql.u/simplify-compound-filter [:not [:or
                                          [:= [:field-id 1] 2]
                                          [:= [:field-id 2] 3]]]))

;; check that `simplify-compound-filter` doesn't remove `nil` from filters where it's being used as the value
(expect
  [:= [:field-id 1] nil]
  (mbql.u/simplify-compound-filter [:= [:field-id 1] nil]))

(expect
  [:= [:field-id 1] nil]
  (mbql.u/simplify-compound-filter [:and nil [:= [:field-id 1] nil]]))


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
  [[:named [:count] "count"]
   [:named [:sum [:field-id 1]] "sum"]
   [:named [:count] "count_2"]
   [:named [:count] "count_3"]]
  (mbql.u/uniquify-named-aggregations [[:named [:count] "count"]
                                       [:named [:sum [:field-id 1]] "sum"]
                                       [:named [:count] "count"]
                                       [:named [:count] "count"]]))

;; what if we try to trick it by using a name it would have generated?
(expect
  ["count" "count_2" "count_2_2"]
  (mbql.u/uniquify-names ["count" "count" "count_2"]))

(expect
  [[:named [:count] "count"]
   [:named [:count] "count_2"]
   [:named [:count] "count_2_2"]]
  (mbql.u/uniquify-named-aggregations [[:named [:count] "count"]
                                       [:named [:count] "count"]
                                       [:named [:count] "count_2"]]))

;; for wacky DBMSes like SQLServer that return blank column names sometimes let's make sure we handle those without
;; exploding
(expect
  ["" "_2"]
  (mbql.u/uniquify-names ["" ""]))

;; can we wrap all of our aggregation clauses in `:named` clauses?
(defn- simple-ag->name [[ag-name]]
  (name ag-name))

(expect
  [[:named [:sum [:field-id 1]] "sum"]
   [:named [:count [:field-id 1]] "count"]
   [:named [:sum [:field-id 1]] "sum"]
   [:named [:avg [:field-id 1]] "avg"]
   [:named [:sum [:field-id 1]] "sum"]
   [:named [:min [:field-id 1]] "min"]]
  (mbql.u/pre-alias-aggregations simple-ag->name
    [[:sum [:field-id 1]]
     [:count [:field-id 1]]
     [:sum [:field-id 1]]
     [:avg [:field-id 1]]
     [:sum [:field-id 1]]
     [:min [:field-id 1]]]))

;; we shouldn't change the name of ones that are already named
(expect
  [[:named [:sum [:field-id 1]] "sum"]
   [:named [:count [:field-id 1]] "count"]
   [:named [:sum [:field-id 1]] "sum"]
   [:named [:avg [:field-id 1]] "avg"]
   [:named [:sum [:field-id 1]] "sum_2"]
   [:named [:min [:field-id 1]] "min"]]
  (mbql.u/pre-alias-aggregations simple-ag->name
    [[:sum [:field-id 1]]
     [:count [:field-id 1]]
     [:sum [:field-id 1]]
     [:avg [:field-id 1]]
     [:named [:sum [:field-id 1]] "sum_2"]
     [:min [:field-id 1]]]))

;; ok, can we do the same thing as the tests above but make those names *unique* at the same time?
(expect
  [[:named [:sum [:field-id 1]] "sum"]
   [:named [:count [:field-id 1]] "count"]
   [:named [:sum [:field-id 1]] "sum_2"]
   [:named [:avg [:field-id 1]] "avg"]
   [:named [:sum [:field-id 1]] "sum_3"]
   [:named [:min [:field-id 1]] "min"]]
  (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
    [[:sum [:field-id 1]]
     [:count [:field-id 1]]
     [:sum [:field-id 1]]
     [:avg [:field-id 1]]
     [:sum [:field-id 1]]
     [:min [:field-id 1]]]))

(expect
  [[:named [:sum [:field-id 1]] "sum"]
   [:named [:count [:field-id 1]] "count"]
   [:named [:sum [:field-id 1]] "sum_2"]
   [:named [:avg [:field-id 1]] "avg"]
   [:named [:sum [:field-id 1]] "sum_2_2"]
   [:named [:min [:field-id 1]] "min"]]
  (mbql.u/pre-alias-and-uniquify-aggregations simple-ag->name
    [[:sum [:field-id 1]]
     [:count [:field-id 1]]
     [:sum [:field-id 1]]
     [:avg [:field-id 1]]
     [:named [:sum [:field-id 1]] "sum_2"]
     [:min [:field-id 1]]]))
