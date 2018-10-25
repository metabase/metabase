(ns metabase.mbql.schema
  "Schema for validating a *normalized* MBQL query. This is also the definitive grammar for MBQL, wow!"
  (:refer-clojure :exclude [count distinct min max + - / * and or not = < > <= >= time])
  (:require [clojure
             [core :as core]
             [set :as set]]
            [metabase.mbql.schema.helpers :refer [defclause is-clause? one-of]]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s]))

;; A NOTE ABOUT METADATA:
;;
;; Clauses below are marked with the following tags for documentation purposes:
;;
;; *  Clauses marked `^:sugar` are syntactic sugar primarily intended to make generating queries easier on the
;;    frontend. These clauses are automatically rewritten as simpler clauses by the `desugar` or `expand-macros`
;;    middleware. Thus driver implementations do not need to handle these clauses.
;;
;; *  Clauses marked `^:internal` are automatically generated by `wrap-value-literals` or other middleware from values
;;    passed in. They are not intended to be used by the frontend when generating a query. These add certain
;;    information that simplify driver implementations. When writing MBQL queries yourself you should pretend these
;;    clauses don't exist.
;;
;; *  Clauses marked `^{:requires-features #{feature+}}` require a certain set of features to be used. At some date in
;;    the future we will likely add middleware that uses this metadata to automatically validate that a driver has the
;;    features needed to run the query in question.

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  MBQL Clauses                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------- Datetime Stuff -------------------------------------------------

(def DatetimeFieldUnit
  "Schema for all valid datetime bucketing units."
  (s/named
   (apply s/enum #{:default :minute :minute-of-hour :hour :hour-of-day :day :day-of-week :day-of-month :day-of-year
                   :week :week-of-year :month :month-of-year :quarter :quarter-of-year :year})
   "datetime-unit"))

