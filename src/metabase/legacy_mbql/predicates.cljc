(ns metabase.legacy-mbql.predicates
  "Predicate functions for checking whether something is a valid instance of a given MBQL clause."
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.util.malli.registry :as mr]))

(def ^{:arglists '([field-clause])} Field?
  "Is this a valid Field clause?"
  (mr/validator mbql.s/Field))

(def ^{:arglists '([filter-clause])} Filter?
  "Is this a valid `:filter` clause?"
  (mr/validator mbql.s/Filter))

(def ^{:arglists '([emptyable-clause])} Emptyable?
  "Is this a valid Emptyable clause?"
  (mr/validator mbql.s/Emptyable))

(def ^{:arglists '([filter-clause])} DatetimeExpression?
  "Is this a valid DatetimeExpression clause?"
  (mr/validator mbql.s/DatetimeExpression))

(def ^{:arglists '([field-clause])} FieldOrExpressionDef?
  "Is this a something that is valid as a top-level expression definition?"
  (mr/validator ::mbql.s/FieldOrExpressionDef))
