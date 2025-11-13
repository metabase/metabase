(ns metabase-enterprise.library.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/create"
  "Creates the Library if it doesn't exist. Returns the created collection.

  Requires superuser permissions."
  [_route
   _query
   _body]
  (api/check-superuser)
  (api/check-400 (not (collections/library-collection)) "Library already exists")
  (collections/create-library-collection!))

(defn- add-here-and-below [collection]
  (let [descendent-ids (map :id (collection/descendants-flat collection))
        below (t2/select-fn-set :type [:model/Card :type] :collection_id [:in descendent-ids])]
    ;;This function is only used on the root Library which cannot have items directly in it
    ;;So can assume :here is empty, and all descendants are :below
    (assoc collection :here []
           :below (cond-> below
                    (contains? below :model)
                    (-> (disj :model) (conj :dataset))

                    true sort))))

(api.macros/defendpoint :get "/"
  "Get the Library. If no library exists, it doesn't fail but returns an empty response."
  [_route
   _query
   _body]
  (if-let [library (collections/library-collection)]
    (-> (api/read-check library)
        (t2/hydrate
         :can_write
         :effective_children)
        (add-here-and-below))
    {:message "Library does not exist"}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
