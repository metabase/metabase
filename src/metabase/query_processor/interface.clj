(ns metabase.query-processor.interface
  "Definitions of `Field`, `Value`, and other record types present in an expanded query.
   This namespace should just contain definitions of various protocols and record types; associated logic
   should go in `metabase.query-processor.expand`."
  (:require [schema.core :as s]
            [metabase.models.field :as field]
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           java.sql.Timestamp))

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

(def IntGreaterThanZero
  "Schema representing an `s/Int` than must also be greater than zero."
  (s/constrained s/Int
                 (partial < 0)
                 "Integer greater than zero"))

(s/defrecord JoinTableField [field-id   :- IntGreaterThanZero
                             field-name :- s/Str])

(s/defrecord JoinTable [source-field :- JoinTableField
                        pk-field     :- JoinTableField
                        table-id     :- IntGreaterThanZero
                        table-name   :- s/Str
                        schema       :- (s/maybe s/Str)
                        join-alias   :- s/Str])

;;; # ------------------------------------------------------------ PROTOCOLS ------------------------------------------------------------

(defprotocol IField
  "Methods specific to the Query Expander `Field` record type."
  (qualified-name-components [this]
    "Return a vector of name components of the form `[table-name parent-names... field-name]`"))


;;; # ------------------------------------------------------------ "RESOLVED" TYPES: FIELD + VALUE ------------------------------------------------------------

;; Field is the expansion of a Field ID in the standard QL
(s/defrecord Field [field-id           :- IntGreaterThanZero
                    field-name         :- s/Str
                    field-display-name :- s/Str
                    base-type          :- (apply s/enum field/base-types)
                    special-type       :- (s/maybe (apply s/enum field/special-types))
                    visibility-type    :- (apply s/enum field/visibility-types)
                    table-id           :- IntGreaterThanZero
                    schema-name        :- (s/maybe s/Str)
                    table-name         :- (s/maybe s/Str) ; TODO - Why is this `maybe` ?
                    position           :- (s/maybe s/Int) ; TODO - int >= 0
                    fk-field-id        :- (s/maybe s/Int)
                    description        :- (s/maybe s/Str)
                    parent-id          :- (s/maybe IntGreaterThanZero)
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

(def NonEmptyString
  "Schema for a non-empty string."
  (s/constrained s/Str seq "non-empty string")) ; TODO - should this be used elsewhere as well, for things like `Field`?

(s/defrecord ExpressionRef [expression-name :- NonEmptyString]
  clojure.lang.Named
  (getName [_] expression-name)
  IField
  (qualified-name-components [_]
    [nil expression-name]))


;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
(s/defrecord Value [value   :- (s/maybe (s/cond-pre s/Bool s/Num s/Str))
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
(s/defrecord FieldPlaceholder [field-id      :- IntGreaterThanZero
                               fk-field-id   :- (s/maybe (s/constrained IntGreaterThanZero
                                                                        (fn [_] (or (assert-driver-supports :foreign-keys) true))
                                                                        "foreign-keys is not supported by this driver."))
                               datetime-unit :- (s/maybe (apply s/enum datetime-field-units))])

(s/defrecord AgFieldRef [index :- (s/constrained s/Int
                                                 zero?
                                                 "Ag field index should be 0 -- MBQL currently only supports a single aggregation")])

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


(declare RValue)

(def ^:private ExpressionOperator (s/named (s/enum :+ :- :* :/) "Valid expression operator"))

(s/defrecord Expression [operator        :- ExpressionOperator
                         args            :- [(s/recursive #'RValue)]])

(def AnyField
  "Schema for a `FieldPlaceholder`, `AgRef`, or `Expression`."
  (s/named (s/cond-pre ExpressionRef Expression FieldPlaceholderOrAgRef)
           "Valid field, ag field reference, or expression reference."))


(def LiteralDatetimeString
  "Schema for an MBQL datetime string literal, in ISO-8601 format."
  (s/constrained s/Str u/date-string? "Valid ISO-8601 datetime string literal"))

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
  (s/named (s/maybe (s/cond-pre s/Bool s/Str OrderableValue)) "Valid value (must be nil, boolean, number, string, or a relative-datetime form)"))

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
                                                                   "Valid aggregation type")])

(s/defrecord AggregationWithField [aggregation-type :- (s/named (s/enum :avg :count :cumulative-sum :distinct :max :min :stddev :sum)
                                                                "Valid aggregation type")
                                   field            :- FieldPlaceholderOrExpressionRef])

(def Aggregation
  "Schema for a top-level `aggregation` clause in an MBQL query."
  (s/constrained
   (s/cond-pre AggregationWithField AggregationWithoutField)
   (fn [{:keys [aggregation-type]}]
     (when (= aggregation-type :stddev)
       (assert-driver-supports :standard-deviation-aggregations))
     true)
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
  (s/named {:field     AnyField
            :direction OrderByDirection}
           "Valid order-by subclause"))


(def Page
  "Schema for the top-level `page` clause in a MBQL query."
  (s/named {:page  IntGreaterThanZero
            :items IntGreaterThanZero}
           "Valid page clause"))

(def Query
  "Schema for an MBQL query."
  {(s/optional-key :aggregation) Aggregation
   (s/optional-key :breakout)    [FieldPlaceholderOrExpressionRef]
   (s/optional-key :fields)      [AnyField]
   (s/optional-key :filter)      Filter
   (s/optional-key :limit)       IntGreaterThanZero
   (s/optional-key :order-by)    [OrderBy]
   (s/optional-key :page)        Page
   (s/optional-key :expressions) {s/Keyword Expression}
   :source-table                 IntGreaterThanZero})
