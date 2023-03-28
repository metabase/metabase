(ns metabase.models.timeline
  (:require
   [java-time :as t]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.serialization :as serdes]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.util.date-2 :as u.date]
   [schema.core :as s]
   [toucan.hydrate :refer [hydrate]]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel Timeline :timeline)

(derive Timeline ::perms/use-parent-collection-perms)

;;;; schemas

(def Icons
  "Timeline and TimelineEvent icon string Schema"
  (s/enum "star" "balloons" "mail" "warning" "bell" "cloud"))

(def DefaultIcon
  "Timeline default icon"
  "star")

;;;; functions

(defn- root-collection
  []
  (-> (collection/root-collection-with-ui-details nil)
      (hydrate :can_write)))

(defn hydrate-root-collection
  "Hydrate `:collection` on [[Timelines]] when the id is `nil`."
  [{:keys [collection_id] :as timeline}]
  (if (nil? collection_id)
    (assoc timeline :collection (root-collection))
    timeline))

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [:timeline/events? :timeline/archived?] :as options}]
  (cond-> (hydrate (t2/select Timeline
                              :collection_id collection-id
                              :archived (boolean archived?))
                   :creator
                   [:collection :can_write])
    (nil? collection-id) (->> (map hydrate-root-collection))
    events? (timeline-event/include-events options)))

(mi/define-methods
 Timeline
 {:properties (constantly {::mi/timestamped? true
                           ::mi/entity-id true})})

(defmethod serdes/hash-fields Timeline
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
