(ns metabase.timeline.models.timeline
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.serialization :as serdes]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.workspaces.core :as workspaces]
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
  (workspaces/stamp-workspace-id model))

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

(defmethod serdes/deserialization-dependencies "Timeline" [{:keys [collection_id]}]
  [[{:model "Collection" :id collection_id}]])

(defmethod serdes/serialization-dependencies "Timeline" [_model-name {:keys [collection_id]}]
  ;; A Timeline only references its containing Collection, which a selective export may legitimately omit.
  (when collection_id
    #{[{:model "Collection" :id collection_id}]}))

(defmethod serdes/make-spec "Timeline" [_model-name opts]
  {:copy      [:archived :default :description :entity_id :icon :name]
   :skip      [;; workspace membership is instance-local state, not portable content
               :workspace_id]
   :transform {:created_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id    (serdes/fk :model/User)
               :events        (serdes/nested :model/TimelineEvent :timeline_id (merge {:sort-by (juxt :name :created_at)} opts))}
   :defaults  {:archived false :default false}})

;;; ------------------------------------------- Workspace copy-on-write -------------------------------------------

(defmethod workspaces/clone-entity! :model/Timeline
  [_model id]
  ;; Deep copy: the timeline row plus its events. Events are inlined children (like dashboard
  ;; cards) — they get fresh rows pointing at the new timeline, with no remapping of their own.
  (t2/with-transaction [_conn]
    (let [timeline  (t2/select-one :model/Timeline :id id)
          new-tl-id (t2/insert-returning-pk!
                     :model/Timeline
                     (-> (select-keys timeline [:entity_id :name :description :icon :collection_id :archived :default])
                         (assoc :creator_id api/*current-user-id*)))]
      (doseq [event (t2/select :model/TimelineEvent :timeline_id id)]
        (t2/insert! :model/TimelineEvent
                    (-> (select-keys event [:name :description :timestamp :time_matters :timezone :icon :archived])
                        (assoc :timeline_id new-tl-id
                               :creator_id  api/*current-user-id*))))
      new-tl-id)))
