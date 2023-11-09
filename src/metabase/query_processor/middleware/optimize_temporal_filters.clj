(ns metabase.query-processor.middleware.optimize-temporal-filters
  "Middlware that optimizes equality filter clauses against bucketed temporal fields. See docstring for
  `optimize-temporal-filters` for more details."
  (:require
   [clojure.walk :as walk]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private optimizable-units
  #{:second :minute :hour :day :week :month :quarter :year})

(defmulti ^:private temporal-unit
  {:arglists '([expression])}
  mbql.u/dispatch-by-clause-name-or-class
  :hierarchy lib.hierarchy/hierarchy)

(defmethod temporal-unit :default
  [_expr]
  nil)

(defmethod temporal-unit :field
  [[_field _id-or-name opts]]
  (:temporal-unit opts))

(defmethod temporal-unit :relative-datetime
  [[_relative-datetime _n unit]]
  unit)

(defmethod temporal-unit :absolute-datetime
  [[_absolute-datetime _t unit]]
  unit)

(defmethod temporal-unit :interval
  [[_interval _n unit]]
  unit)

(doseq [tag [:+ :-]]
  (lib.hierarchy/derive tag ::arithmetic-expr))

(defmethod temporal-unit ::arithmetic-expr
  [[_tag & args]]
  (some temporal-unit args))

(defmulti ^:private optimizable?
  {:arglists '([expression])}
  mbql.u/dispatch-by-clause-name-or-class
  :hierarchy lib.hierarchy/hierarchy)

(defmethod optimizable? :default
  [_expr]
  false)

(defmethod optimizable? :field
  [[_field id-or-name opts]]
  (or (:unit opts)
      (isa? ((some-fn :effective-type :base-type) opts) :type/Temporal)
      (when (integer? id-or-name)
        (lib.types.isa/temporal? (lib.metadata/field (qp.store/metadata-provider) id-or-name)))))

(defmethod optimizable? :expression
  [[_expression _name opts]]
  (isa? ((some-fn :effective-type :base-type) opts) :type/Temporal))

(defmethod optimizable? :relative-datetime
  [[_relative-datetime n unit]]
  (if unit
    (contains? optimizable-units unit)
    (#{0 :current} n)))

(defmethod optimizable? :absolute-datetime
  [[_absolute-datetime _t unit]]
  (contains? optimizable-units unit))

(defmethod optimizable? ::arithmetic-expr
  [[_tag & args]]
  (some optimizable? args))

(doseq [tag [:= :!= :< :<= :> :>=]]
  (lib.hierarchy/derive tag ::binary-filter))

(defn- compatible-units?
  "The temporal units for two expressions *x* and *y* are compatible for optimization purposes if

  a. They both have units, and those units are the same

  b. One of them has a unit, but the other does not."
  ([x-unit y-unit]
   (letfn [(non-default-unit [unit]
             (when-not (= unit :default)
               unit))]
     (let [x-unit (non-default-unit x-unit)
           y-unit (non-default-unit y-unit)]
       (if (and x-unit y-unit)
         (= x-unit y-unit)
         (or x-unit y-unit)))))

  ([x-unit y-unit & more]
   (and (compatible-units? x-unit y-unit)
        (apply compatible-units? x-unit more)
        (apply compatible-units? y-unit more))))

(defmethod optimizable? ::binary-filter
  [[_tag lhs rhs]]
  (and (optimizable? lhs)
       (optimizable? rhs)
       (compatible-units? (temporal-unit lhs) (temporal-unit rhs))))

(defmethod optimizable? :between
  [[_between expr lower-bound upper-bound]]
  (and (optimizable? expr)
       (optimizable? lower-bound)
       (optimizable? upper-bound)
       (compatible-units? (temporal-unit expr) (temporal-unit lower-bound))
       (compatible-units? (temporal-unit expr) (temporal-unit upper-bound))))

(mu/defn ^:private temporal-literal-lower-bound
  [unit t :- (ms/InstanceOfClass java.time.temporal.Temporal)]
  (:start (u.date/range t unit)))

(mu/defn ^:private temporal-literal-upper-bound
  [unit t :- (ms/InstanceOfClass java.time.temporal.Temporal)]
  (:end (u.date/range t unit)))

(defn- change-temporal-unit-to-default [expression]
  (mbql.u/replace expression
    [:field _id-or-name (_opts :guard (comp optimizable-units :temporal-unit))]
    (mbql.u/update-field-options &match assoc :temporal-unit :default)))

(defmulti ^:private temporal-value-lower-bound
  "Get a clause representing the *lower* bound that should be used when converting a `expression` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([expression temporal-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmulti ^:private temporal-value-upper-bound
  "Get a clause representing the *upper* bound that should be used when converting a `expression` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([expression temporal-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod temporal-value-lower-bound :default
  [_expression _temporal-unit]
  nil)

(defmethod temporal-value-upper-bound :default
  [_expression _temporal-unit]
  nil)

(defmethod temporal-value-lower-bound :absolute-datetime
  [[_ t unit] _]
  [:absolute-datetime (temporal-literal-lower-bound unit t) :default])

(defmethod temporal-value-upper-bound :absolute-datetime
  [[_ t unit] _]
  [:absolute-datetime (temporal-literal-upper-bound unit t) :default])

(defmethod temporal-value-lower-bound :relative-datetime
  [[_ n unit] temporal-unit]
  [:relative-datetime (if (= n :current) 0 n) (or unit temporal-unit)])

(defmethod temporal-value-upper-bound :relative-datetime
  [[_ n unit] temporal-unit]
  [:relative-datetime (inc (if (= n :current) 0 n)) (or unit temporal-unit)])

(defmulti ^:private optimize-filter
  "Optimize a filter clause against a temporal-bucketed `:field` clause and `:absolute-datetime` or `:relative-datetime`
  value by converting to an unbucketed range."
  {:arglists '([clause])}
  mbql.u/dispatch-by-clause-name-or-class
  :hierarchy lib.hierarchy/hierarchy)

(defn- combine-relative-datetimes-and-intervals [args]
  (into []
        (mapcat (fn [[unit args]]
                  (if (< (count args) 2)
                    args
                    [(reduce
                      (fn [[x-tag x-n _unit] [y-tag y-n _unit]]
                        [(if (= x-tag y-tag :interval)
                           :interval
                           :relative-datetime)
                         (+ x-n y-n)
                         unit])
                      (first args)
                      (rest args))])))
        (group-by temporal-unit args)))

(defn- combine-temporal-arithmetic-args
  [args]
  (let [combineable?  #(mbql.u/is-clause? #{:relative-datetime :interval} %)
        uncombineable (remove combineable? args)
        combineable   (filter combineable? args)]
    (concat uncombineable
            (combine-relative-datetimes-and-intervals combineable))))

(defn- simplify-temporal-arithmetic [[tag & args]]
  (let [args' (combine-temporal-arithmetic-args args)]
    (if (= (count args') 1)
      (if (= tag :+)
        (first args')
        (let [[tag n unit] (first args')]
          [tag (- n) unit]))
      (into [tag] args'))))

(defn ^:private extract-temporal-arithmetic
  "If `expr` is a temporal arithmetic expression e.g.

    [:+ <t> <interval>]

  return a pair of `[expr-without-arithmetic f]`, where `f` is a a function that can be used to apply that arithmetic
  to a different expression, e.g.

    [<t> (f expr) => [+ expr internal]]"
  [expr]
  (when (#{:+ :-} (mbql.u/dispatch-by-clause-name-or-class expr))
    (let [[tag t & args] expr]
      [t (fn [expr]
           (simplify-temporal-arithmetic (into [tag expr] args)))])))

(defmethod optimize-filter :=
  [[_tag lhs rhs]]
  (if-let [[lhs' f] (extract-temporal-arithmetic lhs)]
    (recur [:= lhs' (f rhs)])
    (let [lhs' (change-temporal-unit-to-default lhs)]
      [:and
       [:>= lhs' (temporal-value-lower-bound rhs (temporal-unit lhs))]
       [:< lhs'  (temporal-value-upper-bound rhs (temporal-unit lhs))]])))

(defmethod optimize-filter :!=
  [filter-clause]
  (mbql.u/negate-filter-clause ((get-method optimize-filter :=) filter-clause)))

(defn- optimize-comparison-filter
  [optimize-temporal-value-fn [tag lhs rhs] new-filter-type]
  (if-let [[lhs' f] (extract-temporal-arithmetic lhs)]
    (recur optimize-temporal-value-fn [tag lhs' (f rhs)] new-filter-type)
    [new-filter-type
     (change-temporal-unit-to-default lhs)
     (optimize-temporal-value-fn rhs (temporal-unit lhs))]))

(defmethod optimize-filter :<
  [filter-clause]
  (optimize-comparison-filter temporal-value-lower-bound filter-clause :<))

(defmethod optimize-filter :<=
  [filter-clause]
  (optimize-comparison-filter temporal-value-upper-bound filter-clause :<))

(defmethod optimize-filter :>
  [filter-clause]
  (optimize-comparison-filter temporal-value-upper-bound filter-clause :>=))

(defmethod optimize-filter :>=
  [filter-clause]
  (optimize-comparison-filter temporal-value-lower-bound filter-clause :>=))

(defmethod optimize-filter :between
  [[_between expr lower-bound upper-bound :as original]]
  (if-let [[expr' f] (extract-temporal-arithmetic expr)]
    (recur [:between expr' (f lower-bound) (f upper-bound)])
    (or (when-let [lower-bound-expr (temporal-value-lower-bound lower-bound (temporal-unit expr))]
          (when-let [upper-bound-expr (temporal-value-upper-bound upper-bound (temporal-unit expr))]
            (let [expr' (change-temporal-unit-to-default expr)]
              [:and
               [:>= expr' lower-bound-expr]
               [:<  expr' upper-bound-expr]])))
        original)))

(defn- optimize-temporal-filters* [query]
  (mbql.u/replace query
    (_ :guard (partial mbql.u/is-clause? (set (keys (methods optimize-filter)))))
    (or (when (optimizable? &match)
          (u/prog1 (optimize-filter &match)
            (if <>
              (when-not (= &match <>)
                (log/tracef "Optimized filter %s to %s" (pr-str &match) (pr-str <>)))
              ;; if for some reason `optimize-filter` doesn't return an optimized filter clause, log and error and use
              ;; the original. `can-optimize-filter?` shouldn't have said we could optimize this filter in the first
              ;; place
              (log/error "Error optimizing temporal filter clause: optimize-filter returned nil"
                         (pr-str &match)))))
        &match)))

(defn optimize-temporal-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
  bucketed datetime fields. Rewrites those filter clauses as logically equivalent filter clauses that do not use
  bucketing (i.e., their datetime unit is `:default`, meaning no bucketing functions need be applied).

    [:= [:field 1 {:temporal-unit :month}] [:absolute-datetime #t \"2019-09-01\" :month]]
    ->
    [:and
     [:>= [:field 1 {:temporal-unit :default}] [:absolute-datetime #t \"2019-09-01\" :month]]
     [:<  [:field 1 {:temporal-unit :default}] [:absolute-datetime #t \"2019-10-01\" :month]]]

  The equivalent SQL, before and after, looks like:

    -- before
    SELECT ... WHERE date_trunc('month', my_field) = date_trunc('month', timestamp '2019-09-01 00:00:00')

    -- after
    SELECT ... WHERE my_field >= timestamp '2019-09-01 00:00:00' AND my_field < timestamp '2019-10-01 00:00:00'

  The idea here is that by avoiding casts/extraction/truncation operations, databases will be able to make better use
  of indexes on these columns.

  This namespace expects to run *after* the `wrap-value-literals` middleware, meaning datetime literal strings like
  `\"2019-09-24\"` should already have been converted to `:absolute-datetime` clauses."
  [{query-type :type, :as query}]
  (if (not= query-type :query)
    query
    ;; walk query, looking for inner-query forms that have a `:filter` key
    (let [query' (walk/postwalk
                  (fn [form]
                    (if-not (and (map? form) (seq (:filter form)))
                      form
                      ;; optimize the filters in this inner-query form.
                      (let [optimized (optimize-temporal-filters* form)]
                        ;; if we did some optimizations, we should flatten/deduplicate the filter clauses afterwards.
                        (cond-> optimized
                          (not= optimized form) (update :filter mbql.u/combine-filter-clauses)))))
                  query)]
      (when-not (= query query')
        (log/debugf "Optimized temporal filters:\n%s" (u/pprint-to-str query)))
      query')))
