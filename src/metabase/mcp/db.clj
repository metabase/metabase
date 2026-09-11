(ns metabase.mcp.db
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.session.core :as session]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; MCP is a session provider like any other as far as `auth_identity` is concerned; declaring it here is what lets
;; the AuthIdentity model's before-insert validation accept the rows [[mcp-auth-identity-id!]] creates.
(auth-identity/derive! :provider/mcp :metabase.auth-identity.provider/provider)

(mu/defn insert-feedback!
  "Insert the McpFeedback `row`, returning the number inserted."
  [row :- ::mcp.schema/mcp-feedback.update]
  (t2/insert! :model/McpFeedback row))

(mu/defn session-user-id
  "The id of the User owning the `core_session` with `key-hashed`, or nil."
  [key-hashed :- :string]
  (t2/select-one-fn :user_id :core_session :key_hashed key-hashed))

;; An AuthIdentity row rather than a new `core_session` column: `auth_identity.provider` is already the provider of
;; record for a session, and the `(user_id, provider)` unique constraint makes one row per user the natural key —
;; `select-or-insert!` leans on that constraint to settle a race between two concurrent MCP handshakes.
(mu/defn- mcp-auth-identity-id! :- ms/PositiveInt
  "The id of `user-id`'s `mcp` AuthIdentity, creating it if there isn't one. There is at most one per user."
  [user-id :- ::lib.schema.id/user]
  (:id (app-db/select-or-insert!
        :model/AuthIdentity
        {:user_id  user-id
         :provider session/mcp-provider}
        (constantly {}))))

(mu/defn get-or-create-core-session!
  "The `core_session` row for `key-hashed` and `user-id`, creating one with a freshly generated session id if none
  exists. Uses the raw `:core_session` table (not `:model/Session`) to bypass the after-insert hook, which would
  otherwise publish a spurious `:event/user-login` event."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (app-db/select-or-insert!
   :core_session
   {:key_hashed key-hashed
    :user_id    user-id}
   (fn []
     {:id               (session/generate-session-id)
      :anti_csrf_token  nil
      ;; the `mcp` provider keeps these rows out of the `/api/sessions` list and revoke endpoints, and stops the
      ;; key from authenticating a request through the session middleware
      :auth_identity_id (mcp-auth-identity-id! user-id)
      :created_at       :%now})))

(mu/defn insert-query-handle!
  "Insert the McpQueryHandle `row` under the client-generated `handle-id`, returning the number inserted."
  [handle-id :- ms/UUIDString
   row       :- ::mcp.schema/mcp-query-handle.update]
  (t2/insert! :model/McpQueryHandle (assoc row :id handle-id)))

(mu/defn query-handle-for-user
  "The McpQueryHandle with `handle-id` whose session belongs to the User with `user-id`, or nil."
  [handle-id :- :string
   user-id   :- ::lib.schema.id/user]
  (t2/select-one :model/McpQueryHandle
                 {:select [:mqh.*]
                  :from   [[:mcp_query_handle :mqh]]
                  :join   [[:core_session :cs] [:= :cs.id :mqh.core_session_id]]
                  :where  [:and
                           [:= :mqh.id handle-id]
                           [:= :cs.user_id user-id]]}))

(mu/defn delete-session-for-user!
  "Delete the `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (t2/query {:delete-from :core_session
             :where       [:and
                           [:= :key_hashed key-hashed]
                           [:= :user_id user-id]]}))

(mu/defn delete-query-handles-for-mcp-session!
  "Delete the McpQueryHandles of the MCP session `mcp-session-id`, returning the number deleted."
  [mcp-session-id :- :string]
  (t2/delete! :model/McpQueryHandle :mcp_session_id mcp-session-id))
