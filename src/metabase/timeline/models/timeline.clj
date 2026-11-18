(ns metabase.timeline.models.timeline
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Timeline  [_model] :timeline)

(doto :model/Timeline
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod eid-translation/spec :model/Timeline [_model]
  {:names [:timeline]})

(defmethod events/spec :model/Timeline
  [_model]
  {:create :event/timeline-create
   :update :event/timeline-update
   :delete :event/timeline-delete})

(defmethod app-db-copy/spec :model/Timeline [_model]
  {:skip? false})

(t2/define-after-select :model/Timeline
  [timeline]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline :icon (fn [icon]
                           (if (= icon "balloons") timeline-event/default-icon icon))))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defmethod mi/after-archived-change :model/Timeline
  [_model rows changes]
  (let [archive? (boolean (:archived changes))
        direct   (if archive?
                   (timeline.db/directly-archived-timeline-ids (mapv :id rows))
                   (into #{} (comp (filter :archived_directly) (map :id)) rows))]
    (doseq [{:keys [id]} rows
            :when        (contains? direct id)]
      (events/with-event-context {:archived-with [:model/Timeline id]}
        (timeline.db/set-timeline-events-archived! id archive?)))))

(t2/define-before-insert :model/Timeline
  [row]
  (collection/check-collection-for :model/Timeline row)
  (cond-> row (nil? (:icon row)) (assoc :icon timeline-event/default-icon)))

(t2/define-before-update :model/Timeline
  [row]
  (let [changes (t2/changes row)]
    (when (contains? changes :collection_id)
      (collection/check-collection-for :model/Timeline row))
    (cond-> row
      (contains? changes :archived) (assoc :archived_directly (mi/archived-directly row #(collection/archived? (:collection_id row)))))))

(mi/define-update-in-transaction :model/Timeline)

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

(defmethod serialization/spec :model/Timeline [_]
  {:schema              ::timeline.schema/external-timeline
   :copy                [:archived :archived_directly :default :description :entity_id :icon :name]
   :transform           {:collection_id (serialization/fk-transform :model/Collection)
                         :creator_id    serialization/user-transform}
   :children            {:events :model/TimelineEvent}
   :defaults            {:archived false :archived_directly false :default false}
   :import-dependencies import-dependencies
   :export-dependencies export-dependencies})

;;; ------------------------------------------------- Remote sync ----------------------------------------------------

(defmethod remote-sync/spec :model/Timeline
  [_model]
  {:synced-items         timeline.db/synced-timeline-items
   :synced-filter-clause timeline.db/synced-timelines-clause})
