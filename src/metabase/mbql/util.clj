(ns metabase.mbql.util
  "Utilitiy functions for working with MBQL queries."
  (:refer-clojure :exclude [replace])
  (:require [clojure.core.match :as match]
            [clojure
             [string :as str]
             [walk :as walk]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [i18n :refer [tru]]
             [schema :as su]]
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

(defn recursive-match [match-fn form]
  (cond
    (map? form)
    (mapcat match-fn (vals form))

    (sequential? form)
    (mapcat match-fn form)))

(defmacro match
  ([query pattern]
   `(match ~query ~pattern nil))
  ([query pattern result]
   (if (map? pattern)
     (let [query-symb (gensym "query")]
       `(let [~query-symb ~query]
          (concat ~@(for [[k v] pattern]
                      `(match (get ~query-symb ~k) ~(get pattern k) ~result)))))
     `((fn match-fn# [form#]
         (match/match [form#]
           ~@(if result
               `[[(~pattern :seq)] [~result]]
               `[[(~pattern :seq) :as match#] [match#]])
           :else (recursive-match match-fn# form#)))
       ~query))))

#_(match {:breakout [[:field-id 10]
                   [:field-id 20]
                   [:field-literal "Wow"]
                   [:fk->
                    [:field-id 30]
                    [:field-id 40]]]}
    [(_ :guard #{:field-id :field-literal}) _])

(def %query%
  {:breakout [[:field-id 10]
              [:field-id 20]
              [:field-literal "Wow"]]
   :fields   [[:fk->
               [:field-id 30]
               [:field-id 40]]]})

(match %query%
  {:breakout [(_ :guard #{:field-id :field-literal}) _]})

(match %query%
  {:fields [:field-id & _]})

(match %query% [:fk-> _ [:field-id dest-id]] dest-id)

(match %query%
  {:fields ([:field-id & _] :seq)})

(defn recursive-replace [replace-fn form]
  (cond
    (map? form)
    (into form (for [[k v] form]
                 [k (replace-fn v)]))

    (sequential? form)
    (mapv replace-fn form)

    :else
    form))

(defmacro replace [query pattern result]
  (if (map? pattern)
    `(-> ~query
         ~@(for [[k] pattern]
             `(update ~k #(replace % ~(get pattern k) ~result))))
    `((fn replace-fn# [form#]
        (match/match [form#]
          [~pattern] ~result
          :else (recursive-replace replace-fn# form#)))
      ~query)))

(replace %query% [:fk-> source [:field-id 40]] [:fk-> source [:field-id 100]])

(replace {:query {:fields [[:fk-> 1 2]
                           [:fk-> [:field-id 3] [:field-id 4]]]}}
         {:query {:fields [:fk-> (source :guard integer?) (dest :guard integer?)]}}
         [:fk-> [:field-id source] [:field-id dest]])

(defn ^:deprecated clause-instances
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

(defn ^:deprecated replace-clauses
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

(defn ^:deprecated replace-clauses-in
  "Replace clauses only in a subset of `query`, defined by `keypath`.

    (replace-clauses-in {:filter [:= [:field-id 10] 100], :breakout [:field-id 100]} [:filter] :field-id
      (constantly 200))
    ;; -> {:filter [:= 200 100], :breakout [:field-id 100]}"
  {:style/indent 3}
  [query keypath k-or-ks f]
  (if-not (seq (get-in query keypath))
    query
    (update-in query keypath #(replace-clauses % k-or-ks f))))


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

(s/defn unwrap-field-clause :- (s/if (partial is-clause? :field-id)
                                 mbql.s/field-id
                                 mbql.s/field-literal)
  "Un-wrap a `Field` clause and return the lowest-level clause it wraps, either a `:field-id` or `:field-literal`."
  [[clause-name x y, :as clause] :- mbql.s/Field]
  (case clause-name
    :field-id         clause
    :fk->             (recur y)
    :field-literal    clause
    :datetime-field   (recur x)
    :binning-strategy (recur x)))

(defn maybe-unwrap-field-clause
  "Unwrap a Field `clause`, if it's something that can be unwrapped (i.e. something that is, or wraps, a `:field-id` or
  `:field-literal`). Otherwise return `clause` as-is."
  [clause]
  (if (is-clause? #{:field-id :fk-> :field-literal :datetime-field :binning-strategy} clause)
    (unwrap-field-clause clause)
    clause))

(s/defn field-clause->id-or-literal :- (s/cond-pre su/IntGreaterThanZero su/NonBlankString)
  "Get the actual Field ID or literal name this clause is referring to. Useful for seeing if two Field clauses are
  referring to the same thing, e.g.

    (field-clause->id-or-literal [:datetime-field [:field-id 100] ...]) ; -> 100
    (field-clause->id-or-literal [:field-id 100])                       ; -> 100

  For expressions (or any other clauses) this returns the clause as-is, so as to facilitate the primary use case of
  comparing Field clauses."
  [clause :- mbql.s/Field]
  (second (unwrap-field-clause clause)))

(s/defn add-order-by-clause :- mbql.s/Query
  "Add a new `:order-by` clause to an MBQL query. If the new order-by clause references a Field that is already being
  used in another order-by clause, this function does nothing."
  [outer-query :- mbql.s/Query, [_ field, :as order-by-clause] :- mbql.s/OrderBy]
  (let [existing-fields (set (for [[_ existing-field] (-> outer-query :query :order-by)]
                               (maybe-unwrap-field-clause existing-field)))]
    (if (existing-fields (maybe-unwrap-field-clause field))
      ;; Field already referenced, nothing to do
      outer-query
      ;; otherwise add new clause at the end
      (update-in outer-query [:query :order-by] (comp vec conj) order-by-clause))))


(s/defn add-datetime-units :- mbql.s/DateTimeValue
  "Return a `relative-datetime` clause with `n` units added to it."
  [absolute-or-relative-datetime :- mbql.s/DateTimeValue
   n                             :- s/Num]
  (if (is-clause? :relative-datetime absolute-or-relative-datetime)
    (let [[_ original-n unit] absolute-or-relative-datetime]
      [:relative-datetime (+ n original-n) unit])
    (let [[_ timestamp unit] absolute-or-relative-datetime]
      (du/relative-date unit n timestamp))))


(defn dispatch-by-clause-name-or-class
  "Dispatch function perfect for use with multimethods that dispatch off elements of an MBQL query. If `x` is an MBQL
  clause, dispatches off the clause name; otherwise dispatches off `x`'s class."
  [x]
  (if (mbql-clause? x)
    (first x)
    (class x)))


(s/defn fk-clause->join-info :- (s/maybe mbql.s/JoinInfo)
  "Return the matching info about the JOINed for the 'destination' Field in an `fk->` clause.

     (fk-clause->join-alias [:fk-> [:field-id 1] [:field-id 2]])
     ;; -> \"orders__via__order_id\""
  [query :- mbql.s/Query, [_ source-field-clause] :- mbql.s/fk->]
  (let [source-field-id (field-clause->id-or-literal source-field-clause)]
    (some (fn [{:keys [fk-field-id], :as info}]
            (when (= fk-field-id source-field-id)
              info))
          (-> query :query :join-tables))))


(s/defn expression-with-name :- mbql.s/ExpressionDef
  "Return the `Expression` referenced by a given `expression-name`."
  [query :- mbql.s/Query, expression-name :- su/NonBlankString]
  (or (get-in query, [:query :expressions (keyword expression-name)])
      (throw (Exception. (str (tru "No expression named ''{0}''" (name expression-name)))))))


(s/defn aggregation-at-index :- mbql.s/Aggregation
  "Fetch the aggregation at index. This is intended to power aggregate field references (e.g. [:aggregation 0]).
   This also handles nested queries, which could be potentially ambiguous if multiple levels had aggregations. To
   support nested queries, you'll need to keep tract of how many `:source-query`s deep you've traveled; pass in this
   number to as optional arg `nesting-level` to make sure you reference aggregations at the right level of nesting."
  ([query index]
   (aggregation-at-index query index 0))
  ([query :- mbql.s/Query, index :- su/NonNegativeInt, nesting-level :- su/NonNegativeInt]
   (if (zero? nesting-level)
     (or (nth (get-in query [:query :aggregation]) index)
         (throw (Exception. (str (tru "No aggregation at index: {0} (nesting level: {1})" index nesting-level)))))
     ;; keep recursing deeper into the query until we get to the same level the aggregation reference was defined at
     (recur (get-in query [:query :source-query]) index (dec nesting-level)))))
