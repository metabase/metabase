(ns metabase.lib.schema.expression
  (:refer-clojure :exclude [boolean])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema.ref :as ref]
   [metabase.shared.util.i18n :as i18n]
   [metabase.types]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(defmulti type-of*
  "Impl for [[type-of]]. Use [[type-of]], but implement [[type-of*]].

  For MBQL clauses, try really hard not return an ambiguous set of possible types! Calculate things and determine what
  the result type will be!"
  {:arglists '([expr])}
  lib.dispatch/dispatch-value)

(defmethod type-of* :default
  [x]
  (throw (ex-info (i18n/tru "Don''t know how to determine the base type of {0}" (pr-str x))
                  {:x x})))

(def ^:private BaseType
  [:fn
   {:error/message "valid base type"}
   #(isa? % :type/*)])

(mu/defn type-of :- [:or
                     BaseType
                     [:set {:min 2} BaseType]]
  "Determine the type of an MBQL expression. Returns either a type keyword, or if the type is ambiguous, a set of
  possible types."
  [expr]
  (or
   ;; for MBQL clauses with `:base-type` in their options: ignore their dumb [[type-of*]] methods and return that type
   ;; directly. Ignore everything else! Life hack!
   (and (vector? expr)
        (keyword? (first expr))
        (map? (second expr))
        (:base-type (second expr)))
   (type-of* expr)))

(defn type-of?
  "Whether the [[type-of]] `expr` isa? [[metabase.types]] `base-type`."
  [expr base-type]
  (let [expr-type (type-of expr)]
    (assert ((some-fn keyword? set?) expr-type)
            (i18n/tru "type-of {0} returned an invalid type {1}" (pr-str expr) (pr-str expr-type)))
    (if (set? expr-type)
      (some (fn [a-type]
              (isa? a-type base-type))
            expr-type)
      (isa? expr-type base-type))))

(defn- type-of?-schema [base-type description]
  [:fn
   {:error/message description}
   #(type-of? % base-type)])

(mr/def ::boolean
  (type-of?-schema :type/Boolean "expression returning a boolean"))

(mr/def ::string
  (type-of?-schema :type/Text "expression returning a string"))

(mr/def ::integer
  (type-of?-schema :type/Integer "expression returning an integer"))

(mr/def ::non-integer-real
  (type-of?-schema :type/Float "expression returning a non-integer real number"))

(mr/def ::number
  (type-of?-schema :type/Number "expression returning a number"))

(mr/def ::temporal
  (type-of?-schema :type/Temporal "expression returning a date, time, or date time"))

;;; Any type of expression that you can appear in an `:order-by` clause, or in a filter like `:>` or `:<=`. This is
;;; basically everything except for boolean expressions.
(mr/def ::orderable
  [:or
   ::string
   ::number
   ::temporal
   ;; FIXME: assume all fields are orderable until we resolve #28911 and include `:base-type` info with every ref
   [:ref ::ref/ref]])

;;; Any type of expression that can appear in an `:=` or `:!=`. I guess this is currently everything?
(mr/def ::equality-comparable
  [:maybe
   [:or
    ::boolean
    ::string
    ::number
    ::temporal
    [:ref ::ref/ref]]])

;;; any type of expression.
(mr/def ::expression
  [:maybe
   [:or
    ::boolean
    ::string
    ::number
    ::temporal
    [:ref ::ref/ref]]])
