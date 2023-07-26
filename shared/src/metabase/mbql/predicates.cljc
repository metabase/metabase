(ns metabase.mbql.predicates
  "Predicate functions for checking whether something is a valid instance of a given MBQL clause."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.expression.temporal
    :as lib.schema.expression.temporal]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.mbql.schema :as mbql.s]))

;;; TODO -- not sure if it's really a good idea to compile all these validators now, because if any of these schemas
;;; change we won't pick up the changes :(

(def ^{:arglists '([unit])} DateTimeUnit?
  "Is `unit` a valid datetime bucketing unit?"
  (mc/validator ::lib.schema.temporal-bucketing/unit))

(def ^{:arglists '([unit])} TimezoneId?
  "Is `unit` a valid datetime bucketing unit?"
  (mc/validator ::lib.schema.expression.temporal/timezone-id))

(def ^{:arglists '([ag-clause])} Aggregation?
  "Is this a valid Aggregation clause?"
  (mc/validator mbql.s/Aggregation))

(def ^{:arglists '([field-clause])} Field?
  "Is this a valid Field clause?"
  (mc/validator mbql.s/Field))

(def ^{:arglists '([filter-clause])} Filter?
  "Is this a valid `:filter` clause?"
  (mc/validator mbql.s/Filter))

(def ^{:arglists '([filter-clause])} DatetimeExpression?
  "Is this a valid DatetimeExpression clause?"
  (mc/validator mbql.s/DatetimeExpression))

(def ^{:arglists '([field-clause])} FieldOrExpressionDef?
  "Is this a something that is valid as a top-level expression definition?"
  (mc/validator mbql.s/FieldOrExpressionDef))
