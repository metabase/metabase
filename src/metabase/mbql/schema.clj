(ns metabase.mbql.schema
  "Schema for validating a *normalized* MBQL query. This is also the definitive grammar for MBQL, wow!"
  (:refer-clojure :exclude [count distinct min max + - / * and or not = < > <= >=])
  (:require [clojure.core :as core]
            [metabase.mbql.schema.helpers :refer [defclause is-clause? one-of]]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s]))

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
(defclause aggregation, aggregation-clause-index s/Int)

(def ^:private FieldOrAggregationReference
  (s/if (partial is-clause? :aggregation)
    aggregation
    Field))


;;; ------------------------------------------------------- Ag -------------------------------------------------------

;; For all of the 'normal' Aggregations below (excluding Metrics) fields are implicit Field IDs

(defclause count,     field (optional Field))
(defclause avg,       field Field)
(defclause cum-count, field (optional Field))
(defclause cum-sum,   field Field)
(defclause distinct,  field Field)
(defclause stddev,    field Field)
(defclause sum,       field Field)
(defclause min,       field Field)
(defclause max,       field Field)

;; Metrics are just 'macros' (placeholders for other aggregations with optional filter and breakout clauses) that get
;; expanded to other aggregations/etc. in the expand-macros middleware
(defclause metric, metric-id su/IntGreaterThanZero) ; TODO - what about GA metrics? This should actually maybe be s/Any

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

(def ^:private OrderBy
  (one-of asc desc))

;;; -------------------------------------------------- Expressions ---------------------------------------------------

(declare ExpressionDef)

(def ^:private ExpressionArg
  (s/conditional
   number?
   s/Num

   (every-pred vector? #{:+ :- :/ :*})
   (s/recursive #'ExpressionDef)

   :else
   Field))

(defclause +, x ExpressionArg, y ExpressionArg)
(defclause -, x ExpressionArg, y ExpressionArg)
(defclause /, x ExpressionArg, y ExpressionArg)
(defclause *, x ExpressionArg, y ExpressionArg)

(def ^:private ExpressionDef
  (one-of + - / *))


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
(defclause segment, segment-id su/IntGreaterThanZero)

(def Filter
  "Schema for a valid MBQL `:filter` clause."
  (one-of and or not = != < > <= >= between inside is-null not-null starts-with ends-with contains does-not-contain
          time-interval segment))


;;; ----------------------------------------------------- Query ------------------------------------------------------

(declare MBQLQuery)

;; TODO - schemas for template tags and dimensions live in `metabase.query-processor.middleware.parameters.sql`. Move
;; them here when we get the chance.

(def ^:private TemplateTag
  s/Any) ; s/Any for now until we move over the stuff from the parameters middleware

(def NativeQuery
  "Schema for a valid, normalized native [inner] query."
  {:native                         s/Any
   (s/optional-key :template-tags) {su/NonBlankString TemplateTag}})


(def ^:private SourceQuery
  "Schema for a valid value for a `:source-query` clause."
  (s/if :native
    NativeQuery
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
                                    :items su/IntGreaterThanZero}}
   (fn [query]
     (core/= 1 (core/count (select-keys query [:source-query :source-table]))))
   "Query must specify either `:source-table` or `:source-query`, but not both."))

(def ^:private Parameter
  "Schema for a valid, normalized query parameter."
  s/Any) ; s/Any for now until we move over the stuff from the parameters middleware

(def ^:private Constraints
  {(s/optional-key :max-results)           su/IntGreaterThanOrEqualToZero
   (s/optional-key :max-results-bare-rows) su/IntGreaterThanOrEqualToZero})

(def Query
  "Schema for an [outer] query, e.g. the sort of thing you'd pass to the query processor or save in
  `Card.dataset_query`."
  (s/constrained
   ;; TODO - move database/virtual-id into this namespace so we don't have to use the magic number here
   {:database                     (s/cond-pre (s/eq -1337) su/IntGreaterThanZero)
    :type                         (s/enum :query :native) ; TODO - consider normalizing `:query` -> `:mbql`
    (s/optional-key :native)      NativeQuery
    (s/optional-key :query)       MBQLQuery
    (s/optional-key :parameters)  [Parameter]
    #_(s/optional-key :enable_embbeding) #_s/Bool
    #_(s/optional-key :embedding_params) #_{s/Keyword (s/enum :enabled :disabled :locked)}
    #_:settings
    #_:driver ;; (?)
    (s/optional-key :constraints) Constraints
    }
   (fn [{native :native, mbql :query, query-type :type}]
     (case query-type
       :native (core/and native (core/not mbql))
       :query  (core/and mbql   (core/not native))))
   "Native queries should specify `:native` but not `:query`; MBQL queries should specify `:query` but not `:native`."))
