(ns metabase.testing-api.db
  "Application database queries for the testing API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn set-card-last-used-at!
  "Set `last_used_at` of the Card with `card-id`."
  [card-id      :- ::lib.schema.id/card
   last-used-at :- ms/TemporalInstant]
  (t2/update! :model/Card :id [:auto/param card-id] {:last_used_at last-used-at}))

(mu/defn set-dashboard-last-viewed-at!
  "Set `last_viewed_at` of the Dashboard with `dashboard-id`."
  [dashboard-id    :- ::lib.schema.id/dashboard
   last-viewed-at  :- ms/TemporalInstant]
  (t2/update! :model/Dashboard :id [:auto/param dashboard-id] {:last_viewed_at last-viewed-at}))

(mu/defn set-document-last-viewed-at!
  "Set `last_viewed_at` of the Document with `document-id`."
  [document-id    :- ms/PositiveInt
   last-viewed-at :- ms/TemporalInstant]
  (t2/update! :model/Document :id [:auto/param document-id] {:last_viewed_at last-viewed-at}))

(mu/defn set-transform-created-at!
  "Set `created_at` of the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform
   created-at   :- ms/TemporalInstant]
  (t2/update! :model/Transform :id [:auto/param transform-id] {:created_at created-at}))

(mu/defn set-transform-run-times!
  "Set `start_time` and `end_time` of every TransformRun of the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform
   run-time     :- ms/TemporalInstant]
  (t2/update! :model/TransformRun :transform_id [:auto/param transform-id] {:start_time run-time :end_time run-time}))

(mu/defn delete-all-security-advisories!
  "Delete every SecurityAdvisory."
  []
  (t2/delete! :model/SecurityAdvisory))

(mu/defn insert-security-advisories!
  "Insert `advisories` and return the inserted SecurityAdvisory instances."
  [advisories :- [:sequential
                  ::security-center.schema/security-advisory.update]]
  (t2/insert-returning-instances! :model/SecurityAdvisory advisories))

(mu/defn permissions-group-id
  "The id of the PermissionsGroup named `group-name`, or nil."
  [group-name :- :string]
  (t2/select-one-pk :model/PermissionsGroup :name [:auto/param group-name]))

(mu/defn insert-permissions-group!
  "Insert a PermissionsGroup named `group-name` and return its id."
  [group-name :- :string]
  (t2/insert-returning-pk! :model/PermissionsGroup {:name group-name}))

(mu/defn group-membership-exists?
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [user-id  :- ::lib.schema.id/user
   group-id :- ms/PositiveInt]
  (t2/exists? :model/PermissionsGroupMembership :user_id [:auto/param user-id] :group_id [:auto/param group-id]))

(mu/defn delete-ai-usage-logs-for-conversations!
  "Delete the AiUsageLog rows for `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (t2/delete! :model/AiUsageLog {:where [:in :conversation_id conversation-ids]}))

(mu/defn delete-metabot-conversations!
  "Delete the MetabotConversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (t2/delete! :model/MetabotConversation {:where [:in :id conversation-ids]}))

(mu/defn insert-metabot-conversation!
  "Insert the MetabotConversation `row`. A conversation carries its own id: the app DB does not mint one."
  [row :- ::metabot.schema/metabot-conversation]
  (t2/insert! :model/MetabotConversation row))

(mu/defn insert-metabot-message!
  "Insert the MetabotMessage `row`."
  [row :- ::metabot.schema/metabot-message.update]
  (t2/insert! :model/MetabotMessage row))

(mu/defn insert-ai-usage-log!
  "Insert the AiUsageLog `row`."
  [row :- ::metabot.schema/ai-usage-log.update]
  (t2/insert! :model/AiUsageLog row))

(mu/defn set-user-tenant!
  "Set the `tenant_id` of the User with `user-id`."
  [user-id   :- ::lib.schema.id/user
   tenant-id :- ms/PositiveInt]
  (t2/update! :model/User :id [:auto/param user-id] {:tenant_id tenant-id}))

(mu/defn delete-ai-usage-logs-for-user-and-conversation!
  "Delete the AiUsageLog rows of the User with `user-id` in the conversation `conversation-id`, returning the number
  deleted."
  [user-id         :- ::lib.schema.id/user
   conversation-id :- :string]
  (t2/delete! :model/AiUsageLog :user_id [:auto/param user-id] :conversation_id [:auto/param conversation-id]))
