(ns metabase.models.timeline
  (:require [metabase.models.collection :as collection]
            [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
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
   {:properties (constantly {:timestamped? true})})

  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
