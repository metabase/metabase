(ns metabase.explorations.models.exploration-thread-metric
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadMetric [_model] :exploration_thread_metric)

(doto :model/ExplorationThreadMetric
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ExplorationThreadMetric
  {:dimension_mappings mi/transform-json})
