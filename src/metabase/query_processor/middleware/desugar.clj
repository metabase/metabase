(ns metabase.query-processor.middleware.desugar
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [schema.core :as s]))

(defn- desugar-inside [query]
  (mbql.u/replace-in query [:query :filter]
    [:inside lat-field lon-field lat-max lon-min lat-min lon-max]
    [:and
     [:between lat-field lat-min lat-max]
     [:between lon-field lon-min lon-max]]))

(defn- desugar-is-null-and-not-null [query]
  (mbql.u/replace-in query [:query :filter]
    [:is-null field]  [:=  field nil]
    [:not-null field] [:!= field nil]))

(defn- desugar-time-interval [query]
  (mbql.u/replace-in query [:query :filter]
    [:time-interval field n unit] (recur [:time-interval field n unit nil])

    ;; replace current/last/next with corresponding value of n and recur
    [:time-interval field :current unit options] (recur [:time-interval field  0 unit options])
    [:time-interval field :last    unit options] (recur [:time-interval field -1 unit options])
    [:time-interval field :next    unit options] (recur [:time-interval field  1 unit options])

    [:time-interval field (n :guard #{-1}) unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime n unit] [:relative-datetime 0 unit]]

    [:time-interval field (n :guard #{1}) unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime 0 unit] [:relative-datetime n unit]]

    [:time-interval field (n :guard #{-1 0 1}) unit _]
    [:= [:datetime-field field unit] [:relative-datetime n unit]]

    [:time-interval field (n :guard neg?) unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime n unit] [:relative-datetime 0 unit]]

    [:time-interval field (n :guard neg?) unit _]
    [:between [:datetime-field field unit] [:relative-datetime n unit] [:relative-datetime -1 unit]]

    [:time-interval field n unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime 0 unit] [:relative-datetime n unit]]

    [:time-interval field n unit _]
    [:between [:datetime-field field unit] [:relative-datetime 1 unit] [:relative-datetime n unit]]))

(defn- desugar-does-not-contain [query]
  (mbql.u/replace-in query [:query :filter] [:does-not-contain & args]
    [:not (vec (cons :contains args))]))

(defn- desugar-equals-and-not-equals-with-extra-args
  "`:=` and `!=` clauses with more than 2 args automatically get rewritten as compound filters.

     [:= field x y]  -> [:or  [:=  field x] [:=  field y]]
     [:!= field x y] -> [:and [:!= field x] [:!= field y]]"
  [query]
  (mbql.u/replace-in query [:query :filter]
    [:= field x y & more]
    (apply vector :or (for [x (concat [x y] more)]
                        [:= field x]))

    [:!= field x y & more]
    (apply vector :and (for [x (concat [x y] more)]
                         [:!= field x]))))

(defn- desugar-current-relative-datetime
  "Replace `relative-datetime` clauses like `[:relative-datetime :current]` with `[:relative-datetime 0 <unit>]`.
  `<unit>` is inferred from the `:datetime-field` the clause is being compared to (if any), otherwise falls back to
  `default.`"
  [query]
  (mbql.u/replace-in query [:query :filter]
    [clause field [:relative-datetime :current & _]]
    [clause field [:relative-datetime 0 (or (mbql.u/match-one field [:datetime-field _ unit] unit)
                                            :default)]]))


(s/defn ^:private desugar* :- mbql.s/Query
  [{{filter-clause :filter} :query, :as query}]
  (if-not (seq filter-clause)
    query
    (-> query
        desugar-inside
        desugar-is-null-and-not-null
        desugar-time-interval
        desugar-does-not-contain
        desugar-equals-and-not-equals-with-extra-args
        desugar-current-relative-datetime
        (update-in [:query :filter] mbql.u/simplify-compound-filter))))

(defn desugar
  "Middleware that replaces high-level 'syntactic sugar' clauses with lower-level clauses. This is done to minimize the
  amount of MBQL individual drivers need to support. For your convenience, clauses replaced by this middleware are
  marked `^:sugar` in the MBQL schema."
  [qp]
  (comp qp desugar*))
