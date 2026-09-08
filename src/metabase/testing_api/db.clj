(ns metabase.testing-api.db
  "Application database queries for the testing API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn set-card-last-used-at! :- :int
  "Set `last_used_at` of the Card with `card-id`."
  [card-id      :- ms/PositiveInt
   last-used-at :- ms/TemporalInstant]
  (t2/update! :model/Card :id card-id {:last_used_at last-used-at}))

(mu/defn set-dashboard-last-viewed-at! :- :int
  "Set `last_viewed_at` of the Dashboard with `dashboard-id`."
  [dashboard-id    :- ms/PositiveInt
   last-viewed-at  :- ms/TemporalInstant]
  (t2/update! :model/Dashboard :id dashboard-id {:last_viewed_at last-viewed-at}))

(mu/defn delete-all-security-advisories! :- :int
  "Delete every SecurityAdvisory."
  []
  (t2/delete! :model/SecurityAdvisory))

(mu/defn insert-security-advisories! :- [:sequential (ms/InstanceOf :model/SecurityAdvisory)]
  "Insert `advisories` and return the inserted SecurityAdvisory instances."
  [advisories :- [:seqable
                  [:map {:closed true}
                   [:advisory_id       {:optional true} :any]
                   [:severity          {:optional true} :any]
                   [:title             {:optional true} :any]
                   [:description       {:optional true} :any]
                   [:advisory_url      {:optional true} :any]
                   [:remediation       {:optional true} :any]
                   [:affected_versions {:optional true} :any]
                   [:matching_query    {:optional true} :any]
                   [:published_at      {:optional true} :any]
                   [:fetched_at        {:optional true} :any]
                   [:match_status      {:optional true} :any]
                   [:last_evaluated_at {:optional true} :any]
                   [:acknowledged_by   {:optional true} :any]
                   [:acknowledged_at   {:optional true} :any]
                   [:last_notified_at  {:optional true} :any]
                   [:updated_at        {:optional true} :any]]]]
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
  [user-id  :- ms/PositiveInt
   group-id :- ms/PositiveInt]
  (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))

(mu/defn delete-ai-usage-logs-for-conversations! :- :int
  "Delete the AiUsageLog rows for `conversation-ids`."
  [conversation-ids :- [:seqable :string]]
  (t2/delete! :model/AiUsageLog {:where [:in :conversation_id conversation-ids]}))

(mu/defn delete-metabot-conversations! :- :int
  "Delete the MetabotConversations with `conversation-ids`."
  [conversation-ids :- [:seqable :string]]
  (t2/delete! :model/MetabotConversation {:where [:in :id conversation-ids]}))

(mu/defn insert-metabot-conversation! :- :int
  "Insert the MetabotConversation `row`."
  [row :- [:map {:closed true}
           [:id                          {:optional true} :any]
           [:created_at                  {:optional true} :any]
           [:user_id                     {:optional true} :any]
           [:title                       {:optional true} :any]
           [:ip_address                  {:optional true} :any]
           [:slack_team_id               {:optional true} :any]
           [:slack_channel_id            {:optional true} :any]
           [:slack_thread_ts             {:optional true} :any]
           [:embedding_hostname          {:optional true} :any]
           [:embedding_path              {:optional true} :any]
           [:user_agent                  {:optional true} :any]
           [:sanitized_user_agent        {:optional true} :any]
           [:forked_from_conversation_id {:optional true} :any]]]
  (t2/insert! :model/MetabotConversation row))

(mu/defn insert-metabot-message! :- :int
  "Insert the MetabotMessage `row`."
  [row :- [:map {:closed true}
           [:id                      {:optional true} :any]
           [:created_at              {:optional true} :any]
           [:profile_id              {:optional true} :any]
           [:role                    {:optional true} :any]
           [:data                    {:optional true} :any]
           [:usage                   {:optional true} :any]
           [:total_tokens            {:optional true} :any]
           [:conversation_id         {:optional true} :any]
           [:slack_msg_id            {:optional true} :any]
           [:channel_id              {:optional true} :any]
           [:deleted_at              {:optional true} :any]
           [:deleted_by_user_id      {:optional true} :any]
           [:user_id                 {:optional true} :any]
           [:ai_proxied              {:optional true} :any]
           [:external_id             {:optional true} :any]
           [:finished                {:optional true} :any]
           [:error                   {:optional true} :any]
           [:data_version            {:optional true} :any]
           [:state                   {:optional true} :any]
           [:forked_from_message_id  {:optional true} :any]]]
  (t2/insert! :model/MetabotMessage row))

(mu/defn insert-ai-usage-log! :- :int
  "Insert the AiUsageLog `row`."
  [row :- [:map {:closed true}
           [:id                     {:optional true} :any]
           [:created_at             {:optional true} :any]
           [:source                 {:optional true} :any]
           [:model                  {:optional true} :any]
           [:prompt_tokens          {:optional true} :any]
           [:completion_tokens      {:optional true} :any]
           [:total_tokens           {:optional true} :any]
           [:user_id                {:optional true} :any]
           [:tenant_id              {:optional true} :any]
           [:conversation_id        {:optional true} :any]
           [:profile_id             {:optional true} :any]
           [:request_id             {:optional true} :any]
           [:ai_proxied             {:optional true} :any]
           [:cache_creation_tokens  {:optional true} :any]
           [:cache_read_tokens      {:optional true} :any]]]
  (t2/insert! :model/AiUsageLog row))

(mu/defn set-user-tenant! :- :int
  "Set the `tenant_id` of the User with `user-id`."
  [user-id   :- ms/PositiveInt
   tenant-id :- ms/PositiveInt]
  (t2/update! :model/User user-id {:tenant_id tenant-id}))

(mu/defn delete-ai-usage-logs-for-user-and-source! :- :int
  "Delete the AiUsageLog rows of the User with `user-id` from `source`, returning the number deleted."
  [user-id :- ms/PositiveInt
   source  :- :string]
  (t2/delete! :model/AiUsageLog :user_id user-id :source source))
