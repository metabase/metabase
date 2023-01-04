(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require
   [compojure.core :as compojure :refer [POST]]
   [metabase.actions :as actions]
   [metabase.actions.http-action :as http-action]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.models :refer [HTTPAction]]
   [metabase.models.action :as action]
   [metabase.models.database :refer [Database]]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
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
    (s/enum "http")
    "Only http actions are supported at this time."))

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

(api/defendpoint-schema GET "/"
  "Returns cards that can be used for QueryActions"
  [model-id]
  {model-id su/IntGreaterThanZero}
  (action/merged-model-action nil :card_id model-id))

(api/defendpoint-schema GET "/:action-id"
  [action-id]
  (api/check-404 (first (action/select-actions :id action-id))))

(api/defendpoint-schema DELETE "/:action-id"
  [action-id]
  (db/delete! HTTPAction :action_id action-id)
  api/generic-204-no-content)

(api/defendpoint-schema POST "/"
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

(def ^:private json-query-schema
  [:and
   string?
   (mu/with-api-error-message
     [:fn #(http-action/apply-json-query {} %)]
     "must be a valid json-query, something like: .item.title")])

(def ^:private http-action-template
  [:map {:closed true}
   [:method                              [:enum "GET" "POST" "PUT" "DELETE" "PATCH"]]
   [:url                                 [string? {:min 1}]]
   [:body               {:optional true} [:maybe string?]]
   [:headers            {:optional true} [:maybe string?]]
   [:parameters         {:optional true} [:maybe [:sequential map?]]]
   [:parameter_mappings {:optional true} [:maybe map?]]])

(api/defendpoint PUT "/:id"
  [id :as {{:keys [type name template response_handle error_handle] :as action} :body}]
  {id              pos-int?
   type            (mu/with-api-error-message [:enum "http"]
                     "Only http actions are supported at this time.")
   name            [:maybe :string]
   template        [:maybe http-action-template]
   response_handle [:maybe json-query-schema]
   error_handle    [:maybe json-query-schema]}
  (db/update! HTTPAction id action)
  (first (action/select-actions :id id)))

(api/define-routes actions/+check-actions-enabled actions/+check-data-apps-enabled)
