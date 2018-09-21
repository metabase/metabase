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
