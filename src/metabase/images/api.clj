(ns metabase.images.api
  (:require
   [metabase.api.macros :as api.macros]))

(api.macros/defendpoint :get "/:id"
  "Fetch a specific image (contents of an image?)"
  []
  {})

(api.macros/defendpoint :post "/"
  "Upload an image."
  []
  {:body #_FileOutputStream nil})
