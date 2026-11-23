(ns metabase.timeline.models.timeline-event
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Setup -------------------------------------------------------

(methodical/defmethod t2/table-name :model/TimelineEvent  [_model] :timeline_event)

(doto :model/TimelineEvent
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def default-icon
  "The default icon for Timeline and TimelineEvents."
  "star")

(defn valid-timezone?
  "Whether `timezone` names a time zone."
  [timezone]
  (try
    (boolean (java.time.ZoneId/of timezone java.time.ZoneId/SHORT_IDS))
    (catch java.time.DateTimeException _
      false)))

(def Timezone
  "Schema for the `timezone` of a TimelineEvent a request writes: a string naming a time zone."
  (mu/with-api-error-message
   [:and :string [:fn valid-timezone?]]
   (deferred-tru "Invalid Timeline event timezone.")))

(def Source
  "Timeline Event Source Schema. For Snowplow Events, where the Event is created from is important.
  Events are added from one of four sources: `collections`, `question` (cards in backend code), `dashboard`, or directly
  with an API call. An API call is indicated by having no source key in the `timeline-event` request."
  [:enum "collections" "question" "dashboard"])

(t2/define-after-select :model/TimelineEvent
  [timeline-event]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline-event :icon (fn [icon]
                                 (if (= icon "balloons") default-icon icon))))

;;; ------------------------------------------------------ Hooks -------------------------------------------------------

(t2/define-before-insert :model/TimelineEvent
  [row]
  (cond-> row
    (and (nil? (:icon row)) (:timeline_id row)) (assoc :icon (timeline.db/icon-clause (:timeline_id row) default-icon))
    (and (nil? (:icon row)) (nil? (:timeline_id row))) (assoc :icon default-icon)))

(t2/define-before-update :model/TimelineEvent
  [event]
  (let [changes (t2/changes event)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a Timeline event.") {:status-code 400})))
    event))

;;; --------------------------------------------------- Permissions ----------------------------------------------------

(defn- timeline-permissions
  "Whether the current user passes `check`, `mi/can-read?` or `mi/can-write?`, on the Timeline of each of `events`, by
  Timeline id, the Timelines hydrated with `k` together."
  [k check events]
  (run! #(when % (api/check-500 (contains? % :timeline_id) "No :timeline_id is set for a TimelineEvent.")) events)
  (let [ids (into [] (comp (remove nil?) (keep :timeline_id) (distinct)) events)]
    (if (seq ids)
      (into {} (map (juxt :id check)) (t2/hydrate (vals (timeline.db/timelines-by-ids ids)) k))
      {})))

(methodical/defmethod t2/batched-hydrate [:model/TimelineEvent :can_read]
  [_model k events]
  (let [permissions (timeline-permissions k mi/can-read? events)]
    (for [event events]
      (when event
        (vary-meta event assoc :can_read (boolean (get permissions (:timeline_id event))))))))

(methodical/defmethod t2/batched-hydrate [:model/TimelineEvent :can_write]
  [_model k events]
  (let [permissions (timeline-permissions k mi/can-write? events)]
    (for [event events]
      (when event
        (assoc event :can_write (boolean (get permissions (:timeline_id event))))))))

(defn- timeline-of
  "The Timeline with `timeline-id`, or a 404 when there is none."
  [timeline-id]
  (api/check-404 (when timeline-id (timeline.db/timeline timeline-id))))

(defmethod mi/can-create? :model/TimelineEvent
  [_model {timeline-id :timeline_id}]
  (mi/can-create? :model/Timeline {:collection_id (:collection_id (timeline-of timeline-id))}))

(defmethod mi/can-update? :model/TimelineEvent
  [event changes]
  (and (mi/can-write? event)
       (or (not (api/column-will-change? (:timeline_id event) (get changes :timeline_id ::api/not-provided)))
           (mi/can-write? (t2/hydrate (timeline-of (:timeline_id changes)) :can_write)))))

;;; ---------------------------------------------------- Hydration -----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/TimelineEvent :timeline]
  [_model k events]
  (mi/instances-with-hydrated-data
   events k
   #(timeline.db/timelines-by-ids (map :timeline_id events))
   :timeline_id))

