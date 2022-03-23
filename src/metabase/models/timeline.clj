(ns metabase.models.timeline
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.models.timeline-event :as timeline-event]
            [metabase.util :as u]
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

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [:timeline/events? :timeline/archived?] :as options}]
  (cond-> (hydrate (db/select Timeline
                              :collection_id collection-id
                              :archived (boolean archived?))
                   :creator)
    events? (timeline-event/include-events options)))

(u/strict-extend (class Timeline)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})})

  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
