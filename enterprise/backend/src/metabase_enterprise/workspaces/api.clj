(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace-manager` endpoints. Superuser only, through a session, an unscoped credential, or an OAuth token
  or API key scoped to `mb:workspace-manager`: every endpoint here is tagged with that scope, and a token with only
  that scope is refused everywhere else. Listing and deleting workspaces work without the `:workspaces` feature, so
  workspaces can still be removed after it is gone."
  (:require
   [metabase-enterprise.workspaces.manager :as ws.manager]
   [metabase-enterprise.workspaces.provisioning-connection :as ws.provisioning-connection]
   [metabase-enterprise.workspaces.workspace :as ws.workspace]
   [metabase.api-scope.workspace-manager :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:private NoContent
  [:map {:closed true}
   [:status [:= 204]]
   [:body :nil]])

(def ^:private Timestamp
  (ms/InstanceOfClass java.time.temporal.Temporal))

(mr/def ::workspace
  "A Workspace as the API shows it: never a warehouse password."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:name       ms/NonBlankString]
   [:creator    [:maybe [:map {:closed true}
                         [:id          ms/PositiveInt]
                         [:email       :string]
                         [:common_name [:maybe :string]]]]]
   [:created_at Timestamp]
   [:updated_at Timestamp]
   [:databases  [:sequential
                 [:map {:closed true}
                  [:database_id ::lib.schema.id/database]
                  [:database    [:map {:closed true}
                                 [:id     ::lib.schema.id/database]
                                 [:name   :string]
                                 [:engine :keyword]]]
                  [:status      [:enum :provisioning :provisioned :deprovisioning :failed]]
                  [:schemas     [:sequential
                                 [:map {:closed true}
                                  [:main_schema       :string]
                                  [:scratch_namespace :string]
                                  [:status            [:enum :adding :active :removing :failed]]
                                  [:error             {:optional true} :string]]]]]]]])

(defn- check-workspaces-access
  []
  (api/check-superuser)
  (premium-features/assert-has-feature :workspaces (tru "Workspaces")))

(api.macros/defendpoint :get "/" :- [:map {:closed true}
                                     [:data  [:sequential ::workspace]]
                                     [:total :int]]
  "List workspaces in id order, a page at a time with `limit` and `offset`, or all of them without. Works without the
  `:workspaces` feature."
  {:scope api-scope/workspace-manager}
  []
  (api/check-superuser)
  (when-let [limit (request/limit)]
    (api/check-400 (pos? limit) (tru "limit must be a positive integer."))
    (api/check-400 (not (neg? (request/offset))) (tru "offset must not be negative.")))
  (ws.workspace/workspaces-page {:limit (request/limit), :offset (or (request/offset) 0)}))

(api.macros/defendpoint :get "/:id" :- ::workspace
  "The workspace with `id`."
  {:scope api-scope/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (check-workspaces-access)
  (api/check-404 (ws.workspace/workspace id)))

(api.macros/defendpoint :post "/" :- [:or
                                      ::workspace
                                      [:map {:closed true}
                                       [:status [:= 500]]
                                       [:body   [:map {:closed true}
                                                 [:message          :string]
                                                 [:workspace_id     ms/PositiveInt]
                                                 [:cleanup_required [:= true]]]]]]
  "Create a workspace on each of `databases` reading its main `schemas`, and provision it in the warehouse: a user and
  one scratch namespace per main schema. Blocks until done; every schema is then `active`. Both lists must be
  non-empty. On a warehouse failure everything is rolled back (502); when the rollback fails too, a 500 names the
  workspace to delete."
  {:scope api-scope/workspace-manager}
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:name      ms/NonBlankString]
            [:databases [:sequential {:min 1}
                         [:map {:closed true}
                          [:database_id ::lib.schema.id/database]
                          [:schemas     [:sequential {:min 1} ms/NonBlankString]]]]]]]
  (check-workspaces-access)
  (let [{:keys [workspace cleanup-required-workspace-id]} (ws.manager/create-workspace! body api/*current-user-id*)]
    (if workspace
      workspace
      {:status 500
       :body   {:message          (tru "Creating the workspace failed and so did its rollback; delete it to finish the cleanup.")
                :workspace_id     cleanup-required-workspace-id
                :cleanup_required true}})))

(api.macros/defendpoint :put "/:id" :- ::workspace
  "Rename the workspace with `id`."
  {:scope api-scope/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {workspace-name :name} :- [:map {:closed true} [:name ms/NonBlankString]]]
  (check-workspaces-access)
  (ws.manager/rename-workspace! id workspace-name))

(api.macros/defendpoint :delete "/:id" :- NoContent
  "Delete the workspace with `id`: drop its scratch namespaces, revoke its grants and drop its user in every database.
  When that fails for some databases, a 502 lists them; they stay `failed` and a retry is safe. Works without the
  `:workspaces` feature."
  {:scope api-scope/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-superuser)
  (ws.manager/delete-workspace! id)
  api/generic-204-no-content)

(api.macros/defendpoint :get "/database/:db-id/provisioning-connection"
  :- [:map {:closed true}
      [:configured :boolean]
      [:user       {:optional true} [:maybe :string]]
      [:updated_at {:optional true} (ms/InstanceOfClass java.time.temporal.Temporal)]]
  "Whether the database has a workspace provisioning connection, and if so its user and when it was saved. Never
  returns the password."
  {:scope api-scope/workspace-manager}
  [{:keys [db-id]} :- [:map {:closed true} [:db-id ::lib.schema.id/database]]]
  (check-workspaces-access)
  (ws.provisioning-connection/connection-info db-id))

(api.macros/defendpoint :put "/database/:db-id/provisioning-connection" :- NoContent
  "Save the workspace provisioning connection of the database: the engine's connection fields, merged over the
  database's own, of a login that can create users and schemas. Tested before it is saved."
  {:scope api-scope/workspace-manager}
  [{:keys [db-id]} :- [:map {:closed true} [:db-id ::lib.schema.id/database]]
   _query-params
   {:keys [details]} :- [:map {:closed true} [:details ms/DatabaseDetails]]]
  (check-workspaces-access)
  (ws.provisioning-connection/save! db-id details api/*current-user-id*)
  api/generic-204-no-content)

(api.macros/defendpoint :delete "/database/:db-id/provisioning-connection" :- NoContent
  "Delete the workspace provisioning connection of the database, unless workspaces exist on it."
  {:scope api-scope/workspace-manager}
  [{:keys [db-id]} :- [:map {:closed true} [:db-id ::lib.schema.id/database]]]
  (check-workspaces-access)
  (ws.provisioning-connection/delete! db-id)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace-manager` routes."
  (api.macros/ns-handler *ns* +auth))
