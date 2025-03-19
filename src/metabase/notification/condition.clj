(ns metabase.notification.condition)

(defn evaluate-expression
  "Evaluates an array-based expression against a context payload"
  [expr context]
  (if (sequential? expr)
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
        :context (get-in context (map keyword operands))

        ;; Functions
        :count (count (evaluate-expression (first operands) context))
        :min   (apply min (map #(evaluate-expression % context) operands))
        :max   (apply max (map #(evaluate-expression % context) operands))))
    ;; literal value
    expr))

(comment
  (evaluate-expression ["and",
                        [">", ["count", ["context", "rows"]], 0],
                        ["=", ["context", "user_id"], 1]]
                       {:user_id 1
                        :rows [1 2 3 4]}))