(def ^:private RelativeDatetimeUnit
  (s/named
   (apply s/enum #{:default :minute :hour :day :week :month :quarter :year})
   "relative-datetime-unit"))

(def ^:private LiteralDatetimeString
  "Schema for an MBQL datetime string literal, in ISO-8601 format. (This also accepts literal time stings.)"
  (s/constrained su/NonBlankString du/date-string? "datetime-literal"))

;; TODO - `unit` is not allowed if `n` is `current`
(defclause relative-datetime
  n    (s/cond-pre (s/eq :current) s/Int)
  unit (optional RelativeDatetimeUnit))

;; This clause is automatically generated by middleware when datetime literals (literal strings or one of the Java
;; types) are encountered. Unit is inferred by looking at the Field the timestamp is compared against. Implemented
;; mostly to convenience driver implementations. You don't need to use this form directly when writing MBQL; datetime
;; literal strings are preferred instead.
;;
;; example:
;; [:= [:datetime-field [:field-id 10] :day] "2018-10-02"]
;;
;; becomes:
;; [:= [:datetime-field [:field-id 10] :day] [:absolute-datetime #inst "2018-10-02" :day]]
(defclause ^:internal absolute-datetime
  timestamp java.sql.Timestamp
  unit      DatetimeFieldUnit)

;; it could make sense to say hour-of-day(field) =  hour-of-day("2018-10-10T12:00")
;; but it does not make sense to say month-of-year(field) = month-of-year("08:00:00"),
;; does it? So we'll restrict the set of units a TimeValue can have to ones that have no notion of day/date.
(def TimeUnit
  "Valid unit for time bucketing."
  (apply s/enum #{:default :minute :minute-of-hour :hour :hour-of-day}))

;; almost exactly the same as `absolute-datetime`, but generated in some sitations where the literal in question was
;; clearly a time (e.g. "08:00:00.000") and/or the Field derived from `:type/Time` and/or the unit was a
;; time-bucketing unit
(defclause ^:internval time
  time java.sql.Time
  unit TimeUnit)

(def ^:private DatetimeLiteral
  "Schema for valid absolute datetime literals."
  (s/conditional
   (partial is-clause? :absolute-datetime)
   absolute-datetime

   (partial is-clause? :time)
   time

   :else
   (s/cond-pre
    ;; literal datetime strings and Java types will get transformed to `absolute-datetime` clauses automatically by
    ;; middleware so drivers don't need to deal with these directly. You only need to worry about handling
    ;; `absolute-datetime` clauses.
    LiteralDatetimeString
    java.util.Date)))

(def DateTimeValue
  "Schema for a datetime value drivers will personally have to handle, either an `absolute-datetime` form or a
  `relative-datetime` form."
  (one-of absolute-datetime relative-datetime time))


;;; -------------------------------------------------- Other Values --------------------------------------------------

(def ValueTypeInfo
  "Type info about a value in a `:value` clause. Added automatically by `wrap-value-literals` middleware to values in
  filter clauses based on the Field in the clause."
  {(s/optional-key :database_type) (s/maybe su/NonBlankString)
   (s/optional-key :base_type)     (s/maybe su/FieldType)
   (s/optional-key :special_type)  (s/maybe su/FieldType)
   (s/optional-key :unit)          (s/maybe DatetimeFieldUnit)})

;; Arguments to filter clauses are automatically replaced with [:value <value> <type-info>] clauses by the
;; `wrap-value-literals` middleware. This is done to make it easier to implement query processors, because most driver
;; implementations dispatch off of Object type, which is often not enough to make informed decisions about how to
;; treat certain objects. For example, a string compared against a Postgres UUID Field needs to be parsed into a UUID
;; object, since text <-> UUID comparision doesn't work in Postgres. For this reason, raw literals in `:filter`
;; clauses are wrapped in `:value` clauses and given information about the type of the Field they will be compared to.
(defclause ^:internal value
  value    s/Any
  type-info (s/maybe ValueTypeInfo))


;;; ----------------------------------------------------- Fields -----------------------------------------------------

;; Normal lowest-level Field clauses refer to a Field either by ID or by name

(defclause field-id, id su/IntGreaterThanZero)

(defclause field-literal, field-name su/NonBlankString, field-type su/FieldType)

;; Both args in `[:fk-> <source-field> <dest-field>]` are implict `:field-ids`. E.g.
;;
;;   [:fk-> 10 20] --[NORMALIZE]--> [:fk-> [:field-id 10] [:field-id 20]]
(defclause ^{:requires-features #{:foreign-keys}} fk->
  source-field (one-of field-id field-literal)
  dest-field   (one-of field-id field-literal))

;; Expression *references* refer to a something in the `:expressions` clause, e.g. something like `[:+ [:field-id 1]
;; [:field-id 2]]`
(defclause ^{:requires-features #{:expressions}} expression
  expression-name su/NonBlankString)

;; `datetime-field` is used to specify DATE BUCKETING for a Field that represents a moment in time of some sort. There
;; is no requirement that all `:type/DateTime` derived Fields be wrapped in `datetime-field`, but for legacy reasons
;; `:field-id` clauses that refer to datetime Fields will be automatically "bucketed" in the `:breakout` clause, but
;; nowhere else. See `auto-bucket-datetime-breakouts` for more details. `:field-id` clauses elsewhere will not be
;; automatically bucketed, so drivers still need to make sure they do any special datetime handling for plain
;; `:field-id` clauses when their Field derives from `:type/DateTime`.
;;
;; Datetime Field can wrap any of the lowest-level Field clauses, but not other datetime-field clauses, because that
;; wouldn't make sense. They similarly can not wrap expression references, because doing arithmetic on timestamps
;; doesn't make a whole lot of sense (what does `"2018-10-23"::timestamp / 2` mean?).
;;
;; Field is an implicit Field ID
(defclause datetime-field
  field (one-of field-id field-literal fk->)
  unit  DatetimeFieldUnit)

;; binning strategy can wrap any of the above clauses, but again, not another binning strategy clause
(def BinningStrategyName
  "Schema for a valid value for the `strategy-name` param of a `binning-strategy` clause."
  (s/enum :num-bins :bin-width :default))

(def BinnableField
  "Schema for any sort of field clause that can be wrapped by a `binning-strategy` clause."
  (one-of field-id fk-> datetime-field field-literal))

(def ResolvedBinningStrategyOptions
  "Schema for map of options tacked on to the end of `binning-strategy` clauses by the `binning` middleware."
  {:num-bins   su/IntGreaterThanZero
   :bin-width  (s/constrained s/Num (complement neg?) "bin width must be >= 0.")
   :min-value  s/Num
   :max-value  s/Num})

;; TODO - binning strategy param is disallowed for `:default` and required for the others. For `num-bins` it must also
;; be an integer.
(defclause ^{:requires-features #{:binning}} binning-strategy
  field          BinnableField
  strategy-name  BinningStrategyName
  strategy-param (optional (s/constrained s/Num (complement neg?) "strategy param must be >= 0."))
  ;; These are added in automatically by the `binning` middleware. Don't add them yourself, as they're just be
  ;; replaced. Driver implementations can rely on this being populated
  resolved-options (optional ResolvedBinningStrategyOptions))

(def Field
  "Schema for anything that refers to a Field, from the common `[:field-id <id>]` to variants like `:datetime-field` or
  `:fk->`."
  (one-of field-id field-literal fk-> datetime-field expression binning-strategy))

;; aggregate field reference refers to an aggregation, e.g.
;;
;;    {:aggregation [[:count]]
;;     :order-by    [[:asc [:aggregation 0]]]} ;; refers to the 0th aggregation, `:count`
;;
;; Currently aggregate Field references can only be used inside order-by clauses. In the future once we support SQL
;; `HAVING` we can allow them in filter clauses too
;;
;; TODO - shouldn't we allow composing aggregations in expressions? e.g.
;;
;;    {:order-by [[:asc [:+ [:aggregation 0] [:aggregation 1]]]]}
;;
;; TODO - it would be nice if we could check that there's actually an aggregation with the corresponding index,
;; wouldn't it
(defclause aggregation, aggregation-clause-index s/Int)

(def ^:private FieldOrAggregationReference
  (s/if (partial is-clause? :aggregation)
    aggregation
    Field))


;;; -------------------------------------------------- Expressions ---------------------------------------------------

;; Expressions are "calculated column" definitions, defined once and then used elsewhere in the MBQL query.

(declare ExpressionDef)

(def ^:private ExpressionArg
  (s/conditional
   number?
   s/Num

   (partial is-clause? #{:+ :- :/ :*})
   (s/recursive #'ExpressionDef)

   :else
   Field))

(defclause ^{:requires-features #{:expressions}} +, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))
(defclause ^{:requires-features #{:expressions}} -, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))
(defclause ^{:requires-features #{:expressions}} /, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))
(defclause ^{:requires-features #{:expressions}} *, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))

(def ExpressionDef
  "Schema for a valid expression definition, as defined under the top-level MBQL `:expressions`."
  (one-of + - / *))


;;; -------------------------------------------------- Aggregations --------------------------------------------------

(def ^:private FieldOrExpressionDef
  (s/if (partial is-clause? #{:+ :- :* :/})
    ExpressionDef
    Field))

;; For all of the 'normal' Aggregations below (excluding Metrics) fields are implicit Field IDs

;; cum-sum and cum-count are SUGAR because they're implemented in middleware. They clauses are swapped out with
;; `count` and `sum` aggregations respectively and summation is done in Clojure-land
(defclause ^{:requires-features #{:basic-aggregations}} ^:sugar count,     field (optional Field))
(defclause ^{:requires-features #{:basic-aggregations}} ^:sugar cum-count, field (optional Field))

;; technically aggregations besides count can also accept expressions as args, e.g.
;;
;;    [[:sum [:+ [:field-id 1] [:field-id 2]]]]
;;
;; Which is equivalent to SQL:
;;
;;    SUM(field_1 + field_2)

(defclause ^{:requires-features #{:basic-aggregations}} avg,      field-or-expression FieldOrExpressionDef)
(defclause ^{:requires-features #{:basic-aggregations}} cum-sum,  field-or-expression FieldOrExpressionDef)
(defclause ^{:requires-features #{:basic-aggregations}} distinct, field-or-expression FieldOrExpressionDef)
(defclause ^{:requires-features #{:basic-aggregations}} sum,      field-or-expression FieldOrExpressionDef)
(defclause ^{:requires-features #{:basic-aggregations}} min,      field-or-expression FieldOrExpressionDef)
(defclause ^{:requires-features #{:basic-aggregations}} max,      field-or-expression FieldOrExpressionDef)

(defclause ^{:requires-features #{:standard-deviation-aggregations}} stddev, field-or-expression FieldOrExpressionDef)

;; Metrics are just 'macros' (placeholders for other aggregations with optional filter and breakout clauses) that get
;; expanded to other aggregations/etc. in the expand-macros middleware
;;
;; METRICS WITH STRING IDS, e.g. `[:metric "ga:sessions"]`, are Google Analytics metrics, not Metabase metrics! They
;; pass straight thru to the GA query processor.
(defclause ^:sugar metric, metric-id (s/cond-pre su/IntGreaterThanZero su/NonBlankString))

;; the following are definitions for expression aggregations, e.g. [:+ [:sum [:field-id 10]] [:sum [:field-id 20]]]

(declare Aggregation)

(def ^:private ExpressionAggregationArg
  (s/if number?
    s/Num
    (s/recursive #'Aggregation)))

(defclause [^{:requires-features #{:expression-aggregations}} ag:+   +]
  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))

(defclause [^{:requires-features #{:expression-aggregations}} ag:-   -]
  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))

(defclause [^{:requires-features #{:expression-aggregations}} ag:*   *]
  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))

(defclause [^{:requires-features #{:expression-aggregations}} ag:div /]
  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))
;; ag:/ isn't a valid token

(def ^:private UnnamedAggregation
  (one-of count avg cum-count cum-sum distinct stddev sum min max ag:+ ag:- ag:* ag:div metric))

;; any sort of aggregation can be wrapped in a `[:named <ag> <custom-name>]` clause, but you cannot wrap a `:named` in
;; a `:named`

(defclause named, aggregation UnnamedAggregation, aggregation-name su/NonBlankString)

(def Aggregation
  "Schema for anything that is a valid `:aggregation` clause."
  (s/if (partial is-clause? :named)
    named
    UnnamedAggregation))


;;; ---------------------------------------------------- Order-By ----------------------------------------------------

;; order-by is just a series of `[<direction> <field>]` clauses like
;;
;;    {:order-by [[:asc [:field-id 1]], [:desc [:field-id 2]]]}
;;
;; Field ID is implicit in these clauses

(defclause asc,  field FieldOrAggregationReference)
(defclause desc, field FieldOrAggregationReference)

(def OrderBy
  "Schema for an `order-by` clause subclause."
  (one-of asc desc))


;;; ----------------------------------------------------- Filter -----------------------------------------------------

(declare Filter)

(defclause and
  first-clause  (s/recursive #'Filter)
  second-clause (s/recursive #'Filter)
  other-clauses (rest (s/recursive #'Filter)))

(defclause or
  first-clause  (s/recursive #'Filter)
  second-clause (s/recursive #'Filter)
  other-clauses (rest (s/recursive #'Filter)))

(defclause not, clause (s/recursive #'Filter))

(def ^:private FieldOrRelativeDatetime
  (s/if (partial is-clause? :relative-datetime)
   relative-datetime
   Field))

(def ^:private EqualityComparible
  "Schema for things things that make sense in a `=` or `!=` filter, i.e. things that can be compared for equality."
  (s/maybe
   (s/cond-pre
    s/Bool
    s/Num
    s/Str
    DatetimeLiteral
    FieldOrRelativeDatetime
    value)))

(def ^:private OrderComparible
  "Schema for things that make sense in a filter like `>` or `<`, i.e. things that can be sorted."
  (s/if (partial is-clause? :value)
    value
    (s/cond-pre
     s/Num
     s/Str
     DatetimeLiteral
     FieldOrRelativeDatetime)))

;; For all of the non-compound Filter clauses below the first arg is an implicit Field ID

;; These are SORT OF SUGARY, because extra values will automatically be converted a compound clauses. Driver
;; implementations only need to handle the 2-arg forms.
;;
;; `=` works like SQL `IN` with more than 2 args
;; [:= [:field-id 1] 2 3] --[DESUGAR]--> [:or [:= [:field-id 1] 2] [:= [:field-id 1] 3]]
;;
;; `!=` works like SQL `NOT IN` with more than 2 args
;; [:!= [:field-id 1] 2 3] --[DESUGAR]--> [:and [:!= [:field-id 1] 2] [:!= [:field-id 1] 3]]

(defclause =,  field Field, value-or-field EqualityComparible, more-values-or-fields (rest EqualityComparible))
(defclause !=, field Field, value-or-field EqualityComparible, more-values-or-fields (rest EqualityComparible))

(defclause <,  field Field, value-or-field OrderComparible)
(defclause >,  field Field, value-or-field OrderComparible)
(defclause <=, field Field, value-or-field OrderComparible)
(defclause >=, field Field, value-or-field OrderComparible)

(defclause between field Field, min OrderComparible, max OrderComparible)

;; SUGAR CLAUSE: This is automatically written as a pair of `:between` clauses by the `:desugar` middleware.
(defclause ^:sugar inside
  lat-field Field
  lon-field Field
  lat-max   OrderComparible
  lon-min   OrderComparible
  lat-min   OrderComparible
  lon-max   OrderComparible)

;; SUGAR CLAUSES: These are rewritten as `[:= <field> nil]` and `[:not= <field> nil]` respectively
(defclause ^:sugar is-null,  field Field)
(defclause ^:sugar not-null, field Field)

(def ^:private StringFilterOptions
  {(s/optional-key :case-sensitive) s/Bool}) ; default true

(def ^:private StringOrField
  (s/cond-pre
   s/Str
   Field
   value))

(defclause starts-with, field Field, string-or-field StringOrField, options (optional StringFilterOptions))
(defclause ends-with,   field Field, string-or-field StringOrField, options (optional StringFilterOptions))
(defclause contains,    field Field, string-or-field StringOrField, options (optional StringFilterOptions))

;; SUGAR: this is rewritten as [:not [:contains ...]]
(defclause ^:sugar does-not-contain
  field Field, string-or-field StringOrField, options (optional StringFilterOptions))

(def ^:private TimeIntervalOptions
  ;; Should we include partial results for the current day/month/etc? Defaults to `false`; set this to `true` to
  ;; include them.
  {(s/optional-key :include-current) s/Bool}) ; default false

;; Filter subclause. Syntactic sugar for specifying a specific time interval.
;;
;; Return rows where datetime Field 100's value is in the current month
;;
;;    [:time-interval [:field-id 100] :current :month]
;;
;; Return rows where datetime Field 100's value is in the current month, including partial results for the
;; current day
;;
;;    [:time-interval [:field-id 100] :current :month {:include-current true}]
;;
;; SUGAR: This is automatically rewritten as a filter clause with a relative-datetime value
(defclause ^:sugar time-interval
  field   (one-of field-id fk-> field-literal)
  n       (s/cond-pre
           s/Int
           (s/enum :current :last :next))
  unit    RelativeDatetimeUnit
  options (optional TimeIntervalOptions))

;; A segment is a special `macro` that saves some pre-definied filter clause, e.g. [:segment 1]
;; this gets replaced by a normal Filter clause in MBQL macroexpansion
;;
;; It can also be used for GA, which looks something like `[:segment "gaid::-11"]`. GA segments aren't actually MBQL
;; segments and pass-thru to GA.
(defclause ^:sugar segment, segment-id (s/cond-pre su/IntGreaterThanZero su/NonBlankString))

(def Filter
  "Schema for a valid MBQL `:filter` clause."
  (one-of
   ;; filters drivers must implement
   and or not = != < > <= >= between starts-with ends-with contains
   ;; SUGAR filters drivers do not need to implement
   does-not-contain inside is-null not-null time-interval segment))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Queries                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------- Native [Inner] Query ----------------------------------------------

;; TODO - schemas for template tags and dimensions live in `metabase.query-processor.middleware.parameters.sql`. Move
;; them here when we get the chance.

(def ^:private TemplateTag
  s/Any) ; s/Any for now until we move over the stuff from the parameters middleware

(def ^:private NativeQuery
  "Schema for a valid, normalized native [inner] query."
  {:query                          s/Any
   (s/optional-key :template-tags) {su/NonBlankString TemplateTag}
   ;; collection (table) this query should run against. Needed for MongoDB
   (s/optional-key :collection)    (s/maybe su/NonBlankString)
   ;; other stuff gets added in my different bits of QP middleware to record bits of state or pass info around.
   ;; Everyone else can ignore them.
   s/Keyword                       s/Any})


;;; ----------------------------------------------- MBQL [Inner] Query -----------------------------------------------

(declare MBQLQuery)

(def ^:private SourceQuery
  "Schema for a valid value for a `:source-query` clause."
  (s/if :native
    ;; when using native queries as source queries the schema is exactly the same except use `:native` in place of
    ;; `:query` for reasons I do not fully remember (perhaps to make it easier to differentiate them from MBQL source
    ;; queries).
    (set/rename-keys NativeQuery {:query :native})
    (s/recursive #'MBQLQuery)))

(def JoinTableInfo
  "Schema for information about a JOIN (or equivalent) that should be performed, and how to do it.. This is added
  automatically by `resolve-joined-tables` middleware for `fk->` forms that are encountered."
  { ;; The alias we should use for the table
   :join-alias  su/NonBlankString
   ;; ID of the Table to JOIN against. Table will be present in the QP store
   :table-id    su/IntGreaterThanZero
   ;; ID of the Field of the Query's SOURCE TABLE to use for the JOIN
   ;; TODO - can `fk-field-id` and `pk-field-id` possibly be NAMES of FIELD LITERALS??
   :fk-field-id su/IntGreaterThanZero
   ;; ID of the Field on the Table we will JOIN (i.e., Table with `table-id`) to use for the JOIN
   :pk-field-id su/IntGreaterThanZero})

(def JoinQueryInfo
  "Schema for information about about a JOIN (or equivalent) that should be performed using a recursive MBQL or native
  query. "
  {:join-alias su/NonBlankString
   ;; TODO - put a proper schema in here once I figure out what it is. I think it's (s/recursive #'Query)?
   :query      s/Any})

(def JoinInfo
  "Schema for information about a JOIN (or equivalent) that needs to be performed, either `JoinTableInfo` or
  `JoinQueryInfo`."
  (s/if :query
    JoinQueryInfo
    JoinTableInfo))

(def ^java.util.regex.Pattern source-table-card-id-regex
  "Pattern that matches `card__id` strings that can be used as the `:source-table` of MBQL queries."
  #"^card__[1-9]\d*$")

(def SourceTable
  "Schema for a valid value for the `:source-table` clause of an MBQL query."
  (s/cond-pre su/IntGreaterThanZero source-table-card-id-regex))

(defn- distinct-non-empty [schema]
  (s/constrained schema (every-pred (partial apply distinct?) seq) "non-empty sequence of distinct items"))

(def MBQLQuery
  "Schema for a valid, normalized MBQL [inner] query."
  (s/constrained
   {(s/optional-key :source-query) SourceQuery
    (s/optional-key :source-table) SourceTable
    (s/optional-key :aggregation)  (su/non-empty [Aggregation])
    (s/optional-key :breakout)     (su/non-empty [Field])
    (s/optional-key :expressions)  {s/Keyword ExpressionDef} ; TODO - I think expressions keys should be strings
    (s/optional-key :fields)       (su/non-empty [Field])    ; TODO - should this be `distinct-non-empty`?
    (s/optional-key :filter)       Filter
    (s/optional-key :limit)        su/IntGreaterThanZero
    (s/optional-key :order-by)     (distinct-non-empty [OrderBy])
    (s/optional-key :page)         {:page  su/IntGreaterThanOrEqualToZero
                                    :items su/IntGreaterThanZero}
    ;; Various bits of middleware add additonal keys, such as `fields-is-implicit?`, to record bits of state or pass
    ;; info to other pieces of middleware. Everyone else can ignore them.
    (s/optional-key :join-tables)  (s/constrained [JoinInfo] (partial apply distinct?) "distinct JoinInfo")
    s/Keyword                      s/Any}
   (fn [query]
     (core/= 1 (core/count (select-keys query [:source-query :source-table]))))
   "Query must specify either `:source-table` or `:source-query`, but not both."))


;;; ----------------------------------------------------- Params -----------------------------------------------------

(def ^:private Parameter
  "Schema for a valid, normalized query parameter."
  s/Any) ; s/Any for now until we move over the stuff from the parameters middleware


;;; ---------------------------------------------------- Options -----------------------------------------------------

(def ^:private Settings
  "Options that tweak the behavior of the query processor."
  ;; The timezone the query should be ran in, overriding the default report timezone for the instance.
  {(s/optional-key :report-timezone) su/NonBlankString
   ;; other Settings might be used somewhere, but I don't know about them. Add them if you come across them for
   ;; documentation purposes
   s/Keyword                         s/Any})

(def ^:private Constraints
  "Additional constraints added to a query limiting the maximum number of rows that can be returned. Mostly useful
  because native queries don't support the MBQL `:limit` clause. For MBQL queries, if `:limit` is set, it will
  override these values."
  {;; maximum number of results to allow for a query with aggregations
   (s/optional-key :max-results)           su/IntGreaterThanOrEqualToZero
   ;; maximum number of results to allow for a query with no aggregations
   (s/optional-key :max-results-bare-rows) su/IntGreaterThanOrEqualToZero
   ;; other Constraints might be used somewhere, but I don't know about them. Add them if you come across them for
   ;; documentation purposes
   s/Keyword                               s/Any})

(def ^:private MiddlewareOptions
  "Additional options that can be used to toggle middleware on or off."
  {;; should we skip adding results_metadata to query results after running the query? Used by
   ;; `metabase.query-processor.middleware.results-metadata`; default `false`
   (s/optional-key :skip-results-metadata?) s/Bool
   ;; should we skip converting datetime types to ISO-8601 strings with appropriate timezone when post-processing
   ;; results? Used by `metabase.query-processor.middleware.format-rows`; default `false`
   (s/optional-key :format-rows?)           s/Bool
   ;; disable the MBQL->native middleware. If you do this, the query will not work at all, so there are no cases where
   ;; you should set this yourself. This is only used by the `qp/query->preprocessed` function to get the fully
   ;; pre-processed query without attempting to convert it to native.
   (s/optional-key :disable-mbql->native?)  s/Bool
   ;; other middleware options might be used somewhere, but I don't know about them. Add them if you come across them
   ;; for documentation purposes
   s/Keyword                                s/Any})


;;; ------------------------------------------------------ Info ------------------------------------------------------

;; This stuff is used for informational purposes, primarily to record QueryExecution entries when a query is ran. Pass
;; them along if applicable when writing code that creates queries, but when working on middleware and the like you
;; can most likely ignore this stuff entirely.

(def Context
  "Schema for `info.context`; used for informational purposes to record how a query was executed."
  (s/enum :ad-hoc
          :csv-download
          :dashboard
          :embedded-dashboard
          :embedded-question
          :json-download
          :map-tiles
          :metabot
          :public-dashboard
          :public-question
          :pulse
          :question
          :xlsx-download))

(def Info
  "Schema for query `:info` dictionary, which is used for informational purposes to record information about how a query
  was executed in QueryExecution and other places. It is considered bad form for middleware to change its behavior
  based on this information, don't do it!"
  {;; These keys are nice to pass in if you're running queries on the backend and you know these values. They aren't
   ;; used for permissions checking or anything like that so don't try to be sneaky
   (s/optional-key :context)      (s/maybe Context)
   (s/optional-key :executed-by)  (s/maybe su/IntGreaterThanZero)
   (s/optional-key :card-id)      (s/maybe su/IntGreaterThanZero)
   (s/optional-key :dashboard-id) (s/maybe su/IntGreaterThanZero)
   (s/optional-key :pulse-id)     (s/maybe su/IntGreaterThanZero)
   (s/optional-key :nested?)      (s/maybe s/Bool)
   ;; `:hash` and `:query-type` get added automatically by `process-query-and-save-execution!`, so don't try passing
   ;; these in yourself. In fact, I would like this a lot better if we could take these keys out of `:info` entirely
   ;; and have the code that saves QueryExceutions figure out their values when it goes to save them
   (s/optional-key :query-hash)   (s/maybe (Class/forName "[B"))
   ;; TODO - this key is pointless since we can just look at `:type`; let's normalize it out and remove it entirely
   ;; when we get a chance
   (s/optional-key :query-type)   (s/enum "MBQL" "native")})

(def SourceQueryMetadata
  "Schema for the expected keys in metadata about source query columns if it is passed in to the query."
  ;; TODO - there is a very similar schema in `metabase.sync.analyze.query-results`; see if we can merge them
  {:name                          su/NonBlankString
   :display_name                  su/NonBlankString
   :base_type                     su/FieldType
   (s/optional-key :special_type) (s/maybe su/FieldType)
   ;; you'll need to provide this in order to use BINNING
   (s/optional-key :fingerprint)  (s/maybe su/Map)
   s/Any                          s/Any})


;;; --------------------------------------------- Metabase [Outer] Query ---------------------------------------------

(def Query
  "Schema for an [outer] query, e.g. the sort of thing you'd pass to the query processor or save in
  `Card.dataset_query`."
  (s/constrained
   ;; TODO - move database/virtual-id into this namespace so we don't have to use the magic number here
   {:database                         (s/cond-pre (s/eq -1337) su/IntGreaterThanZero)
    ;; Type of query. `:query` = MBQL; `:native` = native. TODO - consider normalizing `:query` to `:mbql`
    :type                             (s/enum :query :native)
    (s/optional-key :native)          NativeQuery
    (s/optional-key :query)           MBQLQuery
    (s/optional-key :parameters)      [Parameter]
    ;;
    ;; OPTIONS
    ;;
    ;; These keys are used to tweak behavior of the Query Processor.
    ;; TODO - can we combine these all into a single `:options` map?
    ;;
    (s/optional-key :settings)        (s/maybe Settings)
    (s/optional-key :constraints)     (s/maybe Constraints)
    (s/optional-key :middleware)      (s/maybe MiddlewareOptions)
    ;;
    ;; INFO
    ;;
    ;; Used when recording info about this run in the QueryExecution log; things like context query was ran in and
    ;; User who ran it
    (s/optional-key :info)            (s/maybe Info)
    ;; Info about the columns of the source query. Added in automatically by middleware. This metadata is primarily
    ;; used to let power things like binning when used with Field Literals instead of normal Fields
    (s/optional-key :source-metadata) (s/maybe [SourceQueryMetadata])
    #_:fk-field-ids
    #_:table-ids
    ;;
    ;; Other various keys get stuck in the query dictionary at some point or another by various pieces of QP
    ;; middleware to record bits of state. Everyone else can ignore them.
    s/Keyword                         s/Any}
   (fn [{native :native, mbql :query, query-type :type}]
     (case query-type
       :native (core/and native (core/not mbql))
       :query  (core/and mbql   (core/not native))))
   "Native queries should specify `:native` but not `:query`; MBQL queries should specify `:query` but not `:native`."))


;;; --------------------------------------------------- Validators ---------------------------------------------------

(def ^{:arglists '([query])} validate-query
  "Compiled schema validator for an [outer] Metabase query. (Pre-compling a validator is more efficient; use this
  instead of calling `(s/validate Query query)` or similar."
  (s/validator Query))
