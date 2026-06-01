(ns metabase.explorations.models.exploration-thread-timeline
  (:require
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
          timelines    (when (seq timeline-ids)
                         (timeline/include-events
                          (t2/select :model/Timeline :id [:in timeline-ids])
                          {:events/all? false}))]
      (into {} (map (juxt :id identity)) timelines))
   :timeline_id))

(defn selected-names
  "Names of the timelines selected on `thread-id`, in position order."
  [thread-id]
  (->> (t2/query
        {:select    [[:t.name :name]]
         :from      [[:exploration_thread_timeline :ett]]
         :left-join [[:timeline :t] [:= :t.id :ett.timeline_id]]
         :where     [:= :ett.exploration_thread_id thread-id]
         :order-by  [[:ett.position :asc]]})
       (keep :name)))

(defn load-timeline-events
  "Fetch every non-archived timeline event from each timeline the user selected on `thread-id`,
  grouped by timeline. The events themselves carry the bulk of the analytical signal — names,
  descriptions, and timestamps tell downstream consumers (LLM prompts, etc.) *what happened*
  around the time the data changed. Returns a vector of
  `{:timeline-id :timeline-name :timeline-description :events [...]}` maps, events sorted by
  timestamp ascending."
  [thread-id]
  (let [rows (t2/query
              {:select   [[:t.id :timeline_id]
                          [:t.name :timeline_name]
                          [:t.description :timeline_description]
                          [:te.id :event_id]
                          [:te.name :event_name]
                          [:te.description :event_description]
                          [:te.timestamp :event_timestamp]
                          [:te.icon :event_icon]
                          [:ett.position :position]]
               :from     [[:exploration_thread_timeline :ett]]
               :join     [[:timeline :t] [:= :t.id :ett.timeline_id]]
               :left-join [[:timeline_event :te] [:and
                                                  [:= :te.timeline_id :t.id]
                                                  [:= :te.archived false]]]
               :where    [:= :ett.exploration_thread_id thread-id]
               :order-by [[:ett.position :asc] [:te.timestamp :asc]]})]
    (->> rows
         (group-by :timeline_id)
         (sort-by (fn [[_ rs]] (:position (first rs))))
         (mapv (fn [[_ tl-rows]]
                 (let [head (first tl-rows)]
                   {:timeline-id          (:timeline_id head)
                    :timeline-name        (:timeline_name head)
                    :timeline-description (:timeline_description head)
                    :events (->> tl-rows
                                 (keep (fn [r]
                                         (when (:event_id r)
                                           {:id          (:event_id r)
                                            :name        (:event_name r)
                                            :description (:event_description r)
                                            :timestamp   (u.date/format (:event_timestamp r))
                                            :icon        (:event_icon r)})))
                                 (sort-by :timestamp)
                                 vec)}))))))
