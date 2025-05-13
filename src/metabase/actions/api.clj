(ns metabase.actions.api
  "`/api/action/` endpoints."
  (:require
   [metabase.actions.actions :as actions]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.http-action :as actions.http-action]
   [metabase.actions.models :as action]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; TODO -- by convention these should either have class-like names e.g. `JSONQuery` and `SupportedActionType` or we
;;; should use [[metabase.util.malli.registry/def]] and register them and make them namespaced keywords
(def ^:private JSONQuery
  [:and
   string?
   (mu/with-api-error-message
    [:fn #(actions.http-action/apply-json-query {} %)]
    (deferred-tru "must be a valid json-query, something like ''.item.title''"))])

(def ^:private SupportedActionType
  (mu/with-api-error-message
   ;; TODO -- make this a keyword and let coercion convert it automatically
   [:enum "http" "query" "implicit"]
   (deferred-tru "Unsupported action type")))

(def ^:private ImplicitActionKind
  (mu/with-api-error-message
   (into [:enum]
         (for [ns ["row" "bulk"]
               action ["create" "update" "delete"]]
           (str ns "/" action)))
   (deferred-tru "Unsupported implicit action kind")))

(def ^:private HTTPActionTemplate
  [:map {:closed true}
   [:method                              [:enum "GET" "POST" "PUT" "DELETE" "PATCH"]]
   [:url                                 [string? {:min 1}]]
   [:body               {:optional true} [:maybe string?]]
   [:headers            {:optional true} [:maybe string?]]
   [:parameters         {:optional true} [:maybe [:sequential map?]]]
   [:parameter_mappings {:optional true} [:maybe map?]]])

(api.macros/defendpoint :get "/"
  "Returns actions that can be used for QueryActions. By default lists all viewable actions. Pass optional
  `?model-id=<model-id>` to limit to actions on a particular model."
  [_route-params
   {:keys [model-id]} :- [:map
                          [:model-id {:optional true} [:maybe ms/PositiveInt]]]]
  (letfn [(actions-for [models]
            (if (seq models)
              (t2/hydrate (action/select-actions models
                                                 :model_id [:in (map :id models)]
                                                 :archived false)
                          :creator)
              []))]
    ;; We don't check the permissions on the actions, we assume they are readable if the model is readable.
    (let [models (if model-id
                   [(api/read-check :model/Card model-id)]
                   (t2/select :model/Card {:where
                                           [:and
                                            [:= :type "model"]
                                            [:= :archived false]
                                             ;; action permission keyed off of model permission
                                            (collection/visible-collection-filter-clause)]}))]
      (actions-for models))))

(api.macros/defendpoint :get "/public"
  "Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (t2/select [:model/Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(api.macros/defendpoint :get "/:action-id"
  "Fetch an Action."
  [{:keys [action-id]} :- [:map
                           [:action-id ms/PositiveInt]]]
  (-> (action/select-action :id action-id :archived false)
      (t2/hydrate :creator)
      api/read-check))

(api.macros/defendpoint :delete "/:action-id"
  "Delete an Action."
  [{:keys [action-id]} :- [:map
                           [:action-id ms/PositiveInt]]]
  (let [action (api/write-check :model/Action action-id)]
    (analytics/track-event! :snowplow/action
                            {:event     :action-deleted
                             :type      (:type action)
                             :action_id action-id}))
  (t2/delete! :model/Action :id action-id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/"
  "Create a new action."
  [_route-params
   _query-params
   {:keys [model_id parameters database_id]
    action-type :type
    :as action} :- [:map
                    [:name                   :string]
                    [:model_id               ms/PositiveInt]
                    [:type                   {:optional true} [:maybe SupportedActionType]]
                    [:description            {:optional true} [:maybe :string]]
                    [:parameters             {:optional true} [:maybe [:sequential map?]]]
                    [:parameter_mappings     {:optional true} [:maybe map?]]
                    [:visualization_settings {:optional true} [:maybe map?]]
                    [:kind                   {:optional true} [:maybe ImplicitActionKind]]
                    [:database_id            {:optional true} [:maybe ms/PositiveInt]]
                    [:dataset_query          {:optional true} [:maybe map?]]
                    [:template               {:optional true} [:maybe HTTPActionTemplate]]
                    [:response_handle        {:optional true} [:maybe JSONQuery]]
                    [:error_handle           {:optional true} [:maybe JSONQuery]]]]
  (when (and (nil? database_id)
             (= "query" action-type))
    (throw (ex-info (tru "Must provide a database_id for query actions")
                    {:type        action-type
                     :status-code 400})))
  (let [model (api/write-check :model/Card model_id)]
    (when (and (= "implicit" action-type)
               (not (queries/model-supports-implicit-actions? model)))
      (throw (ex-info (tru "Implicit actions are not supported for models with clauses.")
                      {:status-code 400})))
    (doseq [db-id (cond-> [(:database_id model)] database_id (conj database_id))]
      (actions/check-actions-enabled-for-database!
       (t2/select-one :model/Database :id db-id))))
  (let [action-id (action/insert! (assoc action :creator_id api/*current-user-id*))]
    (analytics/track-event! :snowplow/action
                            {:event          :action-created
                             :type           action-type
                             :action_id      action-id
                             :num_parameters (count parameters)})
    (if action-id
      (action/select-action :id action-id)
      ;; t2/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (action/select-actions nil :type action-type)))))

(api.macros/defendpoint :put "/:id"
  "Update an Action."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   action :- [:map
              [:archived               {:optional true} [:maybe :boolean]]
              [:database_id            {:optional true} [:maybe ms/PositiveInt]]
              [:dataset_query          {:optional true} [:maybe :map]]
              [:description            {:optional true} [:maybe :string]]
              [:error_handle           {:optional true} [:maybe JSONQuery]]
              [:kind                   {:optional true} [:maybe ImplicitActionKind]]
              [:model_id               {:optional true} [:maybe ms/PositiveInt]]
              [:name                   {:optional true} [:maybe :string]]
              [:parameter_mappings     {:optional true} [:maybe :map]]
              [:parameters             {:optional true} [:maybe [:sequential :map]]]
              [:response_handle        {:optional true} [:maybe JSONQuery]]
              [:template               {:optional true} [:maybe HTTPActionTemplate]]
              [:type                   {:optional true} [:maybe SupportedActionType]]
              [:visualization_settings {:optional true} [:maybe :map]]]]
  (actions/check-actions-enabled! id)
  (let [existing-action (api/write-check :model/Action id)]
    (action/update! (assoc action :id id) existing-action))
  (let [{:keys [parameters type] :as action} (action/select-action :id id)]
    (analytics/track-event! :snowplow/action
                            {:event          :action-updated
                             :type           type
                             :action_id      id
                             :num_parameters (count parameters)})
    action))

(api.macros/defendpoint :post "/:id/public_link"
  "Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (validation/check-public-sharing-enabled)
  (let [action (api/read-check :model/Action id :archived false)]
    (actions/check-actions-enabled! action)
    {:uuid (or (:public_uuid action)
               (u/prog1 (str (random-uuid))
                 (t2/update! :model/Action id
                             {:public_uuid <>
                              :made_public_by_id api/*current-user-id*})))}))

(api.macros/defendpoint :delete "/:id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  ;; check the /application/setting permission, not superuser because removing a public link is possible from /admin/settings
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? :model/Action :id id, :public_uuid [:not= nil], :archived false)
  (actions/check-actions-enabled! id)
  (t2/update! :model/Action id {:public_uuid nil, :made_public_by_id nil})
  {:status 204, :body nil})

(api.macros/defendpoint :get "/:action-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [{:keys [action-id]} :- [:map
                           [:action-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters ms/JSONString]]]
  (actions/check-actions-enabled! action-id)
  (-> (action/select-action :id action-id :archived false)
      api/read-check
      (actions.execution/fetch-values (json/decode parameters))))

(api.macros/defendpoint :post "/:id/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [parameters], :as _body} :- [:maybe [:map
                                               [:parameters {:optional true} [:maybe [:map-of :keyword any?]]]]]]
  (let [{:keys [type] :as action} (api/check-404 (action/select-action :id id :archived false))]
    (analytics/track-event! :snowplow/action
                            {:event     :action-executed
                             :source    :model_detail
                             :type      type
                             :action_id id})
    (actions.execution/execute-action! action (update-keys parameters name))))
