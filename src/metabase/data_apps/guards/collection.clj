(ns metabase.data-apps.guards.collection
  "The data-app guard of the `/api/collection` mount of [[metabase.collections-rest.api]]."
  (:require
   [metabase.data-apps.guards :as guards]
   [metabase.data-apps.guards.util :as guards.util]))

(set! *warn-on-reflection* true)

(defn- filter-tree
  "Returns the filter of the collection tree a `request` asks for."
  [request _route-params]
  (guards/collection-tree-filter request))

(defn- filter-items
  "Returns the filter of the collection items a `request` lists."
  [request _route-params]
  (guards/collection-items-filter request))

(defn- check-collection-items!
  "Checks the collection whose items a `request` lists, the `:id` route param, returning the filter of them."
  [request {:keys [id]}]
  (guards/check-collection! request id)
  (guards/collection-items-filter request))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.collections-rest.api]]."
  {[:get "/tree"]       filter-tree
   [:get "/root"]       (constantly nil)
   [:get "/root/items"] filter-items
   [:get "/:id/items"]  check-collection-items!})

(def collection-guard
  "Ring middleware guarding the data-app requests to the `/api/collection` mount."
  (guards.util/route-guard 'metabase.collections-rest.api checks))
