(ns metabase.agent-lib.capabilities.catalog
  "Aggregated structured-program capability catalog split into smaller
  review-friendly groups."
  (:require
   [metabase.agent-lib.capabilities.catalog.aggregation :as aggregation]
   [metabase.agent-lib.capabilities.catalog.expressions :as expressions]
   [metabase.agent-lib.capabilities.catalog.filtering :as filtering]
   [metabase.agent-lib.capabilities.catalog.joins :as joins]
   [metabase.agent-lib.capabilities.catalog.ordering :as ordering]
   [metabase.agent-lib.capabilities.catalog.sources :as sources]
   [metabase.agent-lib.capabilities.catalog.top-level :as top-level]))

(set! *warn-on-reflection* true)

(def grouped-capability-catalog
  "Capability entries grouped into review-friendly sections."
  [{:group :top-level          :capabilities top-level/capabilities}
   {:group :sources            :capabilities sources/capabilities}
   {:group :filtering          :capabilities filtering/capabilities}
   {:group :aggregation        :capabilities aggregation/capabilities}
   {:group :breakout-ordering  :capabilities ordering/capabilities}
   {:group :expressions        :capabilities expressions/capabilities}
   {:group :joins              :capabilities joins/capabilities}])

(def raw-capability-catalog
  "Ordered structured-program capability metadata assembled from the grouped catalog."
  (into []
        (mapcat :capabilities)
        grouped-capability-catalog))
