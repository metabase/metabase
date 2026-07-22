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
   [metabase.events.core :as events]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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
   [:last_message_at [:maybe ms/TemporalInstant]]
   [:forked_from_conversation_id [:maybe ms/UUIDString]]])

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
   [:saved_entities  [:sequential
                      [:map
                       [:card_id  ms/PositiveInt]
                       [:chart_id [:maybe :string]]]]]
   [:messages        [:sequential :map]]])

(def ^:private ConversationTitleResponse
  [:map
   [:status [:enum "ready" "pending" "missing"]]
   [:title  [:maybe :string]]])

(def ^:private ConversationIdParams
  [:map [:id ms/UUIDString]])

(def ^:private ListConversationsQueryParams
  [:maybe
   [:map
    [:profile_id {:optional true} [:maybe ms/NonBlankString]]]])

(def ^:private ForkConversationBody
  [:map
   ;; the `external_id` of the assistant message to fork at (the FE's message id)
   [:message_id ms/UUIDString]])

(def ^:private SaveEntityCard
  [:map
   [:name                   ms/NonBlankString]
   [:description            {:optional true} [:maybe :string]]
   [:dataset_query          :map]
   [:display                ms/NonBlankString]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]])

(def ^:private SaveEntityBody
  [:map
   ;; stamped onto report_card.metabot_chart_id, a varchar(36) — clamp to fit
   [:chart_id [:and ms/NonBlankString [:string {:max 36}]]]
   [:card     SaveEntityCard]])

