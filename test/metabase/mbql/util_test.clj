(ns metabase.mbql.util-test
  (:require [expectations :refer :all]
            [metabase.mbql.util :as mbql.u]))

;; can we use `clause-instances` to find the instances of a clause?
(expect
  [[:field-id 10]
   [:field-id 20]]
  (mbql.u/clause-instances :field-id {:query {:filter [:=
                                                       [:field-id 10]
                                                       [:field-id 20]]}}))

;; clause-instances shouldn't include subclauses of certain clauses if we don't want them
(expect
  [[:field-id 1]
   [:fk-> [:field-id 2] [:field-id 3]]]
  (mbql.u/clause-instances #{:field-id :fk->} [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]))

;; ...but we should be able to ask for them
(expect
  [[:field-id 1]
   [:fk-> [:field-id 2] [:field-id 3]]
   [:field-id 2]
   [:field-id 3]]
  (mbql.u/clause-instances #{:field-id :fk->}
    [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]]
    :include-subclauses? true))

(expect
  [[:field-id 10]
   [:field-id 20]]
  (mbql.u/clause-instances #{:field-id :+ :-}
    {:query {:filter [:=
                      [:field-id 10]
                      [:field-id 20]]}}))

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
