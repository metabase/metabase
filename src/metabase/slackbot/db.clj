(ns metabase.slackbot.db
  "Application database queries for the Slack bot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(def ^:private ActiveSlackConnectIdentity
  "Rows returned by [[active-slack-connect-identity]]."
  (mut/select-keys ::auth-identity.schema/auth-identity [:user_id :metadata]))

(mu/defn active-slack-connect-identity :- [:maybe ActiveSlackConnectIdentity]
  "The user id and metadata of the newest Slack Connect AuthIdentity of an active User for `slack-user-id`, or nil."
  [slack-user-id :- :string]
  (t2/select-one [:model/AuthIdentity :user_id :metadata]
                 :provider "slack-connect"
                 :provider_id slack-user-id
                 {:join     [[:core_user :user] [:= :user.id :auth_identity.user_id]]
                  :where    [:= :user.is_active true]
                  :order-by [[:created_at :desc]]}))

(mu/defn metabot-message-external-id :- [:maybe :string]
  "The external id of the MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id   :- :string
   slack-msg-id :- :string]
  (t2/select-one-fn :external_id :model/MetabotMessage :channel_id channel-id :slack_msg_id slack-msg-id))

(mu/defn assistant-messages-by-slack-ids :- [:sequential ::metabot.schema/metabot-message]
  "The non-deleted assistant MetabotMessages of `conversation-id` posted as one of `slack-msg-ids`."
  [conversation-id :- :string
   slack-msg-ids   :- [:set :string]]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             :slack_msg_id [:in slack-msg-ids]))

(mu/defn deleted-assistant-slack-msg-ids :- [:maybe [:set :string]]
  "The Slack message ids among `slack-msg-ids` of deleted assistant MetabotMessages of `conversation-id`."
  [conversation-id :- :string
   slack-msg-ids   :- [:set :string]]
  (t2/select-fn-set :slack_msg_id
                    :model/MetabotMessage
                    :conversation_id conversation-id
                    :role "assistant"
                    :deleted_at [:not= nil]
                    :slack_msg_id [:in slack-msg-ids]))

(def ^:private AssistantStateMessage
  "Rows returned by [[assistant-state-messages]]."
  (mut/select-keys ::metabot.schema/metabot-message [:id :role :state :error :finished]))

(mu/defn assistant-state-messages :- [:sequential AssistantStateMessage]
  "The id, role, state, error, and finished flag of the non-deleted assistant MetabotMessages of `conversation-id`,
  oldest first."
  [conversation-id :- :string]
  (t2/select [:model/MetabotMessage :id :role :state :error :finished]
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn assistant-response-user-id :- [:maybe ::lib.schema.id/user]
  "The id of the User who triggered the assistant MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id   :- :string
   slack-msg-id :- :string]
  (t2/select-one-fn :user_id
                    :model/MetabotMessage
                    :channel_id   channel-id
                    :slack_msg_id slack-msg-id
                    :role         "assistant"))

(mu/defn card :- [:maybe ::queries.schema/card.row]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))
