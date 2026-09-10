(ns metabase-enterprise.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- default-group-ids
  "The IDs of the groups visible only in simple mode: All Users and, on tenant instances, All tenant users."
  []
  [(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))])

(defn- visible-groups-expr
  "Matches the groups the admin UI shows in the mode selected by `advanced?`: Administrators, All Users, and All
  tenant users in simple mode, every other group in group-level mode."
  [advanced?]
  (if advanced?
    [:not-in :group_id (default-group-ids)]
    [:in :group_id (conj (default-group-ids) (u/the-id (perms/admin-group)))]))

(defn all-groups
  "Every PermissionsGroup, in ID order."
  []
  (t2/select :model/PermissionsGroup {:order-by [[:id :asc]]}))

(defn all-stored-permissions
  "Every MetabotPermissions row, ordered by group and permission type."
  []
  (t2/select :model/MetabotPermissions {:order-by [[:group_id :asc] [:perm_type :asc]]}))

(defn visible-permissions-for-user
  "The MetabotPermissions rows of the groups of the User with `user-id` that the mode selected by `advanced?` shows."
  [user-id advanced?]
  (t2/select :model/MetabotPermissions
             {:where [:and
                      [:in :group_id
                       ^:allow-subquery
                       {:select [:group_id]
                        :from   [(t2/table-name :model/PermissionsGroupMembership)]
                        :where  [:= :user_id user-id]}]
                      (visible-groups-expr advanced?)]}))

(defn permission-exists?
  "Whether the group with `group-id` has a MetabotPermissions row of `perm-type`."
  [group-id perm-type]
  (t2/exists? :model/MetabotPermissions :group_id group-id :perm_type perm-type))

(defn update-permission-value!
  "Set the value of the MetabotPermissions row of `perm-type` for the group with `group-id`."
  [group-id perm-type perm-value]
  (t2/update! :model/MetabotPermissions {:group_id group-id :perm_type perm-type} {:perm_value perm-value}))

(defn insert-permission!
  "Insert the MetabotPermissions `row`."
  [row]
  (t2/insert! :model/MetabotPermissions row))

(defn delete-hidden-group-permissions!
  "Delete the MetabotPermissions rows of the groups the mode selected by `advanced?` hides."
  [advanced?]
  (t2/delete! :model/MetabotPermissions {:where [:not (visible-groups-expr advanced?)]}))

(defn group-limits
  "Every MetabotGroupLimit, in group order."
  []
  (t2/select :model/MetabotGroupLimit {:order-by [[:group_id :asc]]}))

(defn group-limit
  "The MetabotGroupLimit of the group with `group-id`, or nil."
  [group-id]
  (t2/select-one :model/MetabotGroupLimit :group_id group-id))

(defn max-usage-for-user
  "The `:max_usage` row holding the largest group limit of the User with `user-id`, or nil if any of their groups
  is unlimited."
  [user-id]
  (t2/query-one {:select    [[[:case
                               [:= [[:count :*]] [[:count :gl.max_usage]]]
                               [[:max :gl.max_usage]]]
                              :max_usage]]
                 :from      [[:permissions_group_membership :pgm]]
                 :left-join [[:metabot_group_limit :gl] [:= :pgm.group_id :gl.group_id]]
                 :where     [:= :pgm.user_id user-id]}))

(defn insert-group-limit!
  "Insert the MetabotGroupLimit `row`."
  [row]
  (t2/insert! :model/MetabotGroupLimit row))

(defn update-group-limit!
  "Set the maximum usage of the MetabotGroupLimit with `limit-id`."
  [limit-id max-usage]
  (t2/update! :model/MetabotGroupLimit limit-id {:max_usage max-usage}))

(defn delete-group-limit!
  "Delete the MetabotGroupLimit of the group with `group-id`."
  [group-id]
  (t2/delete! :model/MetabotGroupLimit :group_id group-id))

(defn instance-limit
  "The MetabotInstanceLimit of the Tenant with `tenant-id` (nil for the instance-wide limit), or nil."
  [tenant-id]
  (t2/select-one :model/MetabotInstanceLimit :tenant_id tenant-id))

(defn tenant-limits
  "The MetabotInstanceLimits of tenants, ordered by tenant."
  []
  (t2/select :model/MetabotInstanceLimit :tenant_id [:not= nil] {:order-by [[:tenant_id :asc]]}))

(defn insert-instance-limit!
  "Insert the MetabotInstanceLimit `row`."
  [row]
  (t2/insert! :model/MetabotInstanceLimit row))

(defn update-instance-limit!
  "Set the maximum usage of the MetabotInstanceLimit with `limit-id`."
  [limit-id max-usage]
  (t2/update! :model/MetabotInstanceLimit limit-id {:max_usage max-usage}))

(defn delete-instance-limit!
  "Delete the MetabotInstanceLimit of the Tenant with `tenant-id`."
  [tenant-id]
  (t2/delete! :model/MetabotInstanceLimit :tenant_id tenant-id))

(defn insert-usage-log!
  "Insert the AiUsageLog `row`."
  [row]
  (t2/insert! :model/AiUsageLog row))

(defn- usage-window-expr
  [period-start user-id tenant-id]
  [:and
   [:>= :created_at period-start]
   (when user-id [:= :user_id user-id])
   (when tenant-id [:= :tenant_id tenant-id])])

(defn usage-token-sum
  "The `:sum` row of tokens logged since `period-start`, narrowed by the optional `user-id` and `tenant-id`."
  [period-start user-id tenant-id]
  (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                 :from   [:ai_usage_log]
                 :where  (usage-window-expr period-start user-id tenant-id)}))

(defn usage-message-count
  "The `:cnt` row of messages logged since `period-start`, narrowed by the optional `user-id` and `tenant-id`."
  [period-start user-id tenant-id]
  (t2/query-one {:select [[[:count :*] :cnt]]
                 :from   [:ai_usage_log]
                 :where  (usage-window-expr period-start user-id tenant-id)}))

(defn delete-usage-logs-created-before!
  "Delete the AiUsageLogs created before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/AiUsageLog {:where [:< :created_at cutoff]}))

(defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/Transform :id transform-id))

(defn transforms
  "The Transforms with `transform-ids`."
  [transform-ids]
  (t2/select :model/Transform :id [:in transform-ids]))

(defn cards
  "The Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids]))
