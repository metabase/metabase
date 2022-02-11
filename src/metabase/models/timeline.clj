(ns metabase.models.timeline
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel Timeline :timeline)

;;;; functions

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [include archived]}]
  (let [events-hydration-key (if archived :archived-events :events)]
    (if include
      (hydrate (db/select Timeline :collection_id collection-id) [events-hydration-key :creator] :creator)
      (hydrate (db/select Timeline :collection_id collection-id) :creator))))

(u/strict-extend (class Timeline)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})})

  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
