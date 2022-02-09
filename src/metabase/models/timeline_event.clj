(ns metabase.models.timeline-event
  (:require [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel TimelineEvent :timeline_event)

(u/strict-extend (class TimelineEvent)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})})

  ;; todo: need correct the following to follow collection id of the timeline, the parent of the current timeline
  ;; event

  ;; i/IObjectPermissions
  ;; perms/IObjectPermissionsForParentCollection
  )

(defn hydrate-events
  "Efficiently hydrate the events for a timeline."
  {:batched-hydrate :timeline-events}
  [timelines]
  (when (seq timelines)
    (let [timeline-id->events (->> (db/select TimelineEvent
                                     :timeline_id [:in (map :id timelines)]
                                     :archived false
                                     {:order-by [[:timestamp :asc]]})
                                   (group-by :timeline_id))]
      (for [{:keys [id] :as timeline} timelines]
        (when timeline
          (assoc timeline :timeline-events (timeline-id->events id)))))))
