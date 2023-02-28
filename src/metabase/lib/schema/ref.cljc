(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
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

;;; `:field` clause
(mr/def ::field
  [:and
   [:catn
    [:clause [:= :field]]
    [:id-or-name [:altn
                  [:id ::id/field]
                  [:name ::common/non-blank-string]]]
    [:options ::field.options]]
   [:fn (fn [[_field id-or-name options]]
          (or (integer? id-or-name)
              (and (string? id-or-name)
                   (isa? (:base-type options) :type/*))))]])

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
    [:clause [:keyword]]
    [:args   [:* any?]]]
   [:multi {:dispatch #(keyword (first %))}
    [:field ::field]
    [:aggregation ::aggregation]
    [:expression ::expression]]])
