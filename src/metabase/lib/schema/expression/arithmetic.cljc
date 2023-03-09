(ns metabase.lib.schema.expression.arithmetic
  "Arithmetic expressions like `:+`."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types :as types]
   [metabase.util.malli.registry :as mr]))

(mbql-clause/define-tuple-mbql-clause :interval
  :int
  ::temporal-bucketing/unit.date-time.interval)

(defmethod expression/type-of* :interval
  [[_tag _opts expr _n _unit]]
  (expression/type-of expr))

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

(defn- type-of-arithmetic-args [args]
  ;; Okay to use reduce without an init value here since we know we have >= 2 args
  #_{:clj-kondo/ignore [:reduce-without-init]}
  (reduce types/most-specific-common-ancestor (map expression/type-of args)))

(defmethod expression/type-of* :+
  [[_tag _opts & args]]
  (type-of-arithmetic-args args))

(defmethod expression/type-of* :-
  [[_tag _opts & args]]
  (type-of-arithmetic-args args))

(defmethod expression/type-of* :*
  [[_tag _opts & args]]
  (type-of-arithmetic-args args))
