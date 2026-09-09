(ns metabase.slackbot.db
  "Application database queries for the Slack bot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn active-slack-connect-identity
  "The user id and metadata of the newest Slack Connect AuthIdentity of an active User for `slack-user-id`, or nil."
  [slack-user-id]
  (t2/select-one [:model/AuthIdentity :user_id :metadata]
                 :provider "slack-connect"
                 :provider_id slack-user-id
                 {:join     [[:core_user :user] [:= :user.id :auth_identity.user_id]]
                  :where    [:= :user.is_active true]
                  :order-by [[:created_at :desc]]}))

(defn metabot-message-external-id
  "The external id of the MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id slack-msg-id]
  (t2/select-one-fn :external_id :model/MetabotMessage :channel_id channel-id :slack_msg_id slack-msg-id))

(defn assistant-messages-by-slack-ids
  "The non-deleted assistant MetabotMessages of `conversation-id` posted as one of `slack-msg-ids`."
  [conversation-id slack-msg-ids]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             :slack_msg_id [:in slack-msg-ids]))

(defn deleted-assistant-slack-msg-ids
  "The Slack message ids among `slack-msg-ids` of deleted assistant MetabotMessages of `conversation-id`."
  [conversation-id slack-msg-ids]
  (t2/select-fn-set :slack_msg_id
                    :model/MetabotMessage
                    :conversation_id conversation-id
                    :role "assistant"
                    :deleted_at [:not= nil]
                    :slack_msg_id [:in slack-msg-ids]))

(defn assistant-state-messages
  "The id, role, state, error, and finished flag of the non-deleted assistant MetabotMessages of `conversation-id`,
  oldest first."
  [conversation-id]
  (t2/select [:model/MetabotMessage :id :role :state :error :finished]
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(defn assistant-response-user-id
  "The id of the User who triggered the assistant MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id slack-msg-id]
  (t2/select-one-fn :user_id
                    :model/MetabotMessage
                    :channel_id   channel-id
                    :slack_msg_id slack-msg-id
                    :role         "assistant"))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))
