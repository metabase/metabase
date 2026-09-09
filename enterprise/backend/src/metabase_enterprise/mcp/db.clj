(ns metabase-enterprise.mcp.db
  "Application database queries for the mcp module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn session-log-exists? :- :boolean
  "Whether an McpSessionLog with `session-id` exists."
  [session-id :- :string]
  (t2/exists? :model/McpSessionLog :id session-id))

(def ^:private SessionClientIdentity
  "Rows returned by [[session-client-identity]]."
  (mut/select-keys ::mcp.schema/mcp-session-log [:client_name :client_version]))

(mu/defn session-client-identity :- [:maybe SessionClientIdentity]
  "The client name and version of the McpSessionLog with `session-id`, or nil."
  [session-id :- :string]
  (t2/select-one [:model/McpSessionLog :client_name :client_version] :id session-id))

(mu/defn insert-session-log! :- :int
  "Insert the McpSessionLog `row`."
  [row :- [:map {:closed true}
           [:id             {:optional true} :string]
           [:user_id        {:optional true} [:maybe ::lib.schema.id/user]]
           [:tenant_id      {:optional true} [:maybe ms/PositiveInt]]
           [:client_name    {:optional true} [:maybe :string]]
           [:client_version {:optional true} [:maybe :string]]
           [:ip_address     {:optional true} [:maybe :string]]
           [:user_agent     {:optional true} [:maybe :string]]]]
  (t2/insert! :model/McpSessionLog row))

(mu/defn end-session-log! :- :int
  "Stamp `ended_at` on the McpSessionLog with `session-id`."
  [session-id :- :string]
  (t2/update! :model/McpSessionLog :id session-id {:ended_at :%now}))

(mu/defn insert-tool-call-log! :- :int
  "Insert the McpToolCallLog `row`."
  [row :- ::mcp.schema/mcp-tool-call-log.update]
  (t2/insert! :model/McpToolCallLog row))

(mu/defn delete-tool-call-logs-created-before! :- :int
  "Delete the McpToolCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/McpToolCallLog {:where [:< :created_at cutoff]}))

(mu/defn delete-session-logs-created-before! :- :int
  "Delete the McpSessionLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/McpSessionLog {:where [:< :created_at cutoff]}))
