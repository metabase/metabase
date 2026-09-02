(ns metabase.timeline.db
  "Application database queries for the timeline module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
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

(defn hydrate-creator-collection-and-remote-synced
  "Hydrate `:creator`, `:collection` (with `:can_write`), and `:is_remote_synced` onto `timelines`."
  [timelines]
  (t2/hydrate timelines :creator [:collection :can_write] :is_remote_synced))

(defn hydrate-creator-and-collection
  "Hydrate `:creator` and `:collection` (with `:can_write`) onto `timelines`."
  [timelines]
  (t2/hydrate timelines :creator [:collection :can_write]))

(defn hydrate-creator
  "Hydrate `:creator` onto `events`."
  [events]
  (t2/hydrate events :creator))

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

(defn timeline-events
  "The TimelineEvents selected by the Honey SQL `query`."
  [query]
  (t2/select :model/TimelineEvent query))

(defn update-timeline-event!
  "Apply `changes` to the TimelineEvent with `id`."
  [id changes]
  (t2/update! :model/TimelineEvent id changes))

(defn delete-timeline-event!
  "Delete the TimelineEvent with `id`."
  [id]
  (t2/delete! :model/TimelineEvent :id id))
