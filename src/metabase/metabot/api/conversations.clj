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
   [metabase.metabot.schema :as metabot.schema]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Schemas ----------------------------------------

(def ^:private ConversationSummary
  [:map
   [:conversation_id ms/UUIDString]
   [:created_at      ms/TemporalInstant]
   [:title           [:maybe :string]]
   ;; Wire compatibility: keep the field name `user_id`, but it now means the
   ;; conversation originator (first writer), not "the only allowed reader".
   [:user_id         [:maybe ms/PositiveInt]]
   [:profile_id      [:maybe :string]]
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
   [:title           [:maybe :string]]
   [:user_id         [:maybe ms/PositiveInt]]
   [:state           {:optional true} [:maybe ::metabot.schema/state]]
   [:chat_messages   [:sequential :map]]])

(def ^:private ConversationIdParams
  [:map [:id ms/UUIDString]])

(def ^:private ListConversationsQueryParams
  [:maybe
   [:map
    [:profile_id {:optional true} [:maybe ms/NonBlankString]]]])

;;; ---------------------------------------- Queries ----------------------------------------

(def ^:private default-limit  50)
(def ^:private default-offset 0)

(defn- participation-clause
  "Match conversations visible in history for `user-id`.

  New rows participate via `metabot_message.user_id`; legacy rows created before
  message authors were stamped fall back to the conversation originator."
  [user-id]
  (let [participation-exists [:exists {:select [[[:inline 1]]]
                                       :from   [[:metabot_message :participation_message]]
                                       :where  [:and
                                                [:= :participation_message.conversation_id :c.id]
                                                [:= :participation_message.user_id user-id]]}]]
    [:or
     [:= :c.user_id user-id]
     participation-exists]))

(defn- last-live-message-profile-id-subquery
  []
  {:select   [:last_message.profile_id]
   :from     [[:metabot_message :last_message]]
   :where    [:and
              [:= :last_message.conversation_id :c.id]
              [:= :last_message.deleted_at nil]]
   :order-by [[:last_message.created_at :desc] [:last_message.id :desc]]
   :limit    1})

(defn- list-where-clause
  [user-id profile-id]
  (cond-> [:and (participation-clause user-id)]
    profile-id (conj [:= (last-live-message-profile-id-subquery) profile-id])))

;;; ---------------------------------------- Endpoints ----------------------------------------

(api.macros/defendpoint :get "/" :- ListConversationsResponse
  "List conversations visible in the current user's history, most-recent first.

  New conversations are participation-based (the user authored at least one
  message); legacy conversations created before message authors were stamped
  fall back to the conversation originator. Optionally filter by the last live
  message's `profile_id`."
  [_route-params
   {:keys [profile_id]} :- ListConversationsQueryParams]
  (let [user-id     (api/check-404 api/*current-user-id*)
        limit       (or (request/limit) default-limit)
        offset      (or (request/offset) default-offset)
        where       (list-where-clause user-id profile_id)
        activity-at [:greatest :c.created_at [:coalesce [:max :message.created_at] :c.created_at]]
        total       (:count (t2/query-one {:select [[[:count :*] :count]]
                                           :from   [[:metabot_conversation :c]]
                                           :where  where}))
        ;; Participation is defined by message authorship, not deletion state, so
        ;; soft-deleted messages still count. Legacy rows fall back to
        ;; `metabot_conversation.user_id`.
        rows        (t2/select :model/MetabotConversation
                               {:select    [:c.id :c.created_at :c.title :c.user_id
                                            [[:count :message.id] :message_count]
                                            [[:max :message.created_at] :last_message_at]
                                            [(last-live-message-profile-id-subquery) :profile_id]
                                            [activity-at :activity_at]]
                                :from      [[:metabot_conversation :c]]
                                :left-join [[:metabot_message :message]
                                            [:and
                                             [:= :message.conversation_id :c.id]
                                             [:= :message.deleted_at nil]]]
                                :where     where
                                :group-by  [:c.id]
                                :order-by  [[:activity_at :desc] [:c.id :asc]]
                                :limit     limit
                                :offset    offset})]
    {:data   (mapv #(-> %
                        (select-keys [:created_at :title :user_id :profile_id :message_count :last_message_at])
                        (assoc :conversation_id (:id %)))
                   rows)
     :total  total
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
