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
   [:conversation_id    ms/UUIDString]
   [:created_at         ms/TemporalInstant]
   [:summary            [:maybe :string]]
   ;; `originator_user_id` is the user who sent the first message; set once on
   ;; insert, never updated. Distinct from the set of participants — any user
   ;; who has sent a message in the conversation can read it.
   [:originator_user_id [:maybe ms/PositiveInt]]
   [:message_count      ms/IntGreaterThanOrEqualToZero]
   [:last_message_at    [:maybe ms/TemporalInstant]]])

(def ^:private ListConversationsResponse
  [:map
   [:data   [:sequential ConversationSummary]]
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  ms/IntGreaterThanOrEqualToZero]
   [:offset ms/IntGreaterThanOrEqualToZero]])

(def ^:private ConversationDetail
  [:map
   [:conversation_id    ms/UUIDString]
   [:created_at         ms/TemporalInstant]
   [:summary            [:maybe :string]]
   [:originator_user_id [:maybe ms/PositiveInt]]
   [:chat_messages      [:sequential :map]]])

(def ^:private ConversationIdParams
  [:map [:id ms/UUIDString]])

;;; ---------------------------------------- Queries ----------------------------------------

(def ^:private default-limit  50)
(def ^:private default-offset 0)

;;; ---------------------------------------- Endpoints ----------------------------------------

(api.macros/defendpoint :get "/" :- ListConversationsResponse
  "List conversations the current user participates in (has authored at least
  one message in), most-recent first. Covers both solo web-UI chats and shared
  Slack threads where the user is one of several participants."
  []
  (let [user-id (api/check-404 api/*current-user-id*)
        limit   (or (request/limit) default-limit)
        offset  (or (request/offset) default-offset)
        ;; Aggregates are per-row correlated subqueries so pagination stays on the
        ;; outer `metabot_conversation` scan and only runs the subquery 50× per page.
        ;; Participation is defined by message authorship, not deletion state —
        ;; soft-deleted messages still count (consistent with `participant?`),
        ;; so a user doesn't lose their own history to moderation.
        participation-exists [:exists {:select [[[:inline 1]]]
                                       :from   [:metabot_message]
                                       :where  [:and
                                                [:= :conversation_id :metabot_conversation.id]
                                                [:= :user_id user-id]]}]
        rows    (t2/select :model/MetabotConversation
                           {:select   [:id :created_at :summary [:user_id :originator_user_id]
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
                            :where    participation-exists
                            :order-by [[:created_at :desc] [:id :asc]]
                            :limit    limit
                            :offset   offset})]
    {:data   (mapv #(-> %
                        (select-keys [:created_at :summary :originator_user_id :message_count :last_message_at])
                        (assoc :conversation_id (:id %)))
                   rows)
     :total  (t2/count :model/MetabotConversation {:where participation-exists})
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id" :- ConversationDetail
  "Return a single conversation with its flattened chat messages.

  Accessible to any participant in the conversation or to any superuser."
  [{:keys [id]} :- ConversationIdParams]
  (api/read-check :model/MetabotConversation id)
  (let [{:keys [user_id] :as detail} (metabot.persistence/conversation-detail id)]
    (-> detail
        (dissoc :user_id)
        (assoc :originator_user_id user_id))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/conversations` routes."
  (api.macros/ns-handler *ns* +auth))