(def ^:private SaveEntityResponse
  [:map
   [:id                      ms/PositiveInt]
   [:name                    ms/NonBlankString]
   [:description             {:optional true} [:maybe :string]]
   [:dataset_query           :map]
   [:display                 :keyword]
   [:visualization_settings  {:optional true} [:maybe :map]]
   [:collection_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_id            {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id        {:optional true} [:maybe ms/PositiveInt]]
   [:metabot_conversation_id ms/UUIDString]
   [:metabot_chart_id        ms/NonBlankString]])

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

(defn- live-message-count-subquery
  []
  {:select [[[:count :*]]]
   :from   [[:metabot_message :counted_message]]
   :where  [:and
            [:= :counted_message.conversation_id :c.id]
            [:= :counted_message.deleted_at nil]]})

(defn- last-live-message-at-subquery
  []
  {:select [[[:max :recent_message.created_at]]]
   :from   [[:metabot_message :recent_message]]
   :where  [:and
            [:= :recent_message.conversation_id :c.id]
            [:= :recent_message.deleted_at nil]]})

(defn- activity-at-expression
  []
  [:greatest :c.created_at [:coalesce (last-live-message-at-subquery) :c.created_at]])

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
  (let [user-id (api/check-404 api/*current-user-id*)
        limit   (or (request/limit) default-limit)
        offset  (or (request/offset) default-offset)
        where   (list-where-clause user-id profile_id)
        total   (:count (t2/query-one {:select [[[:count :*] :count]]
                                       :from   [[:metabot_conversation :c]]
                                       :where  where}))
        ;; Aggregates are per-row correlated subqueries so pagination stays on the outer
        ;; `metabot_conversation` scan rather than grouping every message the user owns.
        ;; Participation is defined by message authorship, not deletion state, so
        ;; soft-deleted messages still count. Legacy rows fall back to
        ;; `metabot_conversation.user_id`.
        rows    (t2/select :model/MetabotConversation
                           {:select   [:c.id :c.created_at :c.title :c.user_id :c.forked_from_conversation_id
                                       [(live-message-count-subquery) :message_count]
                                       [(last-live-message-at-subquery) :last_message_at]
                                       [(last-live-message-profile-id-subquery) :profile_id]]
                            :from     [[:metabot_conversation :c]]
                            :where    where
                            :order-by [[(activity-at-expression) :desc] [:c.id :asc]]
                            :limit    limit
                            :offset   offset})]
    {:data   (mapv #(-> %
                        (select-keys [:created_at :title :user_id :profile_id :message_count :last_message_at
                                      :forked_from_conversation_id])
                        (assoc :conversation_id (:id %)))
                   rows)
     :total  total
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id/title" :- ConversationTitleResponse
  "Return the title generation status for a conversation.

  Accessible to any participant in the conversation or to any superuser."
  [{:keys [id]} :- ConversationIdParams]
  (let [conversation (api/read-check :model/MetabotConversation id)]
    (conversation-title/title-status id (:title conversation))))

(api.macros/defendpoint :get "/:id" :- ConversationDetail
  "Return a single conversation with its flattened chat messages.

  Accessible to any participant in the conversation or to any superuser."
  [{:keys [id]} :- ConversationIdParams]
  (api/read-check :model/MetabotConversation id)
  (metabot.persistence/conversation-detail id))

(api.macros/defendpoint :post "/:id/fork" :- ConversationDetail
  "Fork a conversation at an assistant message, returning a brand-new conversation
  that copies the thread from the start up to and including that message.

  Only the conversation's originator may fork it, for now. `message_id` is the
  `external_id` of the message to fork at, which must be a live, finished,
  non-errored assistant message. The clone gets fresh conversation/message ids,
  fresh timestamps, the current user as owner, and zeroed token usage so the fork
  does not double-count tokens in the analytics views."
  [{:keys [id]} :- ConversationIdParams
   _query-params
   {:keys [message_id]} :- ForkConversationBody]
  (let [conversation (api/check-404 (t2/select-one [:model/MetabotConversation :id :user_id] :id id))]
    (api/check-403 (= (:user_id conversation) api/*current-user-id*))
    (let [new-conversation-id (metabot.persistence/fork-conversation! id message_id api/*current-user-id*)]
      (api/check-400 (some? new-conversation-id)
                     (tru "Can only fork from a completed Metabot response."))
      (metabot.persistence/conversation-detail new-conversation-id))))

(api.macros/defendpoint :post "/:id/saved-entity" :- SaveEntityResponse
  "Save a Metabot-generated chart from this conversation as a card, stamping the
  card's origin columns in the same request — used by the inline chart's
  manual Save button, which runs outside any agent turn. Creating and stamping
  together (rather than stamping after a separate `POST /api/card`) means the
  card and its origin cannot desync when the follow-up request is lost.

  Accessible to any participant in the conversation or to any superuser."
  [{:keys [id]} :- ConversationIdParams
   _query-params
   {:keys [chart_id card]} :- SaveEntityBody]
  (api/read-check :model/MetabotConversation id)
  ;; Mirror the POST /api/card pre-checks: `create-card!` itself does not check
  ;; permissions on the query's data or the target container. Like the card API's
  ;; `actual-collection-id`, an explicit `collection_id` on a dashboard save must
  ;; match the dashboard's own collection.
  (query-perms/check-run-permissions-for-query (:dataset_query card))
  (if-let [dashboard-id (:dashboard_id card)]
    (let [dashboard-collection-id (:collection_id (api/write-check :model/Dashboard dashboard-id))
          [_ specified-collection-id :as specified?] (find card :collection_id)]
      (when specified?
        (api/check-400 (= specified-collection-id dashboard-collection-id)
                       (tru "Mismatch detected between Dashboard''s `collection_id` ({0}) and `collection_id` ({1})"
                            dashboard-collection-id specified-collection-id))))
    (api/create-check :model/Card {:collection_id (:collection_id card)}))
  ;; Create the card and stamp its origin in ONE transaction so they cannot desync.
  ;; The stamp is a raw table update — it should not run the Card model's heavy
  ;; before-update pipeline (query normalization, metadata population). The
  ;; `:card-create` event is delayed until after the transaction commits so
  ;; subscribers see the card.
  (let [created (t2/with-transaction [_conn]
                  (u/prog1 (queries/create-card!
                            (-> (select-keys card [:name :description :dataset_query :display
                                                   :visualization_settings :collection_id
                                                   :dashboard_id :dashboard_tab_id])
                                (update :display keyword)
                                (update :visualization_settings #(or % {})))
                            {:id api/*current-user-id*}
                            :delay-event)
                    (t2/update! (t2/table-name :model/Card) (:id <>)
                                {:metabot_conversation_id id
                                 :metabot_chart_id        chart_id})))]
    (events/publish-event! :event/card-create
                           {:object created :user-id api/*current-user-id*})
    (assoc created
           :metabot_conversation_id id
           :metabot_chart_id        chart_id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/conversations` routes."
  (api.macros/ns-handler *ns* +auth))
