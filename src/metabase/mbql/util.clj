(ns metabase.mbql.util
  "Utilitiy functions for working with MBQL queries."
  (:require [clojure
             [string :as str]
             [walk :as walk]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(s/defn normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- su/KeywordOrString]
  (-> (u/keyword->qualified-name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

(defn mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a keyword as its first arg). (Since this is used by the code in
  `normalize` this handles pre-normalized clauses as well.)"
  [x]
  (and (sequential? x)
       (keyword? (first x))))

(defn is-clause?
  "If `x` an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))

(defn clause-instances
  "Return a sequence of all the instances of clause(s) in `x`. Like `is-clause?`, you can either look for instances of a
  single clause by passing a single keyword or for instances of multiple clauses by passing a set of keywords. Returns
  `nil` if no instances were found.

    ;; look for :field-id clauses
    (clause-instances :field-id {:query {:filter [:= [:field-id 10] 20]}})
    ;;-> [[:field-id 10]]

    ;; look for :+ or :- clauses
    (clause-instances #{:+ :-} ...)

  By default, this will not include subclauses of any clauses it finds, but you can toggle this behavior with the
  `include-subclauses?` option:

    (clause-instances #{:field-id :fk->} [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]])
    ;; -> [[:field-id 1]
           [:fk-> [:field-id 2] [:field-id 3]]]

    (clause-instances #{:field-id :fk->} [[:field-id 1] [:fk-> [:field-id 2] [:field-id 3]]], :include-subclauses? true)
    ;; -> [[:field-id 1]
           [:fk-> [:field-id 2] [:field-id 3]]
           [:field-id 2]
           [:field-id 3]]"
  {:style/indent 1}
  [k-or-ks x & {:keys [include-subclauses?], :or {include-subclauses? false}}]
  (let [instances (atom [])]
    (walk/prewalk
     (fn [clause]
       (if (is-clause? k-or-ks clause)
         (do (swap! instances conj clause)
             (when include-subclauses?
               clause))
         clause))
     x)
    (seq @instances)))

(defn replace-clauses
  "Walk a query looking for clauses named by keyword or set of keywords `k-or-ks` and replace them the results of a call
  to `(f clause)`.

    (replace-clauses {:filter [:= [:field-id 10] 100]} :field-id (constantly 200))
    ;; -> {:filter [:= 200 100]}"
  {:style/indent 2}
  [query k-or-ks f]
  (walk/postwalk
   (fn [clause]
     (if (is-clause? k-or-ks clause)
       (f clause)
       clause))
   query))

(defn replace-clauses-in
  "Replace clauses only in a subset of `query`, defined by `keypath`.

    (replace-clauses-in {:filter [:= [:field-id 10] 100], :breakout [:field-id 100]} [:filter] :field-id
      (constantly 200))
    ;; -> {:filter [:= 200 100], :breakout [:field-id 100]}"
  {:style/indent 3}
  [query keypath k-or-ks f]
  (update-in query keypath #(replace-clauses % k-or-ks f)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Functions for manipulating queries                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - I think we actually should move this stuff into a `mbql.helpers` namespace so we can use the util functions
;; above in the `schema.helpers` namespace instead of duplicating them

(s/defn simplify-compound-filter :- mbql.s/Filter
  "Simplify compound `:and`, `:or`, and `:not` compound filters, combining or eliminating them where possible. This
  also fixes theoretically disallowed compound filters like `:and` with only a single subclause."
  [[filter-name & args :as filter-clause]]
  (cond
    ;; for `and` or `not` compound filters with only one subclase, just unnest the subclause
    (and (#{:and :or} filter-name)
         (= (count args) 1))
    (recur (first args))

    ;; for `and` and `not` compound filters with subclauses of the same type pull up any compounds of the same type
    ;; e.g. [:and :a [:and b c]] ; -> [:and a b c]
    (and (#{:and :or} filter-name)
         (some (partial is-clause? filter-name) args))
    (recur
     (vec (cons filter-name (mapcat (fn [subclause]
                                      (if (is-clause? filter-name subclause)
                                        (rest subclause)
                                        [subclause]))
                                    args))))

    ;; for `and` or `or` clauses with duplicate args, remove the duplicates and recur
    (and (#{:and :or} filter-name)
         (not= (count args) (count (distinct args))))
    (recur (vec (cons filter-name (distinct args))))

    ;; for `not` that wraps another `not`, eliminate both
    (and (= :not filter-name)
         (is-clause? :not (first args)))
    (recur (second (first args)))

    :else
    filter-clause))

;; TODO - we should validate the query against the Query schema and the output as well. Flip that on once the schema
;; is locked-in 100%

(s/defn combine-filter-clauses :- mbql.s/Filter
  "Combine two filter clauses into a single clause in a way that minimizes slapping a bunch of `:and`s together if
  possible."
  [filter-clause & more-filter-clauses]
  (simplify-compound-filter (vec (cons :and (filter identity (cons filter-clause more-filter-clauses))))))

(s/defn add-filter-clause :- mbql.s/Query
  "Add an additional filter clause to an `outer-query`. If `new-clause` is `nil` this is a no-op."
  [outer-query :- mbql.s/Query, new-clause :- (s/maybe mbql.s/Filter)]
  (if-not new-clause
    outer-query
    (update-in outer-query [:query :filter] combine-filter-clauses new-clause)))


(defn query->source-table-id
  "Return the source Table ID associated with `query`, if applicable; handles nested queries as well."
  {:argslists '([outer-query])}
  [{{source-table-id :source-table, source-query :source-query} :query, query-type :type, :as query}]
  (cond
    ;; for native queries, there's no source table to resolve
    (not= query-type :query)
    nil

    ;; for MBQL queries with a *native* source query, it's the same story
    (and (nil? source-table-id) source-query (:native source-query))
    nil

    ;; for MBQL queries with an MBQL source query, recurse on the source query and try again
    (and (nil? source-table-id) source-query)
    (recur (assoc query :query source-query))

    ;; otherwise resolve the source Table
    :else
    source-table-id))


(defn field-clause->id-or-literal
  "Get the actual Field ID or literal name this clause is referring to. Useful for seeing if two Field clauses are
  referring to the same thing, e.g.

    (field-clause->id-or-literal [:datetime-field [:field-id 100] ...]) ; -> 100
    (field-clause->id-or-literal [:field-id 100])                       ; -> 100

  For expressions (or any other clauses) this returns the clause as-is, so as to facilitate the primary use case of
  comparing Field clauses."
  [[clause-name x y, :as clause]]
  (case clause-name
    :field-id         x
    :fk->             (recur y)
    :field-literal    x
    :datetime-field   (recur x)
    :binning-strategy (recur x)
    ;; for anything else, including expressions and ag clause references, just return the clause as-is
    clause))

(s/defn add-order-by-clause :- mbql.s/Query
  "Add a new `:order-by` clause to an MBQL query. If the new order-by clause references a Field that is already being
  used in another order-by clause, this function does nothing."
  [outer-query :- mbql.s/Query, order-by-clause :- mbql.s/OrderBy]
  (let [existing-clauses (set (map (comp field-clause->id-or-literal second)
                                   (-> outer-query :query :order-by)))]
    (if (existing-clauses (field-clause->id-or-literal (second order-by-clause)))
      ;; Field already referenced, nothing to do
      outer-query
      ;; otherwise add new clause at the end
      (update-in outer-query [:query :order-by] (comp vec conj) order-by-clause))))
