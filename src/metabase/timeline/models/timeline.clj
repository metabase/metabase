(ns metabase.timeline.models.timeline
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
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
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

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
  {:synced-filter-clause timeline.db/synced-timelines-clause})
