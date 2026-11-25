(ns metabase.slackbot.db
  "Application database queries for the Slack bot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn active-slack-connect-identity
  "The user id and metadata of the newest Slack Connect AuthIdentity of an active User for `slack-user-id`, or nil."
  [slack-user-id :- :string]
  (when-not (string? slack-user-id)
    (throw (ex-info "slack-user-id must be a string" {:slack-user-id slack-user-id})))
  (t2/select-one [:model/AuthIdentity :user_id :metadata]
                 :provider "slack-connect"
                 :provider_id slack-user-id
                 {:join     [[(t2/table-name :model/User) :user] [:= :user.id (u/qualified-key (t2/table-name :model/AuthIdentity) :user_id)]]
                  :where    [:= :user.is_active true]
                  :order-by [[:created_at :desc]]}))

(mu/defn metabot-message-external-id
  "The external id of the MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id   :- :string
   slack-msg-id :- :string]
  (when-not (string? channel-id)
    (throw (ex-info "channel-id must be a string" {:channel-id channel-id})))
  (when-not (string? slack-msg-id)
    (throw (ex-info "slack-msg-id must be a string" {:slack-msg-id slack-msg-id})))
  (t2/select-one-fn :external_id :model/MetabotMessage :channel_id channel-id :slack_msg_id slack-msg-id))

(mu/defn assistant-messages-by-slack-ids
  "The non-deleted assistant MetabotMessages of `conversation-id` posted as one of `slack-msg-ids`."
  [conversation-id :- :string
   slack-msg-ids   :- [:set :string]]
  (when-not (string? conversation-id)
    (throw (ex-info "conversation-id must be a string" {:conversation-id conversation-id})))
  (when-not (every? string? slack-msg-ids)
    (throw (ex-info "slack-msg-ids must be strings" {:slack-msg-ids slack-msg-ids})))
  (mdb/select-batched #(t2/select :model/MetabotMessage
                                  :conversation_id conversation-id
                                  :role "assistant"
                                  :deleted_at nil
                                  :slack_msg_id [:in %])
                      slack-msg-ids))

(mu/defn deleted-assistant-slack-msg-ids
  "The Slack message ids among `slack-msg-ids` of deleted assistant MetabotMessages of `conversation-id`."
  [conversation-id :- :string
   slack-msg-ids   :- [:set :string]]
  (when-not (string? conversation-id)
    (throw (ex-info "conversation-id must be a string" {:conversation-id conversation-id})))
  (when-not (every? string? slack-msg-ids)
    (throw (ex-info "slack-msg-ids must be strings" {:slack-msg-ids slack-msg-ids})))
  (mdb/select-batched-set #(t2/select-fn-set :slack_msg_id
                                             :model/MetabotMessage
                                             :conversation_id conversation-id
                                             :role "assistant"
                                             :deleted_at [:not= nil]
                                             :slack_msg_id [:in %])
                          slack-msg-ids))

(mu/defn assistant-state-messages
  "The id, role, state, error, and finished flag of the non-deleted assistant MetabotMessages of `conversation-id`,
  oldest first."
  [conversation-id :- :string]
  (when-not (string? conversation-id)
    (throw (ex-info "conversation-id must be a string" {:conversation-id conversation-id})))
  (t2/select [:model/MetabotMessage :id :role :state :error :finished]
             :conversation_id conversation-id
             :role "assistant"
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn assistant-response-user-id
  "The id of the User who triggered the assistant MetabotMessage posted to `channel-id` as `slack-msg-id`, or nil."
  [channel-id   :- :string
   slack-msg-id :- :string]
  (when-not (string? channel-id)
    (throw (ex-info "channel-id must be a string" {:channel-id channel-id})))
  (when-not (string? slack-msg-id)
    (throw (ex-info "slack-msg-id must be a string" {:slack-msg-id slack-msg-id})))
  (t2/select-one-fn :user_id
                    :model/MetabotMessage
                    :channel_id   channel-id
                    :slack_msg_id slack-msg-id
                    :role         "assistant"))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))
