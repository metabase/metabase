(ns metabase.timeline.models.timeline
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Timeline  [_model] :timeline)

(doto :model/Timeline
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

;;;; permissions

(defn- check-can-read-keys
  "Throws unless `timeline` has the columns its `:can_read` and `:can_write` hydrations read."
  [timeline]
  (api/check-500 (contains? timeline :collection_id) "No :collection_id is set for a Timeline."))

(methodical/defmethod t2/batched-hydrate [:model/Timeline :can_read]
  "Whether the current user reads each of `timelines`, as the content of its Collection."
  [_model _k timelines]
  (run! #(when % (check-can-read-keys %)) timelines)
  (let [readable (collection/content-readable-collection-ids (map :collection_id (remove nil? timelines))
                                                             {:root-namespace nil, :audit-rules? false})]
    (for [timeline timelines]
      (when timeline
        (vary-meta timeline assoc :can_read (contains? readable (:collection_id timeline)))))))

(methodical/defmethod t2/batched-hydrate [:model/Timeline :can_write]
  "Whether the current user writes each of `timelines`, as the content of its Collection."
  [_model _k timelines]
  (run! #(when % (check-can-read-keys %)) timelines)
  (let [writable (collection/content-writable-collection-ids (map :collection_id (remove nil? timelines))
                                                             {:root-namespace nil, :audit-rules? false})]
    (for [timeline timelines]
      (when timeline
        (assoc timeline :can_write (contains? writable (:collection_id timeline)))))))

(defmethod mi/can-create? :model/Timeline
  [_model {collection-id :collection_id}]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

;;;; transforms

(t2/define-after-select :model/Timeline
  [timeline]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline :icon (fn [icon]
                           (if (= icon "balloons") timeline-event/default-icon icon))))

(t2/define-before-insert :model/Timeline [model]
  (collection/check-allowed-content :model/Timeline (:collection_id model))
  model)

(t2/define-before-update :model/Timeline [model]
  (collection/check-allowed-content :model/Timeline (:collection_id (t2/changes model)))
  model)

;;;; functions

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [timeline/events? timeline/archived?] :as options}]
  (cond-> (t2/hydrate (timeline.db/timelines-for-collection collection-id (boolean archived?)) :creator [:collection :can_write])
    (nil? collection-id) (->> (map collection.root/hydrate-root-collection))
    events? (timeline-event/include-events options)))

;;;; serialization

(defmethod serialization/spec :model/Timeline [_]
  {:schema    ::timeline.schema/external-timeline
   :copy      [:archived :default :description :entity_id :icon :name]
   :transform {:collection_id (serialization/fk-transform :model/Collection)
               :creator_id    serialization/user-transform}
   :children  {:events :model/TimelineEvent}
   :defaults  {:archived false :default false}})

(defmethod serialization/import-dependencies :model/Timeline [_ entities]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            [[:model/Collection collection_id]]))
        entities))

(defmethod serialization/export-dependencies :model/Timeline [_ timelines]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            #{[:model/Collection collection_id]}))
        timelines))

(defmethod remote-sync/spec :model/Timeline
  [_model]
  {:synced-items         timeline.db/synced-timeline-items
   :synced-filter-clause timeline.db/synced-timelines-clause})
