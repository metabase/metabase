(ns metabase.models.timeline
  (:require
   [java-time.api :as t]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.permissions :as perms]
   [metabase.models.serialization :as serdes]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.util.date-2 :as u.date]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def Timeline
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/Timeline)

(methodical/defmethod t2/table-name :model/Timeline  [_model] :timeline)

(doto :model/Timeline
  (derive :metabase/model)
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

;;;; transforms

(t2/define-after-select :model/Timeline
  [timeline]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline :icon (fn [icon]
                           (if (= icon "balloons") timeline-event/default-icon icon))))

;;;; functions

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [:timeline/events? :timeline/archived?] :as options}]
  (cond-> (t2/hydrate (t2/select Timeline
                              :collection_id collection-id
                              :archived (boolean archived?))
                   :creator
                   [:collection :can_write])
    (nil? collection-id) (->> (map collection.root/hydrate-root-collection))
    events? (timeline-event/include-events options)))

(defmethod serdes/hash-fields :model/Timeline
  [_timeline]
  [:name (serdes/hydrated-hash :collection) :created_at])

;;;; serialization
(defmethod serdes/extract-query "Timeline" [_model-name opts]
  (eduction (map #(timeline-event/include-events-singular % {:all? true}))
            (serdes/extract-query-collections Timeline opts)))

(defn- extract-events [events]
  (sort-by :timestamp
           (for [event events]
             (-> (into (sorted-map) event)
                 (dissoc :creator :id :timeline_id :updated_at)
                 (update :creator_id  serdes/*export-user*)
                 (update :timestamp   #(u.date/format (t/offset-date-time %)))))))

(defmethod serdes/extract-one "Timeline"
  [_model-name _opts timeline]
  (let [timeline (if (contains? timeline :events)
                   timeline
                   (timeline-event/include-events-singular timeline {:all? true}))]
    (-> (serdes/extract-one-basics "Timeline" timeline)
        (update :events        extract-events)
        (update :collection_id serdes/*export-fk* 'Collection)
        (update :creator_id    serdes/*export-user*))))

(defmethod serdes/load-xform "Timeline" [timeline]
  (-> timeline
      serdes/load-xform-basics
      (update :collection_id serdes/*import-fk* 'Collection)
      (update :creator_id    serdes/*import-user*)))

(defmethod serdes/load-one! "Timeline" [ingested maybe-local]
  (let [timeline ((get-method serdes/load-one! :default) (dissoc ingested :events) maybe-local)]
    (doseq [event (:events ingested)]
      (let [local (t2/select-one 'TimelineEvent :timeline_id (:id timeline) :timestamp (u.date/parse (:timestamp event)))
            event (assoc event
                         :timeline_id (:entity_id timeline)
                         :serdes/meta [{:model "Timeline"      :id (:entity_id timeline)}
                                       {:model "TimelineEvent" :id (u.date/format (t/offset-date-time (:timestamp event)))}])]
        (serdes/load-one! event local)))))

(defmethod serdes/dependencies "Timeline" [{:keys [collection_id]}]
  [[{:model "Collection" :id collection_id}]])
