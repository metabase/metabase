(ns metabase.timeline.models.timeline
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.timeline.collection-items :as timeline.collection-items]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Timeline  [_model] :timeline)

(doto :model/Timeline
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/define-after-select :model/Timeline
  [timeline]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline :icon (fn [icon]
                           (if (= icon "balloons") timeline-event/default-icon icon))))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/Timeline
  [row]
  (cond-> row (nil? (:icon row)) (assoc :icon timeline-event/default-icon)))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Timeline :can_read]
  "Whether the current user reads each of `timelines`, as the content of its Collection."
  [_model _k timelines]
  (collection/hydrate-content-can-read :model/Timeline timelines {:audit-rules? false}))

(methodical/defmethod t2/batched-hydrate [:model/Timeline :can_write]
  "Whether the current user writes each of `timelines`, as the content of its Collection."
  [_model _k timelines]
  (collection/hydrate-content-can-write :model/Timeline timelines {:audit-rules? false}))

(defn- collection-writable?
  "Whether the current user can write the Collection with `collection-id`, nil for the root Collection."
  [collection-id]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(defmethod mi/can-create? :model/Timeline
  [_model {collection-id :collection_id}]
  (collection-writable? collection-id))

(defmethod mi/can-update? :model/Timeline
  [timeline changes]
  (and (mi/can-write? timeline)
       (collection/can-move? timeline changes)))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [timeline/events? timeline/archived?] :as options}]
  (cond-> (t2/hydrate (timeline.db/timelines-for-collection collection-id (boolean archived?)) :creator [:collection :can_write])
    (nil? collection-id) (->> (map collection.root/hydrate-root-collection))
    events? (timeline-event/include-events options)))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- import-dependencies
  "The Collection each of the Timeline `entities` depends on, if any."
  [entities]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            [[:model/Collection collection_id]]))
        entities))

(defn- export-dependencies
  "The Collection each of the `timelines` depends on, if any."
  [timelines]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            #{[:model/Collection collection_id]}))
        timelines))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(defn- check-collections
  "Throws unless the Collection of each of `rows`, if any, can hold a Timeline and is not archived unless the row is,
  reading the Collections once."
  [rows]
  (let [ids         (into [] (comp (keep :collection_id) (distinct)) rows)
        collections (when (seq ids) (timeline.db/collections-for-content-checks ids))]
    (doseq [{:keys [collection_id archived]} rows
            :when                            collection_id
            :let                             [parent (or (get collections collection_id)
                                                         (collection/content-parent collection_id))]]
      (collection/check-allowed-content :model/Timeline parent)
      (collection/check-collection-namespace :model/Timeline parent)
      (collection/check-collection-not-archived archived parent))))

(mu/defn create-timelines! :- [:sequential (ms/InstanceOf :model/Timeline)]
  "Insert the Timeline `rows` and return the inserted instances, in one transaction and one batch of events. A Timeline
  in a Collection that cannot hold it, or in an archived Collection unless it is archived, throws."
  [rows :- [:sequential ::timeline.schema/timeline.create]]
  (if (empty? rows)
    []
    (events/with-batched-events
      (check-collections rows)
      (vec (timeline.db/insert-timelines! rows)))))

(mu/defn create-timeline! :- (ms/InstanceOf :model/Timeline)
  "Insert the Timeline `row` and return the inserted instance, as [[create-timelines!]] does."
  [row :- ::timeline.schema/timeline.create]
  (first (create-timelines! [row])))

