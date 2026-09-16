(ns metabase.mcp-client.db
  "Application database access for external MCP servers and users' connections to them."
  (:require
   [toucan2.core :as t2]))

(defn servers
  "Every external MCP server, by name."
  []
  (t2/select :model/McpServer {:order-by [[:name :asc] [:id :asc]]}))

(defn server
  "The server with `id`, or nil."
  [id]
  (t2/select-one :model/McpServer :id id))

(defn insert-server!
  "Create a server and return it."
  [values]
  (t2/insert-returning-instance! :model/McpServer values))

(defn update-server!
  "Change the server with `id`. When `disconnect?`, also drop everyone's connection to it, in the same transaction."
  [id values disconnect?]
  (t2/with-transaction [_conn]
    (t2/update! :model/McpServer id values)
    (when disconnect?
      (t2/delete! :model/McpConnection :mcp_server_id id))))

(defn delete-server!
  "Remove the server with `id`; its connections go with it."
  [id]
  (t2/delete! :model/McpServer :id id))

(defn connections-by-server-id
  "`user-id`'s connections to the servers in `server-ids`, keyed by server id."
  [user-id server-ids]
  (when (seq server-ids)
    (t2/select-fn->fn :mcp_server_id identity :model/McpConnection
                      :user_id user-id
                      :mcp_server_id [:in server-ids])))

(defn connection
  "The connection with `id`, or nil."
  [id]
  (t2/select-one :model/McpConnection :id id))

(defn user-connection
  "`user-id`'s connection to server `server-id`, or nil."
  [server-id user-id]
  (t2/select-one :model/McpConnection :mcp_server_id server-id :user_id user-id))

(defn pending-connection
  "The connection whose OAuth flow in progress carries `state`, or nil."
  [state]
  (t2/select-one :model/McpConnection :oauth_state state :status :pending))

(defn insert-connection!
  "Create a connection and return it."
  [values]
  (t2/insert-returning-instance! :model/McpConnection values))

(defn update-connection!
  "Change the connection with `id`."
  [id values]
  (t2/update! :model/McpConnection id values))

(defn delete-connection!
  "Remove `user-id`'s connection to server `server-id`."
  [server-id user-id]
  (t2/delete! :model/McpConnection :mcp_server_id server-id :user_id user-id))
