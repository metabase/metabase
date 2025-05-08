(ns metabase.notification.condition
  (:require
   [metabase.util :as u]))

(defn evaluate-expression
  "Evaluates an array-based expression against a context payload"
  [expr context]
  (cond
    (sequential? expr)
    (let [operator (first expr)
          operands (rest expr)]
      (case (keyword operator)
        ;; Logical operators
        :and (boolean (every? #(evaluate-expression % context) operands))
        :or  (boolean (some #(evaluate-expression % context) operands))
        :not (not (evaluate-expression (first operands) context))

        ;; Comparison operators
        :=  (apply = (map #(evaluate-expression % context) operands))
        :!= (apply not= (map #(evaluate-expression % context) operands))
        :>  (apply > (map #(evaluate-expression % context) operands))
        :<  (apply < (map #(evaluate-expression % context) operands))
        :>= (apply >= (map #(evaluate-expression % context) operands))
        :<= (apply <= (map #(evaluate-expression % context) operands))

        ;; Data access
        :context (let [v (get-in context (map keyword operands))]
                   (if (keyword? v)
                     (u/qualified-name v)
                     v))

        ;; Functions
        :count (count (evaluate-expression (first operands) context))
        :min   (apply min (map #(evaluate-expression % context) operands))
        :max   (apply max (map #(evaluate-expression % context) operands))))
    ;; keyword are converted to string
    (keyword? expr)
    ;; literal value
    (u/qualified-name expr)
    :else expr))

(comment
  (evaluate-expression ["and",
                        [">", ["count", ["context", "rows"]], 0],
                        ["=", ["context", "user_id"], 1]
                        ["=", ["context", "event_name"], "created"]]
                       {:user_id 1
                        :rows [1 2 3 4]
                        :event_name :created}))
