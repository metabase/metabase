(ns metabase.transform.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.query-permissions.core :as query-perms]
   [metabase.transform.models.transform :as models.transform]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::post-body
  [:map
   [:display_name ms/NonBlankString]
   [:dataset_query ms/Map]
   [:schema {:optional true} ms/NonBlankString]])

(api.macros/defendpoint :post "/"
  "Create a transform"
  [_ _
   {dataset-query :dataset_query
    display-name :display_name
    schema :schema
    :as _body} :- ::post-body]
  ;; TODO: check whether user is eligible to create transform view -- admin?
  (query-perms/check-run-permissions-for-query dataset-query)
  (models.transform/insert-returning-instance!
   ;; Temporary, api callers should pick the schema
   (or schema
       (models.transform/top-schema (:database (models.transform/dataset-query->query dataset-query))))
   display-name
   dataset-query
   @api/*current-user*))

;; TODO: pagination, sort, filter, ?perms hydration.
(api.macros/defendpoint :get "/"
  "Get all transforms"
  []
  (models.transform/get-transforms))

;; TODO: pagination, sort, filter, ?perms hydration.
(api.macros/defendpoint :get "/:id"
  "Get all transforms"
  [{:keys [id]} :- [:map [:id ms/Int]]]
  (models.transform/transform-by-id id))

(mr/def ::update-body
  [:map
   [:dataset_query {:optional true} ms/Map]])

(api.macros/defendpoint :put "/:id"
  "Create a transform"
  [{:keys [id]} :- [:map [:id ms/Int]]
   _
   body :- ::update-body]
  (let [dataset-query (:dataset_query body)]
    (when (empty? (:dataset_query body))
      (throw (ex-info (i18n/tru "Query is empty.")
                      {:status-code 400
                       :transform_id id})))
    (query-perms/check-run-permissions-for-query dataset-query)
    (models.transform/update-transform!
     id dataset-query
     @api/*current-user*)))

(api.macros/defendpoint :delete "/:id"
  "Create a transform"
  [{:keys [id]} :- [:map [:id ms/Int]]]
  ;; TODO: perms.
  (models.transform/delete-transform! id))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform` routes."
  (api.macros/ns-handler))
