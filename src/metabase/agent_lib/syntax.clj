(ns metabase.agent-lib.syntax
  "Shape-level helpers for structured MBQL operators and tuples."
  (:require
   [metabase.agent-lib.capabilities :as capabilities]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def canonical-operator-aliases
  "Legacy or alternate helper names keyed to their canonical string forms."
  {"if"              "case"
   "relative-date"   "relative-datetime"
   "temporal-diff"   "datetime-diff"
   "count-if"        "count-where"
   "variance"        "var"
   "stddev-pop"      "stddev"
   "count-distinct"  "distinct"
   "distinct-count"  "distinct"
   "is-not-null"     "not-null"
   "|"               "or"
   "dayofweek"       "get-day-of-week"
   "day-of-week"     "get-day-of-week"
   "hour-of-day"     "get-hour"
   "month"           "get-month"
   "month-of-year"   "get-month"
   "quarter-of-year" "get-quarter"})

(def top-level-operation-symbols
  "Top-level structured program operators keyed as symbols."
  capabilities/query-transform-symbols)

(def ^:private structured-helper-symbols
  capabilities/helper-symbols)

(def recognized-operator-symbols
  "All recognized operator symbols, including the synthetic `query` helper."
  (conj structured-helper-symbols 'query))

(def repairable-operator-names
  "Operator names that should be normalized by the repair pass."
  (into #{"visualization" "is" "is-not"}
        (concat
         (map name recognized-operator-symbols)
         (map name top-level-operation-symbols)
         (keys canonical-operator-aliases)
         ["dayofweek" "day-of-week" "hour-of-day" "month-of-year" "quarter-of-year"])))

(defn raw-op-name
  "Return the raw operator name string for a string, keyword, or symbol."
  [value]
  (cond
    (string? value)  value
    (keyword? value) (name value)
    (symbol? value)  (name value)
    :else            nil))

(defn canonical-op-name
  "Return the canonical string operator name for a structured helper."
  [value]
  (when-let [op-name (raw-op-name value)]
    (or (canonical-operator-aliases op-name)
        op-name)))

(defn op-symbol
  "Normalize helper identifiers into canonical operator symbols."
  [op]
  (some-> op canonical-op-name symbol))

(defn possible-operator-tuple?
  "True when `value` looks like a repairable structured helper tuple."
  [value]
  (and (vector? value)
       (contains? repairable-operator-names
                  (or (canonical-op-name (first value))
                      (raw-op-name (first value))))))

(defn boolean-wrapper-form?
  "True when `value` is a legacy boolean wrapper tuple such as `[\"true\", expr]`."
  [value]
  (and (vector? value)
       (= 2 (count value))
       (contains? #{"true" "false"}
                  (some-> (first value) raw-op-name u/lower-case-en))))

(defn top-level-operation-tuple?
  "True when `value` is a top-level structured operation tuple."
  [value]
  (and (possible-operator-tuple? value)
       (contains? top-level-operation-symbols
                  (symbol (canonical-op-name (first value))))))

(defn operator-tuple?
  "True when `value` is a recognized structured helper tuple."
  [value]
  (and (vector? value)
       (string? (first value))
       (contains? recognized-operator-symbols (op-symbol (first value)))))
