(ns metabase.transform.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.query-permissions.core :as query-perms]
   [metabase.transform.models.transform :as models.transform]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::create
  [:map
   [:display_name ms/NonBlankString]
   [:dataset_query ms/Map]])

(api.macros/defendpoint :post "/"
  "Create a transform"
  [_route-params
   _query-params
   {dataset-query :dataset_query
    display-name :display_name
    :as _body} :- ::create]
  (def bbb _body)
  ;; TODO: check whether user is eligible to create transform view -- admin?
  (query-perms/check-run-permissions-for-query dataset-query)
  (models.transform/insert-returning-instance!
   display-name
   dataset-query
   @api/*current-user*))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform` routes."
  (api.macros/ns-handler))