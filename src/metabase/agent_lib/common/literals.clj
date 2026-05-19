(ns metabase.agent-lib.common.literals
  "Literal and structural predicates for structured MBQL programs."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.aggregation]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private aggregation-operator-names
  ;; Derived from the lib schema hierarchy so new aggregation helpers are picked up automatically.
  ;; `:aggregation` is the abstract wrapper clause and `:offset` is a windowed aggregation that
  ;; behaves like an expression in some contexts — neither should be recognized as a plain
  ;; aggregation helper name.
  (into #{}
        (comp (remove #{:aggregation :offset})
              (map name))
        (descendants @lib.hierarchy/hierarchy
                     :metabase.lib.schema.aggregation/aggregation-clause-tag)))

(defn scalar-literal?
  "True when `value` is a scalar JSON-like literal accepted by the structured format."
  [value]
  (or (nil? value)
      (string? value)
      (number? value)
      (boolean? value)))

(defn non-blank-string?
  "True when `value` is a non-blank string."
  [value]
  (and (string? value) (not (str/blank? value))))

(defn quarter-label-string?
  "True when `value` looks like a quarter label such as `Q1`."
  [value]
  (and (string? value)
       (re-matches #"(?i)q[1-4]" (str/trim value))))

(defn now-literal?
  "True when `value` is the case-insensitive literal string `now`."
  [value]
  (and (string? value)
       (= "now" (u/lower-case-en (str/trim value)))))

(defn iso-date-string?
  "True when `value` is an ISO `yyyy-mm-dd` date string."
  [value]
  (and (string? value)
       (re-matches #"\d{4}-\d{2}-\d{2}" (str/trim value))))

(defn null-literal?
  "True when `value` is nil or the case-insensitive string `null`."
  [value]
  (or (nil? value)
      (and (string? value)
           (= "null" (u/lower-case-en value)))))

(defn scalar-sequential?
  "True when `value` is a sequential collection of scalar literals."
  [value]
  (and (sequential? value)
       (not (syntax/possible-operator-tuple? value))
       (every? scalar-literal? value)))

(defn aggregation-form?
  "True when `value` is a canonical aggregation helper tuple."
  [value]
  (and (vector? value)
       (aggregation-operator-names (syntax/canonical-op-name (first value)))))

(defn default-map?
  "True when `value` looks like a legacy `{default ...}` case fallback map."
  [value]
  (and (map? value)
       (or (contains? value :default)
           (contains? value "default"))))

(defn bare-field-id?
  "True when `value` is a positive integer field id without a `field` wrapper."
  [value]
  (and (int? value) (pos? value)))
