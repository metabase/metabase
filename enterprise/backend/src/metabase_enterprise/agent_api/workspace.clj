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

;;; ------------------------------------------------ Agent API Schemas -----------------------------------------------
;;
;; These schemas define the agent API contract independently of the EE workspace API.
;; In practice we will often sync with ws.api.common, but we must be conscious and explicit with breaking changes to
;; so that we can keep our skills and integrations (e.g. CLI, MCP) updated.

(def ^:private WorkspaceStatus
  "Computed workspace status enum."
  (into [:enum] ws.api.common/computed-statuses))

(def ^:private Workspace
  "Schema for a workspace API response."
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:collection_id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:status WorkspaceStatus]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])

(def ^:private TransformSource ws.api.common/TransformSource)

(def ^:private TransformTarget
  [:map {:closed true}
   [:database {:optional true} ::ws.t/appdb-id]
   [:type [:enum "table"]]
   [:schema {:optional true} [:maybe [:string {:min 1}]]]
   [:name [:string {:min 1}]]])

(def ^:private InputTable
  [:map
   [:db_id ::ws.t/appdb-id]
   [:schema [:maybe :string]]
   [:table :string]
   [:table_id [:maybe ::ws.t/appdb-id]]])

(def ^:private OutputTable
  [:map
   [:db_id ::ws.t/appdb-id]
   [:global [:map
             [:transform_id [:maybe ::ws.t/appdb-id]]
             [:schema [:maybe :string]]
             [:table :string]
             [:table_id [:maybe ::ws.t/appdb-id]]]]
   [:isolated [:map
               [:transform_id [:or ::ws.t/ref-id ::ws.t/appdb-id]]
               [:schema :string]
               [:table :string]
               [:table_id [:maybe ::ws.t/appdb-id]]]]])

(def ^:private WorkspaceTransform
  "Schema for a full workspace transform API response."
  [:map
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:description [:maybe :string]]
   [:source :map]
   [:target :map]
   [:target_stale [:maybe :boolean]]
   [:workspace_id ::ws.t/appdb-id]
   [:creator_id [:maybe ::ws.t/appdb-id]]
   [:archived_at :any]
   [:created_at :any]
   [:updated_at :any]
   [:last_run_at :any]
   [:last_run_status [:maybe :string]]
   [:last_run_message [:maybe :string]]])

(def ^:private WorkspaceTransformListing
  "Schema for a transform in a workspace listing."
  [:map {:closed true}
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:source_type [:maybe :keyword]]
   [:creator_id [:maybe ::ws.t/appdb-id]]])

(def ^:private ExternalTransform
  "Schema for an external (non-workspace) transform visible to a workspace."
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:source_type :keyword]
   [:checkout_disabled [:maybe :string]]])

(def ^:private PendingInput
  "Schema for an input table that has not yet been granted access."
  [:map
   [:db_id ::ws.t/appdb-id]
   [:schema [:maybe :string]]
   [:table :string]])

(def ^:private GraphNode
  [:map
   [:id [:or ::ws.t/appdb-id ::ws.t/ref-id]]
   [:type [:enum :input-table :external-transform :workspace-transform]]
   [:dependents_count [:map-of [:enum :input-table :external-transform :workspace-transform] ms/PositiveInt]]
   [:data :map]])

(def ^:private GraphEdge
  [:map
   [:from_entity_id [:or ::ws.t/appdb-id ::ws.t/ref-id]]
   [:from_entity_type :string]
   [:to_entity_id [:or ::ws.t/appdb-id ::ws.t/ref-id]]
   [:to_entity_type :string]])

(def ^:private GraphResult
  "Schema for the workspace dependency graph response."
  [:map
   [:nodes [:sequential GraphNode]]
   [:edges [:sequential GraphEdge]]])

;;; ------------------------------------------------ Read Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/:ws-id" :- Workspace
  "Get a single workspace by ID."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace ws-id))

(api.macros/defendpoint :get "/:ws-id/table"
  :- [:map {:closed true}
      [:inputs [:sequential InputTable]]
      [:outputs [:sequential OutputTable]]]
  "Get workspace input and output tables."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-tables ws-id))

(api.macros/defendpoint :get "/:ws-id/log"
  :- [:map
      [:workspace_id ms/PositiveInt]
      [:status WorkspaceStatus]
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

(api.macros/defendpoint :get "/:ws-id/graph" :- GraphResult
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

(api.macros/defendpoint :get "/:ws-id/external/transform" :- [:map [:transforms [:sequential ExternalTransform]]]
  "List external transforms not checked out into this workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [database-id]} :- [:map [:database-id {:optional true} ::ws.t/appdb-id]]]
  (ws.api.common/get-external-transforms ws-id database-id))

(api.macros/defendpoint :get "/:ws-id/input/pending"
  :- [:map [:inputs [:sequential PendingInput]]]
  "List pending input grants."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (ws.api.common/get-pending-inputs ws-id))

;;; ------------------------------------------ Transform CRUD ---------------------------------------------------------

(api.macros/defendpoint :get "/:ws-id/transform" :- [:map [:transforms [:sequential WorkspaceTransformListing]]]
  "List all transforms in a workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (ws.api.common/list-transforms ws-id))

(api.macros/defendpoint :get "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Get a specific transform in a workspace."
  {:scope "agent:workspace:read"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/fetch-ws-transform ws-id tx-id))

(api.macros/defendpoint :post "/:ws-id/archive" :- Workspace
  "Archive a workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params
   _body-params]
  (ws.api.common/archive-workspace! ws-id))

(api.macros/defendpoint :post "/:ws-id/transform"
  :- WorkspaceTransform
  "Create a new transform in the workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   body :- [:map #_{:closed true}
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source TransformSource]
            #_[:target TransformTarget]]]
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

(api.macros/defendpoint :put "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Update or create a transform in a workspace."
  {:scope "agent:workspace:write"}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} TransformSource]
            [:target {:optional true} TransformTarget]]]
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
