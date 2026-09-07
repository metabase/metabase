(ns metabase-enterprise.mcp.db
  "Application database queries for the mcp module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn session-log-exists?
  "Whether an McpSessionLog with `session-id` exists."
  [session-id]
  (t2/exists? :model/McpSessionLog :id session-id))

(defn session-client-identity
  "The client name and version of the McpSessionLog with `session-id`, or nil."
  [session-id]
  (t2/select-one [:model/McpSessionLog :client_name :client_version] :id session-id))

(defn insert-session-log!
  "Insert the McpSessionLog `row`."
  [row]
  (t2/insert! :model/McpSessionLog row))

(defn end-session-log!
  "Stamp `ended_at` on the McpSessionLog with `session-id`."
  [session-id]
  (t2/update! :model/McpSessionLog :id session-id {:ended_at :%now}))

(defn insert-tool-call-log!
  "Insert the McpToolCallLog `row`."
  [row]
  (t2/insert! :model/McpToolCallLog row))

(defn delete-tool-call-logs-created-before!
  "Delete the McpToolCallLogs created before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/McpToolCallLog {:where [:< :created_at cutoff]}))

(defn delete-session-logs-created-before!
  "Delete the McpSessionLogs created before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/McpSessionLog {:where [:< :created_at cutoff]}))
