(ns metabase.metabot.api.conversations
  "`/api/metabot/conversations` routes.

  Generic conversation endpoints — not the EE analytics endpoints under
  `/api/ee/metabot-analytics/`. These are scoped to the current user (or to a
  specific conversation the user owns) and are intended for things like
  listing a user's chat history and loading a historical conversation to
  continue it."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Schemas ----------------------------------------

(def ^:private ConversationSummary
  [:map
   [:conversation_id ms/UUIDString]
   [:created_at      ms/TemporalInstant]
   [:summary         [:maybe :string]]
   [:user_id         [:maybe ms/PositiveInt]]
   [:message_count   ms/IntGreaterThanOrEqualToZero]
   [:last_message_at [:maybe ms/TemporalInstant]]])

(def ^:private ListConversationsResponse
  [:map
   [:data   [:sequential ConversationSummary]]
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  ms/IntGreaterThanOrEqualToZero]
   [:offset ms/IntGreaterThanOrEqualToZero]])

(def ^:private ConversationDetail
  [:map
   [:conversation_id ms/UUIDString]
   [:created_at      ms/TemporalInstant]
   [:summary         [:maybe :string]]
   [:user_id         [:maybe ms/PositiveInt]]
   [:chat_messages   [:sequential :map]]])

(def ^:private ConversationIdParams
  [:map [:id ms/UUIDString]])

;;; ---------------------------------------- Queries ----------------------------------------

(def ^:private default-limit  50)
(def ^:private default-offset 0)

;;; ---------------------------------------- Endpoints ----------------------------------------

(api.macros/defendpoint :get "/" :- ListConversationsResponse
  "List conversations belonging to the current user, most-recent first."
  []
  (let [user-id (api/check-404 api/*current-user-id*)
        limit   (or (request/limit) default-limit)
        offset  (or (request/offset) default-offset)
        ;; Aggregates are per-row correlated subqueries so pagination stays on the
        ;; outer `metabot_conversation` scan and only runs the subquery 50× per page.
        rows    (t2/select :model/MetabotConversation
                           {:select   [:id :created_at :summary :user_id
                                       [{:select [[[:count :*]]]
                                         :from   [:metabot_message]
                                         :where  [:and
                                                  [:= :conversation_id :metabot_conversation.id]
                                                  [:= :deleted_at nil]]}
                                        :message_count]
                                       [{:select [[[:max :created_at]]]
                                         :from   [:metabot_message]
                                         :where  [:and
                                                  [:= :conversation_id :metabot_conversation.id]
                                                  [:= :deleted_at nil]]}
                                        :last_message_at]]
                            :where    [:= :user_id user-id]
                            :order-by [[:created_at :desc] [:id :asc]]
                            :limit    limit
                            :offset   offset})]
    {:data   (mapv #(-> %
                        (select-keys [:created_at :summary :user_id :message_count :last_message_at])
                        (assoc :conversation_id (:id %)))
                   rows)
     :total  (t2/count :model/MetabotConversation :user_id user-id)
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id" :- ConversationDetail
  "Return a single conversation with its flattened chat messages.

  Accessible to the user who created the conversation or to any superuser."
  [{:keys [id]} :- ConversationIdParams]
  (let [conversation (api/check-404 (t2/select-one :model/MetabotConversation :id id))]
    (api/check-403 (or api/*is-superuser?*
                       (= (:user_id conversation) api/*current-user-id*)))
    (let [messages (t2/select :model/MetabotMessage
                              {:where    [:and
                                          [:= :conversation_id id]
                                          [:= :deleted_at nil]]
                               :order-by [[:created_at :asc]]})]
      {:conversation_id (:id conversation)
       :created_at      (:created_at conversation)
       :summary         (:summary conversation)
       :user_id         (:user_id conversation)
       :chat_messages   (metabot.persistence/messages->chat-messages messages)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/conversations` routes."
  (api.macros/ns-handler *ns* +auth))
