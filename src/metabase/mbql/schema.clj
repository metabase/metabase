(ns metabase.mbql.schema
  "Schema for validating a *normalized* MBQL query. This is also the definitive grammar for MBQL, wow!"
  (:refer-clojure :exclude [count distinct min max + - / * and or not = < > <= >=])
  (:require [clojure
             [core :as core]
             [set :as set]]
            [metabase.mbql.schema.helpers :refer [defclause is-clause? one-of]]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  MBQL Clauses                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------- Datetime Stuff -------------------------------------------------

(def ^:private DatetimeFieldUnit
  (s/named
   (apply s/enum #{:default :minute :minute-of-hour :hour :hour-of-day :day :day-of-week :day-of-month :day-of-year
                   :week :week-of-year :month :month-of-year :quarter :quarter-of-year :year})
   "datetime-unit"))

(def ^:private RelativeDatetimeUnit
  (s/named
   (apply s/enum #{:minute :hour :day :week :month :quarter :year})
   "relative-datetime-unit"))

(def ^:private LiteralDatetimeString
  "Schema for an MBQL datetime string literal, in ISO-8601 format."
  (s/constrained su/NonBlankString du/date-string? "datetime-literal"))

(defclause relative-datetime
  n    (s/cond-pre (s/eq :current) s/Int)
  unit (optional RelativeDatetimeUnit))

(def ^:private DatetimeLiteral
  "Schema for valid absoulute datetime literals."
  (s/cond-pre
   LiteralDatetimeString
   java.sql.Date
   java.util.Date))


;;; ----------------------------------------------------- Fields -----------------------------------------------------

;; Normal lowest-level Field clauses refer to a Field either by ID or by name

(defclause field-id, id su/IntGreaterThanZero)

(defclause field-literal, field-name su/NonBlankString, field-type su/FieldType)

;; Both args in `[:fk-> <source-field> <dest-field>]` are implict `:field-ids`. E.g.
;;
;;   [:fk-> 10 20] --[NORMALIZE]--> [:fk-> [:field-id 10] [:field-id 20]]
(defclause fk->
  source-field (one-of field-id field-literal)
  dest-field   (one-of field-id field-literal))

;; Expression *references* refer to a something in the `:expressions` clause, e.g. something like `[:+ [:field-id 1]
;; [:field-id 2]]`
(defclause expression, expression-name su/NonBlankString)

;; Datetime Field can wrap any of the lowest-level Field clauses or expression references, but not other
;; datetime-field clauses, because that wouldn't make sense
;;
;; Field is an implicit Field ID
(defclause datetime-field
  field (one-of field-id field-literal fk-> expression)
  unit  DatetimeFieldUnit)

;; binning strategy can wrap any of the above clauses, but again, not another binning strategy clause
(def ^:private BinningStrategyName
  (s/enum :num-bins :bin-width :default))

(defclause binning-strategy
  field                     (one-of field-id field-literal fk-> expression datetime-field)
  strategy-name             BinningStrategyName
  strategy-param            (optional s/Num))

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

(declare ExpressionDef)

(def ^:private ExpressionArg
  (s/conditional
   number?
   s/Num

   (partial is-clause? #{:+ :- :/ :*})
   (s/recursive #'ExpressionDef)

   :else
   Field))

(defclause +, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))
(defclause -, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))
(defclause /, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))
(defclause *, x ExpressionArg, y ExpressionArg, more (rest ExpressionArg))

(def ^:private ExpressionDef
  (one-of + - / *))


;;; -------------------------------------------------- Aggregations --------------------------------------------------

(def ^:private FieldOrExpressionDef
  (s/if (partial is-clause? #{:+ :- :* :/})
    ExpressionDef
    Field))

;; For all of the 'normal' Aggregations below (excluding Metrics) fields are implicit Field IDs

(defclause count,     field (optional Field))
(defclause cum-count, field (optional Field))

;; technically aggregations besides count can also accept expressions as args, e.g.
;;
;;    [[:sum [:+ [:field-id 1] [:field-id 2]]]]
;;
;; Which is equivalent to SQL:
;;
;;    SUM(field_1 + field_2)

(defclause avg,       field-or-expression FieldOrExpressionDef)
(defclause cum-sum,   field-or-expression FieldOrExpressionDef)
(defclause distinct,  field-or-expression FieldOrExpressionDef)
(defclause stddev,    field-or-expression FieldOrExpressionDef)
(defclause sum,       field-or-expression FieldOrExpressionDef)
(defclause min,       field-or-expression FieldOrExpressionDef)
(defclause max,       field-or-expression FieldOrExpressionDef)

;; Metrics are just 'macros' (placeholders for other aggregations with optional filter and breakout clauses) that get
;; expanded to other aggregations/etc. in the expand-macros middleware
;;
;; METRICS WITH STRING IDS, e.g. `[:metric "ga:sessions"]`, are Google Analytics metrics, not Metabase metrics! They
;; pass straight thru to the GA query processor.
(defclause metric, metric-id (s/cond-pre su/IntGreaterThanZero su/NonBlankString))

;; the following are definitions for expression aggregations, e.g. [:+ [:sum [:field-id 10]] [:sum [:field-id 20]]]

(declare UnnamedAggregation)

(def ^:private ExpressionAggregationArg
  (s/if number?
    s/Num
    (s/recursive #'UnnamedAggregation)))

(defclause [ag:+   +],  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))
(defclause [ag:-   -],  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))
(defclause [ag:*   *],  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))
(defclause [ag:div /],  x ExpressionAggregationArg, y ExpressionAggregationArg, more (rest ExpressionAggregationArg))
;; ag:/ isn't a valid token

(def ^:private UnnamedAggregation
  (one-of count avg cum-count cum-sum distinct stddev sum min max ag:+ ag:- ag:* ag:div metric))

;; any sort of aggregation can be wrapped in a `[:named <ag> <custom-name>]` clause, but you cannot wrap a `:named` in
;; a `:named`

(defclause named, aggregation UnnamedAggregation, aggregation-name su/NonBlankString)

(def ^:private Aggregation
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
    FieldOrRelativeDatetime)))

