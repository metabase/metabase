(ns metabase.legacy-mbql.predicates
  "Predicate functions for checking whether something is a valid instance of a given MBQL clause."
  {:deprecated "0.57.0"}
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.util.malli.registry :as mr]))

(defn Field?
  "Is this a valid Field clause?"
  [x]
  ((mr/validator ::mbql.s/FieldOrExpressionRef) x))

(defn Filter?
  "Is this a valid `:filter` clause?"
  [x]
  ((mr/validator ::mbql.s/Filter) x))

(defn Emptyable?
  "Is this a valid Emptyable clause?"
  [x]
  ((mr/validator ::mbql.s/Emptyable) x))

(defn FieldOrExpressionDef?
  "Is this a something that is valid as a top-level expression definition?"
  [x]
  ((mr/validator ::mbql.s/FieldOrExpressionDef) x))
