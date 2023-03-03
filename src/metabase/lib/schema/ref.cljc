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
    [:base-type ]]])

;;; `:field` clause
(mr/def ::field.literal
  [:catn
   [:clause [:= :field]]
   [:options ::field.literal.options]
   [:name ::common/non-blank-string]])

(mr/def ::field.id
  [:catn
   [:clause [:= :field]]
   [:options ::field.options]
   [:name ::id/field]])

(mr/def ::field
  [:multi {:dispatch (fn [[_field _opts id-or-name]]
                       (lib.dispatch/dispatch-value id-or-name))}
   [:dispatch-type/integer ::field.id]
   [:dispatch-type/string ::field.literal]])

(mr/def ::expression
  [:catn
   [:clause [:= :expression]]
   [:options ::field.options]
   [:name ::common/non-blank-string]])

(mr/def ::aggregation
  [:catn
   [:clause [:= :aggregation]]
   [:options ::field.options]
   [:index ::common/int-greater-than-or-equal-to-zero]])

(mr/def ::ref
  [:and
   [:catn
    [:clause [:enum :field :expression :aggregation]]
    [:args   [:* any?]]]
   [:multi {:dispatch #(keyword (first %))}
    [:field ::field]
    [:aggregation ::aggregation]
    [:expression ::expression]]])
