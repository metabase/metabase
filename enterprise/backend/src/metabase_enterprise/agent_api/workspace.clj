(ns metabase-enterprise.agent-api.workspace
  "Workspace endpoints for the Agent API, mounted at `/api/agent/v1/workspace/...`.
  Provides workspace access with JWT-based agent authentication."
  (:require
   [metabase-enterprise.workspaces.api.common :as ws.api.common]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase.api.macros :as api.macros]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Read Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/:ws-id" :- ws.api.common/Workspace
  "Get a single workspace by ID."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace ws-id))

(api.macros/defendpoint :get "/:ws-id/table"
  :- [:map {:closed true}
      [:inputs [:sequential ::ws.api.common/input-table]]
      [:outputs [:sequential ::ws.api.common/output-table]]]
  "Get workspace input and output tables."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-tables ws-id))

(api.macros/defendpoint :get "/:ws-id/log"
  :- [:map
      [:workspace_id ms/PositiveInt]
      [:status ::ws.api.common/status]
      [:updated_at :any]
      [:last_completed_at [:maybe :any]]
      [:logs [:sequential [:map
                           [:id ms/PositiveInt]
                           [:task :keyword]
                           [:description ms/LocalizedString]
                           [:started_at :any]
                           [:updated_at :any]
                           [:completed_at [:maybe :any]]
                           [:status [:maybe :keyword]]
                           [:message [:maybe :string]]]]]]
  "Get workspace creation status and recent log entries."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-log ws-id))

(api.macros/defendpoint :get "/:ws-id/graph" :- ws.api.common/GraphResult
  "Get the dependency graph for a workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-graph ws-id))

(api.macros/defendpoint :get "/:ws-id/problem" :- [:sequential ::ws.t/problem]
  "Detect problems in the workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-problems ws-id))

(api.macros/defendpoint :get "/:ws-id/external/transform" :- [:map [:transforms [:sequential ws.api.common/ExternalTransform]]]
  "List external transforms not checked out into this workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [database-id]} :- [:map [:database-id {:optional true} ::ws.t/appdb-id]]]
  (ws.api.common/get-external-transforms ws-id database-id))

(api.macros/defendpoint :get "/:ws-id/input/pending"
  :- [:map [:inputs [:sequential ws.api.common/PendingInput]]]
  "List pending input grants."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (ws.api.common/get-pending-inputs ws-id))

;;; ------------------------------------------ Transform CRUD ---------------------------------------------------------

(api.macros/defendpoint :get "/:ws-id/transform" :- [:map [:transforms [:sequential ws.api.common/WorkspaceTransformListing]]]
  "List all transforms in a workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (ws.api.common/list-transforms ws-id))

(api.macros/defendpoint :get "/:ws-id/transform/:tx-id" :- ws.api.common/WorkspaceTransform
  "Get a specific transform in a workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/fetch-ws-transform ws-id tx-id))

(api.macros/defendpoint :post "/:ws-id/archive" :- ws.api.common/Workspace
  "Archive a workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params
   _body-params]
  (ws.api.common/archive-workspace! ws-id))

(api.macros/defendpoint :post "/:ws-id/transform"
  :- ws.api.common/WorkspaceTransform
  "Create a new transform in the workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   body :- [:map #_{:closed true}
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::ws.api.common/transform-source]
            #_[:target ::ws.api.common/transform-target]]]
  (ws.api.common/create-workspace-transform! ws-id body))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/archive" :- :nil
  "Mark a transform for archival."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/archive-transform! ws-id tx-id))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/unarchive" :- :nil
  "Unmark a transform for archival."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/unarchive-transform! ws-id tx-id))

(api.macros/defendpoint :post "/:ws-id/transform/validate/target"
  :- [:map [:status :int] [:body [:or :string i18n/LocalizedString]]]
  "Validate the target table for a workspace transform."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [transform-id]} :- [:map [:transform-id {:optional true} ::ws.t/ref-id]]
   {:keys [db_id target]} :- [:map
                              [:db_id {:optional true} ::ws.t/appdb-id]
                              [:target [:map
                                        [:database {:optional true} ::ws.t/appdb-id]
                                        [:type :string]
                                        [:schema [:maybe :string]]
                                        [:name :string]]]]]
  (ws.api.common/validate-target ws-id transform-id db_id target))

;;; ---------------------------------------- Run / Query Endpoints ----------------------------------------------------

(api.macros/defendpoint :post "/:ws-id/run"
  :- [:map
      [:succeeded [:sequential ::ws.t/ref-id]]
      [:failed [:sequential ::ws.t/ref-id]]
      [:not_run [:sequential ::ws.t/ref-id]]]
  "Execute all transforms in the workspace in dependency order."
  {:scope "agent:workspace:execute"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   {:keys [stale_only]} :- [:map [:stale_only {:optional true} ::ws.t/flag]]]
  (ws.api.common/run-workspace! ws-id stale_only))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/run"
  :- ::ws.t/execution-result
  "Run a single transform in a workspace."
  {:scope "agent:workspace:execute"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [run_stale_ancestors]} :- [:map [:run_stale_ancestors {:optional true} ::ws.t/flag]]]
  (ws.api.common/run-transform! ws-id tx-id run_stale_ancestors))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/dry-run"
  :- ::ws.t/query-result
  "Dry-run a transform without persisting to the target table."
  {:scope "agent:workspace:execute"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [run_stale_ancestors]} :- [:map [:run_stale_ancestors {:optional true} ::ws.t/flag]]]
  (ws.api.common/dry-run-transform! ws-id tx-id run_stale_ancestors))

(api.macros/defendpoint :post "/:ws-id/query"
  :- ::ws.t/query-result
  "Execute a SQL query in the workspace's isolated database context."
  {:scope "agent:workspace:execute"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   {:keys [sql]} :- [:map [:sql [:string {:min 1}]]]]
  (ws.api.common/execute-query! ws-id sql))

;;; ------------------------------------------ Update / Delete --------------------------------------------------------

(api.macros/defendpoint :put "/:ws-id/transform/:tx-id" :- ws.api.common/WorkspaceTransform
  "Update or create a transform in a workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::ws.api.common/transform-source]
            [:target {:optional true} ::ws.api.common/transform-target]]]
  (ws.api.common/update-transform! ws-id tx-id body))

(api.macros/defendpoint :delete "/:ws-id/transform/:tx-id" :- :nil
  "Delete a transform from the workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/delete-transform! ws-id tx-id))

;;; ------------------------------------------------ Handler ----------------------------------------------------------

(defn workspace-handler
  "Returns the workspace handler for the agent API, wrapped with the given auth middleware."
  [+auth]
  (api.macros/ns-handler 'metabase-enterprise.agent-api.workspace +auth))
