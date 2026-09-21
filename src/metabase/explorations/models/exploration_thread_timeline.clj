(ns metabase.explorations.models.exploration-thread-timeline
  (:require
   [metabase.explorations.db :as explorations.db]
   [metabase.models.interface :as mi]
   [metabase.timeline.core :as timeline]
   [metabase.util.date-2 :as u.date]
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
          ;; Timeline ids are read-checked when attached (POST /api/exploration), which is the
          ;; primary permission boundary. The `mi/can-read?` filter here (collection perms)
          ;; additionally hides the full timeline + events from viewers when a timeline has since
          ;; moved into a collection they can't read — those rows hydrate with a nil `:timeline`.
          timelines    (when (seq timeline-ids)
                         (timeline/include-events
                          (filterv mi/can-read?
                                   (explorations.db/timelines timeline-ids))
                          {:events/all? false}))]
      (into {} (map (juxt :id identity)) timelines))
   :timeline_id))

(defn selected-names
  "Names of the timelines selected on `thread-id`, in position order."
  [thread-id]
  (->> (explorations.db/thread-timeline-names thread-id)
       (keep :name)))

(defn load-timeline-events
  "Fetch every non-archived timeline event from each timeline the user selected on `thread-id`,
  grouped by timeline. The events themselves carry the bulk of the analytical signal — names,
  descriptions, and timestamps tell downstream consumers (LLM prompts, etc.) *what happened*
  around the time the data changed. Returns a vector of
  `{:timeline-id :timeline-name :timeline-description :events [...]}` maps, events sorted by
  timestamp ascending."
  [thread-id]
  (let [rows (explorations.db/thread-timeline-event-rows thread-id)]
    (->> rows
         (group-by :timeline_id)
         (sort-by (fn [[_ rs]] (:position (first rs))))
         (mapv (fn [[_ tl-rows]]
                 (let [head (first tl-rows)]
                   {:timeline-id          (:timeline_id head)
                    :timeline-name        (:timeline_name head)
                    :timeline-description (:timeline_description head)
                    ;; Rows arrive timestamp-ascending from the SQL ORDER BY; `group-by` preserves
                    ;; encounter order within each timeline, so no re-sort is needed here.
                    :events (->> tl-rows
                                 (keep (fn [r]
                                         (when (:event_id r)
                                           {:id          (:event_id r)
                                            :name        (:event_name r)
                                            :description (:event_description r)
                                            :timestamp   (u.date/format (:event_timestamp r))
                                            :icon        (:event_icon r)})))
                                 vec)}))))))
