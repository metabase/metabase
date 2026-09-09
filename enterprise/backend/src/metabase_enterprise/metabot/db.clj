(ns metabase-enterprise.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase-enterprise.metabot.schema :as ee-metabot.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(mu/defn all-groups :- [:sequential ::permissions.schema/permissions-group]
  "Every PermissionsGroup, in ID order."
  []
  (t2/select :model/PermissionsGroup {:order-by [[:id :asc]]}))

(mu/defn all-stored-permissions :- [:sequential ::ee-metabot.schema/metabot-permissions]
  "Every MetabotPermissions row, ordered by group and permission type."
  []
  (t2/select :model/MetabotPermissions {:order-by [[:group_id :asc] [:perm_type :asc]]}))

(mu/defn visible-permissions-for-user :- [:sequential ::ee-metabot.schema/metabot-permissions]
  "The MetabotPermissions rows of the groups of the User with `user-id` that the mode selected by `advanced?` shows."
  [user-id   :- ::lib.schema.id/user
   advanced? :- :boolean]
  (t2/select :model/MetabotPermissions
             {:where [:and
                      [:in :group_id
                       ^:allow-subquery
                       {:select [:group_id]
                        :from   [(t2/table-name :model/PermissionsGroupMembership)]
                        :where  [:= :user_id user-id]}]
                      (visible-groups-expr advanced?)]}))

(mu/defn permission-exists? :- :boolean
  "Whether the group with `group-id` has a MetabotPermissions row of `perm-type`."
  [group-id  :- ms/PositiveInt
   perm-type :- :keyword]
  (t2/exists? :model/MetabotPermissions :group_id group-id :perm_type perm-type))

(mu/defn update-permission-value! :- :int
  "Set the value of the MetabotPermissions row of `perm-type` for the group with `group-id`."
  [group-id   :- ms/PositiveInt
   perm-type  :- :keyword
   perm-value :- :keyword]
  (t2/update! :model/MetabotPermissions {:group_id group-id :perm_type perm-type} {:perm_value perm-value}))

(mu/defn insert-permission! :- :int
  "Insert the MetabotPermissions `row`."
  [row :- [:map {:closed true}
           [:id         {:optional true} ms/PositiveInt]
           [:group_id   {:optional true} [:maybe ms/PositiveInt]]
           [:perm_type  {:optional true} [:maybe [:or :keyword :string]]]
           [:perm_value {:optional true} [:maybe [:or :keyword :string]]]]]
  (t2/insert! :model/MetabotPermissions row))

(mu/defn delete-hidden-group-permissions! :- :int
  "Delete the MetabotPermissions rows of the groups the mode selected by `advanced?` hides."
  [advanced? :- :boolean]
  (t2/delete! :model/MetabotPermissions {:where [:not (visible-groups-expr advanced?)]}))

(mu/defn group-limits :- [:sequential ::ee-metabot.schema/metabot-group-limit]
  "Every MetabotGroupLimit, in group order."
  []
  (t2/select :model/MetabotGroupLimit {:order-by [[:group_id :asc]]}))

(mu/defn group-limit :- [:maybe ::ee-metabot.schema/metabot-group-limit]
  "The MetabotGroupLimit of the group with `group-id`, or nil."
  [group-id :- ms/PositiveInt]
  (t2/select-one :model/MetabotGroupLimit :group_id group-id))

(mu/defn max-usage-for-user :- [:map {:closed true} [:max_usage [:maybe :int]]]
  "The `:max_usage` row holding the largest group limit of the User with `user-id`, or nil if any of their groups
  is unlimited."
  [user-id :- ::lib.schema.id/user]
  (t2/query-one {:select    [[[:case
                               [:= [[:count :*]] [[:count :gl.max_usage]]]
                               [[:max :gl.max_usage]]]
                              :max_usage]]
                 :from      [[:permissions_group_membership :pgm]]
                 :left-join [[:metabot_group_limit :gl] [:= :pgm.group_id :gl.group_id]]
                 :where     [:= :pgm.user_id user-id]}))

(mu/defn insert-group-limit! :- :int
  "Insert the MetabotGroupLimit `row`."
  [row :- [:map {:closed true}
           [:id        {:optional true} ms/PositiveInt]
           [:group_id  {:optional true} [:maybe ms/PositiveInt]]
           [:max_usage {:optional true} [:maybe :int]]]]
  (t2/insert! :model/MetabotGroupLimit row))

(mu/defn update-group-limit! :- :int
  "Set the maximum usage of the MetabotGroupLimit with `limit-id`."
  [limit-id  :- ms/PositiveInt
   max-usage :- [:maybe :int]]
  (t2/update! :model/MetabotGroupLimit limit-id {:max_usage max-usage}))

(mu/defn delete-group-limit! :- :int
  "Delete the MetabotGroupLimit of the group with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/delete! :model/MetabotGroupLimit :group_id group-id))

(mu/defn instance-limit :- [:maybe ::ee-metabot.schema/metabot-instance-limit]
  "The MetabotInstanceLimit of the Tenant with `tenant-id` (nil for the instance-wide limit), or nil."
  [tenant-id :- [:maybe ms/PositiveInt]]
  (t2/select-one :model/MetabotInstanceLimit :tenant_id tenant-id))

(mu/defn tenant-limits :- [:sequential ::ee-metabot.schema/metabot-instance-limit]
  "The MetabotInstanceLimits of tenants, ordered by tenant."
  []
  (t2/select :model/MetabotInstanceLimit :tenant_id [:not= nil] {:order-by [[:tenant_id :asc]]}))

(mu/defn insert-instance-limit! :- :int
  "Insert the MetabotInstanceLimit `row`."
  [row :- [:map {:closed true}
           [:id        {:optional true} ms/PositiveInt]
           [:tenant_id {:optional true} [:maybe ms/PositiveInt]]
           [:max_usage {:optional true} [:maybe :int]]]]
  (t2/insert! :model/MetabotInstanceLimit row))

(mu/defn update-instance-limit! :- :int
  "Set the maximum usage of the MetabotInstanceLimit with `limit-id`."
  [limit-id  :- ms/PositiveInt
   max-usage :- [:maybe :int]]
  (t2/update! :model/MetabotInstanceLimit limit-id {:max_usage max-usage}))

(mu/defn delete-instance-limit! :- :int
  "Delete the MetabotInstanceLimit of the Tenant with `tenant-id`."
  [tenant-id :- [:maybe ms/PositiveInt]]
  (t2/delete! :model/MetabotInstanceLimit :tenant_id tenant-id))

(mu/defn insert-usage-log! :- :int
  "Insert the AiUsageLog `row`."
  [row :- ::ee-metabot.schema/ai-usage-log.update]
  (t2/insert! :model/AiUsageLog row))

(defn- usage-window-expr
  [period-start user-id tenant-id]
  [:and
   [:>= :created_at period-start]
   (when user-id [:= :user_id user-id])
   (when tenant-id [:= :tenant_id tenant-id])])

(mu/defn usage-token-sum :- [:map {:closed true} [:sum [:maybe :int]]]
  "The `:sum` row of tokens logged since `period-start`, narrowed by the optional `user-id` and `tenant-id`."
  [period-start :- ms/TemporalInstant
   user-id      :- [:maybe ::lib.schema.id/user]
   tenant-id    :- [:maybe ms/PositiveInt]]
  (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                 :from   [:ai_usage_log]
                 :where  (usage-window-expr period-start user-id tenant-id)}))

(mu/defn usage-message-count :- [:map {:closed true} [:cnt :int]]
  "The `:cnt` row of messages logged since `period-start`, narrowed by the optional `user-id` and `tenant-id`."
  [period-start :- ms/TemporalInstant
   user-id      :- [:maybe ::lib.schema.id/user]
   tenant-id    :- [:maybe ms/PositiveInt]]
  (t2/query-one {:select [[[:count :*] :cnt]]
                 :from   [:ai_usage_log]
                 :where  (usage-window-expr period-start user-id tenant-id)}))

(mu/defn delete-usage-logs-created-before! :- :int
  "Delete the AiUsageLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/AiUsageLog {:where [:< :created_at cutoff]}))

(mu/defn transform :- [:maybe ::transforms.schema/transform]
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn transforms :- [:sequential ::transforms.schema/transform]
  "The Transforms with `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select :model/Transform :id [:in transform-ids]))

(mu/defn cards :- [:sequential ::queries.schema/card]
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select :model/Card :id [:in card-ids]))
