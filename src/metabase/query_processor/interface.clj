(ns ^:deprecated metabase.query-processor.interface
  "Definitions of `Field`, `Value`, and other record types present in an expanded query.
   This namespace should just contain definitions ^:deprecated of various protocols and record types; associated logic
  should go in `metabase.query-processor.middleware.expand`."
  (:require [metabase.config :as config]
            [metabase.models
             [dimension :as dim]
             [field :as field]]
            [metabase.sync.interface :as i]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s])
  (:import clojure.lang.Keyword
           [java.sql Time Timestamp]))

;;; --------------------------------------------------- CONSTANTS ----------------------------------------------------

(def absolute-max-results
  "Maximum number of rows the QP should ever return.

   This is coming directly from the max rows allowed by Excel for now ...
   https://support.office.com/en-nz/article/Excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3"
  1048576)


;;; -------------------------------------------------- DYNAMIC VARS --------------------------------------------------

(def ^:dynamic ^Boolean *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less
  cluttered)."
  false)


(def ^:dynamic *driver*
  "The driver that will be used to run the query we are currently parsing.
   Used by `assert-driver-supports` and other places.
   Always bound when running queries the normal way, e.g. via `metabase.driver/process-query`.
   Not neccesarily bound when using various functions like `fk->` in the REPL."
  nil)


;;; ------------------------------------------------------ ETC -------------------------------------------------------

