(ns metabase.query-processor.middleware.desugar
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [schema.core :as s]
            [metabase.util :as u]))

(defn- desugar-inside [query]
  (mbql.u/replace query {:query {:filter [:inside lat-field lon-field lat-max lon-min lat-min lon-max]}}
    [:and
     [:between lat-field lat-min lat-max]
     [:between lon-field lon-min lon-max]]))

(defn- desugar-is-null-and-not-null [query]
  (mbql.u/replace query {:query {:filter [(clause-name :guard #{:is-null :not-null}) field]}}
    (case clause-name
      :is-null  [:=  field nil]
      :not-null [:!= field nil])))

(defn- desugar-time-interval* [[_ field n unit options]]
  (if-not (integer? n)
    (case n
      :current (recur [nil field  0 unit options])
      :last    (recur [nil field -1 unit options])
      :next    (recur [nil field  1 unit options]))
    (let [field            [:datetime-field field unit]
          include-current? (:include-current options)]
      (cond
        (= n  0) [:= field [:relative-datetime  0 unit]]
        (= n -1) [:= field [:relative-datetime -1 unit]]
        (= n  1) [:= field [:relative-datetime  1 unit]]
        (< n -1) [:between field
                  [:relative-datetime                          n unit]
                  [:relative-datetime (if include-current? 0 -1) unit]]
        (> n  1) [:between field
                  [:relative-datetime (if include-current? 0  1) unit]
                  [:relative-datetime                          n unit]]))))

(defn- desugar-time-interval [query]
  (mbql.u/replace query {:query {:filter :time-interval}}
    (desugar-time-interval* &match)))

(defn- desugar-does-not-contain [query]
  (mbql.u/replace query {:query {:filter [:does-not-contain & args]}}
    [:not (vec (cons :contains args))]))


(defn- desugar-equals-and-not-equals-with-extra-args
  "`:=` and `!=` clauses with more than 2 args automatically get rewritten as compound filters.

     [:= field x y]  -> [:or  [:=  field x] [:=  field y]]
     [:!= field x y] -> [:and [:!= field x] [:!= field y]]"
  [query]
  (mbql.u/replace query {:query {:filter [(clause-name :guard #{:= :!=}) field & (more :guard #(> (count %) 2))]}}
    (vec
     (cons
      (case clause-name :=  :or, :!= :and)
      (for [x more]
        [clause-name field x])))))

(defn- desugar-current-relative-datetime
  "Replace `relative-datetime` clauses like `[:relative-datetime :current]` with `[:relative-datetime 0 <unit>]`.
  `<unit>` is inferred from the `:datetime-field` the clause is being compared to (if any), otherwise falls back to
  `default.`"
  [query]
  (mbql.u/replace query {:query {:filter [(clause-name :guard #{:= :!= :< :> :<= :>=})
                                          field
                                          [:relative-datetime :current & _]]}}
    [clause-name field [:relative-datetime 0 (or (mbql.u/match-one [:datetime-field _ unit] field unit)
                                                 :default)]]))


(s/defn ^:private desugar* :- mbql.s/Query
  [query]
  (-> query
      desugar-inside
      desugar-is-null-and-not-null
      desugar-time-interval
      desugar-does-not-contain
      desugar-equals-and-not-equals-with-extra-args
      desugar-current-relative-datetime))

(defn desugar
  "Middleware that replaces high-level 'syntactic sugar' clauses with lower-level clauses. This is done to minimize the
  amount of MBQL individual drivers need to support. For your convenience, clauses replaced by this middleware are
  marked `^:sugar` in the MBQL schema."
  [qp]
  (comp qp desugar*))
