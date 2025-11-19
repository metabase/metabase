(ns metabase-enterprise.representations.v0.timeline
  (:require
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(def toucan-model
  "The toucan model keyword associated with timeline representations"
  :model/Timeline)

(defmethod v0-common/representation-type :model/Timeline [_entity]
  :timeline)

(defn- export-timeline-event
  "Export a TimelineEvent Toucan entity to representation format."
  [t2-event]
  (u/remove-nils
   {:name (:name t2-event)
    :description (:description t2-event)
    :timestamp (u.date/format (:timestamp t2-event))
    :time_matters (:time_matters t2-event)
    :timezone (:timezone t2-event)
    :icon (:icon t2-event)
    :archived (:archived t2-event)}))

(defn export-timeline
  "Export a Timeline Toucan entity to a v0 timeline representation."
  [t2-timeline]
  (let [events (t2/select :model/TimelineEvent :timeline_id (:id t2-timeline))]
    (u/remove-nils
     {:type :timeline
      :version :v0
      :name (format "timeline-%s" (:id t2-timeline))
      :display_name (:name t2-timeline)
      :description (:description t2-timeline)
      :icon (:icon t2-timeline)
      :default (:default t2-timeline)
      :archived (:archived t2-timeline)
      :events (mapv export-timeline-event events)})))

(defn- yaml->timeline-event
  "Convert a timeline event from the representation format to Toucan-compatible data."
  [event-data]
  (u/remove-nils
   {:name (:name event-data)
    :description (:description event-data)
    :timestamp (u.date/parse (:timestamp event-data))
    :time_matters (:time_matters event-data)
    :timezone (:timezone event-data)
    :icon (:icon event-data)
    :archived (or (:archived event-data) false)}))

(defn yaml->toucan
  "Convert a v0 timeline representation to Toucan-compatible data."
  [{display-name :display_name
    :keys [description icon default archived events] :as _representation}
   _ref-index]
  (u/remove-nils
   {:name display-name
    :description description
    :icon icon
    :default (or default false)
    :archived (or archived false)
    :events (when events
              (mapv yaml->timeline-event events))}))

(defn- insert-timeline-events!
  "Insert timeilne events for the given timeline ID."
  [timeline-id events]
  (when (seq events)
    (t2/insert-returning-instances! :model/TimelineEvent
                                    (for [event events]
                                      (let [t2-event (->> (yaml->timeline-event event)
                                                          (rep-t2/with-toucan-defaults :model/TimelineEvent))]
                                        (assoc t2-event :timeline_id timeline-id))))))

(defn insert!
  "Insert a v0 timeline as a new entity, handling events as well"
  [representation ref-index]
  (let [t2-timeline (->> (yaml->toucan representation ref-index)
                         (rep-t2/with-toucan-defaults :model/Timeline))
        timeline (t2/insert-returning-instance! :model/Timeline (dissoc t2-timeline :events))
        events (insert-timeline-events! (:id timeline) (:events representation))]
    (assoc timeline :events events)))

(defn update!
  "Update an existing v0 timeline from a representation."
  [representation id ref-index]
  (let [t2-timeline (yaml->toucan representation ref-index)]
    (t2/update! :model/Timeline id (dissoc t2-timeline :entity_id :events)))
  (t2/delete! :model/TimelineEvent :timeline_id id)
  (insert-timeline-events! id (:events representation))
  (let [timeline (t2/select-one :model/Timeline :id id)
        events (t2/select :model/TimelineEvent :timeline_id id)]
    (assoc timeline :events events)))

(defn persist!
  "Persist a v0 transform representation by creating or updating it in the database."
  [_representation _ref-index]
  nil)
