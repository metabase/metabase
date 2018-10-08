(ns metabase.mbql.util-test
  (:require [expectations :refer [expect]]
            [metabase.mbql.util :as mbql.u]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       match & match-including-subclauses                                       |
;;; +----------------------------------------------------------------------------------------------------------------+


;; can we use `match` to find the instances of a clause?
(expect
  [[:field-id 10]
   [:field-id 20]]
  (mbql.u/match [:field-id & _] {:query {:filter [:=
                                                  [:field-id 10]
                                                  [:field-id 20]]}}))

;; is `match` nice enought to automatically wrap raw keywords in appropriate patterns for us?
(expect
  [[:field-id 1]
   [:field-id 2]
   [:field-id 3]]
  (mbql.u/match :field-id {:fields [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]}))

;; if we pass a set of keywords, will that generate an appropriate pattern to match multiple clauses as well?
(expect
  [[:field-id 1]
   [:field-id 2]
   [:field-id 3]
   [:datetime-field [:field-id 4]]]
  (mbql.u/match #{:field-id :datetime-field} {:fields [[:field-id 1]
                                                       [:fk-> [:field-id 2] [:field-id 3]]
                                                       [:datetime-field [:field-id 4]]]}))

;; `match` shouldn't include subclauses of matches
(expect
  [[:field-id 1]
   [:fk-> [:field-id 2] [:field-id 3]]]
  (mbql.u/match [(:or :field-id :fk->) & _] [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]))

;; ...but we should be able get them if we use `match-including-subclauses` instead
(expect
  [[:field-id 1]
   [:fk-> [:field-id 2] [:field-id 3]]
   [:field-id 2]
   [:field-id 3]]
  (mbql.u/match-including-subclauses [(:or :field-id :fk->) & _]
    [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]))

(expect
  [[:field-id 10]
   [:field-id 20]]
  (mbql.u/match [(:or :field-id :+ :-) & _]
      {:query {:filter [:=
                        [:field-id 10]
                        [:field-id 20]]}}))

;; can we use some of the cool features of pattern matching?
(def ^:private a-query
  {:breakout [[:field-id 10]
              [:field-id 20]
              [:field-literal "Wow"]]
   :fields   [[:fk->
               [:field-id 30]
               [:field-id 40]]]})

;; can we use maps in the pattern to restrict the results to a certain part of the Query?
;;
(expect
  [[:field-id 30]
   [:field-id 40]]
  (mbql.u/match {:fields [:field-id & _]} a-query))

;; can we use plain keywords inside of a map?
(expect
  [[:field-id 30]
   [:field-id 40]]
  (mbql.u/match {:fields :field-id} a-query))

;; can we use the optional `result` parameter to find return something other than the whole clause?
(expect
  [41]
  ;; return just the dest IDs of Fields in a fk-> clause
  (mbql.u/match [:fk-> _ [:field-id dest-id]] a-query (inc dest-id)))

(expect
  [10 20]
  (mbql.u/match {:breakout [:field-id id]} a-query id))

;; can we use multiple keys in a map to match more than one key?
(expect
  [[:field-id 10]
   [:field-id 20]
   [:fk-> [:field-id 30] [:field-id 40]]]
  (mbql.u/match {:breakout [:field-id _]
                 :fields   [:fk-> _ _]}
      a-query))

;; match should return `nil` if there are no matches so you don't need to call `seq`
(expect
  nil
  (mbql.u/match [:datetime-field _ unit] {} unit))

;; if pattern is just a raw keyword `match` should be kind enough to turn it into a pattern for you
(expect
  [[:field-id 1]
   [:field-id 2]]
  (mbql.u/match :field-id {:fields [[:field-id 1] [:datetime-field [:field-id 2] :day]]}))

;; can we `:guard` a pattern?
(expect
  [[:field-id 2]]
  (let [a-field-id 2]
    (mbql.u/match [:field-id (id :guard (partial = a-field-id))]
        {:fields [[:field-id 1] [:field-id 2]]})))

;; ok, if for some reason we can't use `:guard` in the pattern will `match` filter out nil results?
(expect
  [2]
  (mbql.u/match [:field-id id] {:fields [[:field-id 1] [:field-id 2]]}
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
    (mbql.u/match :field-id another-query
      (when some-pred?
        &match))))

;; can we use the anaphoric `&parents` symbol to examine the parents of the collection? let's see if we can match
;; `:field-id` clauses that are inside `:datetime-field` clauses, regardless of whether something else wraps them
(expect
  [[:field-id 2]
   [:field-id 3]
   [:field-id 4]]
  (mbql.u/match :field-id another-query
    (when (contains? (set &parents) :datetime-field)
      &match)))

;; can we match using a CLASS?
(expect
  [#inst "2018-10-08T00:00:00.000-00:00"]
  (mbql.u/match java.util.Date [[:field-id 1]
                                [:field-id 2]
                                #inst "2018-10-08"
                                4000]))

;; can we match using a PREDICATE?
(expect
  [4000 5000]
  ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses
  (mbql.u/match integer? {:filter [:and
                                   [:= [:field-id 1] 4000]
                                   [:= [:field-id 2] 5000]]}
    (when (= := (last &parents))
      &match)))

;; how can we use predicates not named by a symbol?
(expect
  [1 4000 2 5000]
  (mbql.u/match (&match :guard #(integer? %)) {:filter [:and
                                                        [:= [:field-id 1] 4000]
                                                        [:= [:field-id 2] 5000]]}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    replace                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; can we use `replace` to replace a specific clause?
(expect
  {:breakout
   [[:datetime-field [:field-id 10] :day]
    [:datetime-field [:field-id 20] :day]
    [:field-literal "Wow"]],
   :fields [[:fk->
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
  (mbql.u/replace a-query {:breakout [:field-id id]}
    [:datetime-field [:field-id id] :day]))

;; can we use multiple keys in maps to replace multiple different clauses? (not sure what the real-world use case is
;; for this)
(expect
  {:breakout [[:field-id 10] [:field-id 20] "Wow"], :fields [30]}
  (mbql.u/replace a-query {:fields   [:fk-> [:field-id id-or-name] _]
                           :breakout [:field-literal id-or-name]}
    id-or-name))

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
  (mbql.u/replace
      {:query {:fields [[:fk-> 1 2]
                        [:fk-> [:field-id 3] [:field-id 4]]]}}
      {:query {:fields [:fk-> (source :guard integer?) (dest :guard integer?)]}}
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
