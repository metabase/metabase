(ns metabase.agent-lib.repair.normalize.forms
  "Nested operator normalization for structured program repair."
  (:require
   [metabase.agent-lib.common.coercions :as coercions :refer [coerce-non-negative-int
                                                              coerce-positive-int
                                                              normalize-join-conditions
                                                              normalize-percentile-value
                                                              unwrap-singleton-form]]
   [metabase.agent-lib.common.literals :refer [iso-date-string?
                                               non-blank-string?
                                               now-literal?
                                               null-literal?
                                               quarter-label-string?
                                               scalar-sequential?]]
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(def ^:private temporal-bucket-extraction-aliases
  "Bucket names that should be repaired into extraction helpers."
  {"dayofweek"       "get-day-of-week"
   "day-of-week"     "get-day-of-week"
   "hour-of-day"     "get-hour"
   "month-of-year"   "get-month"
   "quarter-of-year" "get-quarter"})

(defn expression-definition-tuple?
  "True when `value` is an inline expression definition tuple."
  [value]
  (and (vector? value)
       (= "expression" (syntax/canonical-op-name (first value)))
       (= 3 (count value))
       (non-blank-string? (second value))))

(defn- quarter-expression?
  [value]
  (and (vector? value)
       (let [op-name (syntax/canonical-op-name (first value))]
         (or (= op-name "get-quarter")
             (and (= op-name "with-temporal-bucket")
                  (= "quarter" (nth value 2 nil)))))))

(defn- normalize-quarter-filter-value
  [lhs rhs]
  (cond
    (and (quarter-expression? lhs)
         (quarter-label-string? rhs))
    (coercions/quarter-label->number rhs)

    (and (quarter-expression? lhs)
         (scalar-sequential? rhs)
         (every? quarter-label-string? rhs))
    (mapv coercions/quarter-label->number rhs)

    :else
    rhs))

(defn- branch-pair?
  [v]
  (and (vector? v) (= 2 (count v))))

(defn- else-branch?
  [v]
  (and (branch-pair? v)
       (= "else" (syntax/raw-op-name (first v)))))

(defn- split-else-branch
  "Peel an else-branch off the end of `branches`, merging it with `fallback`."
  [branches fallback]
  (if (and (seq branches) (else-branch? (last branches)))
    [(vec (butlast branches)) (second (last branches))]
    [branches fallback]))

(defn- flat->branch-pairs
  "Convert a flat even-length vector into branch pairs when applicable."
  [v]
  (when (and (vector? v)
             (even? (count v))
             (not-every? branch-pair? v))
    (mapv vec (partition 2 v))))

(defn- normalize-branches-fallback
  "Uniform post-processing: split else-branch and emit `[branches]` or
  `[branches fallback]`."
  [branches fallback]
  (let [[branches fallback] (split-else-branch branches fallback)]
    (if (some? fallback)
      [branches fallback]
      [branches])))

(defn- classify-case-args
  "Classify the shape of `case` args into `[branches fallback]` before uniform
  normalization, or nil if no pattern matches."
  [args]
  (cond
    ;; Three bare args: pred, then, else
    (and (= 3 (count args))
         (not (branch-pair? (first args))))
    [[[(first args) (second args)]] (nth args 2)]

    ;; Single wrapped vector of branch pairs
    (and (seq args)
         (vector? (first args))
         (every? branch-pair? (first args)))
    [(first args) (second args)]

    ;; Single wrapped triple: [pred then else]
    (and (= 1 (count args))
         (vector? (first args))
         (= 3 (count (first args)))
         (not-every? branch-pair? (first args)))
    (let [[pred then else] (first args)]
      [[[pred then]] else])

    ;; Leading branch pairs followed by optional fallback
    (seq (take-while branch-pair? args))
    (let [branches  (vec (take-while branch-pair? args))
          remainder (drop (count branches) args)]
      [branches (when (= 1 (count remainder)) (first remainder))])

    ;; Flat even-length vector inside a wrapper
    (flat->branch-pairs (first args))
    [(flat->branch-pairs (first args)) (second args)]))

(defn repair-case-args
  "Normalize alternate `case` encodings into the canonical branches/fallback shape."
  [args]
  (if-let [[branches fallback] (classify-case-args args)]
    (normalize-branches-fallback branches fallback)
    args))

(defn temporal-expression?
  "True when `value` is a temporal literal or temporal expression tuple."
  [value]
  (or (now-literal? value)
      (and (vector? value)
           (contains? #{"absolute-datetime" "relative-datetime" "now"}
                      (syntax/canonical-op-name (first value))))))

(defn- wrap-iso-date-as-absolute-datetime
  [value]
  (if (iso-date-string? value)
    ["absolute-datetime" value "day"]
    value))

(defn- wrap-now-as-expression
  [value]
  (if (now-literal? value)
    ["now"]
    value))

(defn repair-between-bounds
  "Normalize temporal `between` bounds into canonical datetime helper forms.
  Preserves degenerate (fewer than 3) arg counts so repair remains idempotent
  when the operator is embedded in a helper that reshapes its arguments
  (e.g. `case`)."
  [args]
  (if (< (count args) 3)
    (vec args)
    (let [[lhs lower upper] args
          lower'            (wrap-now-as-expression lower)
          upper'            (wrap-now-as-expression upper)]
      (if (or (temporal-expression? lower')
              (temporal-expression? upper'))
        [lhs
         (if (temporal-expression? upper')
           (wrap-iso-date-as-absolute-datetime lower')
           lower')
         (if (temporal-expression? lower')
           (wrap-iso-date-as-absolute-datetime upper')
           upper')]
        [lhs lower' upper']))))

(defn repair-operator-form
  "Normalize a nested operator form using the recursive `repair-node` callback."
  [repair-node value]
  (let [[raw-op & raw-args] value
        op-name             (syntax/canonical-op-name raw-op)
        args                (mapv (fn [arg]
                                    (let [arg' (repair-node arg)]
                                      (if (#{"in"
                                             "not-in"
                                             "case"
                                             "with-fields"
                                             "with-join-fields"
                                             "with-join-conditions"} op-name)
                                        arg'
                                        (unwrap-singleton-form arg'))))
                                  raw-args)]
    (case op-name
      ("field" "table" "card" "metric" "measure")
      [op-name (coerce-positive-int (first args))]

      "aggregation-ref"
      [op-name (coerce-non-negative-int (first args))]

      "with-temporal-bucket"
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[field bucket] args]
          (if-let [extraction-op (and (string? bucket)
                                      (temporal-bucket-extraction-aliases bucket))]
            [extraction-op field]
            [op-name field bucket])))

      ("contains" "does-not-contain" "starts-with" "ends-with")
      (into [op-name]
            (cond-> args
              (and (> (count args) 2)
                   (or (map? (last args))
                       (boolean? (last args))))
              pop))

      ("in" "not-in")
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[lhs rhs] args]
          [op-name lhs (normalize-quarter-filter-value lhs rhs)]))

      "="
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[lhs rhs] args
              rhs'      (normalize-quarter-filter-value lhs rhs)]
          (if (scalar-sequential? rhs')
            ["in" lhs (vec rhs')]
            [op-name lhs rhs'])))

      "!="
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[lhs rhs] args
              rhs'      (normalize-quarter-filter-value lhs rhs)]
          (if (scalar-sequential? rhs')
            ["not-in" lhs (vec rhs')]
            [op-name lhs rhs'])))

      "is"
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[lhs rhs] args]
          (if (null-literal? rhs)
            ["is-null" lhs]
            ["=" lhs rhs])))

      "is-not"
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[lhs rhs] args]
          (if (null-literal? rhs)
            ["not-null" lhs]
            ["!=" lhs rhs])))

      "case"
      (let [args' (if (= "if" (syntax/raw-op-name raw-op))
                    (if (= 3 (count args))
                      [[[(first args) (second args)]] (nth args 2)]
                      args)
                    args)]
        (into [op-name] (repair-case-args args')))

      "between"
      (into [op-name] (repair-between-bounds args))

      "percentile"
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[expr percentile] args]
          [op-name expr (normalize-percentile-value percentile)]))

      "with-join-conditions"
      (if (< (count args) 2)
        (into [op-name] args)
        (let [[join-spec conditions] args]
          [op-name join-spec (normalize-join-conditions conditions)]))

      (into [op-name] args))))
