(ns metabase.timeline.db
  "Application database queries for the timeline module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.timeline.event-update]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.validated :as validated]
   [toucan2.core :as t2])
  (:import
   (metabase.timeline.event_update EventUpdate TimelineWrite)))

(set! *warn-on-reflection* true)

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
  "Set the archived flag of the TimelineEvents of the Timeline with `timeline-id`, returning the number updated."
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
  "Apply `update`, a [[metabase.timeline.event-update/EventUpdate]] that `validated/parse` returned, for the current user. Returns the
  number updated."
  [update]
  (let [^EventUpdate update (validated/validated EventUpdate update)]
    ;; A parsed update does not expire. Kept, and written later as someone else, it would carry the first user's checks.
    (when-not (= (.-user-id update) api/*current-user-id*)
      (throw (ex-info "Expected an update parsed for the current user" {:status-code 500})))
    (let [^TimelineWrite new-timeline (.-new-timeline update)]
      (t2/update! :model/TimelineEvent
                  (.-event-id update)
                  (cond-> (.-changes update)
                    new-timeline (assoc :timeline_id (.-timeline-id new-timeline)))))))

(mu/defn delete-timeline-event!
  "Delete the TimelineEvent with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/TimelineEvent :id id))
