(ns metabase-enterprise.library.api
  (:require
   [metabase-enterprise.library.db :as library.db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Creates the Library if it doesn't exist. Returns the created collection.

  Requires data analyst or superuser permissions."
  [_route
   _query
   _body]
  (api/check-data-analyst)
  (api/check-400 (not (collections/library-collection)) "Library already exists")
  (collections/create-library-collection!))

(defn- add-here-and-below [collection]
  (let [descendent-ids (map :id (collection/descendants-flat collection))
        ;; a worktree's collections hold no tables of their own; the tables under its Library are the ones under
        ;; the main-app collections it checked those out from
        table-coll-ids (if (:worktree_id collection)
                         (vals (collections/worktree-collection-counterpart-ids descendent-ids))
                         descendent-ids)
        below-card-types (library.db/card-types-in-collections descendent-ids)
        below-tables? (and (seq table-coll-ids)
                           (library.db/published-table-in-collections? table-coll-ids))]
    ;; This function is only used on the root Library which cannot have items directly in it
    ;; So can assume :here is only collection, and all descendants are :below
    (assoc collection :here #{"collection"}
           :below (cond-> below-card-types
                    (contains? below-card-types :model)
                    (-> (disj :model) (conj :dataset))
                    below-tables? (conj :table)
                    true sort
                    true ((partial map name))))))

(api.macros/defendpoint :get "/" :- [:or ::collections.schema/CollectionItem [:map [:data nil?]]]
  "Get the Library. If no library exists, it doesn't fail but returns an empty response.

  `worktree-id` gets the Library a remote-sync worktree checked out rather than the main app's (admin only)."
  [_route
   {:keys [worktree-id]} :- [:map
                             [:worktree-id {:optional true} [:maybe ms/PositiveInt]]]
   _body]
  (when worktree-id
    (api/check-superuser)
    (remote-sync/check-worktree-exists! worktree-id))
  (if-let [library (collections/library-collection worktree-id)]
    (-> (api/read-check library)
        (t2/hydrate :can_write :effective_children)
        (add-here-and-below)
        (assoc :model "collection"))
    {:data nil}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tree"
  "This matches /api/collection/tree but only returns the library collection.

  `worktree-id` returns the Library a remote-sync worktree checked out rather than the main app's (admin only)."
  [_route-params
   {:keys [worktree-id]} :- [:map
                             [:worktree-id {:optional true} [:maybe ms/PositiveInt]]]]
  (when worktree-id
    (api/check-superuser)
    (remote-sync/check-worktree-exists! worktree-id))
  (let [collections              (-> (library.db/library-collections worktree-id)
                                     (t2/hydrate :can_write))
        collection-type-ids      (reduce (fn [acc {collection-id :collection_id, card-type :type, :as _card}]
                                           (update acc (case (keyword card-type)
                                                         :model :dataset
                                                         :metric :metric
                                                         :card) conj collection-id))
                                         {:dataset #{}
                                          :metric  #{}
                                          :card    #{}}
                                         (library.db/unarchived-card-collection-types-reducible))]
    (collection/collections->tree collection-type-ids collections)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
