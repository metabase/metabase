(ns metabase.timeline.models.timeline
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.serialization :as serdes]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(mu/defn get-timeline
  "Fetch the Timeline with `id`, read-checked, with `:creator`, `[:collection :can_write]`, and `:is_remote_synced`
  hydrated. A timeline in the root collection gets the virtual root collection hydrated onto `:collection`.

  When `:include-events?` is true, also hydrates `:events`: unarchived events by default, or all events
  (archived and unarchived) when `:archived?` is true, optionally windowed by `:start`/`:end`."
  [id :- ms/PositiveInt
   {:keys [include-events? archived? start end]} :- [:map {:closed true}
                                                     [:include-events? {:optional true} [:maybe :boolean]]
                                                     [:archived?       {:optional true} [:maybe :boolean]]
                                                     [:start           {:optional true} [:maybe :any]]
                                                     [:end             {:optional true} [:maybe :any]]]]
  (let [timeline (api/read-check (t2/select-one :model/Timeline :id id))]
    (cond-> (t2/hydrate timeline :creator [:collection :can_write] :is_remote_synced)
      ;; `collection_id` `nil` means we need to assoc 'root' collection
      ;; because hydrate `:collection` needs a proper `:id` to work.
      (nil? (:collection_id timeline))
      collection.root/hydrate-root-collection

      include-events?
      (timeline-event/include-events-singular {:events/all?  archived?
                                               :events/start start
                                               :events/end   end}))))

;;;; serialization

(defmethod serdes/hash-fields :model/Timeline
  [_timeline]
  [:name (serdes/hydrated-hash :collection) :created_at])

(defmethod serdes/deserialization-dependencies "Timeline" [{:keys [collection_id]}]
  [[{:model "Collection" :id collection_id}]])

(defmethod serdes/serialization-dependencies "Timeline" [_model-name {:keys [collection_id]}]
  ;; A Timeline only references its containing Collection, which a selective export may legitimately omit.
  (when collection_id
    #{[{:model "Collection" :id collection_id}]}))

(defmethod serdes/make-spec "Timeline" [_model-name opts]
  {:copy      [:archived :default :description :entity_id :icon :name]
   :skip      []
   :transform {:created_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id    (serdes/fk :model/User)
               :events        (serdes/nested :model/TimelineEvent :timeline_id (merge {:sort-by (juxt :name :created_at)} opts))}
   :defaults  {:archived false :default false}})
