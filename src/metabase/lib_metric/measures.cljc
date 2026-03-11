(ns metabase.lib-metric.measures
  "Pure multimethod implementations for :metadata/measure entities.
   These are accessors that read dimension-related data from measure metadata objects."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]))

(defmethod lib-metric.dimension/dimensionable-query :metadata/measure
  [{:keys [definition]}]
  (when (seq definition)
    definition))
