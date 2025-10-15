(ns metabase.notification.condition
  "Generic expression evaluator for conditional logic.

  Evaluates array-based expressions against context data to determine boolean outcomes.
  Originally developed for notification conditions but designed as a reusable utility.

  Currently unused - preserved from Team Workflow's Internal Tools development for future use."
  (:require
   [metabase.util :as u]
   [metabase.util.performance :as perf]))

(defn- evaluate-expression*
  [expr context]
  (cond
    (sequential? expr)
    (let [operator (first expr)
          operands (rest expr)]
      (case (keyword operator)
        ;; Logical operators
        :and (boolean (every? #(evaluate-expression* % context) operands))
        :or  (boolean (some #(evaluate-expression* % context) operands))
        :not (not (evaluate-expression* (first operands) context))

        ;; Comparison operators
        :=  (apply = (map #(evaluate-expression* % context) operands))
        :!= (apply not= (map #(evaluate-expression* % context) operands))
        :>  (apply > (map #(evaluate-expression* % context) operands))
        :<  (apply < (map #(evaluate-expression* % context) operands))
        :>= (apply >= (map #(evaluate-expression* % context) operands))
        :<= (apply <= (map #(evaluate-expression* % context) operands))

        ;; Data access
        :context (let [v (get-in context (map keyword operands))]
                   (cond-> v
                     (keyword? v) u/qualified-name))

        ;; Functions
        :count (count (evaluate-expression* (first operands) context))
        :min   (apply min (map #(evaluate-expression* % context) operands))
        :max   (apply max (map #(evaluate-expression* % context) operands))))
    ;; keyword are converted to string
    (keyword? expr)
    ;; literal value
    (u/qualified-name expr)
    :else expr))

(defn evaluate-expression
  "Evaluates an array-based expression against a context payload"

  [expr context]
  (evaluate-expression* expr (perf/keywordize-keys context)))

(comment
  (evaluate-expression ["and",
                        [">", ["count", ["context", "rows"]], 0],
                        ["=", ["context", "user_id"], 1]
                        ["=", ["context", "event_name"], "created"]]
                       {:user_id    1
                        :rows       [1 2 3 4]
                        :event_name :created}))
