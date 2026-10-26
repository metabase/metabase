(ns metabase.timeline.db
  "Application database queries for the timeline module. Reads by id for parsing live in
  [[metabase.timeline.db.fetch]]; no other namespace in the module runs a query (model definitions still use
  `toucan2.core`). [[update-timeline-event!]] takes only a parsed `TimelineEventUpdate`, whose checks include
  permissions. The other writes check nothing, so their callers must."
  (:require
   [malli.util :as mut]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   ;; loads the class imported below
   [metabase.timeline.parse]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [parsed-types.core :as pt]
   [toucan2.core :as t2])
  (:import
   (metabase.timeline.parse TimelineEventUpdate)))

(mu/defn insert-timeline!
  "Insert the Timeline `row` and return the inserted instance."
  [row :- (mut/select-keys ::timeline.schema/timeline.update [:name :creator_id :default :description :icon :collection_id :archived])]
  (t2/insert-returning-instance! :model/Timeline row))

(mu/defn timelines-in-visible-collections
  "The Timelines whose archived flag is `archived` in the Collections visible to the current user, in
  case-insensitive name order."
  [archived :- :boolean]
  (t2/select :model/Timeline
             {:where    [:and
                         [:= :archived archived]
                         (collection/visible-collection-filter-clause)]
              :order-by [[:%lower.name :asc]]}))

(mu/defn timeline
  "The Timeline with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Timeline :id id))

(mu/defn timeline-icon
  "The icon of the Timeline with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :icon :model/Timeline :id id))

(mu/defn timelines-for-collection
  "The Timelines of the Collection with `collection-id` whose archived flag is `archived`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   archived      :- :boolean]
  (t2/select :model/Timeline :collection_id collection-id :archived archived))

(mu/defn update-timeline!
  "Apply `changes` to the Timeline with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::timeline.schema/timeline.update [:name :default :description :icon :collection_id :archived])]
  (t2/update! :model/Timeline id changes))

(mu/defn set-timeline-events-archived!
  "Set the archived flag of the TimelineEvents of the Timeline with `timeline-id`, returning the number updated. It
  cascades an archive of the Timeline, whose write permission the caller checked; an update of an event a user
  requests goes through a parsed `TimelineEventUpdate` and [[update-timeline-event!]]."
  [timeline-id :- ms/PositiveInt
   archived    :- :boolean]
  (t2/update! :model/TimelineEvent {:timeline_id timeline-id} {:archived archived}))

(mu/defn delete-timeline!
  "Delete the Timeline with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Timeline :id id))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn insert-timeline-event!
  "Insert the TimelineEvent `row` and return the inserted instance."
  [row :- (mut/select-keys ::timeline.schema/timeline-event.update [:name :timestamp :timezone :timeline_id :creator_id :description :time_matters :icon :archived])]
  (t2/insert-returning-instance! :model/TimelineEvent row))

(mu/defn timeline-event
  "The TimelineEvent with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TimelineEvent :id id))

(mu/defn timeline-events-for-timelines
  "The TimelineEvents of the Timelines with `timeline-ids`, unarchived only unless `all?`, and (when `start` and/or
  `end` are given) within that time range (respecting each event's `:time_matters` flag)."
  [timeline-ids :- [:sequential ms/PositiveInt]
   all?         :- [:maybe :boolean]
   start        :- [:maybe ms/TemporalInstant]
   end          :- [:maybe ms/TemporalInstant]]
  (t2/select :model/TimelineEvent
             {:where [:and
                      [:in :timeline_id timeline-ids]
                      (when-not all?
                        [:= :archived false])
                      (when (or start end)
                        [:or
                         [:and
                          [:= :time_matters true]
                          (when start
                            [:<= start :timestamp])
                          (when end
                            [:<= :timestamp end])]
                         [:and
                          [:= :time_matters false]
                          (when start
                            [:<= (h2x/->date start) (h2x/->date :timestamp)])
                          (when end
                            [:<= (h2x/->date :timestamp) (h2x/->date end)])]])]}))

(defn update-timeline-event!
  "Apply `event-update`, a parsed `TimelineEventUpdate`, returning the number updated. Anything else
  throws `::pt/not-parsed`."
  [event-update]
  (let [{:keys [event-id new-timeline-id changes]} (pt/parsed TimelineEventUpdate event-update)]
    (t2/update! :model/TimelineEvent event-id (cond-> changes
                                                new-timeline-id (assoc :timeline_id new-timeline-id)))))

(mu/defn delete-timeline-event!
  "Delete the TimelineEvent with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/TimelineEvent :id id))
