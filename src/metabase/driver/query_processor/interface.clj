(ns metabase.driver.query-processor.interface
  "Definitions of `Field`, `Value`, and other record types present in an expanded query.
   This namespace should just contain definitions of various protocols and record types; associated logic
   should go in `metabase.driver.query-processor.expand`."
  (:import clojure.lang.Keyword
           java.sql.Timestamp))

(def ^:dynamic *driver*
  nil)

;; Expansion Happens in a Few Stages:
;; 1. A query dict is parsed via pattern-matching code in the Query Expander.
;;    field IDs and values are replaced with FieldPlaceholders and ValuePlaceholders, respectively.
;; 2. Relevant Fields and Tables are fetched from the DB, and the placeholder objects are "resolved"
;;    and replaced with objects like Field, Value, etc.

;;; # ------------------------------------------------------------ JOINING OBJECTS ------------------------------------------------------------

;; These are just used by the QueryExpander to record information about how joins should occur.

(defrecord JoinTableField [^Integer field-id
                           ^String  field-name])

(defrecord JoinTable [^JoinTableField source-field
                      ^JoinTableField pk-field
                      ^Integer        table-id
                      ^String         table-name])

;;; # ------------------------------------------------------------ PROTOCOLS ------------------------------------------------------------

(defprotocol IField
  "Methods specific to the Query Expander `Field` record type."
  (qualified-name-components [this]
    "Return a vector of name components of the form `[table-name parent-names... field-name]`"))


;;; # ------------------------------------------------------------ "RESOLVED" TYPES: FIELD + VALUE ------------------------------------------------------------

;; Field is the expansion of a Field ID in the standard QL
(defrecord Field [^Integer field-id
                  ^String  field-name
                  ^String  field-display-name
                  ^Keyword base-type
                  ^Keyword special-type
                  ^Integer table-id
                  ^String  schema-name
                  ^String  table-name
                  ^Integer position
                  ^String  description
                  ^Integer parent-id
                  ;; Field once its resolved; FieldPlaceholder before that
                  parent]
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

(defn datetime-field-unit? [unit]
  (contains? datetime-field-units (keyword unit)))

;; wrapper around Field
(defrecord DateTimeField [^Field   field
                          ^Keyword unit])

;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
(defrecord Value [^Object value
                  ^Field  field])

;; e.g. an absolute point in time (literal)
(defrecord DateTimeValue [^Timestamp     value
                          ^DateTimeField field])

(def ^:const relative-datetime-value-units
  "Valid units for a `RelativeDateTimeValue`."
  #{:minute :hour :day :week :month :quarter :year})

(defn relative-datetime-value-unit? [unit]
  (contains? relative-datetime-value-units (keyword unit)))

(defrecord RelativeDateTimeValue [^Integer       amount
                                  ^Keyword       unit
                                  ^DateTimeField field])


;;; # ------------------------------------------------------------ PLACEHOLDER TYPES: FIELDPLACEHOLDER + VALUEPLACEHOLDER ------------------------------------------------------------

;; Replace Field IDs with these during first pass
(defrecord FieldPlaceholder [^Integer field-id
                             ^Integer fk-field-id
                             ^Keyword datetime-unit])

;; Replace values with these during first pass over Query.
;; Include associated Field ID so appropriate the info can be found during Field resolution
(defrecord ValuePlaceholder [^FieldPlaceholder field-placeholder
                             ^Keyword          relative-unit
                             value])

(defrecord OrderByAggregateField [^Keyword source  ; Name used in original query. Always :aggregation for right now
                                  ^Integer index]) ; e.g. 0
