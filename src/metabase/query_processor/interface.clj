(ns metabase.query-processor.interface
  "Definitions of `Field`, `Value`, and other record types present in an expanded query.
   This namespace should just contain definitions of various protocols and record types; associated logic
   should go in `metabase.query-processor.expand`."
  (:require [metabase.models.field :as field]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import clojure.lang.Keyword
           java.sql.Timestamp))

;;; # ------------------------------------------------------------ CONSTANTS ------------------------------------------------------------

(def ^:const absolute-max-results
  "Maximum number of rows the QP should ever return.

   This is coming directly from the max rows allowed by Excel for now ...
   https://support.office.com/en-nz/article/Excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3"
  1048576)


;;; # ------------------------------------------------------------ DYNAMIC VARS ------------------------------------------------------------

(def ^:dynamic ^Boolean *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)


(def ^:dynamic *driver*
  "The driver that will be used to run the query we are currently parsing.
   Used by `assert-driver-supports` and other places.
   Always bound when running queries the normal way, e.g. via `metabase.driver/process-query`.
   Not neccesarily bound when using various functions like `fk->` in the REPL."
  nil)

;; `assert-driver-supports` doesn't run check when `*driver*` is unbound (e.g., when used in the REPL)
;; Allows flexibility when composing queries for tests or interactive development
(defn assert-driver-supports
  "When `*driver*` is bound, assert that is supports keyword FEATURE."
  [feature]
  (when *driver*
    (when-not (contains? ((resolve 'metabase.driver/features) *driver*) feature)
      (throw (Exception. (str (name feature) " is not supported by this driver."))))))

;; Expansion Happens in a Few Stages:
;; 1. A query dict is parsed via pattern-matching code in the Query Expander.
;;    field IDs and values are replaced with FieldPlaceholders and ValuePlaceholders, respectively.
;; 2. Relevant Fields and Tables are fetched from the DB, and the placeholder objects are "resolved"
;;    and replaced with objects like Field, Value, etc.

;;; # ------------------------------------------------------------ JOINING OBJECTS ------------------------------------------------------------

;; These are just used by the QueryExpander to record information about how joins should occur.

(s/defrecord JoinTableField [field-id   :- su/IntGreaterThanZero
                             field-name :- su/NonBlankString])

(s/defrecord JoinTable [source-field :- JoinTableField
                        pk-field     :- JoinTableField
                        table-id     :- su/IntGreaterThanZero
                        table-name   :- su/NonBlankString
                        schema       :- (s/maybe su/NonBlankString)
                        join-alias   :- su/NonBlankString])

;;; # ------------------------------------------------------------ PROTOCOLS ------------------------------------------------------------

(defprotocol IField
  "Methods specific to the Query Expander `Field` record type."
  (qualified-name-components [this]
    "Return a vector of name components of the form `[table-name parent-names... field-name]`"))


;;; # ------------------------------------------------------------ "RESOLVED" TYPES: FIELD + VALUE ------------------------------------------------------------

;; Field is the expansion of a Field ID in the standard QL
(s/defrecord Field [field-id           :- su/IntGreaterThanZero
                    field-name         :- su/NonBlankString
                    field-display-name :- su/NonBlankString
                    base-type          :- su/FieldType
                    special-type       :- (s/maybe su/FieldType)
                    visibility-type    :- (apply s/enum field/visibility-types)
                    table-id           :- su/IntGreaterThanZero
                    schema-name        :- (s/maybe su/NonBlankString)
                    table-name         :- (s/maybe su/NonBlankString) ; TODO - Why is this `maybe` ?
                    position           :- (s/maybe su/IntGreaterThanZero)
                    fk-field-id        :- (s/maybe s/Int)
                    description        :- (s/maybe su/NonBlankString)
                    parent-id          :- (s/maybe su/IntGreaterThanZero)
                    ;; Field once its resolved; FieldPlaceholder before that
                    parent             :- s/Any]
  clojure.lang.Named
  (getName [_] field-name) ; (name <field>) returns the *unqualified* name of the field, #obvi

  IField
  (qualified-name-components [this]
    (conj (if parent
            (qualified-name-components parent)
            [table-name])
          field-name)))


(def ^:const datetime-field-units
  "Valid units for a `DateTimeField`."
  #{:default :minute :minute-of-hour :hour :hour-of-day :day :day-of-week :day-of-month :day-of-year
    :week :week-of-year :month :month-of-year :quarter :quarter-of-year :year})

(def ^:const relative-datetime-value-units
  "Valid units for a `RelativeDateTimeValue`."
  #{:minute :hour :day :week :month :quarter :year})

(def DatetimeFieldUnit "Schema for datetime units that are valid for `DateTimeField` forms." (s/named (apply s/enum datetime-field-units)          "Valid datetime unit for a field"))
(def DatetimeValueUnit "Schema for datetime units that valid for relative datetime values."  (s/named (apply s/enum relative-datetime-value-units) "Valid datetime unit for a relative datetime"))

(defn datetime-field-unit?
  "Is UNIT a valid datetime unit for a `DateTimeField` form?"
  [unit]
  (contains? datetime-field-units (keyword unit)))

(defn relative-datetime-value-unit?
  "Is UNIT a valid datetime unit for a `RelativeDateTimeValue` form?"
  [unit]
  (contains? relative-datetime-value-units (keyword unit)))


;; wrapper around Field
(s/defrecord DateTimeField [field :- Field
                            unit  :- DatetimeFieldUnit]
  clojure.lang.Named
  (getName [_] (name field)))

(s/defrecord ExpressionRef [expression-name :- su/NonBlankString]
  clojure.lang.Named
  (getName [_] expression-name)
  IField
  (qualified-name-components [_]
    [nil expression-name]))


;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
(s/defrecord Value [value   :- (s/maybe (s/cond-pre s/Bool s/Num su/NonBlankString))
                    field   :- (s/named (s/cond-pre Field ExpressionRef)   ; TODO - Value doesn't need the whole field, just the relevant type info / units
                                        "field or expression reference")])

;; e.g. an absolute point in time (literal)
(s/defrecord DateTimeValue [value :- Timestamp
                            field :- DateTimeField])

(s/defrecord RelativeDateTimeValue [amount :- s/Int
                                    unit   :- DatetimeValueUnit
                                    field  :- DateTimeField])

(defprotocol ^:private IDateTimeValue
  (unit [this]
    "Get the `unit` associated with a `DateTimeValue` or `RelativeDateTimeValue`.")

  (add-date-time-units [this n]
    "Return a new `DateTimeValue` or `RelativeDateTimeValue` with N `units` added to it."))

(extend-protocol IDateTimeValue
  DateTimeValue
  (unit                [this]   (:unit (:field this)))
  (add-date-time-units [this n] (assoc this :value (u/relative-date (unit this) n (:value this))))

  RelativeDateTimeValue
  (unit                [this]   (:unit this))
  (add-date-time-units [this n] (update this :amount (partial + n))))


;;; # ------------------------------------------------------------ PLACEHOLDER TYPES: FIELDPLACEHOLDER + VALUEPLACEHOLDER ------------------------------------------------------------

;; Replace Field IDs with these during first pass
(s/defrecord FieldPlaceholder [field-id      :- su/IntGreaterThanZero
                               fk-field-id   :- (s/maybe (s/constrained su/IntGreaterThanZero
                                                                        (fn [_] (or (assert-driver-supports :foreign-keys) true))
                                                                        "foreign-keys is not supported by this driver."))
                               datetime-unit :- (s/maybe (apply s/enum datetime-field-units))])

(s/defrecord AgFieldRef [index :- s/Int])

;; TODO - add a method to get matching expression from the query?

(def FieldPlaceholderOrAgRef
  "Schema for either a `FieldPlaceholder` or `AgFieldRef`."
  (s/named (s/cond-pre FieldPlaceholder AgFieldRef) "Valid field (not a field ID or aggregate field reference)"))

(def FieldPlaceholderOrExpressionRef
  "Schema for either a `FieldPlaceholder` or `ExpressionRef`."
  (s/named (s/cond-pre FieldPlaceholder ExpressionRef)
           "Valid field or expression reference."))


(s/defrecord RelativeDatetime [amount :- s/Int
                               unit   :- DatetimeValueUnit])


(declare RValue Aggregation)

(def ^:private ExpressionOperator (s/named (s/enum :+ :- :* :/) "Valid expression operator"))

(s/defrecord Expression [operator   :- ExpressionOperator
                         args       :- [(s/cond-pre (s/recursive #'RValue)
                                                    (s/recursive #'Aggregation))]
                         custom-name :- (s/maybe su/NonBlankString)])

(def AnyFieldOrExpression
  "Schema for a `FieldPlaceholder`, `AgRef`, or `Expression`."
  (s/named (s/cond-pre ExpressionRef Expression FieldPlaceholderOrAgRef)
           "Valid field, ag field reference, expression, or expression reference."))


(def LiteralDatetimeString
  "Schema for an MBQL datetime string literal, in ISO-8601 format."
  (s/constrained su/NonBlankString u/date-string? "Valid ISO-8601 datetime string literal"))

(def LiteralDatetime
  "Schema for an MBQL literal datetime value: and ISO-8601 string or `java.sql.Date`."
  (s/named (s/cond-pre java.sql.Date LiteralDatetimeString) "Valid datetime literal (must be ISO-8601 string or java.sql.Date)"))

(def Datetime
  "Schema for an MBQL datetime value: an ISO-8601 string, `java.sql.Date`, or a relative dateitme form."
  (s/named (s/cond-pre RelativeDatetime LiteralDatetime) "Valid datetime (must ISO-8601 string literal or a relative-datetime form)"))

(def OrderableValue
  "Schema for something that is orderable value in MBQL (either a number or datetime)."
  (s/named (s/cond-pre s/Num Datetime) "Valid orderable value (must be number or datetime)"))

(def AnyValue
  "Schema for anything that is a considered a valid value in MBQL - `nil`, a `Boolean`, `Number`, `String`, or relative datetime form."
  (s/named (s/maybe (s/cond-pre s/Bool su/NonBlankString OrderableValue)) "Valid value (must be nil, boolean, number, string, or a relative-datetime form)"))

;; Replace values with these during first pass over Query.
;; Include associated Field ID so appropriate the info can be found during Field resolution
(s/defrecord ValuePlaceholder [field-placeholder :- FieldPlaceholderOrExpressionRef
                               value             :- AnyValue])

(def OrderableValuePlaceholder
  "`ValuePlaceholder` schema with the additional constraint that the value be orderable (a number or datetime)."
  (s/constrained ValuePlaceholder (comp (complement (s/checker OrderableValue)) :value) ":value must be orderable (number or datetime)"))

(def StringValuePlaceholder
  "`ValuePlaceholder` schema with the additional constraint that the value be a string/"
  (s/constrained ValuePlaceholder (comp string? :value) ":value must be a string"))

(def FieldOrAnyValue
  "Schema that accepts either a `FieldPlaceholder` or `ValuePlaceholder`."
  (s/named (s/cond-pre FieldPlaceholder ValuePlaceholder) "Field or value"))

;; (def FieldOrOrderableValue (s/named (s/cond-pre FieldPlaceholder OrderableValuePlaceholder) "Field or orderable value (number or datetime)"))
;; (def FieldOrStringValue    (s/named (s/cond-pre FieldPlaceholder StringValuePlaceholder)    "Field or string literal"))

(def RValue
  "Schema for anything that can be an [RValue](https://github.com/metabase/metabase/wiki/Query-Language-'98#rvalues) -
   a `Field`, `Value`, or `Expression`."
  (s/named (s/cond-pre AnyValue FieldPlaceholderOrExpressionRef Expression)
           "RValue"))


;;; # ------------------------------------------------------------ CLAUSE SCHEMAS ------------------------------------------------------------

(s/defrecord AggregationWithoutField [aggregation-type :- (s/named (s/enum :count :cumulative-count)
                                                                   "Valid aggregation type")
                                      custom-name      :- (s/maybe su/NonBlankString)])

(s/defrecord AggregationWithField [aggregation-type :- (s/named (s/enum :avg :count :cumulative-sum :distinct :max :min :stddev :sum)
                                                                "Valid aggregation type")
                                   field            :- (s/cond-pre FieldPlaceholderOrExpressionRef
                                                                   Expression)
                                   custom-name      :- (s/maybe su/NonBlankString)])

(defn- valid-aggregation-for-driver? [{:keys [aggregation-type]}]
  (when (= aggregation-type :stddev)
    (assert-driver-supports :standard-deviation-aggregations))
  true)

(def Aggregation
  "Schema for an `aggregation` subclause in an MBQL query."
  (s/constrained
   (s/cond-pre AggregationWithField AggregationWithoutField Expression)
   valid-aggregation-for-driver?
   "standard-deviation-aggregations is not supported by this driver."))


(s/defrecord EqualityFilter [filter-type :- (s/enum := :!=)
                             field       :- FieldPlaceholderOrExpressionRef
                             value       :- FieldOrAnyValue])

(s/defrecord ComparisonFilter [filter-type :- (s/enum :< :<= :> :>=)
                               field       :- FieldPlaceholderOrExpressionRef
                               value       :- OrderableValuePlaceholder])

(s/defrecord BetweenFilter [filter-type  :- (s/eq :between)
                            min-val      :- OrderableValuePlaceholder
                            field        :- FieldPlaceholderOrExpressionRef
                            max-val      :- OrderableValuePlaceholder])

(s/defrecord StringFilter [filter-type :- (s/enum :starts-with :contains :ends-with)
                           field       :- FieldPlaceholderOrExpressionRef
                           value       :- StringValuePlaceholder])

(def SimpleFilterClause
  "Schema for a non-compound, non-`not` MBQL `filter` clause."
  (s/named (s/cond-pre EqualityFilter ComparisonFilter BetweenFilter StringFilter)
           "Simple filter clause"))

(s/defrecord NotFilter [compound-type :- (s/eq :not)
                        subclause     :- SimpleFilterClause])

(declare Filter)

(s/defrecord CompoundFilter [compound-type :- (s/enum :and :or)
                             subclauses    :- [(s/recursive #'Filter)]])

(def Filter
  "Schema for top-level `filter` clause in an MBQL query."
  (s/named (s/cond-pre SimpleFilterClause NotFilter CompoundFilter)
           "Valid filter clause"))

(def OrderByDirection
  "Schema for the direction in an `OrderBy` subclause."
  (s/named (s/enum :ascending :descending) "Valid order-by direction"))

(def OrderBy
  "Schema for top-level `order-by` clause in an MBQL query."
  (s/named {:field     AnyFieldOrExpression
            :direction OrderByDirection}
           "Valid order-by subclause"))


(def Page
  "Schema for the top-level `page` clause in a MBQL query."
  (s/named {:page  su/IntGreaterThanZero
            :items su/IntGreaterThanZero}
           "Valid page clause"))

(def Query
  "Schema for an MBQL query."
  {(s/optional-key :aggregation) [Aggregation]
   (s/optional-key :breakout)    [FieldPlaceholderOrExpressionRef]
   (s/optional-key :fields)      [AnyFieldOrExpression]
   (s/optional-key :filter)      Filter
   (s/optional-key :limit)       su/IntGreaterThanZero
   (s/optional-key :order-by)    [OrderBy]
   (s/optional-key :page)        Page
   (s/optional-key :expressions) {s/Keyword Expression}
   :source-table                 su/IntGreaterThanZero})
