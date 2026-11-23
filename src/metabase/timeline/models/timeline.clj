(ns metabase.timeline.models.timeline
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
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

;;; ---------------------------------------------------- Hooks -------------------------------------------------------

(t2/define-before-update :model/Timeline
  [timeline]
  (let [changes (t2/changes timeline)]
    (cond-> timeline
      (and (contains? changes :archived) (not (contains? changes :archived_directly)))
      (assoc :archived_directly (timeline.db/archived-directly-clause changes)))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [timeline/events? timeline/archived?] :as options}]
  (cond-> (t2/hydrate (timeline.db/timelines-for-collection collection-id (boolean archived?)) :creator [:collection :can_write])
    (nil? collection-id) (->> (map collection.root/hydrate-root-collection))
    events? (timeline-event/include-events options)))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(defn- check-timelines
  "Throw a 400 unless each of `rows`, holding the `:collection_id` and `:archived` state a Timeline is about to have,
  satisfies these rules, checked for the first row that breaks one, with one read of the Collections:

  - its Collection is in a namespace that holds Timelines
  - its Collection is not the library, its Data or its Metrics collection
  - its Collection is not archived, unless the Timeline is"
  [rows]
  (collection/check-collections-for-model! :model/Timeline rows))

(defn- check-new-timelines
  "Throw a 400 unless every one of `rows`, new Timelines, satisfies the rules of [[check-timelines]]."
  [rows]
  (check-timelines (map #(update % :archived boolean) rows)))

(mu/defn create-timelines! :- [:sequential (ms/InstanceOf :model/Timeline)]
  "Insert the Timeline `rows` and return the inserted instances, in one transaction, publishing their create event. A
  Timeline in a Collection that cannot hold it, or in an archived Collection unless it is archived, throws."
  [rows :- [:sequential ::timeline.schema/timeline.create]]
  (app-db/create-batched! :model/Timeline rows
                          {:before-create check-new-timelines
                           :after-create  #(events/publish-event! :event/timeline-create (events/create-event %))}))

(defn- carry-to-events!
  "Set the archived flag of the TimelineEvents of the Timelines that `rows`, updates of the Timelines `id->stored`,
  archive or restore on their own, one write for each direction."
  [rows id->stored]
  (let [changing (filter (fn [{:keys [id archived]}]
                           (and (some? archived) (not= (boolean archived) (boolean (:archived (get id->stored id))))))
                         rows)
        direct?  (fn [{:keys [id archived archived_directly]}]
                   (if archived archived_directly (:archived_directly (get id->stored id))))]
    (doseq [[archive? group] (group-by (comp boolean :archived) changing)
            :let             [ids (into [] (comp (filter direct?) (map :id)) group)]
            :when            (seq ids)]
      (timeline-event/update-timeline-events!
       (mapv (fn [event-id] {:id event-id :archived archive?})
             (mapv :id (timeline.db/events-of-timelines-by-archived ids (not archive?))))
       {:context {:archived-with [:model/Timeline (first ids)]}}))))

(defn- derive-archived-directly
  "`rows`, with the `archived_directly` that the write gave each of those that change `archived`, read from `updated`, the
  Timelines by id after the write."
  [rows updated]
  (mapv (fn [{:keys [id] :as row}]
          (cond-> row
            (contains? row :archived) (assoc :archived_directly (:archived_directly (get updated id)))))
        rows))

(defn- check-timeline-updates
  "Throw a 400 unless every one of `rows`, updates of the Timelines `id->stored` that move, satisfies these rules:

  - its Collection is in a namespace that holds Timelines
  - its Collection is not the library, its Data or its Metrics collection
  - its Collection is not archived, unless the Timeline is"
  [id->stored rows]
  (check-timelines (for [row rows
                         :when (contains? row :collection_id)]
                     (update (merge (get id->stored (:id row)) row) :archived boolean))))

(defn- update-timeline-batch!
  "Check and write `updates`, one batch of a call, and return the rows written, the Timelines by id as stored before
  and as they are after."
  [updates]
  (let [id->stored (timeline.db/timelines-by-ids (mapv :id updates))
        updates    (filterv #(and (contains? id->stored (:id %)) (seq (dissoc % :id))) updates)
        _          (check-timeline-updates id->stored updates)
        _          (timeline.db/update-timelines! updates)
        id->updated (timeline.db/timelines-by-ids (mapv :id updates))
        updates    (derive-archived-directly updates id->updated)]
    (carry-to-events! updates id->stored)
    {:updates updates :id->stored id->stored :id->updated id->updated}))

(mu/defn update-timelines! :- :nil
  "Applies `updates`, each the `:id` of a Timeline with the changes it gets, in one transaction, publishing their update
  event with the `:context` of `opts`."
  ([updates :- [:sequential ::timeline.schema/timeline.update]]
   (update-timelines! updates nil))
  ([updates :- [:sequential ::timeline.schema/timeline.update]
    opts    :- ::timeline.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv #(update-timeline-batch! (vec %)) (partition-all app-db/update-partition-size updates))]
       (when (some (comp seq :updates) batches)
         (events/publish-event! :event/timeline-update
                                (events/update-event (into {} (map :id->stored) batches)
                                                     (into [] (mapcat :updates) batches)
                                                     (assoc opts :objects (into {} (map :id->updated) batches)))))))
   nil))

(mu/defn delete-timelines! :- :nil
  "Delete the Timelines with `ids` and their events in one transaction, publishing their delete event right before the
  first statement."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/Timeline ids
                          {:before-delete #(events/publish-event! :event/timeline-delete (events/delete-event %))}))

(defmethod collection/archive-in-collections! :model/Timeline
  [_model collection-ids opts]
  (update-timelines! (mapv (fn [id] {:id id :archived true :archived_directly false}) (mapv :id (timeline.db/unarchived-timelines-in-collections (vec collection-ids)))) opts))

(defmethod collection/restore-in-collections! :model/Timeline
  [_model collection-ids opts]
  (update-timelines! (mapv (fn [id] {:id id :archived false :archived_directly false}) (mapv :id (timeline.db/restorable-timelines-in-collections (vec collection-ids)))) opts))

(defmethod collection/delete-in-collections! :model/Timeline
  [_model collection-ids _opts]
  (when (seq collection-ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/timeline-delete
                             (events/delete-event (timeline.db/timelines-in-collections (vec collection-ids))))
      (timeline.db/delete-timelines-in-collections! (vec collection-ids)))))

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

;;; ----------------------------------------------------- Specs ------------------------------------------------------

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
   :update!             #(do (update-timelines! % {:writer :import}) %)
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
