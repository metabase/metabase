(ns metabase.mcp.db
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn insert-feedback!
  "Insert the McpFeedback `row`."
  [row]
  (t2/insert! :model/McpFeedback row))

(defn session-user-ids
  "The ids of every User owning a `core_session` with `key-hashed`.

  A set rather than a single id: `key-hashed` derives from the client-supplied `Mcp-Session-Id`, so two users
  can each materialize their own row under one id. Reading a single owner picks one of them arbitrarily and
  locks the rest out of a session they already hold — see `metabase.mcp.session/owned-by-user?`."
  [key-hashed]
  (t2/select-fn-set :user_id :core_session :key_hashed key-hashed))

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

(defn delete-query-handles-for-user-session!
  "Delete the McpQueryHandles of MCP session `mcp-session-id` that belong to the User with `user-id`, plus any
  carrying no `core_session_id` at all. See `metabase.mcp.session/delete!` for why the scoping is needed.

  The subquery is deliberate: resolving those session ids in a separate round trip leaves a window where a
  concurrent teardown drops the session between the two statements."
  [mcp-session-id key-hashed user-id]
  (t2/query {:delete-from :mcp_query_handle
             :where       [:and
                           [:= :mcp_session_id mcp-session-id]
                           [:or
                            [:= :core_session_id nil]
                            [:in :core_session_id ^:allow-subquery {:select [:id]
                                                                    :from   [:core_session]
                                                                    :where  [:and
                                                                             [:= :key_hashed key-hashed]
                                                                             [:= :user_id user-id]]}]]]}))
