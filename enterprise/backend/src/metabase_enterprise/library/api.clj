(ns metabase-enterprise.library.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/"
  "Creates the Library if it doesn't exist. Returns the created collection.

  Requires superuser permissions."
  [_route
   _query
   _body]
  (api/check-superuser)
  (api/check-400 (not (collections/library-collection)) "Library already exists")
  (collections/create-library-collection!))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
