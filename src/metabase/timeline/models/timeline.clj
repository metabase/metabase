(ns metabase.timeline.models.timeline
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.serialization :as serdes]
   [metabase.timeline.models.timeline-event :as timeline-event]
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
  (cond-> (t2/hydrate (t2/select :model/Timeline
                                 :collection_id collection-id
                                 :archived (boolean archived?))
                      :creator
                      [:collection :can_write])
    (nil? collection-id) (->> (map collection.root/hydrate-root-collection))
    events? (timeline-event/include-events options)))

;;;; serialization

(defmethod serdes/hash-fields :model/Timeline
  [_timeline]
  [:name (serdes/hydrated-hash :collection) :created_at])

(defmethod serdes/dependencies "Timeline" [{:keys [collection_id]}]
  [[{:model "Collection" :id collection_id}]])

(defmethod serdes/make-spec "Timeline" [_model-name opts]
  {:copy      [:archived :default :description :entity_id :icon :name]
   :skip      []
   :transform {:created_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id    (serdes/fk :model/User)
               :events        (serdes/nested :model/TimelineEvent :timeline_id opts)}})
