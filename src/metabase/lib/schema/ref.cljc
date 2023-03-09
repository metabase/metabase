(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(mr/def ::field.options
  [:and
   ::common/options
   [:map
    [:temporal-unit {:optional true} ::temporal-bucketing/unit]]])

(mr/def ::field.literal.options
  [:merge
   ::field.options
   [:map
    [:base-type ::common/base-type]]])

;;; `:field` clause
(mr/def ::field.literal
  [:tuple
   [:= :field]
   ::field.literal.options
   ::common/non-blank-string])

(mr/def ::field.id
  [:tuple
   [:= :field]
   ::field.options ; TODO -- we should make `:base-type` required here too
   ::id/field])

(mbql-clause/define-mbql-clause :field
  [:and
   [:tuple
    [:= :field]
    ::field.options
    [:or ::id/field ::common/non-blank-string]]
   [:multi {:dispatch (fn [[_field _opts id-or-name]]
                        (lib.dispatch/dispatch-value id-or-name))}
    [:dispatch-type/integer ::field.id]
    [:dispatch-type/string ::field.literal]]])

(mbql-clause/define-tuple-mbql-clause :expression
  ::common/non-blank-string)

(mr/def ::aggregation-options
  [:merge
   ::common/options
   [:name {:optional true} ::common/non-blank-string]
   [:display-name {:optional true}] ::common/non-blank-string])

(mbql-clause/define-mbql-clause :aggregation
  [:tuple
   [:= :aggregation]
   ::aggregation-options
   ::common/int-greater-than-or-equal-to-zero])

(mr/def ::ref
  [:and
   ::mbql-clause/clause
   [:fn
    {:error/message ":field, :expression, :or :aggregation reference"}
    (fn [[tag :as _clause]]
      (#{:field :expression :aggregation} tag))]])
