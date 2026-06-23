(ns metabase.explorations.models.exploration-query-timeline-interestingness
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationQueryTimelineInterestingness [_model]
  :exploration_query_timeline_interestingness)

(doto :model/ExplorationQueryTimelineInterestingness
  (derive :metabase/model)
  (derive :hook/timestamped?))
