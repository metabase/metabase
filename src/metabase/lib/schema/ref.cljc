(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(mr/def ::field.options
  [:and
   ::common/options
   [:map
    [:temporal-unit {:optional true} ::temporal-bucketing/unit]]])

(mr/def ::base-type
  [:fn #(isa? % :type/*)])

(mr/def ::field.literal.options
  [:and
   ::field.options
   [:map
    [:base-type ::base-type]]])

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

(mr/def ::field
  [:and
   [:tuple
    [:= :field]
    ::field.options
    [:or ::id/field ::common/non-blank-string]]
   [:multi {:dispatch (fn [[_field _opts id-or-name]]
                        (lib.dispatch/dispatch-value id-or-name))}
    [:dispatch-type/integer ::field.id]
    [:dispatch-type/string ::field.literal]]])

(mr/def ::expression
  [:tuple
   [:= :expression]
   ::field.options
   ::common/non-blank-string])

(mr/def ::aggregation
  [:tuple
   [:= :aggregation]
   ::field.options
   ::common/int-greater-than-or-equal-to-zero])

(mr/def ::ref
  [:and
   [:tuple
    [:enum :field :expression :aggregation]
    ::field.options
    any?]
   [:multi {:dispatch      #(keyword (first %))
            :error/message ":field, :expression, :or :aggregation reference"}
    [:field ::field]
    [:aggregation ::aggregation]
    [:expression ::expression]]])
