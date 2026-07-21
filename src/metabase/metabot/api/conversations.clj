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
   [:state           {:optional true} [:maybe ::metabot.schema/state]]
   [:saved_entities  [:sequential
                      [:map
                       [:card_id  ms/PositiveInt]
                       [:chart_id [:maybe :string]]]]]
   [:chat_messages   [:sequential :map]]])

(def ^:private ConversationIdParams
  [:map [:id ms/UUIDString]])

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
  (let [user-id         (api/check-404 api/*current-user-id*)
        limit           (or (request/limit) default-limit)
        offset          (or (request/offset) default-offset)
        visible-to-user (participation-clause user-id)
        ;; Aggregates are per-row correlated subqueries so pagination stays on the
        ;; outer `metabot_conversation` scan and only runs the subquery 50× per page.
        ;; Participation is defined by message authorship, not deletion state, so
        ;; soft-deleted messages still count. Legacy rows fall back to
        ;; `metabot_conversation.user_id`.
        rows            (t2/select :model/MetabotConversation
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
