(ns metabase.notification.condition
  "Expression language for evaluating conditions in notifications.

  Grammar:

    <expr> ::= <literal> | <func_eval>

    <literal> ::= <number> | <string> | <boolean>
    <number> ::= integer or decimal
    <string> ::= quoted text
    <boolean> ::= true | false

    <func_eval> ::= [<func>, <expr>*]

    <func> ::= 'and' | 'or' | 'not' | '=' | '!=' | '>' | '<' | '>=' | '<=' 
               | 'max' | 'min' | 'count' | 'context' | 'this' | 'every' | 'some' | 'none'
    <expr>* ::= zero or more expressions or paths"
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u]))

(def ^{:dynamic true
       :private true}
  *local-context* nil)

(declare evaluate-expression)

(defn- stringify-map
  "Turn all map keys into strings"
  [m]
  (walk/postwalk
   #(if (map? %)
      (update-keys % u/qualified-name)
      %)
   m))

(defn- collection-predicate-op
  "Helper function for collection predicate operations (every?, some, not-any?)"
  [pred-fn [pred col] context]
  (pred-fn #(binding [*local-context* (stringify-map %)]
              (evaluate-expression pred context))
           (evaluate-expression col context)))

(defn evaluate-expression
  "Evaluates an array-based expression against a context payload"
  [expr context]
  (if (sequential? expr)
    (let [operator (first expr)
          operands (rest expr)
          context  (stringify-map context)]
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
        :context (get-in context operands)
        :this    (if (seq operands)
                   (get-in *local-context* operands)
                   *local-context*)

        ;; Collection predicates, [:every predicate collection]
        ;; Predicate is an expression that returns a boolean. It'll bind *local-context*
        ;; when it's evaluated. Use [:this] to refer to the current context.
        :every   (collection-predicate-op every? operands context)
        :some    (collection-predicate-op some operands context)
        :none    (collection-predicate-op not-any? operands context)

        ;; Functions
        :count (count (evaluate-expression (first operands) context))
        :min   (apply min (map #(evaluate-expression % context) operands))
        :max   (apply max (map #(evaluate-expression % context) operands))))
    ;; literal value
    expr))
