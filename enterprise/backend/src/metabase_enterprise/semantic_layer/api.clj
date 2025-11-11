(ns metabase-enterprise.semantic-layer.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/create"
  "Creates the Semantic Layer if it doesn't exist. Returns the created collection.

  Requires superuser permissions."
  [_route
   _query
   _body]
  (api/check-superuser)
  (api/check-400 (not (collections/semantic-layer-collection)) "Semantic Layer already exists")
  (collections/create-semantic-layer-collection!))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/semantic-layer` routes."
  (api.macros/ns-handler *ns* +auth))
