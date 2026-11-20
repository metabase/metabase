(ns metabase.timeline.write
  "The write functions of Timelines and TimelineEvents, through which every writer creates, updates and deletes them."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

(defn- timeline-derived-columns
  "The columns that follow `changes` over `updated`, the Timeline as the update leaves it: the cause of an archive and
  the time of the update."
  [updated changes]
  (cond-> {:updated_at (mi/now)}
    (contains? changes :archived) (assoc :archived_directly
                                         (mi/archived-directly updated #(collection/archived? (:collection_id updated))))))

(mu/defn create-timeline!
  "Insert `timeline`, whose after-insert hook publishes its create event, returning the inserted Timeline; for the REST
  API."
  [timeline :- ::timeline.schema/timeline.create]
  (events/with-batched-events
    (timeline.db/insert-timeline! timeline)))

(mu/defn create-timeline-event!
  "Insert `event`, whose after-insert hook publishes its create event, returning the inserted TimelineEvent; for the
  REST API."
  [event :- ::timeline.schema/timeline-event.create]
  (events/with-batched-events
    (timeline.db/insert-timeline-event! event)))

(defn- timeline-event-changes
  "The `changes` to `event` that change it, checked and with the time `now` of the update, or nil when there are none."
  [event changes now]
  (let [changes (changed event changes)]
    (when (seq changes)
      (when (contains? changes :creator_id)
        (throw (ex-info (tru "You cannot change the creator of a Timeline event.") {:status-code 400})))
      (assoc changes :updated_at now))))

(mu/defn update-timeline-events! :- :int
  "Apply `changes` to `timeline-events`, TimelineEvents the caller already loaded, in one statement for those the
  changes update alike, and publish their update events, returning the number of events updated; for the archive of
  their Timeline and generic writers."
  [timeline-events :- [:sequential :map]
   changes         :- ::timeline.schema/timeline-event.update
   opts            :- ::timeline.schema/write-opts]
  (let [now   (mi/now)
        plans (into [] (keep (fn [event] (when-let [final (timeline-event-changes event changes now)] [event final])))
                    timeline-events)]
    (when (seq plans)
      (events/with-event-context (select-keys opts [:archived-with])
        (events/with-batched-events
          (doseq [[final group] (group-by second plans)]
            (timeline.db/update-timeline-events! (mapv (comp :id first) group) final)
            (doseq [[event _] group]
              (events/updated! :model/TimelineEvent (merge event final) event))))))
    (count plans)))

(mu/defn update-timeline-event! :- :int
  "Apply `changes` to `event-or-id`, a TimelineEvent the caller already loaded or the id of one, as
  [[update-timeline-events!]] does, returning the number of events updated; for the REST API, remote sync and the SerDes
  import."
  [event-or-id :- [:or ms/PositiveInt :map]
   changes     :- ::timeline.schema/timeline-event.update
   opts        :- ::timeline.schema/write-opts]
  (if-let [event (if (map? event-or-id) event-or-id (timeline.db/timeline-event event-or-id))]
    (update-timeline-events! [event] changes opts)
    0))

(mu/defn delete-timeline-events! :- :int
  "Delete the TimelineEvents with `ids` and publish their delete events, returning the number deleted; for the REST
  API, remote sync and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::timeline.schema/write-opts]
  (let [events (when (seq ids) (timeline.db/timeline-events ids))]
    (if (empty? events)
      0
      (events/with-batched-events
        (events/deleting! :model/TimelineEvent events
                          #(timeline.db/delete-timeline-events! (mapv :id events)))))))

(mu/defn delete-timeline-event! :- :int
  "Delete the TimelineEvent with `id` and publish its delete event, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::timeline.schema/write-opts]
  (delete-timeline-events! [id] opts))

(defn- carry-archive-to-events!
  "Set `:archived` of the events of the Timeline with `id` to `archived?`, as the events its archive or restore carries."
  [id archived?]
  (update-timeline-events! (timeline.db/timeline-events-of-timeline id)
                           {:archived archived?}
                           {:archived-with [:model/Timeline id]}))

(defn- final-changes
  "The columns of `changes` and those that follow them that update `timeline`, nil when they change nothing."
  [timeline changes]
  (when-let [requested (not-empty (changed timeline changes))]
    (let [updated (merge (t2/instance :model/Timeline timeline) requested)]
      (when (contains? requested :collection_id)
        (collection/check-collection-for :model/Timeline updated))
      (changed timeline (merge requested (timeline-derived-columns updated requested))))))

(defn- carries-archive-to-events?
  "Whether `final`, the changes that update `timeline`, archive or restore it on its own, which archives or restores
  its events."
  [timeline final]
  (and (contains? final :archived)
       (:archived_directly (if (:archived final) (merge timeline final) timeline))))

(mu/defn update-timelines! :- :int
  "Apply `changes` to `timelines`, Timelines the caller already loaded, in one statement for those that the changes
  update alike, and publish their update events, returning the number of Timelines updated, and archive or restore the
  events of those archived or restored on their own; for the archive and restore of a Collection."
  [timelines :- [:sequential :map]
   changes   :- ::timeline.schema/timeline.update
   opts      :- ::timeline.schema/write-opts]
  (let [updates (into [] (keep (fn [timeline] (when-let [final (final-changes timeline changes)] [timeline final]))) timelines)]
    (when (seq updates)
      (events/with-event-context (select-keys opts [:archived-with])
        (events/with-batched-events
          (doseq [[final group] (group-by second updates)]
            (timeline.db/update-timelines! (mapv (comp :id first) group) final)
            (doseq [[timeline _] group]
              (events/updated! :model/Timeline (merge timeline final) timeline)
              (when (carries-archive-to-events? timeline final)
                (carry-archive-to-events! (:id timeline) (boolean (:archived final)))))))))
    (count updates)))

(mu/defn update-timeline! :- :int
  "Apply `changes` to `timeline-or-id`, a Timeline the caller already loaded or the id of one, and publish its update
  event, returning the number of Timelines updated, and archive or restore its events when it is archived or restored
  on its own; for the REST API, remote sync and the SerDes import."
  [timeline-or-id :- [:or ms/PositiveInt :map]
   changes        :- ::timeline.schema/timeline.update
   opts           :- ::timeline.schema/write-opts]
  (let [timeline (if (map? timeline-or-id) timeline-or-id (timeline.db/timeline timeline-or-id))]
    (if timeline
      (update-timelines! [timeline] changes opts)
      0)))

(mu/defn delete-timelines! :- :int
  "Delete the Timelines with `ids`, whose events the database deletes with them, and publish their delete events,
  returning the number deleted; for the REST API, the delete of their Collection, remote sync and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::timeline.schema/write-opts]
  (let [timelines (when (seq ids) (timeline.db/timelines ids))]
    (if (empty? timelines)
      0
      (events/with-batched-events
        (events/deleting! :model/Timeline timelines
                          #(timeline.db/delete-timelines! (mapv :id timelines)))))))

(mu/defn delete-timeline! :- :int
  "Delete the Timeline with `id` and publish its delete event, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::timeline.schema/write-opts]
  (delete-timelines! [id] opts))

(defmethod mi/write-fns :model/Timeline
  [_model]
  {:update!     update-timeline!
   :update-all! update-timelines!
   :delete!     delete-timelines!})

(defmethod mi/write-fns :model/TimelineEvent
  [_model]
  {:update!     update-timeline-event!
   :update-all! update-timeline-events!
   :delete!     delete-timeline-events!})
