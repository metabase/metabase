(ns metabase.query-processor.middleware.optimize-temporal-filters
  "Middlware that optimizes equality filter clauses against bucketed temporal fields. See docstring for
  `optimize-temporal-filters` for more details."
  (:require
   [medley.core :as m]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private optimizable-units
  #{:second :minute :hour :day :week :month :quarter :year})

(defn- temporal-literal? [x]
  (mbql.u/is-clause? #{:absolute-datetime :relative-datetime} x))

(defn- temporal-ref? [x]
  (and (mbql.u/is-clause? #{:field :expression} x)
       (letfn [(opts-specifies-temporal-type? [opts]
                 (when-let [expr-type ((some-fn :effective-type :base-type) opts)]
                   (isa? expr-type :type/Temporal)))]
         (case (first x)
           :field
           (let [[_field _id-or-name opts] x]
             (or (:temporal-unit opts)
                 (opts-specifies-temporal-type? opts)))

           :expression
           (let [[_expression _name opts] x]
             (opts-specifies-temporal-type? opts))))))

(defn- interval? [x]
  (mbql.u/is-clause? :interval x))

(defn- temporal-arithmetic? [x]
  (and (mbql.u/is-clause? #{:+ :-} x)
       (let [[_tag & args] x]
         (and (every? (partial mbql.u/is-clause? #{:relative-datetime :absolute-datetime :interval :field :expression})
                      args)
              (= (count (filter (some-fn temporal-literal? temporal-ref?) args)) 1)))))

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

(doseq [tag [:+ :-]]
  (lib.hierarchy/derive tag ::arithmetic-expr))

(defmethod temporal-unit ::arithmetic-expr
  [[_tag & args]]
  (some temporal-unit args))

(defn- non-default-temporal-unit [x]
  (when-let [unit (temporal-unit x)]
    (when-not (= unit :default)
      unit)))

(mu/defn ^:private temporal-literal-lower-bound
  [unit t :- (ms/InstanceOfClass java.time.temporal.Temporal)]
  (:start (u.date/range t unit)))

(mu/defn ^:private temporal-literal-upper-bound
  [unit t :- (ms/InstanceOfClass java.time.temporal.Temporal)]
  (:end (u.date/range t unit)))

(defn- change-temporal-unit-to-default [expression]
  (mbql.u/replace expression
    :field
    (mbql.u/update-field-options &match assoc :temporal-unit :default)))

(defmulti ^:private temporal-value-lower-bound
  "Get a clause representing the *lower* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause temporal-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmulti ^:private temporal-value-upper-bound
  "Get a clause representing the *upper* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause temporal-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

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

(defmulti ^:private optimize
  {:arglists '([clause])}
  mbql.u/dispatch-by-clause-name-or-class
  :hierarchy lib.hierarchy/hierarchy)

(defmethod optimize :default
  [clause]
  clause)

(defmethod optimize :and
  [[_and & args]]
  (mbql.u/simplify-compound-filter
   (into [:and]
         (map optimize)
         args)))

(defmethod optimize :or
  [[_or & args]]
  (mbql.u/simplify-compound-filter
   (into [:or]
         (map optimize)
         args)))

(defmethod optimize :not
  [[_not x]]
  [:not (optimize x)])

;;; TODO: case, count-where, etc. ?

(mu/defn ^:private group-temporal-arithmetic-args :- [:map
                                                      [:tag          [:enum :+ :-]]
                                                      [:non-interval [:or
                                                                      mbql.s/field
                                                                      mbql.s/expression
                                                                      mbql.s/relative-datetime
                                                                      mbql.s/absolute-datetime]]
                                                      [:intervals    [:maybe [:sequential mbql.s/interval]]]]
  [[tag & args :as _expr] :- [:or mbql.s/+ mbql.s/-]]
  (let [{intervals true, non-intervals false} (group-by (comp boolean interval?) args)]
    {:tag          tag
     :non-interval (first non-intervals)
     :intervals    intervals}))

(mu/defn ^:private transfer-temporal-arithmetic-args :- [:map [:x some?] [:y some?]]
  [x :- [:or mbql.s/+ mbql.s/-]
   y :- some?]
  (let [{:keys [tag non-interval intervals]} (group-temporal-arithmetic-args x)]
    {:x non-interval
     :y (optimize (into [tag y]
                        (map (fn [[_interval n unit]]
                               [:interval (- n) unit]))
                        intervals))}))

(mu/defn ^:private temporal-category :- [:maybe [:enum ::ref ::literal ::arithmetic-wrapping-ref ::arithmetic-wrapping-literal]]
  [x]
  (cond
    (temporal-ref? x)     ::ref
    (temporal-literal? x) ::literal
    (temporal-arithmetic? x)
    (let [{:keys [non-interval]} (group-temporal-arithmetic-args x)]
      (cond
        (temporal-ref? non-interval)     ::arithmetic-wrapping-ref
        (temporal-literal? non-interval) ::arithmetic-wrapping-literal))))

(defn- same-units-or-nil? [units]
  (let [units (into #{} (filter some?) units)]
    (= (count units) 1)))

(mu/defmethod optimize := :- mbql.s/Filter
  [[_= x y] :- [:or mbql.s/= mbql.s/!=]]
  (let [x (optimize x)
        y (optimize y)]
    (or (case [(temporal-category x) (temporal-category y)]
          [::ref ::literal]
          (let [x-unit (non-default-temporal-unit x)
                y-unit (non-default-temporal-unit y)
                unit   (or x-unit y-unit)]
            (when (and unit
                       (optimizable-units unit)
                       (same-units-or-nil? [x-unit y-unit]))
              (let [x' (change-temporal-unit-to-default x)]
                [:and
                 [:>= x' (temporal-value-lower-bound y unit)]
                 [:< x'  (temporal-value-upper-bound y unit)]])))

          [::arithmetic-wrapping-ref ::literal]
          (let [{x' :x, y' :y} (transfer-temporal-arithmetic-args x y)]
            (optimize [:= x' y']))

          ([::literal ::ref] [::literal ::arithmetic-wrapping-ref])
          (optimize [:= y x])

          #_else
          nil)
        [:= x y])))

(mu/defmethod optimize :!= :- mbql.s/Filter
  [clause :- mbql.s/!=]
  (mbql.u/negate-filter-clause ((get-method optimize :=) clause)))

(defn- optimize-comparison-filter
  [[tag x y :as _filter-clause] optimize-temporal-value-fn new-filter-type]
  (let [x (optimize x)
        y (optimize y)]
    (or
     (case [(temporal-category x) (temporal-category y)]
       [::ref ::literal]
       (let [x-unit (non-default-temporal-unit x)
             y-unit (non-default-temporal-unit y)
             unit   (or x-unit y-unit)]
         (when (and unit
                    (optimizable-units unit)
                    (same-units-or-nil? [x-unit y-unit]))
           (let [x' (change-temporal-unit-to-default x)]
             [new-filter-type x' (optimize-temporal-value-fn y unit)])))

       ([::literal ::ref] [::literal ::arithmetic-wrapping-ref])
       (let [opposite-tag (case tag
                            :>  :<
                            :<  :>
                            :>= :<=
                            :<= :>=)]
         (optimize [opposite-tag y x]))

       [::arithmetic-wrapping-ref ::literal]
       (let [{x' :x, y' :y} (transfer-temporal-arithmetic-args x y)]
         (optimize [tag x' y']))

       #_else
       nil)
     [tag x y])))

(mu/defmethod optimize :< :- mbql.s/Filter
  [filter-clause :- mbql.s/<]
  (optimize-comparison-filter filter-clause temporal-value-lower-bound :<))

(mu/defmethod optimize :<= :- mbql.s/Filter
  [filter-clause :- mbql.s/<=]
  (optimize-comparison-filter filter-clause temporal-value-upper-bound :<))

(mu/defmethod optimize :> :- mbql.s/Filter
  [filter-clause :- mbql.s/>]
  (optimize-comparison-filter filter-clause temporal-value-upper-bound :>=))

(mu/defmethod optimize :>= :- mbql.s/Filter
  [filter-clause :- mbql.s/>=]
  (optimize-comparison-filter filter-clause temporal-value-lower-bound :>=))

(defmethod optimize :between
  [[_between x lower upper]]
  (let [x     (optimize x)
        lower (optimize lower)
        upper (optimize upper)]
    (or (case [(temporal-category x) (temporal-category lower) (temporal-category upper)]
          [::ref ::literal ::literal]
          (let [x-unit     (non-default-temporal-unit x)
                lower-unit (non-default-temporal-unit lower)
                upper-unit (non-default-temporal-unit upper)
                unit       (or x-unit lower-unit upper-unit)]
            (when (and unit
                       (optimizable-units unit)
                       (same-units-or-nil? [x-unit lower-unit upper-unit]))
              (let [x' (change-temporal-unit-to-default x)]
                [:and
                 [:>= x' (temporal-value-lower-bound lower unit)]
                 [:<  x' (temporal-value-upper-bound upper unit)]])))

          [::arithmetic-wrapping-ref ::literal ::literal]
          (let [{x' :x, lower' :y} (transfer-temporal-arithmetic-args x lower)
                {upper' :y}        (transfer-temporal-arithmetic-args x upper)]
            (optimize [:between x' lower' upper']))
          #_else
          nil)
        [:between x lower upper])))

(mu/defn ^:private combine-intervals-if-possible :- [:maybe mbql.s/interval]
  "Combine two `:interval` clauses into one if they both have the same unit."
  ([[_interval x-n x-unit] :- mbql.s/interval
    [_interval y-n y-unit] :- mbql.s/interval]
   (when (= x-unit y-unit)
     [:interval (+ x-n y-n) x-unit])))

(mu/defn optimize-intervals :- [:sequential {:min 1} mbql.s/interval]
  "Combine multiple `:interval` clauses into the fewest number possible."
  [intervals :- [:sequential {:min 1} mbql.s/interval]]
  (let [intervals (sort-by
                   (fn [[_interval _n unit]]
                     unit)
                   intervals)]
    (reduce
     (fn [acc interval]
       (if (empty? acc)
         [interval]
         (if-let [combined (combine-intervals-if-possible (last acc) interval)]
           (conj (vec (butlast acc)) combined)
           (conj (vec acc) interval))))
     []
     intervals)))

(mu/defn ^:private add-interval-if-possible :- [:maybe [:or mbql.s/relative-datetime mbql.s/absolute-datetime]]
  "Combine an `:absolute-datetime`/`:relative-datetime` and an `:interval` clause, if possible."
  [literal                              :- [:or mbql.s/relative-datetime mbql.s/absolute-datetime]
   [_interval interval-n interval-unit] :- mbql.s/interval]
  (case (first literal)
    :absolute-datetime
    (let [[_absolute-datetime t unit] literal]
      (when (= unit interval-unit)
        [:absolute-datetime (u.date/add t unit interval-n) unit]))

    :relative-datetime
    (let [[_relative-datetime n unit] literal]
      (if (= n :current)
        [:relative-datetime interval-n interval-unit]
        (when (= unit interval-unit)
          [:relative-datetime (+ n interval-n) unit])))))

(mu/defmethod optimize ::arithmetic-expr :- [:or
                                             mbql.s/-
                                             mbql.s/+
                                             mbql.s/absolute-datetime
                                             mbql.s/relative-datetime]
  [[tag & args] :- [:or mbql.s/- mbql.s/+]]
  (let [args (map optimize args)
        expr (into [tag] args)]
    (or
     (when (temporal-arithmetic? expr)
       (let [{:keys [non-interval intervals]} (group-temporal-arithmetic-args expr)
             intervals                        (optimize-intervals intervals)]
         (when (and (mbql.u/is-clause? #{:absolute-datetime :relative-datetime} non-interval)
                    (= (count intervals) 1))
           (let [interval (first intervals)
                 interval (case tag
                            :+ interval
                            :- (let [[_interval n unit] interval]
                                 [:interval (- n) unit]))]
             (add-interval-if-possible non-interval interval)))))
     expr)))

(defn optimize-temporal-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
  bucketed datetime fields. Rewrites those filter clauses as logically equivalent filter clauses that do not use
  bucketing (i.e., their datetime unit is `:default`, meaning no bucketing functions need be applied).

    [:= [:field 1 {:temporal-unit :month}] [:absolute-datetime #t \"2019-09-01\" :month]]

    =>

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
  [query]
  (letfn [(optimize-join [join]
            (-> join
                (m/update-existing :condition optimize)
                (m/update-existing :source-query optimize-inner-query)))
          (optimize-joins [joins]
              (mapv optimize-join joins))
          (optimize-inner-query [inner-query]
              (-> inner-query
                  (m/update-existing :source-query optimize-inner-query)
                  (m/update-existing :joins optimize-joins)
                  (m/update-existing :filter optimize)))]
    (m/update-existing query :query optimize-inner-query)))
