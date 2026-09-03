(ns metabase-enterprise.metabot-analytics.db
  "Application database queries for the metabot-analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn conversation
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id]
  (t2/select-one :model/MetabotConversation :id conversation-id))

(defn conversations-where
  "The MetabotConversation rows of the Honey SQL `query`."
  [query]
  (t2/select :model/MetabotConversation query))

(defn conversation-count-row
  "The `:count` row of the Honey SQL `query`."
  [query]
  (t2/query-one query))

(defn messages-for-conversation
  "The MetabotMessages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id]
  (t2/select :model/MetabotMessage :conversation_id conversation-id {:order-by [[:created_at :asc] [:id :asc]]}))

(defn message-data-for-conversations
  "The conversation, data, and data version of the MetabotMessages of the MetabotConversations with
  `conversation-ids`."
  [conversation-ids]
  (t2/select [:model/MetabotMessage :conversation_id :data :data_version] :conversation_id [:in conversation-ids]))

(defn feedback-for-conversation
  "The MetabotFeedback rows on the messages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id]
  (t2/select :model/MetabotFeedback
             {:select   [:metabot_feedback.id
                         :metabot_feedback.message_id
                         :metabot_feedback.user_id
                         [:mm.external_id :external_id]
                         :metabot_feedback.positive
                         :metabot_feedback.issue_type
                         :metabot_feedback.freeform_feedback
                         :metabot_feedback.created_at
                         :metabot_feedback.updated_at]
              :from     [:metabot_feedback]
              :join     [[:metabot_message :mm] [:= :mm.id :metabot_feedback.message_id]]
              :where    [:= :mm.conversation_id conversation-id]
              :order-by [[:metabot_feedback.created_at :asc]
                         [:metabot_feedback.message_id :asc]
                         [:metabot_feedback.user_id :asc]]}))
