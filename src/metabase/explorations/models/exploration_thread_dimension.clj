(ns metabase.explorations.models.exploration-thread-dimension
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadDimension [_model] :exploration_thread_dimension)

(doto :model/ExplorationThreadDimension
  (derive :metabase/model)
  (derive :hook/timestamped?))
