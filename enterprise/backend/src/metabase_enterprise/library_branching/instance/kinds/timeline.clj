(ns metabase-enterprise.library-branching.instance.kinds.timeline
  "The app DB side of the kind `:timeline`, in the item form of `format.kinds.timeline`: a timeline row and the rows of
  its events. An event in the trash is not content. Not content: the archive columns (scope, and the trash of an
  event), the creators and the bookkeeping columns of the timeline and of its events.

  The app DB keeps the entity id of an event unique over all events, so a write of a timeline takes over the row of
  each of its events, also from another timeline of the Library tree: that is how an event moves."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.timeline :as format.timeline]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes])
  (:import
   (java.time Instant LocalDateTime OffsetDateTime ZoneOffset ZonedDateTime)))

(set! *warn-on-reflection* true)

(def ^:private library-dashboards-type
  "The type of a Dashboards collection of the Library: the only collection of the Library that can hold a timeline."
  "library-dashboards")

(defn- instant-text
  "The canonical text of the instant of `t`, a timestamp value of the app DB."
  [t]
  (str (condp instance? t
         Instant        t
         OffsetDateTime (.toInstant ^OffsetDateTime t)
         ZonedDateTime  (.toInstant ^ZonedDateTime t)
         ;; An app DB that keeps no offset gives the time in UTC.
         LocalDateTime  (.toInstant ^LocalDateTime t ZoneOffset/UTC)
         java.util.Date (.toInstant ^java.util.Date t))))

(def ^:private event-keys
  "The keys of an event that are the columns of its row of the same names."
  [:name :description :timestamp :timezone :time_matters :icon])

(defn- event
  "The content of event row `row`."
  [row]
  (format.timeline/normal-event
   (-> (select-keys row event-keys)
       (update :timestamp instant-text)
       (assoc :id (:entity_id row)))))

(defn- timeline-attrs
  "The attributes of timeline row `row` whose events not in the trash are the rows `events`, with none at its default."
  [row events]
  (content/attrs format.timeline/spec
                 (assoc (select-keys row [:description :icon :default])
                        :events (vec (sort-by format.timeline/event-order (map event events))))))

