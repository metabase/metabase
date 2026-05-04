(ns metabase.explorations.models.exploration-thread-timeline
  (:require
   [metabase.models.interface :as mi]
   [metabase.timeline.core :as timeline]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadTimeline [_model] :exploration_thread_timeline)

(doto :model/ExplorationThreadTimeline
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThreadTimeline :timeline]
  [_model k join-rows]
  (mi/instances-with-hydrated-data
   join-rows k
   #(let [timeline-ids (into #{} (map :timeline_id) join-rows)
          timelines    (when (seq timeline-ids)
                         (timeline/include-events
                          (t2/select :model/Timeline :id [:in timeline-ids])
                          {:events/all? false}))]
      (into {} (map (juxt :id identity)) timelines))
   :timeline_id))
