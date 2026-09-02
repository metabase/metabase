(ns metabase.mcp.queries
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn insert-feedback!
  "Insert the McpFeedback `row`."
  [row]
  (t2/insert! :model/McpFeedback row))

(defn session-user-id
  "The id of the User owning the `core_session` with `key-hashed`, or nil."
  [key-hashed]
  (t2/select-one-fn :user_id :core_session :key_hashed key-hashed))

(defn insert-query-handle!
  "Insert the McpQueryHandle `row`."
  [row]
  (t2/insert! :model/McpQueryHandle row))

(defn query-handle-for-user
  "The McpQueryHandle with `handle-id` whose session belongs to the User with `user-id`, or nil."
  [handle-id user-id]
  (t2/select-one :model/McpQueryHandle
                 {:select [:mqh.*]
                  :from   [[:mcp_query_handle :mqh]]
                  :join   [[:core_session :cs] [:= :cs.id :mqh.core_session_id]]
                  :where  [:and
                           [:= :mqh.id handle-id]
                           [:= :cs.user_id user-id]]}))

(defn delete-session-for-user!
  "Delete the `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed user-id]
  (t2/query {:delete-from :core_session
             :where       [:and
                           [:= :key_hashed key-hashed]
                           [:= :user_id user-id]]}))

(defn delete-query-handles-for-mcp-session!
  "Delete the McpQueryHandles of the MCP session `mcp-session-id`."
  [mcp-session-id]
  (t2/delete! :model/McpQueryHandle :mcp_session_id mcp-session-id))
