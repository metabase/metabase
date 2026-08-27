(ns metabase.lib-metric.metrics
  "Pure multimethod implementations for :metadata/metric entities (Cards with type=metric).
   These are accessors that read dimension-related data from metric metadata objects."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]))

(defmethod lib-metric.dimension/dimensionable-query :metadata/metric
  [{:keys [dataset-query]}]
  (when (seq dataset-query)
    dataset-query))
