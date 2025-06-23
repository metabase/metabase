(ns metabase.actions.api
  "`/api/action/` endpoints."
  (:require
   [metabase.actions.actions :as actions]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.http-action :as actions.http-action]
   [metabase.actions.models :as actions.models]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.validation :as public-sharing.validation]
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
              (t2/hydrate (actions.models/select-actions models
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
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (t2/select [:model/Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(api.macros/defendpoint :get "/:action-id"
  "Fetch an Action."
  [{:keys [action-id]} :- [:map
                           [:action-id ms/PositiveInt]]]
  (-> (actions.models/select-action :id action-id :archived false)
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
  (let [action-id (actions.models/insert! (assoc action :creator_id api/*current-user-id*))]
    (analytics/track-event! :snowplow/action
                            {:event          :action-created
                             :type           action-type
                             :action_id      action-id
                             :num_parameters (count parameters)})
    (if action-id
      (actions.models/select-action :id action-id)
      ;; t2/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (actions.models/select-actions nil :type action-type)))))

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
    (actions.models/update! (assoc action :id id) existing-action))
  (let [{:keys [parameters type] :as action} (actions.models/select-action :id id)]
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
  (public-sharing.validation/check-public-sharing-enabled)
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
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
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
  (-> (actions.models/select-action :id action-id :archived false)
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
  (let [{:keys [type] :as action} (api/check-404 (actions.models/select-action :id id :archived false))]
    (analytics/track-event! :snowplow/action
                            {:event     :action-executed
                             :source    :model_detail
                             :type      type
                             :action_id id})
    (actions.execution/execute-action! action (update-keys parameters name))))

;; new picker

(api.macros/defendpoint :get "/v2/database"
  "Databases which contain actions"
  [_ _ _]
  ;; TODO optimize into a single reducible query, and support pagination
  (let [non-empty-dbs      (t2/select-fn-set :db_id [:model/Table :db_id])
        databases          (when non-empty-dbs
                             (t2/select [:model/Database :id :name :description :settings]
                                        :id [:in non-empty-dbs]
                                        {:order-by :name}))
        editable-database? (comp boolean :database-enable-table-editing :settings)
        editable-databases (filter editable-database? databases)]
    {:databases (for [db editable-databases]
                  (select-keys db [:id :name :description]))}))

(api.macros/defendpoint :get "/v2/database/:database-id/table"
  "Tables which contain actions"
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]] _ _]
  (let [database           (api/check-404 (t2/select-one :model/Database :id database-id))
        _                  (when-not (get-in database [:settings :database-enable-table-editing])
                             (throw (ex-info "Table editing is not enabled for this database"
                                             {:status-code 400})))
        tables             (t2/select [:model/Table :id :display_name :name :description :schema]
                                      :db_id database-id
                                      :active true
                                      {:order-by :name})]
    {:tables tables}))

(api.macros/defendpoint :get "/v2/model"
  "Models which contain actions"
  [_ _ _]
  ;; TODO optimize into a single reducible query, and support pagination
  (let [model-ids    (t2/select-fn-set :model_id [:model/Action :model_id] :archived false)
        models       (when model-ids
                       (t2/select [:model/Card :id :name :description :collection_position :collection_id]
                                  :id [:in model-ids]
                                  {:order-by :name}))
        coll-ids     (into #{} (keep :collection_id) models)
        collections  (when (seq coll-ids)
                       (t2/select [:model/Collection :id :name] :id [:in coll-ids]))
        ->collection (comp (u/index-by :id :name collections) :collection_id)]
    {:models (for [m models] (assoc m :collection_name (->collection m)))}))

(api.macros/defendpoint :get "/v2/"
  "Returns actions with id and name only. Requires either model-id or table-id parameter."
  [_route-params
   {:keys [model-id table-id]} :- [:map
                                   [:model-id {:optional true} ms/PositiveInt]
                                   [:table-id {:optional true} ms/PositiveInt]]
   _body-params]
  (when-not (or model-id table-id)
    (throw (ex-info "Either model-id or table-id parameter is required"
                    {:status-code 400})))
  (when (and model-id table-id)
    (throw (ex-info "Cannot specify both model-id and table-id parameters"
                    {:status-code 400})))
  (cond
    model-id (do (api/read-check :model/Card model-id)
                 {:actions (t2/select [:model/Action :id :name :description]
                                      :model_id model-id
                                      :archived false
                                      {:order-by :id})})

    table-id (let [table    (api/read-check :model/Table table-id)
                   database (t2/select-one :model/Database :id (:db_id table))
                   _        (when-not (get-in database [:settings :database-enable-table-editing])
                              (throw (ex-info "Table editing is not enabled for this database"
                                              {:status-code 400})))
                   ;; Fields are used to calculate the parameters.
                   ;; There is no longer any reason to hydrate these as the FE will no longer be rendering the "configure" and
                   ;; "execute" forms directly, and will make additional calls to the backend for those anyway.
                   fields   nil
                   actions  (for [[op op-name] actions.models/enabled-table-actions
                                  :let [action (actions.models/table-primitive-action table fields op)]]
                              {:id          (:id action)
                               :name        op-name
                               :description (get-in action [:visualization_settings :description] "")})]
               {:actions actions})))

(defmacro ^:private evil-proxy [verb route var-sym]
  `(api.macros/defendpoint ~verb ~route
     "This is where the route ultimately belongs, but for now its in EE.
      We need to rework it so that certain paid features are skipped when we move it."
     [~'route-params ~'query-params ~'body-params ~'request]
     #_{:clj-kondo/ignore [:metabase/modules]}
     (api.macros/call-core-fn @(requiring-resolve ~var-sym) ~'route-params ~'query-params ~'body-params ~'request)))

(evil-proxy :get  "/v2/tmp-action" 'metabase-enterprise.data-editing.api/tmp-action)
(evil-proxy :post "/v2/config-form" 'metabase-enterprise.data-editing.api/config-form)
(evil-proxy :post "/v2/execute" 'metabase-enterprise.data-editing.api/execute-single)
(evil-proxy :post "/v2/execute-bulk" 'metabase-enterprise.data-editing.api/execute-bulk)
(evil-proxy :post "/v2/tmp-modal" 'metabase-enterprise.data-editing.api/tmp-modal)
