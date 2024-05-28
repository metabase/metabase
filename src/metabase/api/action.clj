(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require
   [cheshire.core :as json]
   [compojure.core :as compojure :refer [POST]]
   [metabase.actions.core :as actions]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models :refer [Action Card Database]]
   [metabase.models.action :as action]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private json-query-schema
  [:and
   string?
   (mu/with-api-error-message
    [:fn #(actions/apply-json-query {} %)]
     (deferred-tru "must be a valid json-query, something like ''.item.title''"))])

(def ^:private supported-action-type
  (mu/with-api-error-message
    [:enum "http" "query" "implicit"]
    (deferred-tru "Unsupported action type")))

(def ^:private implicit-action-kind
  (mu/with-api-error-message
    (into [:enum]
          (for [ns ["row" "bulk"]
                action ["create" "update" "delete"]]
            (str ns "/" action)))
    (deferred-tru "Unsupported implicit action kind")))

(def ^:private http-action-template
  [:map {:closed true}
   [:method                              [:enum "GET" "POST" "PUT" "DELETE" "PATCH"]]
   [:url                                 [string? {:min 1}]]
   [:body               {:optional true} [:maybe string?]]
   [:headers            {:optional true} [:maybe string?]]
   [:parameters         {:optional true} [:maybe [:sequential map?]]]
   [:parameter_mappings {:optional true} [:maybe map?]]])

