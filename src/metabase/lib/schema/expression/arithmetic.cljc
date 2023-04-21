(ns metabase.lib.schema.expression.arithmetic
  "Arithmetic expressions like `:+`."
  (:require
   [malli.core :as mc]
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

(defn- plus-minus-schema [tag]
  [:or
   [:and
    [:cat
     [:= tag]
     [:schema [:ref ::common/options]]
     [:schema [:ref ::expression/temporal]]
     [:repeat {:min 1} [:schema [:ref :mbql.clause/interval]]]]
    [:fn
     {:error/message "Temporal arithmetic expression with valid interval units for the expression type"}
     (fn [[_tag _opts expr & intervals]]
       (let [expr-type (expression/type-of expr)]
         (every? #(valid-interval-for-type? % expr-type) intervals)))]]
   [:cat
    [:= tag]
    [:schema [:ref ::common/options]]
    [:repeat {:min 2} [:schema [:ref ::expression/number]]]]])

(defn- type-of-arithmetic-args [args]
  ;; Okay to use reduce without an init value here since we know we have >= 2 args
  #_{:clj-kondo/ignore [:reduce-without-init]}
  (reduce types/most-specific-common-ancestor (map expression/type-of args)))

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
(defmethod expression/type-of* :lib.type-of/type-is-type-of-arithmetic-args
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

(defmethod expression/type-of* :power
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