(def ^:private OrderComparible
  "Schema for things that make sense in a filter like `>` or `<`, i.e. things that can be sorted."
  (s/cond-pre
   s/Num
   DatetimeLiteral
   FieldOrRelativeDatetime))

;; For all of the non-compound Filter clauses below the first arg is an implicit Field ID

(defclause =,  field Field, value-or-field EqualityComparible, more-values-or-fields (rest EqualityComparible))
(defclause !=, field Field, value-or-field EqualityComparible, more-values-or-fields (rest EqualityComparible))

(defclause <,  field Field, value-or-field OrderComparible)
(defclause >,  field Field, value-or-field OrderComparible)
(defclause <=, field Field, value-or-field OrderComparible)
(defclause >=, field Field, value-or-field OrderComparible)

(defclause between field Field, min OrderComparible, max OrderComparible)

(defclause inside
  lat-field Field
  lon-field Field
  lat-max   OrderComparible
  lon-min   OrderComparible
  lat-min   OrderComparible
  lon-max   OrderComparible)

(defclause is-null,  field Field)
(defclause not-null, field Field)

(def ^:private StringFilterOptions
  {(s/optional-key :case-sensitive) s/Bool}) ; default true

(def ^:private StringOrField
  (s/cond-pre
   s/Str
   Field))

(defclause starts-with,      field Field, string-or-field StringOrField, options (optional StringFilterOptions))
(defclause ends-with,        field Field, string-or-field StringOrField, options (optional StringFilterOptions))
(defclause contains,         field Field, string-or-field StringOrField, options (optional StringFilterOptions))
(defclause does-not-contain, field Field, string-or-field StringOrField, options (optional StringFilterOptions))

(def ^:private TimeIntervalOptions
  {(s/optional-key :include-current) s/Bool}) ; default false

(defclause time-interval
  field   Field
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
(defclause segment, segment-id (s/cond-pre su/IntGreaterThanZero su/NonBlankString))

(def Filter
  "Schema for a valid MBQL `:filter` clause."
  (one-of and or not = != < > <= >= between inside is-null not-null starts-with ends-with contains does-not-contain
          time-interval segment))


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

(def MBQLQuery
  "Schema for a valid, normalized MBQL [inner] query."
  (s/constrained
   {(s/optional-key :source-query) SourceQuery
    (s/optional-key :source-table) (s/cond-pre su/IntGreaterThanZero #"^card__[1-9]\d*$")
    (s/optional-key :aggregation)  (su/non-empty [Aggregation])
    (s/optional-key :breakout)     (su/non-empty [Field])
    (s/optional-key :expressions)  {s/Keyword ExpressionDef} ; TODO - I think expressions keys should be strings
    (s/optional-key :fields)       (su/non-empty [Field])
    (s/optional-key :filter)       Filter
    (s/optional-key :limit)        su/IntGreaterThanZero
    (s/optional-key :order-by)     (su/non-empty [OrderBy])
    (s/optional-key :page)         {:page  su/IntGreaterThanOrEqualToZero
                                    :items su/IntGreaterThanZero}
    ;; Various bits of middleware add additonal keys, such as `fields-is-implicit?`, to record bits of state or pass
    ;; info to other pieces of middleware. Everyone else can ignore them.
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


;;; --------------------------------------------- Metabase [Outer] Query ---------------------------------------------

(def Query
  "Schema for an [outer] query, e.g. the sort of thing you'd pass to the query processor or save in
  `Card.dataset_query`."
  (s/constrained
   ;; TODO - move database/virtual-id into this namespace so we don't have to use the magic number here
   {:database                     (s/cond-pre (s/eq -1337) su/IntGreaterThanZero)
    ;; Type of query. `:query` = MBQL; `:native` = native. TODO - consider normalizing `:query` to `:mbql`
    :type                         (s/enum :query :native)
    (s/optional-key :native)      NativeQuery
    (s/optional-key :query)       MBQLQuery
    (s/optional-key :parameters)  [Parameter]
    ;;
    ;; OPTIONS
    ;;
    ;; These keys are used to tweak behavior of the Query Processor.
    ;; TODO - can we combine these all into a single `:options` map?
    ;;
    (s/optional-key :settings)    (s/maybe Settings)
    (s/optional-key :constraints) (s/maybe Constraints)
    (s/optional-key :middleware)  (s/maybe MiddlewareOptions)
    ;;
    ;; INFO
    ;;
    ;; Used when recording info about this run in the QueryExecution log; things like context query was ran in and
    ;; User who ran it
    (s/optional-key :info)        (s/maybe Info)
    ;; Other various keys get stuck in the query dictionary at some point or another by various pieces of QP
    ;; middleware to record bits of state. Everyone else can ignore them.
    s/Keyword                     s/Any}
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
