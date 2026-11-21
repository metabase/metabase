(ns metabase.timeline.models.timeline-event
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
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
    (nil? (:icon row)) (assoc :icon default-icon)))

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
      (into {} (map (juxt :id check)) (t2/hydrate (vals (timeline.db/timelines-by-id ids)) k))
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
   #(timeline.db/timelines-by-id (map :timeline_id events))
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

(defn- with-timeline-icons
  "`rows` of new TimelineEvents, those without an icon given the icon of their Timeline."
  [rows]
  (let [timeline-ids (into [] (comp (remove :icon) (map :timeline_id) (distinct)) rows)
        timelines    (when (seq timeline-ids) (timeline.db/timelines-by-id timeline-ids))]
    (mapv (fn [{:keys [icon timeline_id] :as row}]
            (cond-> row
              (nil? icon) (assoc :icon (or (:icon (get timelines timeline_id)) default-icon))))
          rows)))

(mu/defn create-timeline-events! :- [:sequential (ms/InstanceOf :model/TimelineEvent)]
  "Insert the TimelineEvent `rows` and return the inserted instances, an event without an icon getting the icon of its
  Timeline, in one transaction, publishing their create event."
  [rows :- [:sequential ::timeline.schema/timeline-event.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [timeline-events (vec (timeline.db/insert-timeline-events! (with-timeline-icons rows)))]
        (events/publish-lifecycle! [(events/created :event/timeline-event-create timeline-events)])
        timeline-events))))

(mu/defn create-timeline-event! :- (ms/InstanceOf :model/TimelineEvent)
  "Insert the TimelineEvent `row` and return the inserted instance, as [[create-timeline-events!]] does."
  [row :- ::timeline.schema/timeline-event.create]
  (first (create-timeline-events! [row])))

(defn- update-event
  "The update event of the TimelineEvents that the changes in `rows`, each an id and columns, change, `stored` holding
  their rows as they were."
  [stored rows]
  (let [pairs (into []
                    (keep (fn [row]
                            (when-let [previous (get stored (:id row))]
                              (let [object (events/updated-row previous (dissoc row :id))]
                                (when (not= (into {} previous) (into {} object))
                                  [previous object])))))
                    rows)]
    (events/updated :event/timeline-event-update (mapv first pairs) (mapv second pairs))))

(mu/defn update-timeline-events! :- [:sequential ::timeline.schema/timeline-event]
  "Apply the changes in each of `rows`, the id of a TimelineEvent and the columns to change, with one statement per
  distinct set of changes, in one transaction, publishing their update event. Returns `rows`."
  [rows :- [:sequential ::timeline.schema/timeline-event]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [stored (timeline.db/timeline-events-by-id (mapv :id rows))]
        (doseq [[changes group] (group-by #(dissoc % :id) rows)]
          (when (seq changes)
            (timeline.db/update-timeline-events! (mapv :id group) changes)))
        (events/publish-lifecycle! [(update-event stored rows)])
        (vec rows)))))

(mu/defn update-timeline-event!
  "Apply `changes` to the TimelineEvent with `id`."
  [id      :- ms/PositiveInt
   changes :- ::timeline.schema/timeline-event.update]
  (update-timeline-events! [(assoc changes :id id)])
  nil)

(mu/defn set-timeline-events-archived!
  "Set the archived flag of the TimelineEvents of the Timelines with `timeline-ids`, in one statement, publishing their
  update event with `context`."
  [timeline-ids :- [:sequential ms/PositiveInt]
   archived     :- :boolean
   context      :- [:maybe :metabase.events.schema/context]]
  (when (seq timeline-ids)
    (t2/with-transaction [_conn]
      (when-let [rows (not-empty (timeline.db/events-of-timelines-by-archived timeline-ids (not archived)))]
        (timeline.db/update-timeline-events! (mapv :id rows) {:archived archived})
        (events/publish-lifecycle!
         [(update-event (m/index-by :id rows) (mapv (fn [row] {:id (:id row) :archived archived}) rows))]
         {:context context})))))

(mu/defn delete-timeline-events!
  "Delete the TimelineEvents with `ids`, in one statement, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [rows  (vec (vals (timeline.db/timeline-events-by-id ids)))
            event (events/deleted :event/timeline-event-delete :model/TimelineEvent rows)]
        (timeline.db/delete-timeline-events! ids)
        (events/publish-lifecycle! [event])))))

(mu/defn delete-timeline-event!
  "Delete the TimelineEvent with `id`."
  [id :- ms/PositiveInt]
  (delete-timeline-events! [id]))

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
   :update!   update-timeline-events!
   :delete!   delete-timeline-events!})

(defmethod remote-sync/spec :model/TimelineEvent
  [_model]
  {:synced-filter-clause timeline.db/synced-timeline-events-clause})