(defn ^:deprecated driver-supports?
  "Does the currently bound `*driver*` support FEATURE?
   (This returns `nil` if `*driver*` is unbound. `*driver*` is always bound when running queries the normal way,
   but may not be when calling this function directly from the REPL.)"
  [feature]
  (when *driver*
    ((resolve 'metabase.driver/driver-supports?) *driver* feature)))

;; `assert-driver-supports` doesn't run check when `*driver*` is unbound (e.g., when used in the REPL)
;; Allows flexibility when composing queries for tests or interactive development
(defn ^:deprecated assert-driver-supports
  "When `*driver*` is bound, assert that is supports keyword FEATURE."
  [feature]
  (when *driver*
    (when-not (driver-supports? feature)
      (throw (Exception. (str (name feature) " is not supported by this driver."))))))

;; Expansion Happens in a Few Stages:
;; 1. A query dict is parsed via pattern-matching code in the Query Expander.
;;    field IDs and values are replaced with FieldPlaceholders and ValuePlaceholders, respectively.
;; 2. Relevant Fields and Tables are fetched from the DB, and the placeholder objects are "resolved"
;;    and replaced with objects like Field, Value, etc.

;;; ------------------------------------------------ JOINING OBJECTS -------------------------------------------------

;; These are just used by the QueryExpander to record information about how joins should occur.

(s/defrecord ^:deprecated JoinTableField [field-id   :- su/IntGreaterThanZero
                                          field-name :- su/NonBlankString]
  nil
  :load-ns true)

(s/defrecord ^:deprecated JoinTable [source-field :- JoinTableField
                                     pk-field     :- JoinTableField
                                     table-id     :- su/IntGreaterThanZero
                                     table-name   :- su/NonBlankString
                                     schema       :- (s/maybe su/NonBlankString)
                                     join-alias   :- su/NonBlankString]
  nil
  :load-ns true)

(declare Query)

;; Similar to a `JoinTable` but instead of referencing a table, it references a query expression
(s/defrecord ^:deprecated JoinQuery [source-field :- JoinTableField
                                     pk-field     :- JoinTableField
                                     table-id     :- su/IntGreaterThanZero
                                     schema       :- (s/maybe su/NonBlankString)
                                     join-alias   :- su/NonBlankString
                                     query        :- {s/Any  s/Any
                                                      :query Query}]
  nil
  :load-ns true)

;;; --------------------------------------------------- PROTOCOLS ----------------------------------------------------

(defprotocol ^:deprecated IField
  "Methods specific to the Query Expander `Field` record type."
  (qualified-name-components [this]
    "Return a vector of name components of the form `[table-name parent-names... field-name]`
     (This should always return AT LEAST 2 components. If no table name should be used, return
     `nil` as the first part.)"))
;; TODO - Yes, I know, that makes no sense. `annotate/qualify-field-name` expects it that way tho


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     FIELDS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+


(s/defrecord ^:deprecated FieldValues [field-value-id          :- su/IntGreaterThanZero
                                       field-id                :- su/IntGreaterThanZero
                                       values                  :- (s/maybe (s/cond-pre [s/Any] {} []))
                                       human-readable-values   :- (s/maybe (s/cond-pre [s/Any] {} []))
                                       created-at              :- java.util.Date
                                       updated-at              :- java.util.Date]
  nil
  :load-ns true)

(s/defrecord ^:deprecated Dimensions [dimension-id            :- su/IntGreaterThanZero
                                      field-id                :- su/IntGreaterThanZero
                                      dimension-name          :- su/NonBlankString
                                      human-readable-field-id :- (s/maybe su/IntGreaterThanZero)
                                      dimension-type          :- (apply s/enum dim/dimension-types)
                                      created-at              :- java.util.Date
                                      updated-at              :- java.util.Date]
  nil
  :load-ns true)

;; Field is the "expanded" form of a Field ID (field reference) in MBQL
(s/defrecord ^:deprecated Field [field-id           :- su/IntGreaterThanZero
                                 field-name         :- su/NonBlankString
                                 field-display-name :- su/NonBlankString
                                 database-type      :- su/NonBlankString
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
                                 parent             :- s/Any
                                 remapped-from      :- (s/maybe s/Str)
                                 remapped-to        :- (s/maybe s/Str)
                                 dimensions         :- (s/maybe (s/cond-pre Dimensions {} []))
                                 values             :- (s/maybe (s/cond-pre FieldValues {} []))
                                 fingerprint        :- (s/maybe i/Fingerprint)]
  nil
  :load-ns true
  clojure.lang.Named
  (getName [_] field-name)              ; (name <field>) returns the *unqualified* name of the field, #obvi

  IField
  (qualified-name-components [_]
    (conj (if parent
            (qualified-name-components parent)
            [table-name])
          field-name)))

;;; DateTimeField

(def ^:deprecated datetime-field-units
  "Valid units for a `DateTimeField`."
  #{:default :minute :minute-of-hour :hour :hour-of-day :day :day-of-week :day-of-month :day-of-year
    :week :week-of-year :month :month-of-year :quarter :quarter-of-year :year})

(def ^:deprecated relative-datetime-value-units
  "Valid units for a `RelativeDateTimeValue`."
  #{:minute :hour :day :week :month :quarter :year})

(def ^:deprecated DatetimeFieldUnit
  "Schema for datetime units that are valid for `DateTimeField` forms."
  (s/named (apply s/enum datetime-field-units) "Valid datetime unit for a field"))

(def ^:deprecated DatetimeValueUnit
  "Schema for datetime units that valid for relative datetime values."
  (s/named (apply s/enum relative-datetime-value-units) "Valid datetime unit for a relative datetime"))

(defn ^:deprecated datetime-field-unit?
  "Is UNIT a valid datetime unit for a `DateTimeField` form?"
  [unit]
  (contains? datetime-field-units (keyword unit)))

(defn ^:deprecated relative-datetime-value-unit?
  "Is UNIT a valid datetime unit for a `RelativeDateTimeValue` form?"
  [unit]
  (contains? relative-datetime-value-units (keyword unit)))

(def ^:deprecated binning-strategies
  "Valid binning strategies for a `BinnedField`"
  #{:num-bins :bin-width :default})

;; TODO - maybe we should figure out some way to have the schema validate that the driver supports field literals,
;; like we do for some of the other clauses. Ideally we'd do that in a more generic way (perhaps in expand, we could
;; make the clauses specify required feature metadata and have that get checked automatically?)
(s/defrecord ^:deprecated FieldLiteral [field-name       :- su/NonBlankString
                                        base-type        :- su/FieldType
                                        binning-strategy :- (s/maybe (apply s/enum binning-strategies))
                                        binning-param    :- (s/maybe s/Num)
                                        fingerprint      :- (s/maybe i/Fingerprint)]
  nil
  :load-ns true
  clojure.lang.Named
  (getName [_] field-name)
  IField
  (qualified-name-components [_] [nil field-name]))

;; DateTimeField is just a simple wrapper around Field
(s/defrecord ^:deprecated DateTimeField [field :- (s/cond-pre Field FieldLiteral)
                                         unit  :- DatetimeFieldUnit]
  nil
  :load-ns true
  clojure.lang.Named
  (getName [_] (name field)))

;; TimeField is just a field wrapper that indicates string should be interpretted as a time
(s/defrecord ^:deprecated TimeField [field :- (s/cond-pre Field FieldLiteral)]
  nil
  :load-ns true
  clojure.lang.Named
  (getName [_] (name field)))

(s/defrecord ^:deprecated TimeValue [value       :- Time
                                     field       :- TimeField
                                     timezone-id :- (s/maybe String)]
  nil
  :load-ns true)

(s/defrecord ^:deprecated BinnedField [field     :- (s/cond-pre Field FieldLiteral)
                                       strategy  :- (apply s/enum binning-strategies)
                                       num-bins  :- s/Int
                                       min-value :- s/Num
                                       max-value :- s/Num
                                       bin-width :- s/Num]
  nil
  :load-ns true
  clojure.lang.Named
  (getName [_] (name field)))

(s/defrecord ^:deprecated ExpressionRef [expression-name :- su/NonBlankString]
  nil
  :load-ns true
  clojure.lang.Named
  (getName [_] expression-name)
  IField
  (qualified-name-components [_]
    [nil expression-name]))


;;; Placeholder Types. See explaination above RE what these mean

(def ^:deprecated FKFieldID
  "Schema for an ID for a foreign key Field. If `*driver*` is bound this will throw an Exception if this is non-nil
  and the driver does not support foreign keys."
  (s/constrained
   su/IntGreaterThanZero
   (fn [_] (or (assert-driver-supports :foreign-keys) true))
   "foreign-keys is not supported by this driver."))

;; Replace Field IDs with these during first pass
;; fk-field-id = the ID of the Field we point to (if any). For example if we are 'bird_id` then that is the ID of
;; bird.id
(s/defrecord ^:deprecated FieldPlaceholder [field-id            :- su/IntGreaterThanZero
                                            fk-field-id         :- (s/maybe FKFieldID)
                                            datetime-unit       :- (s/maybe DatetimeFieldUnit)
                                            remapped-from       :- (s/maybe s/Str)
                                            remapped-to         :- (s/maybe s/Str)
                                            field-display-name  :- (s/maybe s/Str)
                                            binning-strategy    :- (s/maybe (apply s/enum binning-strategies))
                                            binning-param       :- (s/maybe s/Num)]
  nil
  :load-ns true)

(s/defrecord ^:deprecated AgFieldRef [index :- s/Int]
  nil
  :load-ns true)
;; TODO - add a method to get matching expression from the query?

(s/defrecord ^:deprecated RelativeDatetime [amount :- s/Int
                                            unit   :- DatetimeValueUnit]
  nil
  :load-ns true)

(declare Aggregation AnyField AnyValueLiteral)

(def ^:deprecated ^:private ExpressionOperator (s/named (s/enum :+ :- :* :/) "Valid expression operator"))

(s/defrecord ^:deprecated Expression [operator   :- ExpressionOperator
                                      args       :- [(s/cond-pre (s/recursive #'AnyValueLiteral)
                                                                 (s/recursive #'AnyField)
                                                                 (s/recursive #'Aggregation))]
                                      custom-name :- (s/maybe su/NonBlankString)]
  nil
  :load-ns true)


(def ^:deprecated AnyField
  "Schema for anything that is considered a valid 'field' including placeholders, expressions, and literals."
  (s/named (s/cond-pre Field
                       FieldPlaceholder
                       DateTimeField
                       FieldLiteral
                       AgFieldRef
                       Expression
                       ExpressionRef)
           "AnyField: field, ag field reference, expression, expression reference, or field literal."))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     VALUES                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:deprecated LiteralDatetimeString
  "Schema for an MBQL datetime string literal, in ISO-8601 format."
  (s/constrained su/NonBlankString du/date-string? "Valid ISO-8601 datetime string literal"))

(def ^:deprecated LiteralDatetime
  "Schema for an MBQL literal datetime value: and ISO-8601 string or `java.sql.Date`."
  (s/named (s/cond-pre java.sql.Date LiteralDatetimeString)
           "Valid datetime literal (must be ISO-8601 string or java.sql.Date)"))

(def ^:deprecated Datetime
  "Schema for an MBQL datetime value: an ISO-8601 string, `java.sql.Date`, or a relative dateitme form."
  (s/named (s/cond-pre RelativeDatetime LiteralDatetime)
           "Valid datetime (must ISO-8601 string literal or a relative-datetime form)"))

(def ^:deprecated OrderableValueLiteral
  "Schema for something that is orderable value in MBQL (either a number or datetime)."
  (s/named (s/cond-pre s/Num Datetime) "Valid orderable value (must be number or datetime)"))

(def ^:deprecated AnyValueLiteral
  "Schema for anything that is a considered a valid value literal in MBQL - `nil`, a `Boolean`, `Number`, `String`, or
  relative datetime form."
  (s/named (s/maybe (s/cond-pre s/Bool su/NonBlankString OrderableValueLiteral))
           "Valid value (must be nil, boolean, number, string, or a relative-datetime form)"))


;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
;; TODO - Value doesn't need the whole field, just the relevant type info / units
(s/defrecord ^:deprecated Value [value   :- AnyValueLiteral
                                 field   :- (s/recursive #'AnyField)]
  nil
  :load-ns true)

(s/defrecord ^:deprecated RelativeDateTimeValue [amount :- s/Int
                                                 unit   :- DatetimeValueUnit
                                                 field  :- (s/cond-pre DateTimeField
                                                                       FieldPlaceholder)]
  nil
  :load-ns true)

;; e.g. an absolute point in time (literal)
(s/defrecord ^:deprecated DateTimeValue [value :- (s/maybe Timestamp)
                                         field :- DateTimeField]
  nil
  :load-ns true)

(def ^:deprecated OrderableValue
  "Schema for an instance of `Value` whose `:value` property is itself orderable (a datetime or number, i.e. a
  `OrderableValueLiteral`)."
  (s/named (s/cond-pre
            DateTimeValue
            RelativeDateTimeValue
            (s/constrained Value (fn [{value :value}]
                                   (nil? (s/check OrderableValueLiteral value)))))
           "Value that is orderable (Value whose :value is something orderable, like a datetime or number)"))

(def ^:deprecated StringValue
  "Schema for an instance of `Value` whose `:value` property is itself a string (a datetime or string, i.e. a
  `OrderableValueLiteral`)."
  (s/named (s/constrained Value (comp string? :value))
           "Value that is a string (Value whose :value is a string)"))

(defprotocol ^:deprecated ^:private IDateTimeValue
  (unit [this]
    "Get the `unit` associated with a `DateTimeValue` or `RelativeDateTimeValue`.")

  (add-date-time-units [this n]
    "Return a new `DateTimeValue` or `RelativeDateTimeValue` with N `units` added to it."))

(extend-protocol IDateTimeValue
  DateTimeValue
  (unit                [this]   (:unit (:field this)))
  (add-date-time-units [this n] (assoc this :value (du/relative-date (unit this) n (:value this))))

  RelativeDateTimeValue
  (unit                [this]   (:unit this))
  (add-date-time-units [this n] (update this :amount (partial + n))))


;;; Placeholder Types

;; Replace values with these during first pass over Query.
;; Include associated Field ID so appropriate the info can be found during Field resolution
(s/defrecord ^:deprecated ValuePlaceholder [field-placeholder :- AnyField
                                            value             :- AnyValueLiteral]
  nil
  :load-ns true)

(def ^:deprecated OrderableValuePlaceholder
  "`ValuePlaceholder` schema with the additional constraint that the value be orderable (a number or datetime)."
  (s/constrained
   ValuePlaceholder
   (comp (complement (s/checker OrderableValueLiteral)) :value)
   ":value must be orderable (number or datetime)"))

(def ^:deprecated OrderableValueOrPlaceholder
  "Schema for an `OrderableValue` (instance of `Value` whose `:value` is orderable) or a placeholder for one."
  (s/named (s/cond-pre OrderableValue OrderableValuePlaceholder)
           "Must be an OrderableValue or OrderableValuePlaceholder"))

(def ^:deprecated StringValuePlaceholder
  "`ValuePlaceholder` schema with the additional constraint that the value be a string/"
  (s/constrained ValuePlaceholder (comp string? :value) ":value must be a string"))

(def ^:deprecated StringValueOrPlaceholder
  "Schema for an `StringValue` (instance of `Value` whose `:value` is a string) or a placeholder for one."
  (s/named (s/cond-pre StringValue StringValuePlaceholder)
           "Must be an StringValue or StringValuePlaceholder"))

(def ^:deprecated AnyValue
  "Schema that accepts anything normally considered a value or value placeholder."
  (s/named (s/cond-pre DateTimeValue RelativeDateTimeValue Value ValuePlaceholder) "Valid value"))

(def ^:deprecated AnyFieldOrValue
  "Schema that accepts anything normally considered a field or value."
  (s/named (s/cond-pre AnyField AnyValue) "Field or value"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    CLAUSES                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; aggregation

(s/defrecord ^:deprecated AggregationWithoutField [aggregation-type :- (s/named (s/enum :count :cumulative-count)
                                                                                "Valid aggregation type")
                                                   custom-name      :- (s/maybe su/NonBlankString)]
  nil
  :load-ns true)

(s/defrecord ^:deprecated AggregationWithField [aggregation-type :- (s/named (s/enum :avg :count :cumulative-count
                                                                                     :cumulative-sum :distinct :max
                                                                                     :min :stddev :sum)
                                                                             "Valid aggregation type")
                                                field            :- (s/cond-pre AnyField
                                                                                Expression)
                                                custom-name      :- (s/maybe su/NonBlankString)]
  nil
  :load-ns true)

(defn- ^:deprecated valid-aggregation-for-driver? [{:keys [aggregation-type]}]
  (when (= aggregation-type :stddev)
    (assert-driver-supports :standard-deviation-aggregations))
  true)

(def ^:deprecated Aggregation
  "Schema for an `aggregation` subclause in an MBQL query."
  (s/constrained
   (s/cond-pre AggregationWithField AggregationWithoutField Expression)
   valid-aggregation-for-driver?
   "standard-deviation-aggregations is not supported by this driver."))


;;; filter

(s/defrecord ^:deprecated EqualityFilter [filter-type :- (s/enum := :!=)
                                          field       :- AnyField
                                          value       :- AnyFieldOrValue]
  nil
  :load-ns true)

(s/defrecord ^:deprecated ComparisonFilter [filter-type :- (s/enum :< :<= :> :>=)
                                            field       :- AnyField
                                            value       :- OrderableValueOrPlaceholder]
  nil
  :load-ns true)

(s/defrecord ^:deprecated BetweenFilter [filter-type  :- (s/eq :between)
                                         min-val      :- OrderableValueOrPlaceholder
                                         field        :- AnyField
                                         max-val      :- OrderableValueOrPlaceholder]
  nil
  :load-ns true)

(s/defrecord ^:deprecated StringFilter [filter-type     :- (s/enum :starts-with :contains :ends-with)
                                        field           :- AnyField
                                        ;; TODO - not 100% sure why this is also allowed to accept a plain string
                                        value           :- (s/cond-pre s/Str StringValueOrPlaceholder)
                                        case-sensitive? :- s/Bool]
  nil
  :load-ns true)

(def ^:deprecated SimpleFilterClause
  "Schema for a non-compound, non-`not` MBQL `filter` clause."
  (s/named (s/cond-pre EqualityFilter ComparisonFilter BetweenFilter StringFilter)
           "Simple filter clause"))

(s/defrecord ^:deprecated NotFilter [compound-type :- (s/eq :not)
                                     subclause     :- SimpleFilterClause]
  nil
  :load-ns true)

(declare Filter)

(s/defrecord ^:deprecated CompoundFilter [compound-type :- (s/enum :and :or)
                                          subclauses    :- [(s/recursive #'Filter)]]
  nil
  :load-ns true)

(def ^:deprecated Filter
  "Schema for top-level `filter` clause in an MBQL query."
  (s/named (s/cond-pre SimpleFilterClause NotFilter CompoundFilter)
           "Valid filter clause"))


;;; order-by

(def ^:deprecated OrderByDirection
  "Schema for the direction in an `OrderBy` subclause."
  (s/named (s/enum :ascending :descending) "Valid order-by direction"))

(def ^:deprecated OrderBy
  "Schema for top-level `order-by` clause in an MBQL query."
  (s/named {:field     AnyField
            :direction OrderByDirection}
           "Valid order-by subclause"))


;;; page

(def ^:deprecated Page
  "Schema for the top-level `page` clause in a MBQL query."
  (s/named {:page  su/IntGreaterThanZero
            :items su/IntGreaterThanZero}
           "Valid page clause"))


;;; source-query

(def ^:deprecated SourceQuery
  "Schema for a valid value for a `:source-query` clause."
  (s/if :native
    {:native                         s/Any
     (s/optional-key :template-tags) s/Any}
    (s/recursive #'Query)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     QUERY                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:deprecated Query
  "Schema for an MBQL query."
  (s/constrained
   {(s/optional-key :aggregation)  [Aggregation]
    (s/optional-key :breakout)     [AnyField]
    (s/optional-key :fields)       [AnyField]
    (s/optional-key :filter)       Filter
    (s/optional-key :limit)        su/IntGreaterThanZero
    (s/optional-key :order-by)     [OrderBy]
    (s/optional-key :page)         Page
    (s/optional-key :expressions)  {s/Keyword Expression}
    (s/optional-key :source-table) su/IntGreaterThanZero
    (s/optional-key :source-query) SourceQuery}
   (fn [{:keys [source-table source-query native-source-query]}]
     (and (or source-table
              source-query
              native-source-query)
          (not (and source-table
                    source-query
                    native-source-query))))
   "Query must specify either `:source-table` or `:source-query`, but not both."))

;; Go ahead and mark all the `->Record` and `map->Record` functions as deprecated too! Just so they show up in red in
;; Emacs
(when config/is-dev?
  (doseq [[_ varr] (ns-publics *ns*)
          :when (fn? (var-get varr))]
    (alter-meta! varr assoc :deprecated true)))
