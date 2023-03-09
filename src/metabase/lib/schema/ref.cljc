(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(mr/def ::field.options
  [:merge
   ::common/options
   [:map
    [:temporal-unit {:optional true} ::temporal-bucketing/unit]]])

;;; `:field` clause
(mr/def ::field
  [:and
   [:tuple
    [:= :field]
    [:or ::id/field ::common/non-blank-string]
    ::field.options]
   [:fn
    {:error/message "Field with integer ID, or string name with :base-type in the options"}
    (fn [[_field id-or-name options]]
      (or (integer? id-or-name)
          (and (string? id-or-name)
               (isa? (:base-type options) :type/*))))]])

(mbql-clause/define-mbql-clause :field ::field)

(mr/def ::expression
  [:tuple
   [:= :expression]
   ::common/non-blank-string])

(mbql-clause/define-mbql-clause :expression ::expression)

(mr/def ::aggregation
  [:tuple
   [:= :aggregation]
   ::common/int-greater-than-or-equal-to-zero])

(mbql-clause/define-mbql-clause :aggregation ::aggregation)

(mr/def ::ref
  [:and
   [:ref ::mbql-clause/clause]
   [:fn
    {:error/message ":expression, :aggregation, or :field ref"}
    (fn [clause]
      (#{:expression :aggregation :field} (first clause)))]])
