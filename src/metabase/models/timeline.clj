(ns metabase.models.timeline
  (:require [metabase.models.collection :as collection]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.models.timeline-event :as timeline-event]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel Timeline :timeline)

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
  (cond-> (hydrate (db/select Timeline
                              :collection_id collection-id
                              :archived (boolean archived?))
                   :creator
                   [:collection :can_write])
    (nil? collection-id) (->> (map hydrate-root-collection))
    events? (timeline-event/include-events options)))

(u/strict-extend (class Timeline)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true
                             :entity_id    true})})

  mi/IObjectPermissions
  perms/IObjectPermissionsForParentCollection

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:name (serdes.hash/hydrated-hash :collection)])})

;;;; serialization
(defmethod serdes.base/extract-one "Timeline"
  [_model-name _opts timeline]
  (-> (serdes.base/extract-one-basics "Timeline" timeline)
      (update :collection_id serdes.util/export-fk 'Collection)
      (update :creator_id    serdes.util/export-fk-keyed 'User :email)))

(defmethod serdes.base/load-xform "Timeline" [timeline]
  (-> timeline
      serdes.base/load-xform-basics
      (update :collection_id serdes.util/import-fk 'Collection)
      (update :creator_id    serdes.util/import-fk-keyed 'User :email)))

(defmethod serdes.base/serdes-dependencies "Timeline" [{:keys [collection_id]}]
  [[{:model "Collection" :id collection_id}]])
