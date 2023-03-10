(ns metabase.lib.schema.aggregation
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::sum
  [:tuple
   [:= :sum]
   ::common/options
   [:ref ::expression/number]])

(mr/def ::aggregation
  [:or
   ::sum
   ;;; placeholder!
   any?])

(mr/def ::aggregations
  [:sequential {:min 1} [:ref ::aggregation]])
