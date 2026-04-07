(ns metabase.agent-lib.common.coercions
  "Coercion and normalization helpers for structured MBQL programs."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.common.literals :as literals]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn quarter-label->number
  "Convert quarter labels such as `Q1` into the corresponding integer."
  [value]
  (when (string? value)
    (case (u/upper-case-en (str/trim value))
      "Q1" 1
      "Q2" 2
      "Q3" 3
      "Q4" 4
      nil)))

(defn parse-int-string
  "Parse an integer string, returning nil when parsing fails."
  [value]
  (when (and (string? value)
             (re-matches #"-?\d+" value))
    (try
      (Long/parseLong value)
      (catch NumberFormatException _
        nil))))

(defn coerce-positive-int
  "Coerce positive integer strings into integers."
  [value]
  (cond
    (pos-int? value) value
    (string? value)  (let [parsed (parse-int-string value)]
                       (if (pos-int? parsed) parsed value))
    :else            value))

(defn coerce-non-negative-int
  "Coerce non-negative integer strings into integers."
  [value]
  (cond
    (and (int? value) (<= 0 value)) value
    (string? value)                 (let [parsed (parse-int-string value)]
                                      (if (and (int? parsed) (<= 0 parsed)) parsed value))
    :else                           value))

(defn direction-string?
  "True when `value` is an order direction string or keyword."
  [value]
  (boolean (#{"asc" "desc"} (some-> value syntax/raw-op-name u/lower-case-en))))

(defn normalize-direction
  "Normalize a direction enum to its lowercase string form."
  [value]
  (some-> value syntax/raw-op-name u/lower-case-en))

(defn unwrap-singleton-form
  "Recursively unwrap singleton vectors that are not operator tuples."
  [value]
  (loop [value value]
    (if (and (vector? value)
             (= 1 (count value))
             (not (syntax/possible-operator-tuple? value))
             (not (literals/scalar-sequential? value)))
      (recur (first value))
      value)))

(defn normalize-percentile-value
  "Normalize percentiles expressed as whole-number percentages to fractions."
  [value]
  (if (and (number? value)
           (> (double value) 1.0)
           (<= (double value) 100.0))
    (/ (double value) 100.0)
    value))

(defn normalize-join-conditions
  "Unwrap one extra sequential level around join conditions."
  [conditions]
  (loop [conditions conditions]
    (if (and (sequential? conditions)
             (= 1 (count conditions))
             (sequential? (first conditions))
             (not (syntax/possible-operator-tuple? (first conditions))))
      (recur (vec (first conditions)))
      conditions)))

(defn normalize-map-key
  "Convert string map keys to keywords while leaving other keys unchanged."
  [k]
  (if (string? k)
    (keyword k)
    k))
