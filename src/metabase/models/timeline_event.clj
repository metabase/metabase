(ns metabase.models.timeline-event
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel TimelineEvent :timeline_event)

;;;; permissions

(defn- perms-objects-set
  [event read-or-write]
  (let [timeline (or (:timeline event)
                     (db/select-one 'Timeline :id (:timeline_id event)))]
    (i/perms-objects-set timeline read-or-write)))

;;;; hydration

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

;;;; model

(u/strict-extend (class TimelineEvent)
  models/IModel
  (merge
   models/IModelDefaults
   ;; todo: add hydration keys??
   {#_#_:hydration-keys (constantly [:timeline-event])
    :properties (constantly {:timestamped? true})})

  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:perms-objects-set perms-objects-set
    :can-read?         (partial i/current-user-has-full-permissions? :read)
    :can-write?        (partial i/current-user-has-full-permissions? :write)}))
