(ns metabase.explorations.collection-items
  "How the collection items listing shows the Explorations."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of Explorations of the collection items listing as the API shows them, with their location in
  `collection` and what the user can do with them."
  [collection _opts rows]
  (t2/hydrate (for [exploration rows]
                (-> (t2/instance :model/Exploration exploration)
                    (assoc :location (or (when collection
                                           (collection/children-location collection))
                                         "/"))
                    (update :archived api/bit->boolean)
                    (update :archived_directly api/bit->boolean)))
              :can_write :can_restore :can_delete))
