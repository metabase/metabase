(ns metabase.timeline.models.timeline
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.cache :as models.cache]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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

(defn- check-read-keys
  "Throws unless `timeline` has the columns its read check reads."
  [timeline]
  (api/check-500 (contains? timeline :collection_id) "No :collection_id is set for a Timeline."))

(defn- check-write-keys
  "Throws unless `timeline` is saved and has the columns its write check reads."
  [timeline]
  (check-read-keys timeline)
  (api/check-500 (some? (:id timeline)) "No :id is set for a Timeline."))

(defmethod mi/can-read? :model/Timeline
  ([{collection-id :collection_id :as timeline}]
   (check-read-keys timeline)
   (perms/user-has-permission-for-collection? api/*current-user-id* :read collection-id))
  ([_model pk]
   (mi/can-read? (timeline.db/timeline pk))))

(defmethod mi/can-write? :model/Timeline
  ([{id :id, collection-id :collection_id :as timeline}]
   (check-write-keys timeline)
   (and (perms/user-has-permission-for-collection? api/*current-user-id* :read-and-write collection-id)
        (remote-sync/can-write? :model/Timeline id)))
  ([_model pk]
   (mi/can-write? (timeline.db/timeline pk))))

;; Moving to another Collection also needs write on both the old and the new one.
(defmethod mi/can-update? :model/Timeline
  [timeline changes]
  (and (mi/can-write? timeline)
       (or (not (contains? changes :collection_id))
           (and (collection/can-write-collection-or-root? (:collection_id timeline) nil)
                (collection/can-write-collection-or-root? (:collection_id changes) nil)))))

;;;; transforms

(t2/define-after-select :model/Timeline
  [timeline]
  (models.cache/register-loaded! :model/Timeline (:id timeline))
  (models.cache/register-loaded! :model/Collection (:collection_id timeline))
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
