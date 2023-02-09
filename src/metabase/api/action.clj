(ns metabase.api.action
  "`/api/action/` endpoints."
  (:require
   [compojure.core :as compojure :refer [POST]]
   [metabase.actions :as actions]
   [metabase.actions.http-action :as http-action]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models :refer [Action Card Database]]
   [metabase.models.action :as action]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]])
  (:import
   (java.util UUID)))

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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:action-id"
  [action-id]
  (api/write-check Action action-id)
  (db/delete! Action :id action-id)
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
  (when (and (nil? database_id)
             (= "query" type))
    (throw (ex-info (tru "Must provide a database_id for query actions")
                    {:type        type
                     :status-code 400})))
  (when database_id
    (actions/check-actions-enabled! (db/select-one Database :id database_id)))
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
  (let [existing-action (api/write-check Action id)]
    (action/update! (assoc action :id id) existing-action))
  (first (action/actions-with-implicit-params nil :id id)))

(api/defendpoint POST "/:id/public_link"
  "Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [id]
  {id pos-int?}
  (api/check-superuser)
  (validation/check-public-sharing-enabled)
  (api/read-check Action id)
  {:uuid (or (db/select-one-field :public_uuid Action :id id)
             (u/prog1 (str (UUID/randomUUID))
                      (db/update! Action id
                                  :public_uuid <>
                                  :made_public_by_id api/*current-user-id*)))})

(api/defendpoint DELETE "/:id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [id]
  {id pos-int?}
  ;; check the /application/setting permission, not superuser because removing a public link is possible from /admin/settings
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? Action :id id, :public_uuid [:not= nil])
  (db/update! Action id :public_uuid nil, :made_public_by_id nil)
  {:status 204, :body nil})

(api/define-routes)
