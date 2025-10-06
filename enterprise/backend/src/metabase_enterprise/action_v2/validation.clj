(ns metabase-enterprise.action-v2.validation
  "A light validation for action inputs.

  Actions inputs are all strings regardless of the field types. We may want to revisit this.
  See {[metabase.driver.sql-jdbc.actions/cast-values]}

  Though we do want to have a light validation to gives users nice error messages."
  (:require
   [java-time.api :as t]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime LocalDate LocalTime LocalDateTime)
   (java.time.format DateTimeParseException)))

(set! *warn-on-reflection* true)

(defmacro can-parse?
  "Returns true if the string value can be parsed by the given parse-fn, false otherwise."
  [parse-fn value]
  `(try
     (~parse-fn ~value)
     true
     (catch Exception _# false)))

(defmulti ^:private validate-type
  "Validates a value against a type. Returns nil if valid, error message if invalid."
  {:arglists '([ttype value])}
  (fn [ttype _value] ttype))

(defmethod validate-type :default
  [_ttype _value]
  nil)

(defmethod validate-type :type/Number
  [_ttype value]
  (cond
    (number? value) nil
    (string? value) (when-not (can-parse? #(Double/parseDouble ^String %) value)
                      "Must be a number")
    :else "Must be a number"))

(defmethod validate-type :type/Integer
  [_ttype value]
  (cond
    (integer? value) nil
    (string? value) (when-not (can-parse? #(Long/parseLong %) value)
                      "Must be an integer")
    :else "Must be an integer"))

(defmethod validate-type :type/BigInteger
  [_ttype value]
  (cond
    (integer? value) nil
    (string? value) (when-not (can-parse? #(BigInteger. ^String %) value)
                      "Must be an integer")
    :else "Must be an integer"))

(defmethod validate-type :type/Decimal
  [_ttype value]
  (cond
    (number? value) nil
    (string? value) (when-not (can-parse? #(BigDecimal. ^String %) value)
                      "Must be a number")
    :else "Must be a number"))

(defmethod validate-type :type/Text
  [_ttype value]
  (when-not (string? value)
    "Must be a text string"))

;; Datetime can be crazy in db, you can do thins like Dec 24, 2024 or December 24 2024 etc.
;; But we decided to scope down our rules, so these the patterns we used for datetime stuffs here
;; will match the output of FE components

(defmethod validate-type :type/Date
  [_ttype value]
  (when-not (and (string? value)
                 (try
                   (LocalDate/parse value (t/formatter :iso-local-date))
                   true
                   (catch DateTimeParseException _
                     false)))
    "Must be a valid date in format YYYY-MM-DD"))

(defmethod validate-type :type/Time
  [_ttype value]
  (when-not (and (string? value)
                 (try
                   (LocalTime/parse value (t/formatter :iso-local-time))
                   true
                   (catch DateTimeParseException _
                     false)))
    "Must be a valid time in format HH:mm:ss"))

(defmethod validate-type :type/DateTime
  [_ttype value]
  (when-not (and (string? value)
                 (some (fn [parser]
                         (try
                           (parser value)
                           true
                           (catch DateTimeParseException _
                             false)))
                       [#(LocalDateTime/parse % (t/formatter :iso-local-date-time))
                        #(OffsetDateTime/parse % (t/formatter :iso-offset-date-time))]))
    "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"))

(defmethod validate-type :type/Boolean
  [_ttype value]
  (cond
    (boolean? value) nil
    (string? value) (when-not (contains? #{"true" "false" "0" "1"} (u/lower-case-en value))
                      "Must be true, false, 0, or 1")
    :else "Must be true, false, 0, or 1"))

(defn- validate-value*
  "Validate a value given a field. Returns nil if valid, error message if invalid."
  [value field]
  (if (and (nil? value) (:database_required field))
    "This field is required"
    (when-not (nil? value)
      (validate-type (:base_type field) value))))

(defn- validate-input
  [row field-name->fields]
  (not-empty (reduce (fn [errors [column value]]
                       (if-let [error-msg (some-> (get field-name->fields column)
                                                  (->> (validate-value* value)))]
                         (assoc errors column error-msg)
                         errors))
                     {}
                     row)))

(defn validate-inputs
  "Validate rows of a given table"
  [table-id-or-fields inputs]
  (let [fields (if (int? table-id-or-fields)
                 (t2/select-fn->fn :name identity [:model/Field :name :database_required :base_type] :table_id table-id-or-fields)
                 (u/index-by :name table-id-or-fields))
        errors (mapv #(validate-input % fields) inputs)]
    (when (some some? errors)
      errors)))
