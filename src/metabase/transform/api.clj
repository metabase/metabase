(ns metabase.transform.api
  (:require
   #_[metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.transform.models.transform :as models.transform]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::create
  [:map
   [:display_name {:optional true} [:maybe ms/NonBlankString]]
   [:dataset_query ms/Map]])

(api.macros/defendpoint :post "/"
  "Create a transform"
  [_route-params
   _query-params
   body :- ::create]
  ;; TODO: body shenanigans
  (models.transform/insert-returning-instance! body))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform` routes."
  (api.macros/ns-handler))