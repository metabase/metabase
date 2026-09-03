(ns metabase.timeline.db
  "Application database queries for the timeline module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn insert-timeline!
  "Insert the Timeline `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Timeline row))

(defn timelines-in-collections
  "The Timelines whose archived flag is `archived` in the Collections matching the Honey SQL `collection-clause`, in
  case-insensitive name order."
  [archived collection-clause]
  (t2/select :model/Timeline
             {:where    [:and
                         [:= :archived archived]
                         collection-clause]
              :order-by [[:%lower.name :asc]]}))

(defn timeline
  "The Timeline with `id`, or nil."
  [id]
  (t2/select-one :model/Timeline :id id))

(defn timeline-icon
  "The icon of the Timeline with `id`, or nil."
  [id]
  (t2/select-one-fn :icon :model/Timeline :id id))

(defn timelines-by-id
  "A map of id to Timeline for the Timelines with `ids`."
  [ids]
  (t2/select-pk->fn identity :model/Timeline :id [:in ids]))

(defn timelines-for-collection
  "The Timelines of the Collection with `collection-id` whose archived flag is `archived`."
  [collection-id archived]
  (t2/select :model/Timeline :collection_id collection-id :archived archived))

(defn update-timeline!
  "Apply `changes` to the Timeline with `id`."
  [id changes]
  (t2/update! :model/Timeline id changes))

(defn set-timeline-events-archived!
  "Set the archived flag of the TimelineEvents of the Timeline with `timeline-id`."
  [timeline-id archived]
  (t2/update! :model/TimelineEvent {:timeline_id timeline-id} {:archived archived}))

(defn delete-timeline!
  "Delete the Timeline with `id`."
  [id]
  (t2/delete! :model/Timeline :id id))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn insert-timeline-event!
  "Insert the TimelineEvent `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/TimelineEvent row))

(defn timeline-event
  "The TimelineEvent with `id`, or nil."
  [id]
  (t2/select-one :model/TimelineEvent :id id))

(defn timeline-events-for-timelines
  "The TimelineEvents of the Timelines with `timeline-ids`, unarchived only unless `all?`, and (when `start` and/or
  `end` are given) within that time range (respecting each event's `:time_matters` flag)."
  [timeline-ids all? start end]
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
  "Apply `changes` to the TimelineEvent with `id`."
  [id changes]
  (t2/update! :model/TimelineEvent id changes))

(defn delete-timeline-event!
  "Delete the TimelineEvent with `id`."
  [id]
  (t2/delete! :model/TimelineEvent :id id))
