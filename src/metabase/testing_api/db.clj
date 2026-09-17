(ns metabase.testing-api.db
  "Application database queries for the testing API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.permissions.db :as permissions.db]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.users.db :as users.db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn set-card-last-used-at!
  "Set `last_used_at` of the Card with `card-id`."
  [card-id      :- ::lib.schema.id/card
   last-used-at :- ms/TemporalInstant]
  (t2/update! :model/Card :id card-id {:last_used_at last-used-at}))

(mu/defn set-dashboard-last-viewed-at!
  "Set `last_viewed_at` of the Dashboard with `dashboard-id`."
  [dashboard-id    :- ::lib.schema.id/dashboard
   last-viewed-at  :- ms/TemporalInstant]
  (t2/update! :model/Dashboard :id dashboard-id {:last_viewed_at last-viewed-at}))

(mu/defn delete-all-security-advisories!
  "Delete every SecurityAdvisory."
  []
  (t2/delete! :model/SecurityAdvisory))

(mu/defn insert-security-advisories!
  "Insert `advisories` and return the inserted SecurityAdvisory instances."
  [advisories :- [:sequential
                  ::security-center.schema/security-advisory.create]]
  (t2/insert-returning-instances! :model/SecurityAdvisory advisories))

(mu/defn permissions-group-id
  "The id of the PermissionsGroup named `group-name`, or nil."
  [group-name :- :string]
  (permissions.db/select-one-permissions-group-pk {:name group-name}))

(mu/defn insert-permissions-group!
  "Insert a PermissionsGroup named `group-name` and return its id."
  [group-name :- :string]
  (:id (permissions.db/insert-permissions-group! {:name group-name})))

(mu/defn group-membership-exists?
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [user-id  :- ::lib.schema.id/user
   group-id :- ms/PositiveInt]
  (permissions.db/permissions-group-membership-exists? {:user_id user-id :group_id group-id}))

(mu/defn delete-ai-usage-logs-for-conversations!
  "Delete the AiUsageLog rows for `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (metabot.db/delete-ai-usage-logs! {:conversation_id (set conversation-ids)}))

(mu/defn delete-metabot-conversations!
  "Delete the MetabotConversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (metabot.db/delete-metabot-conversations! {:id (set conversation-ids)}))

(mu/defn insert-metabot-conversation!
  "Insert the MetabotConversation `row`, which must carry the client-generated `:id`."
  [row :- ::metabot.schema/metabot-conversation]
  (metabot.db/insert-metabot-conversation! (:id row) (dissoc row :id)))

(mu/defn insert-metabot-message!
  "Insert the MetabotMessage `row`."
  [row :- ::metabot.schema/metabot-message.create]
  (metabot.db/insert-metabot-messages! row))

(mu/defn insert-ai-usage-log!
  "Insert the AiUsageLog `row`."
  [row :- ::metabot.schema/ai-usage-log.create]
  (metabot.db/insert-ai-usage-log! row))

(mu/defn set-user-tenant!
  "Set the `tenant_id` of the User with `user-id`."
  [user-id   :- ::lib.schema.id/user
   tenant-id :- ms/PositiveInt]
  (users.db/update-users! {:id user-id} {:tenant_id tenant-id}))

(mu/defn delete-ai-usage-logs-for-user-and-source!
  "Delete the AiUsageLog rows of the User with `user-id` from `source`, returning the number deleted."
  [user-id :- ::lib.schema.id/user
   source  :- :string]
  (metabot.db/delete-ai-usage-logs! {:user_id user-id :source source}))
