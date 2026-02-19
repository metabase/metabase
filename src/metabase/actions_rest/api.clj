(ns metabase.actions-rest.api
  "`/api/action/` endpoints."
  (:require
   [metabase.actions.core :as actions]
   [metabase.actions.schema :as actions.schema]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/" :- [:sequential ::actions.schema/action]
  "Returns actions that can be used for QueryActions. By default lists all viewable actions. Pass optional
  `?model-id=<model-id>` to limit to actions on a particular model."
  [_route-params
   {:keys [model-id]} :- [:map
                          [:model-id {:optional true} [:maybe ::lib.schema.id/card]]]]
  (letfn [(actions-for [models]
            (if (seq models)
              (t2/hydrate (actions/select-actions models
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

(api.macros/defendpoint :get "/public" :- [:sequential ::actions.schema/action]
  "Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled."
  []
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (t2/select [:model/Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(api.macros/defendpoint :get "/:action-id" :- ::actions.schema/action
  "Fetch an Action."
  [{:keys [action-id]} :- [:map
                           [:action-id ms/PositiveInt]]]
  (-> (actions/select-action :id action-id :archived false)
      (t2/hydrate :creator)
      api/read-check))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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

(api.macros/defendpoint :post "/" :- ::actions.schema/action
  "Create a new action."
  [_route-params
   _query-params
   {:keys [model_id parameters database_id]
    action-type :type
    :as action} :- ::actions.schema/action.for-insert]
  (when (= action-type :http)
    (throw (ex-info (tru "HTTP actions are not supported.")
                    {:type        :http
                     :status-code 400})))
  (when (and (nil? database_id)
             (= action-type :query))
    (throw (ex-info (tru "Must provide a database_id for query actions")
                    {:type        action-type
                     :status-code 400})))
  (let [model (api/write-check :model/Card model_id)]
    (when (and (= action-type :implicit)
               (not (queries/model-supports-implicit-actions? model)))
      (throw (ex-info (tru "Implicit actions are not supported for models with clauses.")
                      {:status-code 400})))
    (doseq [db-id (cond-> [(:database_id model)] database_id (conj database_id))]
      (actions/check-actions-enabled-for-database!
       (t2/select-one :model/Database :id db-id))))
  (let [action-id (actions/insert! (assoc action :creator_id api/*current-user-id*))]
    (analytics/track-event! :snowplow/action
                            {:event          :action-created
                             :type           action-type
                             :action_id      action-id
                             :num_parameters (count parameters)})
    (if action-id
      (actions/select-action :id action-id)
      ;; t2/insert! does not return a value when used with h2
      ;; so we return the most recently updated http action.
      (last (actions/select-actions nil :type action-type)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an Action."
  [{:keys [id]} :- [:map
                    [:id ::actions.schema/id]]
   _query-params
   action :- ::actions.schema/action.for-update]
  (when (= (:type action) :http)
    (throw (ex-info (tru "HTTP actions are not supported.")
                    {:type        :http
                     :status-code 400})))
  (actions/check-actions-enabled! id)
  (let [existing-action (api/write-check :model/Action id)]
    (when (= (:type existing-action) :http)
      (throw (ex-info (tru "HTTP actions are not supported.")
                      {:type        :http
                       :status-code 400})))
    (actions/update! (assoc action :id id) existing-action))
  (let [{:keys [parameters type] :as action} (actions/select-action :id id)]
    (analytics/track-event! :snowplow/action
                            {:event          :action-updated
                             :type           type
                             :action_id      id
                             :num_parameters (count parameters)})
    action))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/public_link"
  "Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [{:keys [id]} :- [:map
                    [:id ::actions.schema/id]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (let [action (api/read-check :model/Action id :archived false)]
    (actions/check-actions-enabled! action)
    {:uuid (or (:public_uuid action)
               (u/prog1 (str (random-uuid))
                 (t2/update! :model/Action id
                             {:public_uuid <>
                              :made_public_by_id api/*current-user-id*})))}))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [{:keys [id]} :- [:map
                    [:id ::actions.schema/id]]]
  ;; check the /application/setting permission, not superuser because removing a public link is possible from
  ;; /admin/settings
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Action :id id, :public_uuid [:not= nil], :archived false)
  (actions/check-actions-enabled! id)
  (t2/update! :model/Action id {:public_uuid nil, :made_public_by_id nil})
  {:status 204, :body nil})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:action-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [{:keys [action-id]} :- [:map
                           [:action-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters ms/JSONString]]]
  (actions/check-actions-enabled! action-id)
  (-> (actions/select-action :id action-id :archived false)
      api/read-check
      (actions/fetch-values (json/decode parameters))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  [{:keys [id]} :- [:map
                    [:id ::actions.schema/id]]
   _query-params
   {:keys [parameters], :as _body} :- [:maybe [:map
                                               [:parameters {:optional true} [:maybe [:map-of :keyword any?]]]]]]
  (let [{:keys [type] :as action} (api/check-404 (actions/select-action :id id :archived false))]
    (when (= type :http)
      (throw (ex-info (tru "HTTP actions are not supported.")
                      {:type        :http
                       :status-code 400})))
    (analytics/track-event! :snowplow/action
                            {:event     :action-executed
                             :source    :model_detail
                             :type      type
                             :action_id id})
    (actions/execute-action! action (update-keys parameters name))))
