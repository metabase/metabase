(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require [compojure.core :as compojure :refer [POST]]
            [metabase.actions :as actions]
            [metabase.actions.http-action :as http-action]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.models :refer [HTTPAction]]
            [metabase.models.action :as action]
            [metabase.models.database :refer [Database]]
            [metabase.models.setting :as setting]
            [metabase.models.table :as table]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(def ^:private JsonQuerySchema
  (su/with-api-error-message
    (s/constrained
      s/Str
      #(http-action/apply-json-query {} %))
    "must be a valid json-query"))

(def ^:private SupportedActionType
  (su/with-api-error-message
    (s/enum "http")
    "Only http actions are supported at this time."))

(def ^:private HTTPActionTemplate
  {:method (s/enum "GET" "POST" "PUT" "DELETE" "PATCH")
   :url s/Str
   (s/optional-key :body) (s/maybe s/Str)
   (s/optional-key :headers) (s/maybe s/Str)
   (s/optional-key :parameters) (s/maybe [su/Map])
   (s/optional-key :parameter_mappings) (s/maybe su/Map)})

(api/defendpoint POST "/:action-namespace/:action-name"
  "Generic API endpoint for executing any sort of Action."
  [action-namespace action-name :as {:keys [body]}]
  (let [action (keyword action-namespace action-name)]
    (actions/perform-action! action body)))

(api/defendpoint POST "/:action-namespace/:action-name/:table-id"
  "Generic API endpoint for executing any sort of Action with source Table ID specified as part of the route."
  [action-namespace action-name table-id :as {:keys [body]}]
  (let [action (keyword action-namespace action-name)]
    (actions/perform-action! action {:database (api/check-404 (table/table-id->database-id table-id))
                                     :table-id table-id
                                     :arg      body})))

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
  (api/check-404 (first (hydrate (action/select-actions :id action-id) :action/emitter-usages))))

(api/defendpoint DELETE "/:action-id"
  [action-id]
  (db/delete! HTTPAction :action_id action-id)
  api/generic-204-no-content)

(api/defendpoint POST "/"
  "Create a new HTTP action."
  [:as {{:keys [type name template response_handle error_handle] :as action} :body}]
  {type SupportedActionType
   name s/Str
   template HTTPActionTemplate
   response_handle (s/maybe JsonQuerySchema)
   error_handle (s/maybe JsonQuerySchema)}
  (let [action-id (action/insert! action)]
    (if action-id
      (first (action/select-actions :id action-id))
      ;; db/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (action/select-actions :type "http")))))

(api/defendpoint PUT "/:id"
  [id :as {{:keys [type name template response_handle error_handle] :as action} :body}]
  {id su/IntGreaterThanZero
   type SupportedActionType
   name (s/maybe s/Str)
   template (s/maybe HTTPActionTemplate)
   response_handle (s/maybe JsonQuerySchema)
   error_handle (s/maybe JsonQuerySchema)}
  (db/update! HTTPAction id action)
  (first (hydrate (action/select-actions :id id) :action/emitter-usages)))

(api/define-routes actions/+check-actions-enabled)
