(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require
   [compojure.core :as compojure :refer [POST]]
   [metabase.actions :as actions]
   [metabase.actions.http-action :as http-action]
   [metabase.api.common :as api]
   [metabase.models :refer [Action Card HTTPAction ImplicitAction QueryAction]]
   [metabase.models.action :as action]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(def ^:private JsonQuerySchema
  (su/with-api-error-message
    (s/constrained
      s/Str
      #(http-action/apply-json-query {} %))
    "must be a valid json-query"))

(def ^:private SupportedActionType
  (su/with-api-error-message
    (s/enum "http" "query" "implicit")
    "Unsupported action type"))

(def ^:private ImplicitActionKind
  (su/with-api-error-message
    (apply s/enum (for [ns ["row" "bulk"]
                        action ["create" "update" "delete"]]
                    (str ns "/" action)))
    "Unsupported implicit action kind"))

(def ^:private HTTPActionTemplate
  {:method (s/enum "GET" "POST" "PUT" "DELETE" "PATCH")
   :url s/Str
   (s/optional-key :body) (s/maybe s/Str)
   (s/optional-key :headers) (s/maybe s/Str)
   (s/optional-key :parameters) (s/maybe [su/MapPlumatic])
   (s/optional-key :parameter_mappings) (s/maybe su/MapPlumatic)})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Returns cards that can be used for QueryActions"
  [model-id]
  {model-id su/IntGreaterThanZeroPlumatic}
  (let [model (api/read-check Card model-id)]
    ;; We don't check the permissions on the actions, we assume they are
    ;; readable if the model is readable.
    (action/actions-with-implicit-params [model] :model_id model-id)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:action-id"
  [action-id]
  (api/read-check (first (action/actions-with-implicit-params nil :id action-id))))

(defn- type->model [existing-action-type]
  (case existing-action-type
                          :http HTTPAction
                          :implicit ImplicitAction
                          :query QueryAction))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:action-id"
  [action-id]
  (let [{existing-action-type :type} (api/write-check Action action-id)]
    (db/delete! (type->model existing-action-type) :action_id action-id))
  api/generic-204-no-content)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/"
  "Create a new action."
  [:as {{:keys [type name description model_id parameters parameter_mappings visualization_settings
                kind
                database_id dataset_query
                template response_handle error_handle] :as action} :body}]
  {type SupportedActionType
   name s/Str
   description (s/maybe s/Str)
   model_id su/IntGreaterThanZeroPlumatic
   parameters (s/maybe [su/MapPlumatic])
   parameter_mappings (s/maybe su/MapPlumatic)
   visualization_settings (s/maybe su/MapPlumatic)
   kind (s/maybe ImplicitActionKind)
   database_id (s/maybe su/IntGreaterThanZeroPlumatic)
   dataset_query (s/maybe su/MapPlumatic)
   template (s/maybe HTTPActionTemplate)
   response_handle (s/maybe JsonQuerySchema)
   error_handle (s/maybe JsonQuerySchema)}
  (api/write-check Card model_id)
  (let [action-id (action/insert! action)]
    (if action-id
      (first (action/actions-with-implicit-params nil :id action-id))
      ;; db/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (action/actions-with-implicit-params nil :type type)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:id"
  [id :as {{:keys [type name description model_id parameters parameter_mappings visualization_settings
                   kind
                   database_id dataset_query
                   template response_handle error_handle] :as action} :body}]
  {id su/IntGreaterThanZeroPlumatic
   type (s/maybe SupportedActionType)
   name (s/maybe s/Str)
   description (s/maybe s/Str)
   model_id (s/maybe su/IntGreaterThanZeroPlumatic)
   parameters (s/maybe [su/MapPlumatic])
   parameter_mappings (s/maybe su/MapPlumatic)
   visualization_settings (s/maybe su/MapPlumatic)
   kind (s/maybe ImplicitActionKind)
   database_id (s/maybe su/IntGreaterThanZeroPlumatic)
   dataset_query (s/maybe su/MapPlumatic)
   template (s/maybe HTTPActionTemplate)
   response_handle (s/maybe JsonQuerySchema)
   error_handle (s/maybe JsonQuerySchema)}
  (let [action-columns [:type :name :description :parameters :parameter_mappings :visualization_settings]
        existing-action (api/write-check Action id)
        existing-action-type (:type existing-action)
        existing-model (type->model existing-action-type)]
    (when-let [action-row (not-empty (select-keys action action-columns))]
      (db/update! Action id action-row))
    (when-let [type-row (not-empty (apply dissoc action action-columns))]
      (if (and (:type action) (not= (:type action) existing-action-type))
        (let [new-model (type->model (:type action))]
          (db/delete! existing-model id)
          (db/insert! new-model (assoc type-row :action_id id)))
        (db/update! existing-model id type-row))))
  (first (action/actions-with-implicit-params nil :id id)))

(api/define-routes actions/+check-actions-enabled)
