(ns metabase-enterprise.library.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
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
        below-card-types (t2/select-fn-set :type [:model/Card :type] :collection_id [:in descendent-ids])
        below-tables? (t2/exists? :model/Table :is_published true :collection_id [:in descendent-ids])]
    ;; This function is only used on the root Library which cannot have items directly in it
    ;; So can assume :here is only collection, and all descendants are :below
    (assoc collection :here #{"collection"}
           :below (cond-> below-card-types
                    (contains? below-card-types :model)
                    (-> (disj :model) (conj :dataset))
                    below-tables? (conj :table)
                    true sort
                    true ((partial map name))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/" :- [:or ::collections.schema/CollectionItem [:map [:data nil?]]]
  "Get the Library. If no library exists, it doesn't fail but returns an empty response"
  [_route
   _query
   _body]
  (if-let [library (collections/library-collection)]
    (-> (api/read-check library)
        (t2/hydrate
         :can_write
         :effective_children)
        (add-here-and-below)
        (assoc :model "collection"))
    {:data nil}))

(defn- select-collections
  []
  (t2/select :model/Collection
             {:where    [:and
                         [:in :type [collection/library-collection-type
                                     collection/library-data-collection-type
                                     collection/library-metrics-collection-type]]
                         (collection/visible-collection-filter-clause
                          :id
                          {:include-archived-items    :exclude
                           :include-trash-collection? false
                           :permission-level          :read
                           :archive-operation-id      nil})]
              :order-by [[:%lower.name :asc]]}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tree"
  "This matches /api/collection/tree but only returns the library collection."
  [_route-params
   _query]
  (let [collections              (-> (select-collections)
                                     (t2/hydrate :can_write))
        collection-type-ids      (reduce (fn [acc {collection-id :collection_id, card-type :type, :as _card}]
                                           (update acc (case (keyword card-type)
                                                         :model :dataset
                                                         :metric :metric
                                                         :card) conj collection-id))
                                         {:dataset #{}
                                          :metric  #{}
                                          :card    #{}}
                                         (t2/reducible-query {:select-distinct [:collection_id :type]
                                                              :from            [:report_card]
                                                              :where           [:= :archived false]}))]
    (collection/collections->tree collection-type-ids collections)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
