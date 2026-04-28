(ns metabase.explorations.models.exploration-thread-timeline
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadTimeline [_model] :exploration_thread_timeline)

(doto :model/ExplorationThreadTimeline
  (derive :metabase/model)
  (derive :hook/timestamped?))