(defn- fetch-events
  "Fetch events for timelines in `timeline-ids`. Can include optional `start` and `end` dates in the options map, as
  well as `all?`. By default, will return only unarchived events, unless `all?` is truthy and will return all events
  regardless of archive state."
  [timeline-ids {:events/keys [all? start end]}]
  (t2/hydrate (timeline.db/timeline-events-for-timelines timeline-ids all? start end) :creator))

(defn include-events
  "Include events on `timelines` passed in. Options are optional and include whether to return unarchived events or all
  events regardless of archive status (`all?`), and `start` and `end` parameters for events."
  [timelines options]
  (if-not (seq timelines)
    []
    (let [timeline-id->events (->> (fetch-events (map :id timelines) options)
                                   (group-by :timeline_id))]
      (for [{:keys [id] :as timeline} timelines]
        (let [events (timeline-id->events id)]
          (when timeline
            (assoc timeline :events (if events events []))))))))

(defn include-events-singular
  "Similar to [[include-events]] but allows for passing a single timeline not in a collection."
  ([timeline] (include-events-singular timeline {}))
  ([timeline options]
   (first (include-events [timeline] options))))

(defn dashcard-timeline-events
  "Look for a timeline and corresponding events associated with this dashcard."
  [{{:keys [collection_id] :as _card} :card}]
  (let [timelines (timeline.db/timelines-for-collection collection_id false)]
    (->> (t2/hydrate timelines :creator [:collection :can_write])
         (map #(include-events-singular % {:events/all? true})))))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(mu/defn create-timeline-events! :- [:sequential (ms/InstanceOf :model/TimelineEvent)]
  "Insert the TimelineEvent `rows` and return the inserted instances, an event without an icon getting the icon of its
  Timeline, in one transaction, publishing their create event."
  [rows :- [:sequential ::timeline.schema/timeline-event.create]]
  (app-db/create-batched! :model/TimelineEvent rows
                          {:after-create #(events/publish-event! :event/timeline-event-create (events/create-event %))}))

(defn- without-empty-updates
  "The `updates` that give a column."
  [updates _id->stored]
  (filterv #(seq (dissoc % :id)) updates))

(mu/defn update-timeline-events! :- :nil
  "Applies `updates`, each the `:id` of a TimelineEvent with the changes it gets, in one transaction, publishing their
  update event with the `:context` of `opts`."
  ([updates :- [:sequential ::timeline.schema/timeline-event.update]]
   (update-timeline-events! updates nil))
  ([updates :- [:sequential ::timeline.schema/timeline-event.update]
    opts    :- :metabase.events.schema/write-opts]
   (app-db/update-batched! :model/TimelineEvent updates
                           {:before-update without-empty-updates
                            :after-update  (fn [updates id->stored _id->updated]
                                             (when (seq updates)
                                               (events/publish-event! :event/timeline-event-update
                                                                      (events/update-event id->stored updates opts))))})))

(mu/defn delete-timeline-events! :- :nil
  "Delete the TimelineEvents with `ids` in one transaction, publishing their delete event right before the first
  statement."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/TimelineEvent ids
                          {:before-delete #(events/publish-event! :event/timeline-event-delete (events/delete-event %))}))

;;; ------------------------------------------------------ Specs -------------------------------------------------------

(defmethod app-db-copy/spec :model/TimelineEvent [_model]
  {:skip? false})

(defmethod serialization/spec :model/TimelineEvent [_]
  {:schema    ::timeline.schema/external-timeline-event
   :copy      [:archived :description :entity_id :icon :name :time_matters :timezone]
   :parent    {:model :model/Timeline :key :timeline_id :order (juxt :name :entity_id)}
   :transform {:timeline_id serialization/import-only-transform
               :creator_id serialization/user-transform
               :timestamp  serialization/date-transform}
   :defaults  {:archived false}
   :insert!   create-timeline-events!
   :update!   #(do (update-timeline-events! % {:writer :import}) %)
   :delete!   delete-timeline-events!})

(defmethod remote-sync/spec :model/TimelineEvent
  [_model]
  {:synced-filter-clause timeline.db/synced-timeline-events-clause})

(defmethod eid-translation/spec :model/TimelineEvent [_model]
  {:names [:timeline-event]})
