(ns metabase-enterprise.metabot-analytics.api
  "`/api/ee/metabot-analytics/` endpoints for AI/Metabot usage analytics.
  These only work if you have a premium token with the `:audit-app` feature."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.persistence :as metabot-persistence]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Schemas --------------------------------------------------

(def ^:private UserInfo
  "Schema for user info in responses."
  [:map
   [:id :int]
   [:email [:maybe :string]]
   [:first_name [:maybe :string]]
   [:last_name [:maybe :string]]])

(def ^:private ConversationSummary
  "Schema for a conversation summary in list responses."
  [:map
   [:conversation_id :string]
   [:created_at :any]
   [:user_id :int]
   [:summary [:maybe :string]]
   [:message_count :int]
   [:user_message_count :int]
   [:assistant_message_count :int]
   [:total_tokens :int]
   [:last_message_at [:maybe :any]]
   [:model [:maybe :string]]
   [:user [:maybe UserInfo]]])

(def ^:private MessageDetail
  "Schema for a message in conversation detail responses."
  [:map
   [:message_id :int]
   [:created_at :any]
   [:role [:enum "user" "assistant"]]
   [:model [:maybe :string]]
   [:total_tokens [:maybe :int]]
   [:data :any]])

(def ^:private ConversationDetail
  "Schema for full conversation detail response."
  [:map
   [:conversation_id :string]
   [:created_at :any]
   [:user_id :int]
   [:summary [:maybe :string]]
   [:state [:maybe :any]]
   [:user [:maybe UserInfo]]
   [:messages [:sequential MessageDetail]]
   [:chat_messages [:sequential :map]]])

(def ^:private ListConversationsParams
  "Query-param schema for `GET /conversations`. `limit` and `offset` are handled by the
   offset-paging middleware and are read via `metabase.request.core`."
  [:map
   [:user-id {:optional true} [:maybe ms/PositiveInt]]
   [:sort-by {:optional true} [:maybe [:enum "created_at" "message_count" "total_tokens"]]]
   [:sort-dir {:optional true} [:maybe [:enum "asc" "desc"]]]])

(def ^:private ListConversationsResponse
  "Response schema for `GET /conversations`."
  [:map
   [:data [:sequential ConversationSummary]]
   [:total :int]
   [:limit [:maybe :int]]
   [:offset [:maybe :int]]])

(def ^:private ConversationIdParams
  "Route-param schema for endpoints addressing a single conversation by id."
  [:map [:id ms/UUIDString]])

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- batch-load-users
  "Fetch user info for multiple user IDs in a single query.
   Returns a map of user-id -> user-info."
  [user-ids]
  (when (seq user-ids)
    (let [users (t2/select [:model/User :id :email :first_name :last_name]
                           :id [:in user-ids])]
      (into {} (map (juxt :id #(select-keys % [:id :email :first_name :last_name]))) users))))

(defn- enrich-conversations-with-users
  "Add user info to conversations using batch loading."
  [conversations]
  (let [user-ids    (into #{} (keep :user_id conversations))
        users-by-id (batch-load-users user-ids)]
    (mapv #(assoc % :user (get users-by-id (:user_id %))) conversations)))

;;; -------------------------------------------------- Endpoints --------------------------------------------------

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

(api.macros/defendpoint :get "/conversations" :- ListConversationsResponse
  "Return paginated list of AI conversations with summary statistics."
  [_route-params
   {:keys [user-id sort-by sort-dir]} :- ListConversationsParams]
  (api/check-superuser)
  (let [limit        (or (request/limit) 50)
        offset       (or (request/offset) 0)
        sort-by-kw   (keyword (or sort-by "created_at"))
        sort-dir-kw  (if (= sort-dir "asc") :asc :desc)
        where-clause (when user-id [:= :c.user_id user-id])
        base-query   {:select    [[:c.id :conversation_id]
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
        query        (cond-> base-query
                       where-clause (assoc :where where-clause))
        ;; Count all conversations (including those with no messages, which the LEFT JOIN below also returns).
        count-query  (cond-> {:select [[[:count :*] :count]]
                              :from   [[:metabot_conversation :c]]}
                       where-clause (assoc :where where-clause))
        total        (or (:count (t2/query-one count-query)) 0)
        ;; Fetch paginated results. Add :c.id as a stable tiebreaker so pagination is deterministic
        ;; even when the primary sort key has duplicates (e.g. message_count = 0).
        results      (t2/query (-> query
                                   (assoc :order-by [[sort-by-kw sort-dir-kw] [:c.id :asc]])
                                   (assoc :limit limit)
                                   (assoc :offset offset)))]
    {:data   (enrich-conversations-with-users results)
     :total  total
     :limit  (request/limit)
     :offset (request/offset)}))

(defn- fetch-conversation-detail
  "Fetch a conversation with all its messages, user info, and frontend-ready chat messages."
  [conversation-id]
  (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
    (api/check-404 conversation)
    (let [messages   (t2/select :model/MetabotMessage
                                :conversation_id conversation-id
                                {:where    [:= :deleted_at nil]
                                 :order-by [[:created_at :asc]]})
          users      (batch-load-users #{(:user_id conversation)})
          user-info  (get users (:user_id conversation))]
      {:conversation_id (:id conversation)
       :created_at      (:created_at conversation)
       :user_id         (:user_id conversation)
       :summary         (:summary conversation)
       :state           (:state conversation)
       :user            user-info
       :messages        (mapv (fn [m]
                                {:message_id   (:id m)
                                 :created_at   (:created_at m)
                                 :role         (name (:role m))
                                 :model        (:profile_id m)
                                 :total_tokens (:total_tokens m)
                                 :data         (:data m)})
                              messages)
       :chat_messages   (metabot-persistence/messages->chat-messages messages)})))

(api.macros/defendpoint :get "/conversations/:id"
  :- ConversationDetail
  "Return full details for a specific conversation including all messages."
  [{:keys [id]} :- ConversationIdParams]
  (api/check-superuser)
  (fetch-conversation-detail id))

;;; -------------------------------------------------- Routes --------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "Routes for `/api/ee/metabot-analytics/`."
  (+auth (api.macros/ns-handler *ns*)))
