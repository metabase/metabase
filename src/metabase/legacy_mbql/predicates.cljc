(ns metabase.legacy-mbql.predicates
  "Predicate functions for checking whether something is a valid instance of a given MBQL clause."
  (:require
   [metabase.legacy-mbql.schema]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(comment metabase.legacy-mbql.schema/keep-me)

(def ^{:arglists '([unit])} DateTimeUnit?
  "Is `unit` a valid datetime bucketing unit?"
  (mr/validator ::lib.schema.temporal-bucketing/unit))

(def ^{:arglists '([field-clause])} Field?
  "Is this a valid Field clause?"
  (mr/validator :legacy-mbql/field))

(def ^{:arglists '([filter-clause])} Filter?
  "Is this a valid `:filter` clause?"
  (mr/validator :legacy-mbql/filter))

(def ^{:arglists '([filter-clause])} DatetimeExpression?
  "Is this a valid DatetimeExpression clause?"
  (mr/validator :legacy-mbql/datetime-expression))

(def ^{:arglists '([field-clause])} FieldOrExpressionDef?
  "Is this a something that is valid as a top-level expression definition?"
  (mr/validator :legacy-mbql/field-or-expression))
