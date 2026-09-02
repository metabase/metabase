(ns metabase.testing-api.queries
  "Application database queries for the testing API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn set-card-last-used-at!
  "Set `last_used_at` of the Card with `card-id`."
  [card-id last-used-at]
  (t2/update! :model/Card :id card-id {:last_used_at last-used-at}))

(defn set-dashboard-last-viewed-at!
  "Set `last_viewed_at` of the Dashboard with `dashboard-id`."
  [dashboard-id last-viewed-at]
  (t2/update! :model/Dashboard :id dashboard-id {:last_viewed_at last-viewed-at}))

(defn delete-all-security-advisories!
  "Delete every SecurityAdvisory."
  []
  (t2/delete! :model/SecurityAdvisory))

(defn insert-security-advisories!
  "Insert `advisories` and return the inserted SecurityAdvisory instances."
  [advisories]
  (t2/insert-returning-instances! :model/SecurityAdvisory advisories))

(defn permissions-group-id
  "The id of the PermissionsGroup named `group-name`, or nil."
  [group-name]
  (t2/select-one-pk :model/PermissionsGroup :name group-name))

(defn insert-permissions-group!
  "Insert a PermissionsGroup named `group-name` and return its id."
  [group-name]
  (t2/insert-returning-pk! :model/PermissionsGroup {:name group-name}))

(defn group-membership-exists?
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [user-id group-id]
  (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))

(defn delete-ai-usage-logs-for-conversations!
  "Delete the AiUsageLog rows for `conversation-ids`."
  [conversation-ids]
  (t2/delete! :model/AiUsageLog {:where [:in :conversation_id conversation-ids]}))

(defn delete-metabot-conversations!
  "Delete the MetabotConversations with `conversation-ids`."
  [conversation-ids]
  (t2/delete! :model/MetabotConversation {:where [:in :id conversation-ids]}))

(defn insert-metabot-conversation!
  "Insert the MetabotConversation `row`."
  [row]
  (t2/insert! :model/MetabotConversation row))

(defn insert-metabot-message!
  "Insert the MetabotMessage `row`."
  [row]
  (t2/insert! :model/MetabotMessage row))

(defn insert-ai-usage-log!
  "Insert the AiUsageLog `row`."
  [row]
  (t2/insert! :model/AiUsageLog row))

(defn set-user-tenant!
  "Set the `tenant_id` of the User with `user-id`."
  [user-id tenant-id]
  (t2/update! :model/User user-id {:tenant_id tenant-id}))

(defn delete-ai-usage-logs-for-user-and-source!
  "Delete the AiUsageLog rows of the User with `user-id` from `source`, returning the number deleted."
  [user-id source]
  (t2/delete! :model/AiUsageLog :user_id user-id :source source))
