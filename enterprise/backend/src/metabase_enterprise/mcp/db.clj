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

(mu/defn advanced-mode? :- :boolean
  "Whether MCP tool access is set per group instead of for All Users only. That is the state in which All Users has no
  McpGroupPermission: the migration seeds one, only entering group-level mode deletes it, and leaving re-seeds it."
  []
  (not (t2/exists? :model/McpGroupPermission :group_id (u/the-id (perms/all-users-group)))))

(mu/defn seeded-group-ids :- [:sequential ms/PositiveInt]
  "The IDs of the groups the mode selected by `advanced?` enables on entry: Data Analysts in group-level mode, All
  Users and All tenant users in simple mode."
  [advanced? :- :boolean]
  (if advanced?
    [(u/the-id (perms/data-analyst-group))]
    (default-group-ids)))

(defn- visible-groups-expr
  "Matches, on `column`, the groups the MCP tool access page shows in the mode selected by `advanced?`:
  Administrators, All Users, and All tenant users in simple mode, every other group in group-level mode."
  [column advanced?]
  (if advanced?
    [:not-in column (default-group-ids)]
    [:in column (conj (default-group-ids) (u/the-id (perms/admin-group)))]))

(mu/defn visible-group-ids :- [:set ms/PositiveInt]
  "The IDs of the groups the mode selected by `advanced?` shows."
  [advanced? :- :boolean]
  (t2/select-pks-set :model/PermissionsGroup {:where (visible-groups-expr :id advanced?)}))

(mu/defn group-permissions-for-user
  "The McpGroupPermission rows of the groups of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/McpGroupPermission
             {:where [:in :group_id
                      ^:allow-subquery
                      {:select [:group_id]
                       :from   [(t2/table-name :model/PermissionsGroupMembership)]
                       :where  [:= :user_id user-id]}]}))

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

(mu/defn insert-group-permission-unless-exists!
  "Give the group with `group-id` an McpGroupPermission with `values` when it has none."
  [group-id :- ms/PositiveInt
   values   :- [:map {:closed true}
                [:mcp_enabled :boolean]
                [:tool_access ::mcp.perms/tool-access]]]
  (when-not (t2/exists? :model/McpGroupPermission :group_id group-id)
    (t2/insert! :model/McpGroupPermission (assoc values :group_id group-id))))

(mu/defn delete-hidden-group-permissions!
  "Delete the McpGroupPermission rows of the groups the mode selected by `advanced?` hides."
  [advanced? :- :boolean]
  (t2/delete! :model/McpGroupPermission {:where [:not (visible-groups-expr :group_id advanced?)]}))
