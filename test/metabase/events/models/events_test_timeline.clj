(ns metabase.events.models.events-test-timeline
  "Models of the timeline table that derive the events trait, for the tests of the event bus."
  (:require
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name ::Timeline [_model] :timeline)

(doto ::Timeline
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec ::Timeline
  [_model]
  {:create :event/events-test-timeline-create
   :update :event/events-test-timeline-update
   :delete :event/events-test-timeline-delete})

(methodical/defmethod t2/table-name ::TimelineUpdateOnly [_model] :timeline)

(doto ::TimelineUpdateOnly
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec ::TimelineUpdateOnly
  [_model]
  {:update :event/events-test-timeline-update-only-update})

(methodical/defmethod t2/table-name ::TimelineSelfUpdate [_model] :timeline)

(doto ::TimelineSelfUpdate
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec ::TimelineSelfUpdate
  [_model]
  {:create :event/events-test-timeline-self-update-create
   :update :event/events-test-timeline-self-update-update})

(t2/define-after-insert ::TimelineSelfUpdate
  [row]
  (t2/update! ::TimelineSelfUpdate :id (:id row) {:description "set by the hook"})
  row)

(methodical/defmethod t2/table-name ::TimelineConverted [_model] :timeline)

(doto ::TimelineConverted
  (derive :metabase/model)
  (derive :hook/timestamped-on-insert?)
  (derive :hook/entity-id))

(defmethod events/spec ::TimelineConverted
  [_model]
  {:create :event/events-test-timeline-converted-create
   :update :event/events-test-timeline-converted-update
   :delete :event/events-test-timeline-converted-delete})

(t2/define-after-insert ::TimelineConverted
  [row]
  (events/created! ::TimelineConverted row)
  row)

(defn create-timeline!
  "Insert `row`, whose after-insert hook publishes its create event, as a write function of a converted model does."
  [row]
  (events/with-batched-events
    (t2/insert-returning-instance! ::TimelineConverted row)))

(defn update-timeline!
  "Apply `changes` to the timeline with `id` and publish its update event, as a write function of a converted model
  does."
  [id changes _opts]
  (let [previous (t2/select-one ::TimelineConverted :id id)
        changes  (assoc changes :updated_at (mi/now))]
    (events/with-batched-events
      (u/prog1 (t2/update! ::TimelineConverted :id id changes)
        (events/updated! ::TimelineConverted (merge previous changes) previous)))))

(defn delete-timelines!
  "Delete the timelines with `ids` and publish their delete events, as a write function of a converted model does."
  [ids _opts]
  (let [rows (t2/select ::TimelineConverted :id [:in ids])]
    (events/with-batched-events
      (events/deleting! ::TimelineConverted rows #(t2/delete! ::TimelineConverted :id [:in ids])))))

(defmethod mi/write-fns ::TimelineConverted
  [_model]
  {:update! update-timeline!
   :delete! delete-timelines!})
