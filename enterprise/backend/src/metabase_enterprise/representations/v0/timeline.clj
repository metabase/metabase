(ns metabase-enterprise.representations.v0.timeline
  (:require
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def toucan-model
  "The toucan model keyword associated with timeline representations"
  :model/Timeline)

(defmethod v0-common/representation-type :model/Timeline [_entity]
  :timeline)

(defn- yaml->timeline-event
  "Convert a timeline event from the representation format to Toucan-compatible data."
  [event-data]
  (u/remove-nils
   {:name (:name event-data)
    :description (:description event-data)
    :timestamp (:timestamp event-data)
    :time_matters (:time_matters event-data)
    :timezone (:timezone event-data)
    :icon (:icon event-data)
    :archived (or (:archived event-data) false)}))

(defn yaml->toucan
  "Convert a v0 timeline representation to Toucan-compatible data."
  [{timeline-name :display_name
    :keys [name description icon default archived events] :as _representation}
   ref-index]
  (u/remove-nils
   {:name (or timeline-name name)
    :description description
    :icon icon
    :default (or default false)
    :archived (or archived false)
    ::v0-common/delete-before-output
    {:events (when events
               (mapv yaml->timeline-event events))}}))

(defn persist!
  "Persist a v0 timeline representation by creating or updating it in the database."
  [representation ref-index]
  (let [timeline-data (yaml->toucan representation ref-index)
        events (get-in timeline-data [::v0-common/delete-before-output :events])
        timeline-data-clean (dissoc timeline-data ::v0-common/delete-before-output)
        new-timeline (->> timeline-data-clean
                          (rep-t2/with-toucan-defaults :model/Timeline))
        timeline-name (:name new-timeline)
        existing (t2/select-one :model/Timeline :name timeline-name)]
    (if existing
      (do
        (log/info "Updating existing timeline" timeline-name)
        (t2/update! :model/Timeline (:id existing) (dissoc new-timeline :name))
        (when events
          (log/debug "Deleting old events for timeline" timeline-name)
          (t2/delete! :model/TimelineEvent :timeline_id (:id existing))
          (log/debug "Creating" (count events) "events for timeline" timeline-name)
          (doseq [event events]
            (t2/insert! :model/TimelineEvent (assoc event :timeline_id (:id existing)))))
        (t2/select-one :model/Timeline :id (:id existing)))
      (do
        (log/info "Creating new timeline" timeline-name)
        (let [created-timeline (t2/insert-returning-instance! :model/Timeline new-timeline)]
          (when events
            (log/debug "Creating" (count events) "events for timeline" timeline-name)
            (doseq [event events]
              (t2/insert! :model/TimelineEvent (assoc event :timeline_id (:id created-timeline)))))
          created-timeline)))))

(defn- export-timeline-event
  "Export a TimelineEvent Toucan entity to representation format."
  [t2-event]
  (u/remove-nils
   {:name (:name t2-event)
    :description (:description t2-event)
    :timestamp (str (:timestamp t2-event))
    :time_matters (:time_matters t2-event)
    :timezone (:timezone t2-event)
    :icon (:icon t2-event)
    :archived (:archived t2-event)}))

(defn export-timeline
  "Export a Timeline Toucan entity to a v0 timeline representation."
  [t2-timeline]
  (let [events (t2/select :model/TimelineEvent :timeline_id (:id t2-timeline))]
    (-> {:type :timeline
         :version :v0
         :name (format "timeline-%s" (:id t2-timeline))
         :display_name (:name t2-timeline)
         :description (:description t2-timeline)
         :icon (:icon t2-timeline)
         :default (:default t2-timeline)
         :archived (:archived t2-timeline)
         :events (mapv export-timeline-event events)}
        u/remove-nils)))
