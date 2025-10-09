(ns metabase.legacy-mbql.predicates
  "Predicate functions for checking whether something is a valid instance of a given MBQL clause."
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.util.malli.registry :as mr]))

(defn Field?
  "Is this a valid Field clause?"
  {:deprecated "0.57.0"}
  [x]
  ((mr/validator ::mbql.s/field-or-expression-ref) x))

(defn Filter?
  "Is this a valid `:filter` clause?"
  {:deprecated "0.57.0"}
  [x]
  ((mr/validator ::mbql.s/Filter) x))

(defn Emptyable?
  "Is this a valid Emptyable clause?"
  {:deprecated "0.57.0"}
  [x]
  ((mr/validator ::mbql.s/Emptyable) x))

(defn FieldOrExpressionDef?
  "Is this a something that is valid as a top-level expression definition?"
  {:deprecated "0.57.0"}
  [x]
  ((mr/validator ::mbql.s/FieldOrExpressionDef) x))
