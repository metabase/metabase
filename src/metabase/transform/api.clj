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
  (def bbb _body)
  ;; TODO: check whether user is eligible to create transform view -- admin?
  (query-perms/check-run-permissions-for-query dataset-query)
  (models.transform/insert-returning-instance!
   ;; Temporary, api callers should pick the schema
   (or schema
       (models.transform/top-schema (:database (models.transform/dataset-query->query dataset-query))))
   display-name
   dataset-query
   @api/*current-user*))

;; should live in model
(def sortable-columns
  [:id :table_id :created_at :updated_at])

(mr/def ::sortable-columns
  (into [:enum] sortable-columns))

#_(mr/def ::get-query-params
    [:map
     [:sort {:optional true} [:vector
                              [:map
                               [:column ::sortable-columns]
                               [:order [:enum :asc :desc]]]]]])

#_(api.macros/defendpoint :get "/"
    "Create a transform"
    [_
     {sort :sort} :- ::get-query-params]
  ;; this should have default limit/offset
  ;; this should have hydration for tables?
    (def soso)
    1)

#_(mr/def ::get-by-id
    [:map
     [:id ms/IntGreaterThanOrEqualToZero]])

#_(api.macros/defendpoint :get "/:id"
    "Create a transform"
    [{:keys [id]} :- ::get-by-id]
  ;; this should have default limit/offset
  ;; this should have hydration for tables?
  ;; TODO: into the model ns
    (some-> (toucan2.core/select-one :model/TransformView :id id)
            #_(t2/hydrate)))

(mr/def ::update-body
  [:map
   ;; X id
   ;; X database_id
   ;; X creator_id
   ;; X view_name
   ;; X status
   ;; X dataset_query_schema
   ;; X dataset_query_type
   ;; [:display_name {:optional true} ms/NonBlankString] ; do this through table!!!
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform` routes."
  (api.macros/ns-handler))