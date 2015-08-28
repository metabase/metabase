(ns metabase.driver.query-processor.interface
  "Record type and protocol definitions for the Query Processor."
  (:require [clojure.string :as s]
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           java.sql.Timestamp))

(declare map->DateTimeField
         map->DateTimeLiteral
         map->DateTimeValue
         map->Value)

;;; # ------------------------------------------------------------ CONSTANTS ------------------------------------------------------------

(defn- int-in-range-fn
  "Return a 1-airity function that checks that its arg is in the given range and returns it."
  [lower-bound-inclusive upper-bound-inclusive]
  (fn [v]
    (when-not (and (integer? v)
                   (<= lower-bound-inclusive v upper-bound-inclusive))
      (throw (Exception. (format "Invalid value %d: must be between %d and %d, inclusive." v lower-bound-inclusive upper-bound-inclusive))))
    v))

(defn- enum-fn
  "Return a 1-airity function that checks its arg is an int in the given range (via `int-in-range-fn`)
   or that its arg is one of a given case-insensitive keyword or string. In either case, the corresponding
   int value will be returned."
  [lower-bound-inclusive upper-bound-inclusive & values]
  (let [kw->int      (zipmap values (range lower-bound-inclusive (inc upper-bound-inclusive)))
        int-in-range (int-in-range-fn lower-bound-inclusive upper-bound-inclusive)]
    (fn [v]
      (if (integer? v)
        (int-in-range v)
        (let [v       (keyword (s/lower-case (name v)))
              int-val (kw->int v)]
          (when-not int-val
            (throw (Exception. (format "Invalid named value '%s': Must be one of: %s" (name v) values))))
          int-val)))))

(def ^:private datetime-unit->parser
  "Map of datetime units to functions that should be used to parse associated values."
  {;; Use the standard high-resolution option. For SQL this means Timestamp.
   :default         identity
   ;; Timestamp w/ minute resolution
   :minute          identity
   ;; 00 - 59
   :minute-of-hour  (int-in-range-fn 0 59)
   ;; Timestamp w/ hour resolution
   :hour            identity
   ;; 0 - 23
   :hour-of-day     (int-in-range-fn 0 23)
   ;; Date
   :day             identity
   ;; 1 - 7 (Mon - Sun)
   :day-of-week     (enum-fn 1 7 :sunday :monday :tuesday :wednesday :thursday :friday :saturday)
   ;; 1 - 31
   :day-of-month    (int-in-range-fn 1 31)
   ;; 1 - 365
   :day-of-year     (int-in-range-fn 1 366)
   ;; Date w/ week resolution. E.g. 'Week of Monday, August 24th, 2015)
   :week            identity
   ;; 1 - 52
   :week-of-year    (int-in-range-fn 1 53)
   ;; Date w/ month resolution. YYYY-MM
   :month           identity
   ;; 1 - 12 (Jan - Dec)
   :month-of-year   (enum-fn 1 12 :january :february :march :april :may :june :july :august :september :october :november :december)
   ;; Date w/ Quarter resolution. E.g. 'Quarter commencing April 1st, 2015)
   :quarter         identity
   ;; 1 - 4
   :quarter-of-year (int-in-range-fn 1 4)
   ;; YYYY
   :year            identity})

(def ^:const datetime-field-units
  "Units that can be applied to `DateTimeFields`."
  (set (keys datetime-unit->parser)))

