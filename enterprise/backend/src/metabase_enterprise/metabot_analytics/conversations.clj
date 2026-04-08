(ns metabase-enterprise.metabot-analytics.conversations
  "Data-access layer for the metabot analytics API. Builds and runs the
  HoneySQL queries that back the `/api/ee/metabot-analytics/conversations`
  endpoints, and assembles the response shapes the handlers return.

  Handlers in `metabase-enterprise.metabot-analytics.api` should stay thin —
  auth, param coercion, and delegation to the functions here."
  (:require
   [metabase-enterprise.metabot-analytics.queries :as analytics.queries]
   [metabase.api.common :as api]
   [metabase.metabot.persistence :as metabot-persistence]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private list-query
  "HoneySQL query that selects one row per conversation with aggregate
   message stats."
  {:select    [[:c.id :conversation_id]
               [:c.created_at :created_at]
               [:c.user_id :user_id]
               [:c.summary :summary]
               [[:count :m.id] :message_count]
               [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
               [[:max :m.created_at] :last_message_at]]
   :from      [[:metabot_conversation :c]]
   :left-join [[:metabot_message :m] [:and
                                      [:= :m.conversation_id :c.id]
                                      [:= :m.deleted_at nil]]]
   :group-by  [:c.id :c.created_at :c.user_id :c.summary]})

(defn list-conversations
  "Return a paginated `{:data :total :limit :offset}` map of conversation
   summaries, ordered by creation time descending."
  [{:keys [limit offset]}]
  (let [total   (or (:count (t2/query-one {:select [[[:count :*] :count]]
                                           :from   [:metabot_conversation]}))
                    0)
        ;; `:c.id :asc` is a stable tiebreaker so pagination stays
        ;; deterministic when the primary sort key has duplicates.
        results (t2/query (assoc list-query
                                 :order-by [[:c.created_at :desc] [:c.id :asc]]
                                 :limit limit
                                 :offset offset))]
    {:data   (t2/hydrate (mapv #(t2/instance :model/MetabotConversation %) results) :user)
     :total  total
     :limit  limit
     :offset offset}))

(defn fetch-conversation-detail
  "Fetch a conversation with its user info, the frontend-ready flattened
   chat messages, and the queries the bot generated during the conversation.
   404s via `api/check-404` if no conversation matches `conversation-id`."
  [conversation-id]
  (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
    (api/check-404 conversation)
    (let [messages (t2/select :model/MetabotMessage
                              :conversation_id conversation-id
                              {:where    [:= :deleted_at nil]
                               :order-by [[:created_at :asc]]})
          hydrated (t2/hydrate conversation :user)]
      {:conversation_id (:id conversation)
       :created_at      (:created_at conversation)
       :summary         (:summary conversation)
       :user            (:user hydrated)
       :chat_messages   (metabot-persistence/messages->chat-messages messages)
       :queries         (analytics.queries/messages->generated-queries messages)})))
