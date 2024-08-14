(ns metabase.lib.schema.expression.arithmetic
  "Arithmetic expressions like `:+`."
  (:require
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
      (mr/validate unit-schema unit)
      true)))

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

;;; TODO -- doesn't really make sense to say something like `[:- <interval -1 day> "2023-11-23"]`, does it? What does -1
;;; day minus <date> mean?
(mr/def ::plus-minus-temporal-interval-schema
  [:and
   {:error/message ":+ or :- clause with a temporal expression and one or more :interval clauses"}
   [:cat
    {:min 4}
    [:enum :+ :-]
    [:schema [:ref ::common/options]]
    [:repeat [:schema [:ref :mbql.clause/interval]]]
    [:schema [:ref ::expression/temporal]]
    [:repeat [:schema [:ref :mbql.clause/interval]]]]
   [:fn
    {:error/fn (fn [{:keys [value]} _]
                 (str "Invalid :+ or :- clause: " (validate-plus-minus-temporal-arithmetic-expression value)))}
    (complement validate-plus-minus-temporal-arithmetic-expression)]])

(mr/def ::plus-minus-numeric-schema
  [:cat
   {:error/message ":+ or :- clause with numeric args"}
   :keyword
   [:schema [:ref ::common/options]]
   [:repeat {:min 2} [:schema [:ref ::expression/number]]]])

(defn- type-of-numeric-arithmetic-arg [expr]
  (let [expr-type (expression/type-of expr)]
    (if (and (isa? expr-type ::expression/type.unknown)
             (mr/validate :metabase.lib.schema.ref/ref expr))
      :type/Number
      expr-type)))

(defn- type-of-numeric-arithmetic-args
  "Given a sequence of args to a numeric arithmetic expression like `:+`, determine the type returned by the expression
  by calculating the most-specific common ancestor type of all the args. E.g. `[:+ ... 2.0 2.0]` has two `:type/Float`
  args, and thus the most-specific common ancestor type is `:type/Float`. `[:+ ... 2.0 2]` has a `:type/Float` and a
  `:type/Integer` arg; the most-specific common ancestor type is `:type/Number`. For refs without type
  information (e.g. `:field` clauses), assume `:type/Number`."
  [args]
  (transduce
   (map type-of-numeric-arithmetic-arg)
   (completing (fn [x y]
                 (if (nil? x)
                   y
                   (types/most-specific-common-ancestor x y))))
   nil
   args))

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
  returns. There are three types of arithmetic expressions:

  * Ones consisting of numbers. See [[type-of-numeric-arithmetic-args]].

  * Ones consisting of a temporal value like a Date plus one or more `:interval` clauses, in any order. See
    [[type-of-temporal-arithmetic-args]].

  * Ones consisting of exactly two temporal values being subtracted to produce an `:interval`. See
    [[type-of-temporal-arithmetic-args]]."
  [tag args]
  (cond
    ;; temporal value + intervals
    (some #(isa? (expression/type-of %) :type/Interval) args)
    (type-of-temporal-arithmetic-args args)

    ;; the difference of exactly two temporal values
    (and (= tag :-)
         (= (count args) 2)
         (or (every? #(isa? (expression/type-of %) :type/Date) args)
             (every? #(isa? (expression/type-of %) :type/DateTime) args)))
    :type/Interval

    ;; fall back to numeric args
    :else (type-of-numeric-arithmetic-args args)))

(mr/def ::temporal-difference-schema
  [:cat
   {:error/message ":- clause taking the difference of two temporal expressions"}
   [:= {:decode/normalize common/normalize-keyword} :-]
   [:schema [:ref ::common/options]]
   [:schema [:ref ::expression/temporal]]
   [:schema [:ref ::expression/temporal]]])

(mbql-clause/define-mbql-clause :+
  [:and
   {:error/message "valid :+ clause"}
   [:cat
    [:= {:decode/normalize common/normalize-keyword} :+]
    [:schema [:ref ::common/options]]
    [:+ {:min 2} :any]]
   [:multi
    {:dispatch (fn [[_tag _opts & args]]
                 (if (some #(common/is-clause? :interval %)
                           args)
                   :temporal
                   :numeric))}
    [:temporal [:ref ::plus-minus-temporal-interval-schema]]
    [:numeric  [:ref ::plus-minus-numeric-schema]]]])

;;; TODO -- should `:-` support just a single arg (for numbers)? What about `:+`?
(mbql-clause/define-mbql-clause :-
  [:and
   [:cat
    [:= {:decode/normalize common/normalize-keyword} :-]
    [:schema [:ref ::common/options]]
    [:+ {:min 2} :any]]
   [:multi
    {:dispatch (fn [[_tag _opts & args]]
                 (cond
                   (some #(common/is-clause? :interval %) args) :temporal
                   (> (count args) 2)                           :numeric
                   :else                                        :numeric-or-temporal-difference))}
    [:temporal [:ref ::plus-minus-temporal-interval-schema]]
    [:numeric  [:ref ::plus-minus-numeric-schema]]
    ;; TODO -- figure out a way to know definitively what type of `:-` this should be so we don't need to use `:or`
    [:numeric-or-temporal-difference
     [:or
      [:ref ::plus-minus-numeric-schema]
      [:ref ::temporal-difference-schema]]]]])

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
  [[tag _opts & args]]
  (type-of-arithmetic-args tag args))

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
