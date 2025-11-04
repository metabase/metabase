(ns metabase.links.api
  "REST API endpoints for collection links."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.links.schema :as schema]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/" :- ::schema/link-response
  "Create a new collection link.

  Creates a link in a collection that points to a resource (card, dashboard, collection, etc.) in another
  collection. The link appears in the containing collection alongside regular items, providing a way to reference
  resources without duplicating them.

  Requires:
  - Write access to the target collection
  - Read access to the target object

  Returns the created link with full metadata including ID, timestamps, and entity ID."
  [_route-params
   _query-params
   {:keys [collection_id target_model target_id name description] :as link-data}
   :- ::schema/link-for-creation]
  ;; Permission checks are handled by the model's mi/can-create? method via api/create-check
  (api/create-check :model/CollectionLink link-data)
  (let [created-link (first (t2/insert-returning-instances!
                             :model/CollectionLink
                             (cond-> {:collection_id collection_id
                                      :target_model target_model
                                      :target_id target_id
                                      :name name
                                      :created_by_id api/*current-user-id*}
                               description (assoc :description description))))]
    created-link))