(defn- with-archived-columns
  "`rows`, updates of Timelines, each that changes `:archived` with the `archived_directly` it gives, so that the
  hooks run no statement: the Collections are read once."
  [rows stored]
  (let [ids (into [] (comp (map #(:collection_id (merge (get stored (:id %)) %))) (filter some?) (distinct)) rows)
        flags (when (seq ids) (timeline.db/collections-for-content-checks ids))]
    (mapv (fn [{:keys [id archived] :as row}]
            (cond-> row
              (and (some? archived) (not (contains? row :archived_directly)))
              (assoc :archived_directly
                     (boolean (and archived
                                   (not (:archived (get flags (:collection_id (merge (get stored id) row))))))))))
          rows)))

(defn- carried-events!
  "Set the archived flag of the TimelineEvents of the Timelines that `rows`, updates with their `stored` Timelines,
  archive or restore on their own, one statement for each direction."
  [rows stored]
  (let [changing (filter (fn [{:keys [id archived]}]
                           (and (some? archived) (not= (boolean archived) (boolean (:archived (get stored id))))))
                         rows)
        direct?  (fn [{:keys [id archived archived_directly]}]
                   (if archived archived_directly (:archived_directly (get stored id))))]
    (doseq [[archive? group] (group-by (comp boolean :archived) changing)
            :let             [ids (into [] (comp (filter direct?) (map :id)) group)]
            :when            (seq ids)]
      (events/with-event-context {:archived-with [:model/Timeline (first ids)]}
        (timeline-event/set-timeline-events-archived! ids archive?)))))

(mu/defn update-timelines! :- [:sequential ::timeline.schema/timeline]
  "Apply the changes in each of `rows`, the id of a Timeline and the columns to change, with one statement per distinct
  set of changes, in one transaction and one batch of events. A move into a Collection that cannot hold a Timeline
  throws, archiving a Timeline archives its events and restoring it restores them. Returns `rows`."
  [rows :- [:sequential ::timeline.schema/timeline]]
  (if (empty? rows)
    []
    (events/with-batched-events
      (let [stored  (timeline.db/timelines-by-id (mapv :id rows))
            rows*   (with-archived-columns rows stored)
            moving  (filter #(contains? % :collection_id) rows*)]
        (check-collections (map #(merge (get stored (:id %)) %) moving))
        (doseq [[changes group] (group-by #(dissoc % :id) rows*)]
          (when (seq changes)
            (timeline.db/update-timelines! (mapv :id group) changes)))
        (carried-events! rows* stored)
        (vec rows)))))

(mu/defn update-timeline!
  "Apply `changes` to the Timeline with `id`, as [[update-timelines!]] does."
  [id      :- ms/PositiveInt
   changes :- ::timeline.schema/timeline.update]
  (update-timelines! [(assoc changes :id id)])
  nil)

(mu/defn delete-timelines!
  "Delete the Timelines with `ids` and their events, in one statement."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (events/with-batched-events
      (timeline.db/delete-timelines! ids))))

(mu/defn delete-timeline!
  "Delete the Timeline with `id`."
  [id :- ms/PositiveInt]
  (delete-timelines! [id]))

(mu/defn archive-timelines-in-collections!
  "Archive the Timelines in the Collections with `collection-ids`, which an archive of their Collection carries, in one
  statement. They are not archived on their own."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (when (seq collection-ids)
    (timeline.db/set-archived-in-collections! collection-ids true false)))

(mu/defn restore-timelines-in-collections!
  "Restore the Timelines in the Collections with `collection-ids` that an archive of their Collection carried, in one
  statement."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (when (seq collection-ids)
    (when-let [ids (not-empty (timeline.db/restorable-timeline-ids-in-collections collection-ids))]
      (timeline.db/update-timelines! ids {:archived false :archived_directly false}))))

(mu/defn delete-timelines-in-collections!
  "Delete the Timelines in the Collections with `collection-ids`, in one statement."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (when (seq collection-ids)
    (timeline.db/delete-timelines-in-collections! collection-ids)))

(defmethod collection/archive-in-collections! :model/Timeline
  [_model collection-ids]
  (archive-timelines-in-collections! (vec collection-ids)))

(defmethod collection/restore-in-collections! :model/Timeline
  [_model collection-ids]
  (restore-timelines-in-collections! (vec collection-ids)))

(defmethod collection/delete-in-collections! :model/Timeline
  [_model collection-ids]
  (delete-timelines-in-collections! (vec collection-ids)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/Timeline
  [_model]
  {:create :event/timeline-create
   :update :event/timeline-update
   :delete :event/timeline-delete})

(defmethod app-db-copy/spec :model/Timeline [_model]
  {:skip? false})

(defmethod serialization/spec :model/Timeline [_]
  {:schema              ::timeline.schema/external-timeline
   :copy                [:archived :archived_directly :default :description :entity_id :icon :name]
   :transform           {:collection_id (serialization/fk-transform :model/Collection)
                         :creator_id    serialization/user-transform}
   :children            {:events :model/TimelineEvent}
   :defaults            {:archived false :archived_directly false :default false}
   :insert!             create-timelines!
   :update!             update-timelines!
   :delete!             delete-timelines!
   :import-dependencies import-dependencies
   :export-dependencies export-dependencies})

(defmethod remote-sync/spec :model/Timeline
  [_model]
  {:synced-items         timeline.db/synced-timeline-items
   :synced-filter-clause timeline.db/synced-timelines-clause})

(defmethod collection-items/spec :model/Timeline [_model]
  {"timeline" {:rank    8
               :items   timeline.db/collection-timeline-items
               :hydrate timeline.collection-items/hydrate}})

(defmethod eid-translation/spec :model/Timeline [_model]
  {:names [:timeline]})
