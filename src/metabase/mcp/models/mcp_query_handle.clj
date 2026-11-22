(ns metabase.mcp.models.mcp-query-handle
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpQueryHandle [_model] :mcp_query_handle)

(doto :model/McpQueryHandle
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-mcp-query-handle!
  "Insert the McpQueryHandle `row` under the client-generated `handle-id`, returning the number inserted."
  [handle-id :- ms/UUIDString
   row       :- ::mcp.schema/mcp-query-handle.create]
  (mcp.db/insert-query-handle! handle-id row))

(mu/defn delete-mcp-query-handles-for-cleanup!
  "Delete every McpQueryHandle created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (mcp.db/delete-query-handles-created-before! cutoff))

(mu/defn delete-mcp-query-handles-for-session!
  "Delete the McpQueryHandles of MCP session `mcp-session-id` that belong to the User with `user-id` through the core
  session with `key-hashed`, plus those that carry no core session."
  [mcp-session-id :- :string
   key-hashed     :- :string
   user-id        :- ::lib.schema.id/user]
  (mcp.db/delete-query-handles-for-user-session! mcp-session-id key-hashed user-id))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/McpQueryHandle [_model]
  {:skip? true})
