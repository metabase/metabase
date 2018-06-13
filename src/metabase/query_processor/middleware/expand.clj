(ns metabase.query-processor.middleware.expand
  "Converts a Query Dict as received by the API into an *expanded* one that contains extra information that will be
  needed to construct the appropriate native Query, and perform various post-processing steps such as Field ordering."
  (:refer-clojure :exclude [< <= > >= = != and or not filter count distinct sum min max + - / *])
  (:require [clojure.core :as core]
            [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import [metabase.query_processor.interface AgFieldRef BetweenFilter ComparisonFilter CompoundFilter DateTimeValue
            DateTimeField Expression ExpressionRef FieldLiteral FieldPlaceholder RelativeDatetime
            RelativeDateTimeValue StringFilter Value ValuePlaceholder]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                CLAUSE HANDLERS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - check that there's a matching :aggregation clause in the query ?
(s/defn ^:ql aggregate-field :- AgFieldRef
  "Aggregate field referece, e.g. for use in an `order-by` clause.

     (query (aggregate (count))
            (order-by (asc (aggregate-field 0)))) ; order by :count"
  [index :- s/Int]
  (i/map->AgFieldRef {:index index}))

(s/defn ^:ql field-id :- i/AnyField
  "Create a generic reference to a `Field` with ID."
  [id]
  ;; If for some reason we were passed a field literal (e.g. [field-id [field-literal ...]])
  ;; we should technically barf but since we know what people meant we'll be nice for once and fix it for them :D
  (if (instance? FieldLiteral id)
    (do
      (log/warn (u/format-color 'yellow (str "It doesn't make sense to use `field-literal` forms inside `field-id` forms.\n"
                                             "Instead of [field-id [field-literal ...]], just do [field-literal ...].")))
      id)
    (i/map->FieldPlaceholder {:field-id id})))

(s/defn ^:private field :- i/AnyField
  "Generic reference to a `Field`. F can be an integer Field ID, or various other forms like `fk->` or `aggregation`."
  [f]
  (if (integer? f)
    (do (log/warn (u/format-color 'yellow "Referring to fields by their bare ID (%d) is deprecated in MBQL '98. Please use [:field-id %d] instead." f f))
        (field-id f))
    f))

(s/defn ^:ql field-literal :- FieldLiteral
  "Generic reference to a Field by FIELD-NAME. This is intended for use when using nested queries so as to allow one
   to refer to the fields coming back from the source query."
  [field-name :- su/KeywordOrString, field-type :- su/KeywordOrString]
  (i/map->FieldLiteral {:field-name (u/keyword->qualified-name field-name), :base-type (keyword field-type)}))

(s/defn ^:ql named :- i/Aggregation
  "Specify a CUSTOM-NAME to use for a top-level AGGREGATION-OR-EXPRESSION in the results.
   (This will probably be extended to support Fields in the future, but for now, only the `:aggregation` clause is
   supported.)"
  {:added "0.22.0"}
  [aggregation-or-expression :- i/Aggregation, custom-name :- su/NonBlankString]
  (assoc aggregation-or-expression :custom-name custom-name))

(s/defn ^:ql datetime-field :- i/AnyField
  "Reference to a `DateTimeField`. This is just a `Field` reference with an associated datetime UNIT."
  ([f _ unit]
   (log/warn (u/format-color 'yellow (str "The syntax for datetime-field has changed in MBQL '98. "
                                          "[:datetime-field <field> :as <unit>] is deprecated. "
                                          "Prefer [:datetime-field <field> <unit>] instead.")))
   (datetime-field f unit))
  ([f unit]
   (cond
     (instance? DateTimeField f) f
     (instance? FieldLiteral f)  (i/map->DateTimeField {:field f, :unit (qputil/normalize-token unit)})
     ;; if it already has a datetime unit don't replace it with a new one (?)
     ;; (:datetime-unit f)          f
     :else                       (assoc (field f) :datetime-unit (qputil/normalize-token unit)))))

(s/defn ^:ql fk-> :- FieldPlaceholder
  "Reference to a `Field` that belongs to another `Table`. DEST-FIELD-ID is the ID of this Field, and FK-FIELD-ID is
   the ID of the foreign key field belonging to the *source table* we should use to perform the join.

   `fk->` is so named because you can think of it as \"going through\" the FK Field to get to the dest Field:

     (fk-> 100 200) ; refer to Field 200, which is part of another Table; join to the other table via our foreign key 100"
  [fk-field-id :- s/Int, dest-field-id :- s/Int]
  (i/assert-driver-supports :foreign-keys)
  (i/map->FieldPlaceholder {:fk-field-id fk-field-id, :field-id dest-field-id}))

(defn- datetime-unit
  "Determine the appropriate datetime unit that should be used for a field F and a value V.

  (Sometimes the value may already have a 'default' value that should be replaced with the value from the field it is
  being used with, e.g. in a filter clause.)

  For example when filtering by minute it is important both F and V are bucketed as minutes, and thus both most have
  the same unit."
  [f v]
  (qputil/normalize-token (core/or (:datetime-unit f)
                                   (:unit f)
                                   (:unit v))))

(s/defn ^:private value :- i/AnyValue
  "Literal value. F is the `Field` it relates to, and V is `nil`, or a boolean, string, numerical, or datetime value."
  [f v]
  (cond
    (instance? ValuePlaceholder v)      v
    (instance? Value v)                 v
    (instance? RelativeDateTimeValue v) v
    (instance? DateTimeValue v)         v
    (instance? RelativeDatetime v)      (i/map->RelativeDateTimeValue (assoc v :unit (datetime-unit f v), :field (datetime-field f (datetime-unit f v))))
    (instance? DateTimeField f)         (i/map->DateTimeValue {:value (u/->Timestamp v), :field f})
    (instance? FieldLiteral f)          (if (isa? (:base-type f) :type/DateTime)
                                          (i/map->DateTimeValue {:value (u/->Timestamp v)
                                                                 :field (i/map->DateTimeField {:field f :unit :default})})
                                          (i/map->Value {:value v, :field f}))
    :else                               (i/map->ValuePlaceholder {:field-placeholder (field f), :value v})))

(s/defn ^:private field-or-value
  "Use instead of `value` when something may be either a field or a value."
  [f v]

  (if (core/or (instance? FieldPlaceholder v)
               (instance? ExpressionRef v))
    v
    (value f v)))

(s/defn ^:ql relative-datetime :- RelativeDatetime
  "Value that represents a point in time relative to each moment the query is ran, e.g. \"today\" or \"1 year ago\".

   With `:current` as the only arg, refer to the current point in time; otherwise N is some number and UNIT is a unit
   like `:day` or `:year`.

     (relative-datetime :current)
     (relative-datetime -31 :day)"
  ([n]                (s/validate (s/eq :current) (qputil/normalize-token n))
                      (relative-datetime 0 nil))
  ([n :- s/Int, unit] (i/map->RelativeDatetime {:amount n, :unit (if (nil? unit)
                                                                   :day                        ; give :unit a default value so we can simplify the schema a bit and require a :unit
                                                                   (qputil/normalize-token unit))})))

(s/defn ^:ql expression :- ExpressionRef
  {:added "0.17.0"}
  [expression-name :- su/KeywordOrString]
  (i/strict-map->ExpressionRef {:expression-name (name expression-name)}))


;;; ## aggregation

(defn- field-or-expression [f]
  (if (instance? Expression f)
    ;; recursively call field-or-expression on all the args inside the expression unless they're numbers
    ;; plain numbers are always assumed to be numeric literals here; you must use MBQL '98 `:field-id` syntax to refer
    ;; to Fields inside an expression <3
    (update f :args #(for [arg %]
                       (if (number? arg)
                         arg
                         (field-or-expression arg))))
    ;; otherwise if it's not an Expression it's a Field
    (field f)))

(s/defn ^:private ag-with-field :- i/Aggregation [ag-type f]
  (i/map->AggregationWithField {:aggregation-type ag-type, :field (field-or-expression f)}))

(def ^:ql ^{:arglists '([f])} avg      "Aggregation clause. Return the average value of F."                (partial ag-with-field :avg))
(def ^:ql ^{:arglists '([f])} distinct "Aggregation clause. Return the number of distinct values of F."    (partial ag-with-field :distinct))
(def ^:ql ^{:arglists '([f])} sum      "Aggregation clause. Return the sum of the values of F."            (partial ag-with-field :sum))
(def ^:ql ^{:arglists '([f])} cum-sum  "Aggregation clause. Return the cumulative sum of the values of F." (partial ag-with-field :cumulative-sum))
(def ^:ql ^{:arglists '([f])} min      "Aggregation clause. Return the minimum value of F."                (partial ag-with-field :min))
(def ^:ql ^{:arglists '([f])} max      "Aggregation clause. Return the maximum value of F."                (partial ag-with-field :max))

(defn ^:ql stddev
  "Aggregation clause. Return the standard deviation of values of F.
   Requires the feature `:standard-deviation-aggregations`."
  [f]
  (i/assert-driver-supports :standard-deviation-aggregations)
  (ag-with-field :stddev f))

(s/defn ^:ql count :- i/Aggregation
  "Aggregation clause. Return total row count (e.g., `COUNT(*)`). If F is specified, only count rows where F is non-null (e.g. `COUNT(f)`)."
  ([]  (i/map->AggregationWithoutField {:aggregation-type :count}))
  ([f] (ag-with-field :count f)))

(s/defn ^:ql cum-count :- i/Aggregation
  "Aggregation clause. Return the cumulative row count (presumably broken out in some way)."
  []
  (i/map->AggregationWithoutField {:aggregation-type :cumulative-count}))

(defn ^:ql ^:deprecated rows
  "Bare rows aggregation. This is the default behavior, so specifying it is deprecated."
  []
  (log/warn (u/format-color 'yellow "Specifying :rows as the aggregation type is deprecated in MBQL '98. This is the default behavior, so you don't need to specify it.")))

(s/defn ^:ql aggregation
  "Specify the aggregation to be performed for this query.

     (aggregation {} (count 100))
     (aggregation {} :count 100))"
  ;; Handle ag field references like [:aggregation 0] (deprecated)
  ([index :- s/Int]
   (log/warn "The syntax for aggregate fields has changed in MBQL '98. Instead of `[:aggregation 0]`, please use `[:aggregate-field 0]` instead.")
   (aggregate-field index))

  ;; Handle :aggregation top-level clauses. This is either a single map (single aggregation) or a vector of maps
  ;; (multiple aggregations)
  ([query ag-or-ags :- (s/maybe (s/cond-pre su/Map [su/Map]))]
   (cond
     (map? ag-or-ags)  (recur query [ag-or-ags])
     (empty? ag-or-ags) query
     :else              (assoc query :aggregation (vec (for [ag ag-or-ags]
                                                         ;; make sure the ag map is still typed correctly
                                                         (u/prog1 (cond
                                                                    (:operator ag) (i/map->Expression ag)
                                                                    (:field ag)    (i/map->AggregationWithField    (update ag :aggregation-type qputil/normalize-token))
                                                                    :else          (i/map->AggregationWithoutField (update ag :aggregation-type qputil/normalize-token)))
                                                           (s/validate i/Aggregation <>)))))))

  ;; also handle varargs for convenience
  ([query ag & more]
   (aggregation query (cons ag more))))


;;; ## breakout & fields

(s/defn ^:ql binning-strategy :- FieldPlaceholder
  "Reference to a `BinnedField`. This is just a `Field` reference with an associated `STRATEGY-NAME` and
  `STRATEGY-PARAM`"
  ([f strategy-name & [strategy-param]]
   (let [strategy (qputil/normalize-token strategy-name)
         field (field f)]
     (assoc field :binning-strategy strategy, :binning-param strategy-param))))

(defn- fields-list-clause
  ([k query] query)
  ([k query & fields] (assoc query k (mapv field fields))))

(def ^:ql ^{:arglists '([query & fields])} breakout "Specify which fields to breakout by." (partial fields-list-clause :breakout))
(def ^:ql ^{:arglists '([query & fields])} fields   "Specify which fields to return."      (partial fields-list-clause :fields))

;;; ## filter

(s/defn ^:private compound-filter :- i/Filter
  ([compound-type, subclause :- i/Filter]
   (log/warn (u/format-color 'yellow "You shouldn't specify an %s filter with only one subclause." compound-type))
   subclause)

  ([compound-type, subclause :- i/Filter, & more :- [i/Filter]]
   (i/map->CompoundFilter {:compound-type compound-type, :subclauses (vec (cons subclause more))})))

(def ^:ql ^{:arglists '([& subclauses])} and "Filter subclause. Return results that satisfy *all* SUBCLAUSES." (partial compound-filter :and))
(def ^:ql ^{:arglists '([& subclauses])} or  "Filter subclause. Return results that satisfy *any* of the SUBCLAUSES." (partial compound-filter :or))

(s/defn ^:private equality-filter :- i/Filter
  ([filter-type _ f v]
   (i/map->EqualityFilter {:filter-type filter-type, :field (field f), :value (field-or-value f v)}))
  ([filter-type compound-fn f v & more]
   (apply compound-fn (for [v (cons v more)]
                        (equality-filter filter-type compound-fn f v)))))

(def ^:ql ^{:arglists '([f v & more])} =
  "Filter subclause. With a single value, return results where F == V. With two or more values, return results where F
  matches *any* of the values (i.e.`IN`)

     (= f v)
     (= f v1 v2) ; same as (or (= f v1) (= f v2))"
  (partial equality-filter := or))

(def ^:ql ^{:arglists '([f v & more])} !=
  "Filter subclause. With a single value, return results where F != V. With two or more values, return results where F
  does not match *any* of the values (i.e. `NOT IN`)

     (!= f v)
     (!= f v1 v2) ; same as (and (!= f v1) (!= f v2))"
  (partial equality-filter :!= and))

(defn ^:ql is-null  "Filter subclause. Return results where F is `nil`."     [f] (=  f nil)) ; TODO - Should we deprecate these? They're syntactic sugar, and not particualarly useful.
(defn ^:ql not-null "Filter subclause. Return results where F is not `nil`." [f] (!= f nil)) ; not-null is doubly unnecessary since you could just use `not` instead.

(s/defn ^:private comparison-filter :- ComparisonFilter [filter-type f v]
  (i/map->ComparisonFilter {:filter-type filter-type, :field (field f), :value (value f v)}))

(def ^:ql ^{:arglists '([f v])} <  "Filter subclause. Return results where F is less than V. V must be orderable, i.e. a number or datetime."                (partial comparison-filter :<))
(def ^:ql ^{:arglists '([f v])} <= "Filter subclause. Return results where F is less than or equal to V. V must be orderable, i.e. a number or datetime."    (partial comparison-filter :<=))
(def ^:ql ^{:arglists '([f v])} >  "Filter subclause. Return results where F is greater than V. V must be orderable, i.e. a number or datetime."             (partial comparison-filter :>))
(def ^:ql ^{:arglists '([f v])} >= "Filter subclause. Return results where F is greater than or equal to V. V must be orderable, i.e. a number or datetime." (partial comparison-filter :>=))

(s/defn ^:ql between :- BetweenFilter
  "Filter subclause. Return results where F is between MIN and MAX. MIN and MAX must be orderable, i.e. numbers or datetimes.
   This behaves like SQL `BETWEEN`, i.e. MIN and MAX are inclusive."
  [f min-val max-val]
  (i/map->BetweenFilter {:filter-type :between, :field (field f), :min-val (value f min-val), :max-val (value f max-val)}))

(s/defn ^:ql inside :- CompoundFilter
  "Filter subclause for geo bounding. Return results where LAT-FIELD and LON-FIELD are between some set of bounding values."
  [lat-field lon-field lat-max lon-min lat-min lon-max]
  (and (between lat-field lat-min lat-max)
       (between lon-field lon-min lon-max)))


(s/defn ^:private string-filter :- StringFilter
  "String search filter clauses: `contains`, `starts-with`, and `ends-with`. First shipped in `0.11.0` (before initial
  public release) but only supported case-sensitive searches. In `0.29.0` support for case-insensitive searches was
  added. For backwards-compatibility, and to avoid possible performance implications, case-sensitive is the default
  option if no `options-maps` is specified for all drivers except GA. Whether we should default to case-sensitive can
  be specified by the `IDriver` method `default-to-case-sensitive?`."
  ([filter-type f s]
   (string-filter filter-type f s {:case-sensitive (if i/*driver*
                                                     (driver/default-to-case-sensitive? i/*driver*)
                                                     ;; if *driver* isn't bound then just assume `true`
                                                     true)}))
  ([filter-type f s options-map]
   (i/strict-map->StringFilter
    {:filter-type     filter-type
     :field           (field f)
     :value           (value f s)
     :case-sensitive? (qputil/get-normalized options-map :case-sensitive true)})))

(def ^:ql ^{:arglists '([f s] [f s options-map])} starts-with
  "Filter subclause. Return results where F starts with the string S. By default, is case-sensitive, but you may pass an
  `options-map` with `{:case-sensitive false}` for case-insensitive searches."
  (partial string-filter :starts-with))

(def ^:ql ^{:arglists '([f s] [f s options-map])} contains
  "Filter subclause. Return results where F contains the string S. By default, is case-sensitive, but you may pass an
  `options-map` with `{:case-sensitive false}` for case-insensitive searches."
  (partial string-filter :contains))

(def ^:ql ^{:arglists '([f s] [f s options-map])} ends-with
  "Filter subclause. Return results where F ends with with the string S. By default, is case-sensitive, but you may pass
  an `options-map` with `{:case-sensitive false}` for case-insensitive searches."
  (partial string-filter :ends-with))


(s/defn ^:ql not :- i/Filter
  "Filter subclause. Return results that do *not* satisfy SUBCLAUSE.

   For the sake of simplifying driver implementation, `not` automatically translates its argument to a simpler,
   logically equivalent form whenever possible:

     (not (and x y)) -> (or (not x) (not y))
     (not (not x))   -> x
     (not (= x y)    -> (!= x y)"
  {:added "0.15.0"}
  [{:keys [compound-type subclause subclauses], :as clause} :- i/Filter]
  (case compound-type
    :and (apply or  (mapv not subclauses))
    :or  (apply and (mapv not subclauses))
    :not subclause
    nil  (let [{:keys [field value filter-type]} clause]
           (case filter-type
             :=       (!= field value)
             :!=      (=  field value)
             :<       (>= field value)
             :>       (<= field value)
             :<=      (>  field value)
             :>=      (<  field value)
             :between (let [{:keys [min-val max-val]} clause]
                        (or (< field min-val)
                            (> field max-val)))
             (i/strict-map->NotFilter {:compound-type :not, :subclause clause})))))

(def ^:ql ^{:arglists '([f s]), :added "0.15.0"} does-not-contain
  "Filter subclause. Return results where F does not start with the string S."
  (comp not contains))

(s/defn ^:ql time-interval :- i/Filter
  "Filter subclause. Syntactic sugar for specifying a specific time interval.

 Optionally accepts a map of `options`. The following options are currently implemented:

 *  `:include-current` Should we include partial results for the current day/month/etc? Defaults to `false`; set
     this to `true` to include them.

     ;; return rows where datetime Field 100's value is in the current month
     (filter {} (time-interval (field-id 100) :current :month))

     ;; return rows where datetime Field 100's value is in the current month, including partial results for the
     ;; current day
     (filter {} (time-interval (field-id 100) :current :month {:include-current true}))"
  [f n unit & [options]]
  (if-not (integer? n)
    (case (qputil/normalize-token n)
      :current (recur f  0 unit options)
      :last    (recur f -1 unit options)
      :next    (recur f  1 unit options))
    (let [f                (datetime-field f unit)
          include-current? (qputil/get-normalized options :include-current)]
      (cond
        (core/= n  0) (= f (value f (relative-datetime  0 unit)))
        (core/= n -1) (= f (value f (relative-datetime -1 unit)))
        (core/= n  1) (= f (value f (relative-datetime  1 unit)))
        (core/< n -1) (between f (value f (relative-datetime                          n unit))
                                 (value f (relative-datetime (if include-current? 0 -1) unit)))
        (core/> n  1) (between f (value f (relative-datetime (if include-current? 0  1) unit))
                                 (value f (relative-datetime                          n unit)))))))

(s/defn ^:ql filter
  "Filter the results returned by the query.

     (filter {} := 100 true) ; return rows where Field 100 == true"
  [query, filter-map :- (s/maybe i/Filter)]
  (if filter-map
    (assoc query :filter filter-map)
    query))

(s/defn ^:ql limit
  "Limit the number of results returned by the query.

     (limit {} 10)"
  [query, limit :- (s/maybe s/Int)]
  (if limit
    (assoc query :limit limit)
    query))


;;; ## order-by

(s/defn ^:private order-by-subclause :- i/OrderBy
  [direction :- i/OrderByDirection, f]
  ;; it's not particularly useful to sort datetime fields with the default `:day` bucketing,
  ;; so specifiy `:default` bucketing to prevent the default of `:day` from being set during resolution.
  ;; This won't affect fields that aren't `DateTimeFields`.
  {:direction direction
   :field     (let [f (field f)]
                (if-not (instance? FieldPlaceholder f)
                  f
                  (update f :datetime-unit (fn [unit]
                                             (core/or unit :default)))))})

(def ^:ql ^{:arglists '([field])} asc
  "`order-by` subclause. Specify that results should be returned in ascending order for Field or AgRef F.

     (order-by {} (asc 100))"
  (partial order-by-subclause :ascending))

(def ^:ql ^{:arglists '([field])} desc
  "`order-by` subclause. Specify that results should be returned in ascending order for Field or AgRef F.

     (order-by {} (desc 100))"
  (partial order-by-subclause :descending))

(s/defn ^:private maybe-parse-order-by-subclause :- i/OrderBy
  [subclause]
  (cond
    (map? subclause)    subclause ; already parsed by `asc` or `desc`
    (vector? subclause) (let [[f direction] subclause]
                          (log/warn (u/format-color 'yellow "The syntax for order-by has changed in MBQL '98. [<field> :ascending/:descending] is deprecated. Prefer [:asc/:desc <field>] instead."))
                          (order-by-subclause (qputil/normalize-token direction) f))))

(defn ^:ql order-by
  "Specify how ordering should be done for this query.

     (order-by {} (asc 20))        ; order by field 20
     (order-by {} [20 :ascending]) ; order by field 20 (deprecated/legacy syntax)
     (order-by {} [(aggregate-field 0) :descending]) ; order by the aggregate field (e.g. :count)"
  ([query] query)
  ([query & subclauses]
   (assoc query :order-by (mapv maybe-parse-order-by-subclause subclauses))))


;;; ## page

(s/defn ^:ql page
  "Specify which 'page' of results to fetch (offset and limit the results).

     (page {} {:page 1, :items 20}) ; fetch first 20 rows"
  [query page-clause :- (s/maybe i/Page)]
  (if page-clause
    (assoc query :page page-clause)
    query))

;;; ## source-table

(s/defn ^:ql source-table
  "Specify the ID of the table to query.
   Queries must specify *either* `:source-table` or `:source-query`.

     (source-table {} 100)"
  [query, table-id :- s/Int]
  (assoc query :source-table table-id))

(declare expand-inner)

(s/defn ^:ql source-query
  "Specify a query to use as the source for this query (e.g., as a `SUBSELECT`).
   Queries must specify *either* `:source-table` or `:source-query`.

     (source-query {} (-> (source-table {} 100)
                          (limit 10)))"
  {:added "0.25.0"}
  [query, source-query :- su/Map]
  (assoc query :source-query (if (:native source-query)
                               source-query
                               (expand-inner source-query))))


;;; ## calculated columns

(s/defn ^:ql expressions
  "Top-level clause. Add additional calculated fields to a query."
  {:added "0.17.0"}
  [query, m :- {s/Keyword Expression}]
  (assoc query :expressions m))

(s/defn ^:private expression-fn :- Expression
  [k :- s/Keyword, & args]
  (i/map->Expression {:operator k, :args (vec (for [arg args]
                                                (if (number? arg)
                                                  (float arg) ; convert args to floats so things like 5 / 10 -> 0.5 instead of 0
                                                  arg)))}))

(def ^:ql ^{:arglists '([rvalue1 rvalue2 & more]), :added "0.17.0"} + "Arithmetic addition function."       (partial expression-fn :+))
(def ^:ql ^{:arglists '([rvalue1 rvalue2 & more]), :added "0.17.0"} - "Arithmetic subtraction function."    (partial expression-fn :-))
(def ^:ql ^{:arglists '([rvalue1 rvalue2 & more]), :added "0.17.0"} * "Arithmetic multiplication function." (partial expression-fn :*))
(def ^:ql ^{:arglists '([rvalue1 rvalue2 & more]), :added "0.17.0"} / "Arithmetic division function."       (partial expression-fn :/))

;;; Metric & Segment handlers

;; These *do not* expand the normal Metric and Segment macros used in normal queries; that's handled in
;; `metabase.query-processor.macros` before this namespace ever even sees the query. But since the GA driver's queries
;; consist of custom `metric` and `segment` clauses we need to at least accept them without barfing so we can expand a
;; query in order to check what permissions it requires.  TODO - in the future, we should just make these functions
;; expand Metric and Segment macros for consistency with the rest of the MBQL clauses
(defn ^:ql metric  "Placeholder expansion function for GA metric clauses. (This does not expand normal Metric macros; that is done in `metabase.query-processor.macros`.)"   [& _])
(defn ^:ql segment "Placeholder expansion function for GA segment clauses. (This does not expand normal Segment macros; that is done in `metabase.query-processor.macros`.)" [& _])


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   EXPANSION                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; QL functions are any public function in this namespace marked with `^:ql`.
(def ^:private token->ql-fn
  "A map of keywords (e.g., `:=`), to the matching vars (e.g., `#'=`)."
  (into {} (for [[symb varr] (ns-publics *ns*)
                 :when       (:ql (meta varr))]
             {(keyword symb) varr})))

(defn- fn-for-token
  "Return fn var that matches a token, or throw an exception.

     (fn-for-token :starts-with) -> #'starts-with"
  [token]
  (let [token (qputil/normalize-token token)]
    (core/or (token->ql-fn token)
             (throw (Exception. (str "Illegal clause (no matching fn found): " token))))))

(s/defn expand-ql-sexpr
  "Expand a QL bracketed S-expression by dispatching to the appropriate `^:ql` function. If SEXPR is not a QL
   S-expression (the first item isn't a token), it is returned as-is.

     (expand-ql-sexpr [:field-id 10]) -> (field-id 10) -> {:field-id 10, :fk-field-id nil, :datetime-unit nil}"
  [[token & args :as sexpr] :- (s/pred vector?)]
  (if (core/or (keyword? token)
               (string?  token))
    (apply (fn-for-token token) args)
    sexpr))

(defn- walk-expand-ql-sexprs
  "Walk QUERY depth-first and expand QL bracketed S-expressions."
  [x]
  (cond (map? x)        (into x (for [[k v] x]                    ; do `into x` instead of `into {}` so we can keep the original class,
                                  [k (walk-expand-ql-sexprs v)])) ; e.g. FieldPlaceholder
        (sequential? x) (expand-ql-sexpr (mapv walk-expand-ql-sexprs x))
        :else           x))


(s/defn expand-inner :- i/Query
  "Expand an inner query map."
  [inner-query :- (s/pred map?)]
  (loop [query {}, [[clause-name arg] & more] (seq inner-query)]
    (let [arg   (walk-expand-ql-sexprs arg)
          args  (cond
                  (sequential? arg) arg
                  arg               [arg])
          query (if (seq args)
                  (apply (fn-for-token clause-name) query args)
                  query)]
      (if (seq more)
        (recur query more)
        query))))

(defn expand
  "Expand a query dictionary as it comes in from the API and return an \"expanded\" form, (almost) ready for use by
   the Query Processor. This includes steps like token normalization and function dispatch.

     (expand {:query {\"SOURCE_TABLE\" 10, \"FILTER\" [\"=\" 100 200]}})

       -> {:query {:source-table 10
                   :filter       {:filter-type :=
                                  :field       {:field-id 100}
                                  :value       {:field-placeholder {:field-id 100}
                                                :value 200}}}}

   The \"placeholder\" objects above are fetched from the DB and replaced in the next QP step, in
   `metabase.query-processor.middleware.resolve`."
  [outer-query]
  (update outer-query :query expand-inner))

(defn expand-middleware
  "Wraps `expand` in a query-processor middleware function"
  [qp]
  (fn [query]
    (qp (if (qputil/mbql-query? query)
          (expand query)
          query))))

(defmacro query
  "Build a query by threading an (initially empty) map through each form in BODY with `->`.
   The final result is validated against the `Query` schema."
  {:style/indent 0}
  [& body]
  `(-> {}
       ~@body
       expand-inner))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                OTHER HELPER FNS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn is-clause?
  "Check to see whether CLAUSE is an instance of the clause named by normalized CLAUSE-KEYWORD.

     (is-clause? :field-id [\"FIELD-ID\" 2000]) ; -> true"
  [clause-keyword clause]
  (core/and (sequential? clause)
            (core/= (qputil/normalize-token (first clause)) clause-keyword)))