(api/defendpoint GET "/"
  "Returns actions that can be used for QueryActions. By default lists all viewable actions. Pass optional
  `?model-id=<model-id>` to limit to actions on a particular model."
  [model-id]
  {model-id [:maybe ms/PositiveInt]}
  (letfn [(actions-for [models]
            (if (seq models)
              (t2/hydrate (action/select-actions models
                                              :model_id [:in (map :id models)]
                                              :archived false)
                       :creator)
              []))]
    ;; We don't check the permissions on the actions, we assume they are readable if the model is readable.
    (let [models (if model-id
                   [(api/read-check Card model-id)]
                   (t2/select Card {:where
                                    [:and
                                     [:= :type "model"]
                                     [:= :archived false]
                                     ;; action permission keyed off of model permission
                                     (collection/visible-collection-ids->honeysql-filter-clause
                                      :collection_id
                                      (collection/permissions-set->visible-collection-ids
                                       @api/*current-user-permissions-set*))]}))]
      (actions-for models))))

(api/defendpoint GET "/public"
  "Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (t2/select [Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/:action-id"
  "Fetch an Action."
  [action-id]
  {action-id ms/PositiveInt}
  (-> (action/select-action :id action-id :archived false)
      (t2/hydrate :creator)
      api/read-check))

(api/defendpoint DELETE "/:action-id"
  "Delete an Action."
  [action-id]
  {action-id ms/PositiveInt}
  (let [action (api/write-check Action action-id)]
    (snowplow/track-event! ::snowplow/action-deleted api/*current-user-id* {:type      (:type action)
                                                                            :action_id action-id}))
  (t2/delete! Action :id action-id)
  api/generic-204-no-content)

(api/defendpoint POST "/"
  "Create a new action."
  [:as {{:keys [type name description model_id parameters parameter_mappings visualization_settings
                kind
                database_id dataset_query
                template response_handle error_handle] :as action} :body}]
  {name                   :string
   model_id               ms/PositiveInt
   type                   [:maybe supported-action-type]
   description            [:maybe :string]
   parameters             [:maybe [:sequential map?]]
   parameter_mappings     [:maybe map?]
   visualization_settings [:maybe map?]
   kind                   [:maybe implicit-action-kind]
   database_id            [:maybe ms/PositiveInt]
   dataset_query          [:maybe map?]
   template               [:maybe http-action-template]
   response_handle        [:maybe json-query-schema]
   error_handle           [:maybe json-query-schema]}
  (when (and (nil? database_id)
             (= "query" type))
    (throw (ex-info (tru "Must provide a database_id for query actions")
                    {:type        type
                     :status-code 400})))
  (let [model (api/write-check Card model_id)]
    (when (and (= "implicit" type)
               (not (card/model-supports-implicit-actions? model)))
      (throw (ex-info (tru "Implicit actions are not supported for models with clauses.")
                      {:status-code 400})))
    (doseq [db-id (cond-> [(:database_id model)] database_id (conj database_id))]
      (actions/check-actions-enabled-for-database!
       (t2/select-one Database :id db-id))))
  (let [action-id (action/insert! (assoc action :creator_id api/*current-user-id*))]
    (snowplow/track-event! ::snowplow/action-created api/*current-user-id* {:type           type
                                                                            :action_id      action-id
                                                                            :num_parameters (count parameters)})
    (if action-id
      (action/select-action :id action-id)
      ;; t2/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (action/select-actions nil :type type)))))

(api/defendpoint PUT "/:id"
  "Update an Action."
  [id :as {action :body}]
  {id     ms/PositiveInt
   action [:map
           [:archived               {:optional true} [:maybe :boolean]]
           [:database_id            {:optional true} [:maybe ms/PositiveInt]]
           [:dataset_query          {:optional true} [:maybe :map]]
           [:description            {:optional true} [:maybe :string]]
           [:error_handle           {:optional true} [:maybe json-query-schema]]
           [:kind                   {:optional true} [:maybe implicit-action-kind]]
           [:model_id               {:optional true} [:maybe ms/PositiveInt]]
           [:name                   {:optional true} [:maybe :string]]
           [:parameter_mappings     {:optional true} [:maybe :map]]
           [:parameters             {:optional true} [:maybe [:sequential :map]]]
           [:response_handle        {:optional true} [:maybe json-query-schema]]
           [:template               {:optional true} [:maybe http-action-template]]
           [:type                   {:optional true} [:maybe supported-action-type]]
           [:visualization_settings {:optional true} [:maybe :map]]]}
  (actions/check-actions-enabled! id)
  (let [existing-action (api/write-check Action id)]
    (action/update! (assoc action :id id) existing-action))
  (let [{:keys [parameters type] :as action} (action/select-action :id id)]
    (snowplow/track-event! ::snowplow/action-updated api/*current-user-id* {:type           type
                                                                            :action_id      id
                                                                            :num_parameters (count parameters)})
    action))

(api/defendpoint POST "/:id/public_link"
  "Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [id]
  {id ms/PositiveInt}
  (api/check-superuser)
  (validation/check-public-sharing-enabled)
  (let [action (api/read-check Action id :archived false)]
    (actions/check-actions-enabled! action)
    {:uuid (or (:public_uuid action)
               (u/prog1 (str (random-uuid))
                 (t2/update! Action id
                             {:public_uuid <>
                              :made_public_by_id api/*current-user-id*})))}))

(api/defendpoint DELETE "/:id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [id]
  {id ms/PositiveInt}
  ;; check the /application/setting permission, not superuser because removing a public link is possible from /admin/settings
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? Action :id id, :public_uuid [:not= nil], :archived false)
  (actions/check-actions-enabled! id)
  (t2/update! Action id {:public_uuid nil, :made_public_by_id nil})
  {:status 204, :body nil})

(api/defendpoint GET "/:action-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [action-id parameters]
  {action-id  ms/PositiveInt
   parameters ms/JSONString}
  (actions/check-actions-enabled! action-id)
  (-> (action/select-action :id action-id :archived false)
      api/read-check
      (actions/fetch-values (json/parse-string parameters))))

(api/defendpoint POST "/:id/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  [id :as {{:keys [parameters], :as _body} :body}]
  {id         ms/PositiveInt
   parameters [:maybe [:map-of :keyword any?]]}
  (let [{:keys [type] :as action} (api/check-404 (action/select-action :id id :archived false))]
    (snowplow/track-event! ::snowplow/action-executed api/*current-user-id* {:source    :model_detail
                                                                             :type      type
                                                                             :action_id id})
    (actions/execute-action! action (update-keys parameters name))))

(api/define-routes)
