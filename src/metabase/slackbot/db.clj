(ns metabase.slackbot.db
  "Application database queries for the Slack bot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-slack-connect-identity :- [:maybe [:map {:closed true} [:user_id ms/PositiveInt] [:metadata :any]]]
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

(mu/defn assistant-messages-by-slack-ids :- [:sequential (ms/InstanceOf :model/MetabotMessage)]
  "The non-deleted assistant MetabotMessages of `conversation-id` posted as one of `slack-msg-ids`."
  [conversation-id :- :string
   slack-msg-ids   :- [:seqable :string]]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             :slack_msg_id [:in slack-msg-ids]))

(mu/defn deleted-assistant-slack-msg-ids :- [:maybe [:set :string]]
  "The Slack message ids among `slack-msg-ids` of deleted assistant MetabotMessages of `conversation-id`."
  [conversation-id :- :string
   slack-msg-ids   :- [:seqable :string]]
  (t2/select-fn-set :slack_msg_id
                    :model/MetabotMessage
                    :conversation_id conversation-id
                    :role "assistant"
                    :deleted_at [:not= nil]
                    :slack_msg_id [:in slack-msg-ids]))

(mu/defn assistant-state-messages :- [:sequential (ms/InstanceOf :model/MetabotMessage)]
  "The id, role, state, error, and finished flag of the non-deleted assistant MetabotMessages of `conversation-id`,
  oldest first."
  [conversation-id :- :string]
  (t2/select [:model/MetabotMessage :id :role :state :error :finished]
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn assistant-response-user-id :- [:maybe ms/PositiveInt]
  "The id of the User who triggered the assistant MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id   :- :string
   slack-msg-id :- :string]
  (t2/select-one-fn :user_id
                    :model/MetabotMessage
                    :channel_id   channel-id
                    :slack_msg_id slack-msg-id
                    :role         "assistant"))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))
