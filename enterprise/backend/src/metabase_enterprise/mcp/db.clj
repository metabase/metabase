(ns metabase-enterprise.mcp.db
  "Application database queries for the mcp module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn session-log-exists?
  "Whether an McpSessionLog with `session-id` exists."
  [session-id :- :string]
  (t2/exists? :model/McpSessionLog :id session-id))

(mu/defn session-client-identity
  "The client name and version of the McpSessionLog with `session-id`, or nil."
  [session-id :- :string]
  (t2/select-one [:model/McpSessionLog :client_name :client_version] :id session-id))

(mu/defn insert-session-log!
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

(mu/defn end-session-log!
  "Stamp `ended_at` on the McpSessionLog with `session-id`."
  [session-id :- :string]
  (t2/update! :model/McpSessionLog :id session-id {:ended_at :%now}))

(mu/defn insert-tool-call-log!
  "Insert the McpToolCallLog `row`."
  [row :- ::mcp.schema/mcp-tool-call-log.update]
  (t2/insert! :model/McpToolCallLog row))

(mu/defn delete-tool-call-logs-created-before!
  "Delete the McpToolCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/McpToolCallLog {:where [:< :created_at cutoff]}))

(mu/defn delete-session-logs-created-before!
  "Delete the McpSessionLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/McpSessionLog {:where [:< :created_at cutoff]}))

(defn- default-group-ids
  "The IDs of All Users and All tenant users."
  []
  [(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))])

(mu/defn seeded-group-ids :- [:sequential ms/PositiveInt]
  "The IDs of the groups the migration seeds with MCP on and no overrides, Administrators aside: All Users, Data
  Analysts, and All tenant users."
  []
  (conj (default-group-ids) (u/the-id (perms/data-analyst-group))))

(defn- visible-groups-expr
  "Matches the groups the MCP tool access page shows in the mode selected by `advanced?`: Administrators, All
  Users, and All tenant users in simple mode, every other group in group-level mode."
  [advanced?]
  (if advanced?
    [:not-in :group_id (default-group-ids)]
    [:in :group_id (conj (default-group-ids) (u/the-id (perms/admin-group)))]))

(mu/defn visible-group-permissions-for-user
  "The McpGroupPermission rows of the groups of the User with `user-id` that the mode selected by `advanced?` shows."
  [user-id   :- ::lib.schema.id/user
   advanced? :- :boolean]
  (t2/select :model/McpGroupPermission
             {:where [:and
                      [:in :group_id
                       ^:allow-subquery
                       {:select [:group_id]
                        :from   [(t2/table-name :model/PermissionsGroupMembership)]
                        :where  [:= :user_id user-id]}]
                      (visible-groups-expr advanced?)]}))

(mu/defn all-group-ids
  "Every PermissionsGroup id, in ID order."
  []
  (t2/select-pks-vec :model/PermissionsGroup {:order-by [[:id :asc]]}))

(mu/defn all-group-permissions
  "Every McpGroupPermission row, in group order."
  []
  (t2/select :model/McpGroupPermission {:order-by [[:group_id :asc]]}))

(mu/defn upsert-group-permission!
  "Set the McpGroupPermission of the group with `group-id` to `values`, creating the row when the group has none."
  [group-id :- ms/PositiveInt
   values   :- [:map {:closed true}
                [:mcp_enabled :boolean]
                [:tool_access ::mcp.perms/tool-access]]]
  (if (t2/exists? :model/McpGroupPermission :group_id group-id)
    (t2/update! :model/McpGroupPermission {:group_id group-id} values)
    (t2/insert! :model/McpGroupPermission (assoc values :group_id group-id))))

(mu/defn delete-hidden-group-permissions!
  "Delete the McpGroupPermission rows of the groups the mode selected by `advanced?` hides."
  [advanced? :- :boolean]
  (t2/delete! :model/McpGroupPermission {:where [:not (visible-groups-expr advanced?)]}))
