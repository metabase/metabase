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

(def ^:private first-assistant-model-subquery
  "Correlated subquery selecting the `profile_id` of the earliest non-deleted assistant message
   for the outer `metabot_conversation` row aliased as `c`."
  {:select   [:mm.profile_id]
   :from     [[:metabot_message :mm]]
   :where    [:and
              [:= :mm.conversation_id :c.id]
              [:= :mm.role "assistant"]
              [:= :mm.deleted_at nil]]
   :order-by [[:mm.created_at :asc]]
   :limit    1})

(defn- list-query
  "Build the HoneySQL query that selects one row per conversation with
   aggregate message stats. `where-clause` is an optional HoneySQL fragment
   applied to the outer `metabot_conversation c` table."
  [where-clause]
  (cond-> {:select    [[:c.id :conversation_id]
                       [:c.created_at :created_at]
                       [:c.user_id :user_id]
                       [:c.summary :summary]
                       [[:count :m.id] :message_count]
                       [[:count [:case [:= :m.role "user"] 1]] :user_message_count]
                       [[:count [:case [:= :m.role "assistant"] 1]] :assistant_message_count]
                       [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
                       [[:max :m.created_at] :last_message_at]
                       [first-assistant-model-subquery :model]]
           :from      [[:metabot_conversation :c]]
           :left-join [[:metabot_message :m] [:and
                                              [:= :m.conversation_id :c.id]
                                              [:= :m.deleted_at nil]]]
           :group-by  [:c.id :c.created_at :c.user_id :c.summary]}
    where-clause (assoc :where where-clause)))

(defn- count-query
  "Build a count query over `metabot_conversation` matching the same
   `where-clause` used by `list-query`, so the paginated listing's `:total`
   stays consistent with `:data`."
  [where-clause]
  (cond-> {:select [[[:count :*] :count]]
           :from   [[:metabot_conversation :c]]}
    where-clause (assoc :where where-clause)))

(defn list-conversations
  "Return a paginated `{:data :total :limit :offset}` map of conversation
   summaries. `sort-by` is one of `:created_at`, `:message_count`, or
   `:total_tokens`; `sort-dir` is `:asc` or `:desc`."
  [{:keys [user-id sort-by sort-dir limit offset]}]
  (let [where-clause (when user-id [:= :c.user_id user-id])
        total        (or (:count (t2/query-one (count-query where-clause))) 0)
        ;; `:c.id :asc` is a stable tiebreaker so pagination stays
        ;; deterministic when the primary sort key has duplicates.
        results      (t2/query (-> (list-query where-clause)
                                   (assoc :order-by [[sort-by sort-dir] [:c.id :asc]])
                                   (assoc :limit limit)
                                   (assoc :offset offset)))]
    {:data   (t2/hydrate (mapv #(t2/instance :model/MetabotConversation %) results) :user)
     :total  total
     :limit  limit
     :offset offset}))

(defn fetch-conversation-detail
  "Fetch a conversation with all its messages, user info, frontend-ready chat
   messages, and the queries the bot generated during the conversation.
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
       :user_id         (:user_id conversation)
       :summary         (:summary conversation)
       :state           (:state conversation)
       :user            (:user hydrated)
       :messages        (mapv (fn [m]
                                {:message_id   (:id m)
                                 :created_at   (:created_at m)
                                 :role         (name (:role m))
                                 :model        (:profile_id m)
                                 :total_tokens (:total_tokens m)
                                 :data         (:data m)})
                              messages)
       :chat_messages   (metabot-persistence/messages->chat-messages messages)
       :queries         (analytics.queries/messages->generated-queries messages)})))
