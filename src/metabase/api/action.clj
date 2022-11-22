(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require [compojure.core :as compojure :refer [POST]]
            [metabase.actions :as actions]
            [metabase.actions.http-action :as http-action]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.models :refer [Action HTTPAction ImplicitAction QueryAction]]
            [metabase.models.action :as action]
            [metabase.models.database :refer [Database]]
            [metabase.models.setting :as setting]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n]
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

(def ^:private HTTPActionTemplate
  {:method (s/enum "GET" "POST" "PUT" "DELETE" "PATCH")
   :url s/Str
   (s/optional-key :body) (s/maybe s/Str)
   (s/optional-key :headers) (s/maybe s/Str)
   (s/optional-key :parameters) (s/maybe [su/Map])
   (s/optional-key :parameter_mappings) (s/maybe su/Map)})

(defn check-actions-enabled
  "Check whether Actions are enabled and allowed for the [[metabase.models.database]] with `database-id`, or return a
  400 status code."
  [database-id]
  {:pre [(integer? database-id)]}
  (let [{db-settings :settings, driver :engine, :as db} (db/select-one Database :id database-id)]
    ;; make sure the Driver supports Actions.
    (when-not (driver/database-supports? driver :actions db)
      (throw (ex-info (i18n/tru "{0} Database {1} does not support actions."
                                (u/qualified-name driver)
                                (format "%d %s" (:id db) (pr-str (:name db))))
                      {:status-code 400, :database-id (:id db)})))
    (binding [setting/*database-local-values* db-settings]
      ;; make sure Actions are enabled for this Database
      (when-not (actions/database-enable-actions)
        (throw (ex-info (i18n/tru "Actions are not enabled for Database {0}." database-id)
                        {:status-code 400}))))))

(api/defendpoint GET "/"
  "Returns cards that can be used for QueryActions"
  [model-id]
  {model-id su/IntGreaterThanZero}
  (action/merged-model-action nil :card_id model-id))

(api/defendpoint GET "/:action-id"
  [action-id]
  (api/check-404 (first (action/select-actions :id action-id))))

(defn- type->model [existing-action-type]
  (case existing-action-type
                          :http HTTPAction
                          :implicit ImplicitAction
                          :query QueryAction))

(api/defendpoint DELETE "/:action-id"
  [action-id]
  (let [existing-action-type (db/select-one-field :type Action :id action-id)]
    (db/delete! (type->model existing-action-type) :action_id action-id))
  api/generic-204-no-content)

(api/defendpoint POST "/"
  "Create a new HTTP action."
  [:as {{:keys [type name template response_handle error_handle model_id] :as action} :body}]
  {type SupportedActionType
   name s/Str
   model_id su/IntGreaterThanZero
  ;; TODO check different types
   #_#_
   template HTTPActionTemplate
   #_#_
   response_handle (s/maybe JsonQuerySchema)
   #_#_
   error_handle (s/maybe JsonQuerySchema)}
  (let [action-id (action/insert! action)]
    (if action-id
      (first (action/select-actions :id action-id))
      ;; db/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (action/select-actions :type type)))))

(api/defendpoint PUT "/:id"
  [id :as {{:keys [type name template response_handle error_handle] :as action} :body}]
  {id su/IntGreaterThanZero
   type (s/maybe SupportedActionType)
   name (s/maybe s/Str)
   template (s/maybe HTTPActionTemplate)
   response_handle (s/maybe JsonQuerySchema)
   error_handle (s/maybe JsonQuerySchema)}
  (let [action-columns [:type :name :parameters :parameter_mappings :visualization_settings]
        existing-action-type (db/select-one-field :type Action :id id)
        existing-model (type->model existing-action-type)]
    (when-let [action-row (not-empty (select-keys action action-columns))]
      (db/update! Action id action-row))
    (when-let [type-row (not-empty (apply dissoc action action-columns))]
      (if (and (:type action) (not= (:type action) existing-action-type))
        (let [new-model (type->model (:type action))]
          (db/delete! existing-model id)
          (db/insert! new-model (assoc type-row :action_id id)))
        (db/update! existing-model id type-row))))
  (first (action/select-actions :id id)))

(api/define-routes actions/+check-actions-enabled)
