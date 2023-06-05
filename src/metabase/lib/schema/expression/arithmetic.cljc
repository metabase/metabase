(ns metabase.lib.schema.expression.arithmetic
  "Arithmetic expressions like `:+`."
  (:require
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types :as types]
   [metabase.util.malli.registry :as mr]))

(defn- valid-interval-for-type? [[_tag _opts _n unit :as _interval] expr-type]
  (let [unit-schema (cond
                      (isa? expr-type :type/Date)     ::temporal-bucketing/unit.date.interval
                      (isa? expr-type :type/Time)     ::temporal-bucketing/unit.time.interval
                      (isa? expr-type :type/DateTime) ::temporal-bucketing/unit.date-time.interval)]
    (if unit-schema
      (mc/validate unit-schema unit)
      true)))

(mr/def ::args.temporal
  [:and
   [:catn
    [:expr      [:schema [:ref ::expression/temporal]]]
    [:intervals [:+ :mbql.clause/interval]]]
   [:fn
    {:error/message "Temporal arithmetic expression with valid interval units for the expression type"}
    (fn [[expr & intervals]]
      (let [expr-type (expression/type-of expr)]
        (every? #(valid-interval-for-type? % expr-type) intervals)))]])

(mr/def ::args.numbers
  [:repeat {:min 2} [:schema [:ref ::expression/number]]])

(defn- validate-plus-minus-temporal-arithmetic-expression
  "Validate a `:+` or `:-` expression with temporal args. Return a string describing any errors found, or `nil` if it
  looks ok."
  [[_tag _opts & exprs]]
  (let [{non-intervals false, intervals true} (group-by #(isa? (expression/type-of %) :type/Interval) exprs)]
    (cond
      (not= (count non-intervals) 1)
      "Temporal arithmetic expression must contain exactly one non-interval value"

      (< (count intervals) 1)
      "Temporal arithmetic expression must contain at least one :interval"

      :else
      (let [expr-type (expression/type-of (first non-intervals))]
        (some (fn [[_tag _opts _n unit :as interval]]
                (when-not (valid-interval-for-type? interval expr-type)
                  (str "Cannot add a " unit " interval to a " expr-type " expression")))
              intervals)))))

(defn- plus-minus-temporal-schema
  "Create a schema for `:+` or `:-` with temporal args: <temporal> ± <interval(s)> in any order"
  [tag]
  [:and
   {:error/message (str tag " clause with a temporal expression and one or more :interval clauses")}
   [:cat
    [:= tag]
    [:schema [:ref ::common/options]]
    [:repeat [:schema [:ref :mbql.clause/interval]]]
    [:schema [:ref ::expression/temporal]]
    [:repeat [:schema [:ref :mbql.clause/interval]]]]
   [:fn
    {:error/fn (fn [{:keys [value]} _]
                 (str "Invalid " tag " clause: " (validate-plus-minus-temporal-arithmetic-expression value)))}
    (complement validate-plus-minus-temporal-arithmetic-expression)]])

(defn- plus-minus-numeric-schema
  "Create a schema for `:+` or `:-` with numeric args."
  [tag]
  [:cat
   {:error/message (str tag " clause with numeric args")}
   [:= tag]
   [:schema [:ref ::common/options]]
   [:repeat {:min 2} [:schema [:ref ::expression/number]]]])

(defn- plus-minus-schema [tag]
  [:or
   (plus-minus-temporal-schema tag)
   (plus-minus-numeric-schema tag)])

(defn- type-of-numeric-arithmetic-args
  "Given a sequence of args to a numeric arithmetic expression like `:+`, determine the type returned by the expression
  by calculating the most-specific common ancestor type of all the args. E.g. `[:+ ... 2.0 2.0]` has two `:type/Float`
  args, and thus the most-specific common ancestor type is `:type/Float`. `[:+ ... 2.0 2]` has a `:type/Float` and a
  `:type/Integer` arg; the most-specific common ancestor type is `:type/Number`. For refs without type
  information (e.g. `:field` clauses), assume `:type/Number`."
  [args]
  ;; Okay to use reduce without an init value here since we know we have >= 2 args
  #_{:clj-kondo/ignore [:reduce-without-init]}
  (reduce
   types/most-specific-common-ancestor
   (map (fn [expr]
          (let [expr-type (expression/type-of expr)]
            (if (and (isa? expr-type ::expression/type.unknown)
                     (mc/validate :metabase.lib.schema.ref/ref expr))
              :type/Number
              expr-type)))
        args)))

(defn- type-of-temporal-arithmetic-args
  "Given a temporal value plus one or more intervals `args` passed to an arithmetic expression like `:+`, determine the
  overall type returned by the expression. This is the type of the temporal value (the arg that is not an interval),
  or assume `:type/Temporal` if it is a ref without type information."
  [args]
  (let [first-non-interval-arg-type (m/find-first #(not (isa? % :type/Interval))
                                                  (map expression/type-of args))]
    (if (isa? first-non-interval-arg-type ::expression/type.unknown)
      :type/Temporal
      first-non-interval-arg-type)))

(defn- type-of-arithmetic-args
  "Given a sequence of `args` to an arithmetic expression like `:+`, determine the overall type that the expression
  returns. There are two types of arithmetic expressions:

  * Ones consisting of numbers. See [[type-of-numeric-arithmetic-args]].

  * Ones consisting of a temporal value like a Date plus one or more `:interval` clauses, in any order. See
    [[type-of-temporal-arithmetic-args]]."
  [args]
  (if (some #(isa? (expression/type-of %) :type/Interval) args)
    ;; temporal value + intervals
    (type-of-temporal-arithmetic-args args)
    (type-of-numeric-arithmetic-args args)))

(mbql-clause/define-mbql-clause :+
  (plus-minus-schema :+))

;;; TODO -- should `:-` support just a single arg (for numbers)? What about `:+`?
(mbql-clause/define-mbql-clause :-
  (plus-minus-schema :-))

(mbql-clause/define-catn-mbql-clause :*
  [:args ::args.numbers])

;;; we always do non-integer real division even if all the expressions are integers, e.g.
;;;
;;;    [:/ <int-field>  2] => my_int_field / 2.0
;;;
;;; so the results are 0.5 as opposed to 0. This is what people expect division to do
(mbql-clause/define-catn-mbql-clause :/ :- :type/Float
  [:args ::args.numbers])

(doseq [tag [:+ :- :*]]
  (lib.hierarchy/derive tag :lib.type-of/type-is-type-of-arithmetic-args))

;;; `:+`, `:-`, and `:*` all have the same logic; also used for [[metabase.lib.metadata.calculation/type-of-method]]
(defmethod expression/type-of-method :lib.type-of/type-is-type-of-arithmetic-args
  [[_tag _opts & args]]
  (type-of-arithmetic-args args))

(mbql-clause/define-tuple-mbql-clause :abs
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :abs :lib.type-of/type-is-type-of-first-arg)

(doseq [op [:log :exp :sqrt]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Float
    [:schema [:ref ::expression/number]]))

(doseq [op [:ceil :floor :round]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Integer
    [:schema [:ref ::expression/number]]))

(mbql-clause/define-tuple-mbql-clause :power
  #_num [:schema [:ref ::expression/number]]
  #_exp [:schema [:ref ::expression/number]])

(defmethod expression/type-of-method :power
  [[_tag _opts expr exponent]]
  ;; if both expr and exponent are integers, this will return an integer.
  (if (and (isa? (expression/type-of expr) :type/Integer)
           (isa? (expression/type-of exponent) :type/Integer))
    :type/Integer
    ;; otherwise this will return some sort of number with a decimal place. e.g.
    ;;
    ;;    (Math/pow 2 2.1) => 4.2870938501451725
    ;;
    ;; If we don't know the type of `expr` or `exponent` it's safe to assume `:type/Float` anyway, maybe not as
    ;; specific as `:type/Integer` but better than `:type/*` or `::expression/type.unknown`.
    :type/Float))