(def ^:const datetime-value-units
  "Units that can be applied to [relative] `DateTimeValues`."
  #{:minute :hour :day :week :month :quarter :year})

(defn datetime-field-unit?
  "Can UNIT be used in a `[datetime_field ...]` clause?"
  [unit]
  (contains? datetime-field-units (keyword unit)))

(defn datetime-value-unit?
  "Can UNIT be used in a `[datetime ...]` clause?"
  [unit]
  (contains? datetime-value-units (keyword unit)))


;;; # ------------------------------------------------------------ PLACEHOLDERS ------------------------------------------------------------

;; When Field IDs or related forms (such as ["fk->" ...]) are encountered in a query dictionary during expansion, they are initially replaced
;; with placeholder objects. Later, during "resolution", these placeholders are replaced with actual Field + Value objects.

(defprotocol IResolve
  "Methods called during `Field` and `Table` resolution. Placeholder types should implement this protocol."
  (resolve-field [this field-id->field]
    "This method is called when walking the Query after fetching `Fields`.
     Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
     return their expanded form. Other objects should just return themselves.")
  (resolve-table [this table-id->tables]
    "Called when walking the Query after `Fields` have been resolved and `Tables` have been fetched.
     Objects like `Fields` can add relevant information like the name of their `Table`."))


;; Default impls are just identity
(extend Object
  IResolve {:resolve-field (fn [this _] this)
            :resolve-table (fn [this _] this)})

(extend nil
  IResolve {:resolve-field (constantly nil)
            :resolve-table (constantly nil)})

(defn- datetime-field? [field]
  (or (contains? #{:DateField :DateTimeField} (:base-type field))
      (contains? #{:timestamp_seconds :timestamp_milliseconds} (:special-type field))))

;; Replace Field IDs with these during first pass
(defrecord FieldPlaceholder [^Integer field-id]
  IResolve
  (resolve-field [this field-id->field]
    (let [resolved-field (field-id->field field-id)]
      (cond
        ;; If the resolved Field turns out to be something to be treated as a datetime, this means the placeholder was
        ;; generated by an ID passed directly, which is basically a DEPRECATED usage (datetime fields should now be
        ;; specified with the new [datetime_field <id> as <unit>] syntax).
        ;;
        ;; Return a DateTimeField with 'day' bucketing, which was the behavior of Fields like these in the past.
        ;; e.g. {:breakout [100]} should generate the same expansion as {:breakout [[datetime_field 100 as day]]}
        ;; for backwards-compatibility.
        (datetime-field? resolved-field) (map->DateTimeField {:field resolved-field, :unit :day})
        resolved-field                   resolved-field
        ;; If we were unable to be resolved this round return ourselves as-is
        :else                            this))))


(defrecord DateTimeFieldPlaceholder [^Integer field-id
                                     ^Keyword unit]
  IResolve
  (resolve-field [this field-id->field]
    (or (when-let [resolved-field (field-id->field field-id)]
          (assert (instance? (resolve 'metabase.driver.query_processor.interface.Field) resolved-field))
          (map->DateTimeField {:field resolved-field, :unit unit}))
        this)))


(defn- resolve-field-or-throw
  "Resolve FIELD-PLACEHOLDER or throw an exception."
  [field-placeholder field-id->field]
  (or (let [resolved-field (resolve-field field-placeholder field-id->field)]
        (when (not= field-placeholder resolved-field)
          resolved-field))
      (throw (Exception. (format "Unable to resolve Field: %s" (u/pprint-to-str field-placeholder))))))

(defn- resolve-datetime-field-or-throw
  "Resolve FIELD-PLACEHOLDER, converting the `Field` to a `DateTimeField` if needed, or throw an exception."
  [field-placeholder field-id->field]
  (let [field (resolve-field-or-throw field-placeholder field-id->field)]
    (assert (instance? (resolve 'metabase.driver.query_processor.interface.DateTimeField) field))
    field))


;; Replace values with these during first pass over Query.
;; Include associated Field ID so appropriate the info can be found during Field resolution
(defrecord ValuePlaceholder [^FieldPlaceholder field
                             value]
  IResolve
  (resolve-field [_ field-id->field]
    (let [resolved-field (resolve-field-or-throw field field-id->field)
          DateTimeField? (instance? (resolve 'metabase.driver.query_processor.interface.DateTimeField) resolved-field)]
      (map->Value {:field resolved-field
                   :value (if-not DateTimeField? value                                         ; if we're a holding a value like "July" (etc) and the resolved
                                  (let [parser (datetime-unit->parser (:unit resolved-field))] ; field is a DateTimeField, look up the appropriate parser so
                                    (parser value)))}))))                                      ; we can convert ourselves to the actual value (e.g. 6)


(defrecord DateTimeValuePlaceholder [^DateTimeFieldPlaceholder field
                                     ^Keyword                  unit
                                     ^Integer                  relative-amount]
  IResolve
  (resolve-field [_ field-id->field]
    (map->DateTimeValue {:field           (resolve-datetime-field-or-throw field field-id->field)
                         :unit            unit
                         :relative-amount relative-amount})))

(defrecord DateTimeLiteralPlaceholder [^DateTimeFieldPlaceholder field
                                       ^Timestamp                value]
  IResolve
  (resolve-field [_ field-id->field]
    (map->DateTimeLiteral {:field (resolve-datetime-field-or-throw field field-id->field)
                           :value value})))


;;; # ------------------------------------------------------------ JOIN TABLE + JOIN FIELD ------------------------------------------------------------

;; These types are just used to hold information about how to join to another Table; JoinTableField is not a Field in the sense that Field/DateTimeField are.

(defrecord JoinTableField [^Integer field-id
                           ^String  field-name])

(defrecord JoinTable [^JoinTableField source-field
                      ^JoinTableField pk-field
                      ^Integer        table-id
                      ^String         table-name])


;;; # ------------------------------------------------------------ FIELD TYPES (Field, DateTimeField, etc.) ------------------------------------------------------------

(defprotocol IField
  "Methods that all field types (`Field`, and `DateTimeField`) must implement."
  (qualified-name-components [this]
    "Return a vector of name components of the form `[table-name parent-names... field-name]`"))


;; Field is the expansion of a Field ID in the standard QL
(defrecord Field [^Integer field-id
                  ^String  field-name
                  ^String  field-display-name
                  ^Keyword base-type
                  ^Keyword special-type
                  ^Integer table-id
                  ^String  table-name
                  ^Integer position
                  ^String  description
                  ^Integer parent-id
                  parent] ; Field once its resolved; FieldPlaceholder before that
  IResolve
  (resolve-field [this field-id->field]
    (cond
      parent    (if (= (type parent) Field)
                  this
                  (resolve-field parent field-id->field))
      parent-id (assoc this :parent (or (field-id->field parent-id)
                                        (FieldPlaceholder. parent-id)))
      :else     this))

  (resolve-table [this table-id->table]
    (assoc this :table-name (:name (or (table-id->table table-id)
                                       (throw (Exception. (format "Query expansion failed: could not find table %d." table-id)))))))

  IField
  (qualified-name-components [_]
    (conj (if parent
            (qualified-name-components parent)
            [table-name])
          field-name)))


;; DateTimeField just acts as a "wrapper" for a normal Field.
(defrecord DateTimeField [^Field   field
                          ^Keyword unit]
  IResolve
  (resolve-field [_ field-id->field]
    (DateTimeField. (resolve-field field field-id->field) unit))

  (resolve-table [_ table-id->table]
    (DateTimeField. (resolve-table field table-id->table) unit))

  IField
  (qualified-name-components [_]
    (qualified-name-components field)))


(defrecord OrderByAggregateField [^Keyword source  ; Name used in original query. Always :aggregation for right now
                                  ^Integer index   ; e.g. 0
                                  aggregation]     ; The aggregation clause being referred to. Type is 'Aggregation'
  IField
  (qualified-name-components [_]
    ;; Return something like [nil "count"]
    ;; nil is used where Table name would normally go
    [nil (name (:aggregation-type aggregation))]))


;;; # ------------------------------------------------------------ VALUE TYPES (Value, DateTimeValue, etc.) ------------------------------------------------------------

;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
(defrecord Value [value
                  ^Field field])

(defrecord DateTimeLiteral [^DateTimeField field
                            ^Timestamp     value])

(defrecord DateTimeValue [^DateTimeField field
                          ^Keyword       unit
                          ^Integer       relative-amount])