(defn read-timelines
  "`{entity-id item}` of the timelines of `entity-ids`."
  [entity-ids]
  (let [rows     (content/in-chunks library-branching.db/timelines-by-entity-id (vec entity-ids))
        events   (group-by :timeline_id (content/in-chunks library-branching.db/live-events-by-timeline-id
                                                           (mapv :id rows)))
        places   (portable/export-batch #(serdes/*export-fk* (:collection_id %) :model/Collection) rows)]
    (into {}
          (map (fn [{:keys [id entity_id name] :as row} place]
                 [entity_id (content/item :timeline entity_id name place (timeline-attrs row (get events id)))])
               rows
               places))))

(defn current-timeline
  "The state of timeline `id` (`instance/current`), after a lock on its row and on the rows of its events."
  [id]
  (let [row (library-branching.db/lock-timeline id)]
    (when row
      (library-branching.db/lock-timeline-events (:id row)))
    (content/current-state (boolean (and row (tree/collection-id-in-tree? (:collection_id row))))
                           #(scope/in-scope? :timeline id)
                           #(get (read-timelines [id]) id))))

;;; ----------------------------------------------------- Writes ----------------------------------------------------

(defn- event-value
  "The value of key `k` of event `e`: its value, or its default when absent."
  [e k]
  (get e k (get format.timeline/event-defaults k)))

(defn- event-columns
  "The columns of event `e` whose values differ from those of the event row `row`; every column when `row` is nil."
  [e row]
  (let [old (some-> row event)]
    (into {}
          (keep (fn [k]
                  (let [v (event-value e k)]
                    (when (or (nil? old) (not= v (event-value old k)))
                      [k (if (= :timestamp k) (OffsetDateTime/ofInstant (Instant/parse v) ZoneOffset/UTC) v)]))))
          event-keys)))

(defn- check-event-in-tree!
  "Throws ::instance/refused for timeline `id` when event row `row` belongs to a timeline outside the Library tree."
  [id row]
  (when-not (tree/collection-id-in-tree? (library-branching.db/timeline-collection-id (:timeline_id row)))
    (instance/refuse! :outside-library id "An event of a timeline outside the Library has the identity of an event."
                      {:event (:entity_id row)})))

(defn- archive-events!
  "Moves the event rows of `ids` to the trash."
  [ids]
  (run! #(library-branching.db/archive-timeline-events! (vec %)) (partition-all content/chunk-size ids)))

(defn- write-events!
  "Makes the events not in the trash of timeline row `timeline-id` (of item `id`) equal to `events`: each event row
  takes its content, and leaves the trash and its former timeline; every other event of the timeline moves to the
  trash."
  [id timeline-id events]
  (let [own     (into {} (map (juxt :entity_id identity)) (library-branching.db/lock-timeline-events timeline-id))
        wanted  (into #{} (map :id) events)]
    (doseq [e events]
      (let [row (or (get own (:id e)) (library-branching.db/lock-timeline-event (:id e)))]
        (if-not row
          (library-branching.db/insert-timeline-event!
           (merge {:entity_id   (:id e)
                   :timeline_id timeline-id
                   :creator_id  (or api/*current-user-id* config/internal-mb-user-id)}
                  (event-columns e nil)))
          (let [moved?  (not= timeline-id (:timeline_id row))
                _       (when moved? (check-event-in-tree! id row))
                changes (cond-> (event-columns e row)
                          moved?          (assoc :timeline_id timeline-id)
                          (:archived row) (assoc :archived false))]
            (when (seq changes)
              (library-branching.db/update-timeline-event! (:id row) changes))))))
    (archive-events! (keep (fn [[eid row]] (when-not (or (:archived row) (contains? wanted eid)) (:id row))) (sort own)))))

(defn- place-collection
  "The collection row of `place`, the place of timeline `id`. Throws ::instance/refused unless it is an in-scope
  Dashboards collection of the Library."
  [id place]
  (when (nil? place)
    (instance/refuse! :place id "A timeline is in a Dashboards collection of the Library."))
  (let [parent (tree/place-collection id place)]
    (when-not (= library-dashboards-type (:type parent))
      (instance/refuse! :place id "A timeline is in a Dashboards collection of the Library." {:place place}))
    parent))

(defn- columns
  "The timeline columns of the attributes `ks` of `attrs`, an absent one at its default."
  [attrs ks]
  (into {} (map (fn [k] [k (content/attr-value format.timeline/spec attrs k)])) ks))

(defn write-timeline!
  "Makes the content of timeline `id` equal to `item`, by the contract of `instance/write!`: the timeline row and its
  events."
  [id {:keys [name place attrs] :as item}]
  (content/check-item! :timeline id item)
  (let [row    (library-branching.db/lock-timeline id)
        _      (when row (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row))))
        parent (place-collection id place)
        ks     [:description :icon :default]
        tl-id  (if-not row
                 (:id (library-branching.db/insert-timeline!
                       (merge {:entity_id     id
                               :name          name
                               :collection_id (:id parent)
                               :creator_id    (or api/*current-user-id* config/internal-mb-user-id)}
                              (columns attrs ks))))
                 (let [old     (get (read-timelines [id]) id)
                       changes (cond-> (columns attrs (filter (content/changed-attrs format.timeline/spec (:attrs old) attrs)
                                                              ks))
                                 (not= name (:name old))                  (assoc :name name)
                                 (not= (:id parent) (:collection_id row)) (assoc :collection_id (:id parent))
                                 (:archived row)                          (assoc :archived false))]
                   (when (seq changes)
                     (library-branching.db/update-timeline! (:id row) changes))
                   (:id row)))]
    (write-events! id tl-id (content/attr-value format.timeline/spec attrs :events))
    nil))

(defn trash-timeline!
  "Moves timeline `id` and its events to the trash, as the Trash of Metabase does."
  [id]
  (when-let [row (library-branching.db/lock-timeline id)]
    (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row)))
    (when-not (:archived row)
      (library-branching.db/update-timeline! (:id row) {:archived true})
      (archive-events! (map :id (remove :archived (library-branching.db/lock-timeline-events (:id row))))))
    nil))

(def ^:private models-of-read
  "The models whose tables a read of timelines reads: the timelines, their events and their collections."
  #{:model/Collection :model/Timeline :model/TimelineEvent})

(def kind-store
  "The `KindStore` of timelines."
  (reify instance/KindStore
    (read-all [_ ids] (read-timelines ids))
    (read-models [_] models-of-read)
    (current [_ id] (current-timeline id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-timeline! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-timeline! id)))))
