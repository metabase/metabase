(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require
   [compojure.core :as compojure :refer [POST]]
   [metabase.actions.http-action :as http-action]
   [metabase.api.common :as api]
   [metabase.models :refer [Action Card HTTPAction ImplicitAction QueryAction]]
   [metabase.models.action :as action]
   [metabase.util.malli :as mu]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]))

(def ^:private json-query-schema
  [:and
   string?
   (mu/with-api-error-message
     [:fn #(http-action/apply-json-query {} %)]
     "must be a valid json-query, something like '.item.title'")])

(def ^:private supported-action-type
  (mu/with-api-error-message
    [:enum "http" "query" "implicit"]
    "Unsupported action type"))

(def ^:private implicit-action-kind
  (mu/with-api-error-message
    (into [:enum]
          (for [ns ["row" "bulk"]
                action ["create" "update" "delete"]]
            (str ns "/" action)))
    "Unsupported implicit action kind"))

(def ^:private http-action-template
  [:map {:closed true}
   [:method                              [:enum "GET" "POST" "PUT" "DELETE" "PATCH"]]
   [:url                                 [string? {:min 1}]]
   [:body               {:optional true} [:maybe string?]]
   [:headers            {:optional true} [:maybe string?]]
   [:parameters         {:optional true} [:maybe [:sequential map?]]]
   [:parameter_mappings {:optional true} [:maybe map?]]])

(api/defendpoint GET "/"
  "Returns cards that can be used for QueryActions"
  [model-id]
  {model-id pos-int?}
  (let [model (api/read-check Card model-id)]
    ;; We don't check the permissions on the actions, we assume they are
    ;; readable if the model is readable.
    (hydrate
     (action/actions-with-implicit-params [model] :model_id model-id)
     :creator)))

(api/defendpoint GET "/:action-id"
  [action-id]
  (-> (action/actions-with-implicit-params nil :id action-id)
      first
      (hydrate :creator)
      api/read-check))

(defn- type->model [existing-action-type]
  (case existing-action-type
    :http     HTTPAction
    :implicit ImplicitAction
    :query    QueryAction))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:action-id"
  [action-id]
  (let [{existing-action-type :type} (api/write-check Action action-id)]
    (db/delete! (type->model existing-action-type) :action_id action-id))
  api/generic-204-no-content)

(api/defendpoint POST "/"
  "Create a new action."
  [:as {{:keys [type name description model_id parameters parameter_mappings visualization_settings
                kind
                database_id dataset_query
                template response_handle error_handle] :as action} :body}]
  {name                   :string
   model_id               pos-int?
   type                   [:maybe supported-action-type]
   description            [:maybe :string]
   parameters             [:maybe [:sequential map?]]
   parameter_mappings     [:maybe map?]
   visualization_settings [:maybe map?]
   kind                   [:maybe implicit-action-kind]
   database_id            [:maybe pos-int?]
   dataset_query          [:maybe map?]
   template               [:maybe http-action-template]
   response_handle        [:maybe json-query-schema]
   error_handle           [:maybe json-query-schema]}
  (api/write-check Card model_id)
  (let [action-id (action/insert! (assoc action :creator_id api/*current-user-id*))]
    (if action-id
      (first (action/actions-with-implicit-params nil :id action-id))
      ;; db/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (action/actions-with-implicit-params nil :type type)))))

(api/defendpoint PUT "/:id"
  [id :as
   {{:keys [type name description model_id parameters parameter_mappings visualization_settings
            kind database_id dataset_query template response_handle error_handle] :as action} :body}]
  {id                     pos-int?
   database_id            [:maybe pos-int?]
   dataset_query          [:maybe map?]
   description            [:maybe :string]
   error_handle           [:maybe json-query-schema]
   kind                   [:maybe implicit-action-kind]
   model_id               [:maybe pos-int?]
   name                   [:maybe :string]
   parameter_mappings     [:maybe map?]
   parameters             [:maybe [:sequential map?]]
   response_handle        [:maybe json-query-schema]
   template               [:maybe http-action-template]
   type                   [:maybe supported-action-type]
   visualization_settings [:maybe map?]}
  (let [action-columns       [:type :name :description :parameters :parameter_mappings :visualization_settings]
        existing-action      (api/write-check Action id)
        existing-action-type (:type existing-action)
        existing-model       (type->model existing-action-type)]
    (when-let [action-row (not-empty (select-keys action action-columns))]
      (db/update! Action id action-row))
    (when-let [type-row (not-empty (apply dissoc action action-columns))]
      (if (and (:type action) (not= (:type action) existing-action-type))
        (let [new-model (type->model (:type action))]
          (db/delete! existing-model id)
          (db/insert! new-model (assoc type-row :action_id id)))
        (db/update! existing-model id type-row))))
  (first (action/actions-with-implicit-params nil :id id)))

(api/define-routes)
