(ns metabase.metabot.api.conversations
  "`/api/metabot/conversations` routes.

  Generic conversation endpoints — not the EE analytics endpoints under
  `/api/ee/metabot-analytics/`. These are scoped to conversations the current
  user *participates in* (has at least one message authored by them), which
  covers both solo web-UI chats and shared Slack threads where multiple
  Metabase users @-mention Metabot in the same conversation."
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
   ;; Wire compatibility: keep the field name `user_id`, but it now means the
   ;; conversation originator (first writer), not "the only allowed reader".
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

(defn- participation-clause
  "Match conversations visible in history for `user-id`.

  New rows participate via `metabot_message.user_id`; legacy rows created before
  message authors were stamped fall back to the conversation originator."
  [user-id]
  (let [participation-exists [:exists {:select [[[:inline 1]]]
                                       :from   [:metabot_message]
                                       :where  [:and
                                                [:= :conversation_id :metabot_conversation.id]
                                                [:= :user_id user-id]]}]]
    [:or
     [:= :user_id user-id]
     participation-exists]))

;;; ---------------------------------------- Endpoints ----------------------------------------

(api.macros/defendpoint :get "/" :- ListConversationsResponse
  "List conversations visible in the current user's history, most-recent first.

  New conversations are participation-based (the user authored at least one
  message); legacy conversations created before message authors were stamped
  fall back to the conversation originator."
  []
  (let [user-id (api/check-404 api/*current-user-id*)
        limit   (or (request/limit) default-limit)
        offset  (or (request/offset) default-offset)
        visible-to-user (participation-clause user-id)
        ;; Aggregates are per-row correlated subqueries so pagination stays on the
        ;; outer `metabot_conversation` scan and only runs the subquery 50× per page.
        ;; Participation is defined by message authorship, not deletion state, so
        ;; soft-deleted messages still count. Legacy rows fall back to
        ;; `metabot_conversation.user_id`.
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
                            :where    visible-to-user
                            :order-by [[:created_at :desc] [:id :asc]]
                            :limit    limit
                            :offset   offset})]
    {:data   (mapv #(-> %
                        (select-keys [:created_at :summary :user_id :message_count :last_message_at])
                        (assoc :conversation_id (:id %)))
                   rows)
     :total  (t2/count :model/MetabotConversation {:where visible-to-user})
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id" :- ConversationDetail
  "Return a single conversation with its flattened chat messages.

  Accessible to any participant in the conversation or to any superuser."
  [{:keys [id]} :- ConversationIdParams]
  (api/read-check :model/MetabotConversation id)
  (metabot.persistence/conversation-detail id))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/conversations` routes."
  (api.macros/ns-handler *ns* +auth))
