(ns metabase.mcp.db
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.session.core :as session]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-feedback! :- :int
  "Insert the McpFeedback `row`, returning the number inserted."
  [row :- ::mcp.schema/mcp-feedback.update]
  (t2/insert! :model/McpFeedback row))

(mu/defn session-user-id :- [:maybe ::lib.schema.id/user]
  "The id of the User owning the `core_session` with `key-hashed`, or nil."
  [key-hashed :- :string]
  (t2/select-one-fn :user_id :core_session :key_hashed key-hashed))

(mu/defn get-or-create-core-session! :- :map
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
     {:id              (session/generate-session-id)
      :anti_csrf_token nil
      :created_at      :%now})))

(mu/defn insert-query-handle! :- :int
  "Insert the McpQueryHandle `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:id              {:optional true} ms/PositiveInt]
           [:mcp_session_id  {:optional true} [:maybe :string]]
           [:core_session_id {:optional true} [:maybe :string]]
           [:encoded_query   {:optional true} [:maybe [:or :string :map sequential?]]]
           [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
           [:prompt          {:optional true} [:maybe [:or :string :map sequential?]]]]]
  (t2/insert! :model/McpQueryHandle row))

(mu/defn query-handle-for-user :- [:maybe (mut/optional-keys (mut/open-schema (mr/schema ::mcp.schema/mcp-query-handle)))]
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

(mu/defn delete-session-for-user! :- [:sequential :int]
  "Delete the `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (t2/query {:delete-from :core_session
             :where       [:and
                           [:= :key_hashed key-hashed]
                           [:= :user_id user-id]]}))

(mu/defn delete-query-handles-for-mcp-session! :- :int
  "Delete the McpQueryHandles of the MCP session `mcp-session-id`, returning the number deleted."
  [mcp-session-id :- :string]
  (t2/delete! :model/McpQueryHandle :mcp_session_id mcp-session-id))
