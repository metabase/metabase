(ns metabase.lib-metric.measures
  "Pure multimethod implementations for :metadata/measure entities.
   These are accessors that read dimension-related data from measure metadata objects."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]))

(defmethod lib-metric.dimension/dimensionable-query :metadata/measure
  [{:keys [definition]}]
  (when (seq definition)
    definition))

(defmethod lib-metric.dimension/get-persisted-dimensions :metadata/measure
  [measure]
  (:dimensions measure))

(defmethod lib-metric.dimension/get-persisted-dimension-mappings :metadata/measure
  [measure]
  (:dimension-mappings measure))
