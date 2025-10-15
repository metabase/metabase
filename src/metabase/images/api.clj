(ns metabase.images.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]))

(api.macros/defendpoint :get "/:id"
  "This is our endpoint for serving the contents of an image that we have stored locally somewhere."
  []
  {})

(api.macros/defendpoint :post "/"
  "Upload an image."
  []
  {:body #_FileOutputStream nil})

;; GET /api/collection/:id/items needs to return collection_image

;; GET /api/user + GET /api/user/:id needs to return profile pic URL

;;; TODO -- not sure bout this =(
(api.macros/defendpoint :post "/collection/:collection-id"
  "Add an image to a collection (create a new :model/CollectionImage"
  []
  {})

(api.macros/defendpoint :post "/card/:card-id/snapshot"
  "Snapshot a Card. This will create a new CollectionImage."
  [{:keys [card-id]} :- [:map
                         [:card-id ::lib.schema.id/card]]]
  {})

(api.macros/defendpoint :get "/card/:card-id/snapshots"
  "List all snapshots of a Card."
  [{:keys [card-id]} :- [:map
                         [:card-id ::lib.schema.id/card]]]
  {})
