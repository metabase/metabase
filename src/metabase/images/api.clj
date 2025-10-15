(ns metabase.images.api
  (:require
   [clojure.java.io :as io]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :get "/:id"
  "This is our endpoint for serving the contents of an image that we have stored locally somewhere."
  []
  {})

(api.macros/defendpoint :post "/"
  "Upload an image."
  {:multipart true}
  [_
   _
   _
   {{:strs [file]} :multipart-params}
   :- [:map
       [:multipart-params
        [:map
         ["file" (mu/with ms/File {:description "image data"})]]]]]
  (let [{:keys [tempfile size]} file]
    (try
      (log/infof "Got a cool file with %d bytes" size)
      (io/copy tempfile (io/file "/tmp/hack2025/duck.png"))
      {:status 200
       :body   {:message "cool"}}
      (finally
        (io/delete-file tempfile true)))))

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
