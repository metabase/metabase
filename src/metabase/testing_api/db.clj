(ns metabase.testing-api.db
  "Application database queries for the testing API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase-enterprise.security-center.schema :as security-center.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn set-card-last-used-at! :- :int
  "Set `last_used_at` of the Card with `card-id`."
  [card-id      :- ::lib.schema.id/card
   last-used-at :- ms/TemporalInstant]
  (t2/update! :model/Card :id card-id {:last_used_at last-used-at}))

(mu/defn set-dashboard-last-viewed-at! :- :int
  "Set `last_viewed_at` of the Dashboard with `dashboard-id`."
  [dashboard-id    :- ::lib.schema.id/dashboard
   last-viewed-at  :- ms/TemporalInstant]
  (t2/update! :model/Dashboard :id dashboard-id {:last_viewed_at last-viewed-at}))

(mu/defn delete-all-security-advisories! :- :int
  "Delete every SecurityAdvisory."
  []
  (t2/delete! :model/SecurityAdvisory))

(mu/defn insert-security-advisories! :- [:sequential ::security-center.schema/security-advisory]
  "Insert `advisories` and return the inserted SecurityAdvisory instances."
  [advisories :- [:sequential
                  ::security-center.schema/security-advisory.update]]
  (t2/insert-returning-instances! :model/SecurityAdvisory advisories))

(mu/defn permissions-group-id :- [:maybe ms/PositiveInt]
  "The id of the PermissionsGroup named `group-name`, or nil."
  [group-name :- :string]
  (t2/select-one-pk :model/PermissionsGroup :name group-name))

(mu/defn insert-permissions-group! :- ms/PositiveInt
  "Insert a PermissionsGroup named `group-name` and return its id."
  [group-name :- :string]
  (t2/insert-returning-pk! :model/PermissionsGroup {:name group-name}))

(mu/defn group-membership-exists? :- :boolean
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [user-id  :- ::lib.schema.id/user
   group-id :- ms/PositiveInt]
  (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))

(mu/defn delete-ai-usage-logs-for-conversations! :- :int
  "Delete the AiUsageLog rows for `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (t2/delete! :model/AiUsageLog {:where [:in :conversation_id conversation-ids]}))

(mu/defn delete-metabot-conversations! :- :int
  "Delete the MetabotConversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (t2/delete! :model/MetabotConversation {:where [:in :id conversation-ids]}))

(mu/defn insert-metabot-conversation! :- :int
  "Insert the MetabotConversation `row`."
  [row :- ::metabot.schema/metabot-conversation.update]
  (t2/insert! :model/MetabotConversation row))

(mu/defn insert-metabot-message! :- :int
  "Insert the MetabotMessage `row`."
  [row :- ::metabot.schema/metabot-message.update]
  (t2/insert! :model/MetabotMessage row))

(mu/defn insert-ai-usage-log! :- :int
  "Insert the AiUsageLog `row`."
  [row :- ::metabot.schema/ai-usage-log.update]
  (t2/insert! :model/AiUsageLog row))

(mu/defn set-user-tenant! :- :int
  "Set the `tenant_id` of the User with `user-id`."
  [user-id   :- ::lib.schema.id/user
   tenant-id :- ms/PositiveInt]
  (t2/update! :model/User user-id {:tenant_id tenant-id}))

(mu/defn delete-ai-usage-logs-for-user-and-source! :- :int
  "Delete the AiUsageLog rows of the User with `user-id` from `source`, returning the number deleted."
  [user-id :- ::lib.schema.id/user
   source  :- :string]
  (t2/delete! :model/AiUsageLog :user_id user-id :source source))
