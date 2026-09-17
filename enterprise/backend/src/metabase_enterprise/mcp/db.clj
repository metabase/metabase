(ns metabase-enterprise.mcp.db
  "Application database queries for the mcp module. Every function here delegates to `metabase.mcp.db`, which owns
  the McpSessionLog and McpToolCallLog tables, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn session-log-exists?
  "Whether an McpSessionLog with `session-id` exists."
  [session-id :- :string]
  (mcp.db/mcp-session-log-exists? {:id session-id}))

(mu/defn session-client-identity
  "The client name and version of the McpSessionLog with `session-id`, or nil."
  [session-id :- :string]
  (mcp.db/select-one-mcp-session-log {:id session-id :columns [:client_name :client_version]}))

(mu/defn insert-session-log!
  "Insert the McpSessionLog `row`, which must carry the client-generated `:id`."
  [row :- [:map {:closed true}
           [:id             :string]
           [:user_id        {:optional true} [:maybe ::lib.schema.id/user]]
           [:tenant_id      {:optional true} [:maybe ms/PositiveInt]]
           [:client_name    {:optional true} [:maybe :string]]
           [:client_version {:optional true} [:maybe :string]]
           [:ip_address     {:optional true} [:maybe :string]]
           [:user_agent     {:optional true} [:maybe :string]]]]
  (mcp.db/insert-mcp-session-log! (:id row) (dissoc row :id)))

(mu/defn end-session-log!
  "Stamp `ended_at` on the McpSessionLog with `session-id`."
  [session-id :- :string]
  (mcp.db/update-mcp-session-logs! {:id session-id} {:ended_at :%now}))

(mu/defn insert-tool-call-log!
  "Insert the McpToolCallLog `row`."
  [row :- ::mcp.schema/mcp-tool-call-log.create]
  (mcp.db/insert-mcp-tool-call-log! row))

(mu/defn delete-tool-call-logs-created-before!
  "Delete the McpToolCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (mcp.db/delete-mcp-tool-call-logs-created-before! cutoff))

(mu/defn delete-session-logs-created-before!
  "Delete the McpSessionLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (mcp.db/delete-mcp-session-logs-created-before! cutoff))
