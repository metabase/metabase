(ns metabase-enterprise.metabot-analytics.api
  "`/api/ee/metabot-analytics/` endpoints for AI/Metabot usage analytics.
  These only work if you have a premium token with the `:audit-app` feature."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as app-db]
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
   [:estimated_cost :double]
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
   [:messages [:sequential MessageDetail]]])

(def ^:private UsageDataPoint
  "Schema for daily usage data point."
  [:map
   [:usage_date :any]
   [:model [:maybe :string]]
   [:conversation_count :int]
   [:unique_users :int]
   [:user_messages :int]
   [:assistant_messages :int]
   [:total_tokens :int]
   [:estimated_cost :double]])

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- days-ago-sql
  "Return database-specific SQL for N days ago. Different databases have different
   syntax for date arithmetic."
  [n]
  [:raw (case (app-db/db-type)
          :postgres (format "CURRENT_TIMESTAMP - INTERVAL '%d days'" n)
          :h2       (format "DATEADD('DAY', -%d, CURRENT_TIMESTAMP)" n)
          :mysql    (format "CURRENT_TIMESTAMP - INTERVAL %d DAY" n))])

(defn- cast-to-date-sql
  "Return database-specific SQL for casting a column to date."
  [column]
  (case (app-db/db-type)
    :postgres [:raw (format "CAST(%s AS DATE)" (name column))]
    :h2       [:raw (format "CAST(%s AS DATE)" (name column))]
    :mysql    [:raw (format "DATE(%s)" (name column))]))

(defn- batch-load-users
  "Fetch user info for multiple user IDs in a single query.
   Returns a map of user-id -> user-info."
  [user-ids]
  (when (seq user-ids)
    (let [users (t2/select [:model/User :id :email :first_name :last_name]
                           :id [:in user-ids])]
      (into {} (map (juxt :id identity) users)))))

(defn- enrich-conversations-with-users
  "Add user info to conversations using batch loading."
  [conversations]
  (let [user-ids    (into #{} (keep :user_id conversations))
        users-by-id (batch-load-users user-ids)]
    (mapv #(assoc % :user (get users-by-id (:user_id %))) conversations)))

;;; -------------------------------------------------- Endpoints --------------------------------------------------

(api.macros/defendpoint :get "/summary"
  :- [:map
      [:total_conversations :int]
      [:total_messages :int]
      [:total_tokens :int]
      [:total_cost :double]
      [:unique_users :int]
      [:conversations_last_30_days :int]
      [:tokens_last_30_days :int]
      [:cost_last_30_days :double]]
  "Return summary statistics for AI/Metabot usage."
  []
  (api/check-superuser)
  (let [thirty-days-ago (days-ago-sql 30)
        cost-totals     (t2/query-one {:select [[[:coalesce [:sum :estimated_cost_usd] 0] :total]
                                                [[:coalesce
                                                  [:sum [:case [:>= :created_at thirty-days-ago] :estimated_cost_usd]]
                                                  0] :last_30]]
                                       :from   [:ai_usage_log]})]
    {:total_conversations        (or (t2/count :model/MetabotConversation) 0)
     :total_messages             (or (t2/count :model/MetabotMessage {:where [:= :deleted_at nil]}) 0)
     :total_tokens               (or (t2/select-one-fn :sum
                                                       [:model/MetabotMessage [:%sum.total_tokens :sum]]
                                                       {:where [:= :deleted_at nil]})
                                     0)
     :total_cost                 (or (:total cost-totals) 0.0)
     :unique_users               (or (:count (t2/query-one {:select [[[:count [:distinct :user_id]] :count]]
                                                            :from   [:metabot_conversation]}))
                                     0)
     :conversations_last_30_days (or (t2/count :model/MetabotConversation
                                               {:where [:>= :created_at thirty-days-ago]})
                                     0)
     :tokens_last_30_days        (or (t2/select-one-fn :sum
                                                       [:model/MetabotMessage [:%sum.total_tokens :sum]]
                                                       {:where [:and
                                                                [:= :deleted_at nil]
                                                                [:>= :created_at thirty-days-ago]]})
                                     0)
     :cost_last_30_days          (or (:last_30 cost-totals) 0.0)}))

(api.macros/defendpoint :get "/conversations"
  :- [:map
      [:data [:sequential ConversationSummary]]
      [:total :int]
      [:limit :int]
      [:offset :int]]
  "Return paginated list of AI conversations with summary statistics."
  [_route-params
   {:keys [limit offset user-id sort-by sort-dir]}
   :- [:map
       [:limit {:optional true :default 50} ms/PositiveInt]
       [:offset {:optional true :default 0} ms/IntGreaterThanOrEqualToZero]
       [:user-id {:optional true} [:maybe ms/PositiveInt]]
       [:sort-by {:optional true :default "created_at"} [:enum "created_at" "message_count" "total_tokens"]]
       [:sort-dir {:optional true :default "desc"} [:enum "asc" "desc"]]]]
  (api/check-superuser)
  (let [limit        (or limit 50)
        offset       (or offset 0)
        sort-by-kw   (keyword (or sort-by "created_at"))
        sort-dir-kw  (if (= sort-dir "asc") :asc :desc)
        where-clause (when user-id [:= :c.user_id user-id])
        ;; Main query with model fetched via correlated subquery
        base-query   {:select    [[:c.id :conversation_id]
                                  [:c.created_at :created_at]
                                  [:c.user_id :user_id]
                                  [:c.summary :summary]
                                  [[:count :m.id] :message_count]
                                  [[:count [:case [:= :m.role "user"] 1]] :user_message_count]
                                  [[:count [:case [:= :m.role "assistant"] 1]] :assistant_message_count]
                                  [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
                                  [[:raw "(SELECT COALESCE(SUM(a.estimated_cost_usd), 0) FROM ai_usage_log a
                                           WHERE a.conversation_id = CAST(c.id AS VARCHAR))"] :estimated_cost]
                                  [[:max :m.created_at] :last_message_at]
                                  ;; Subquery for model (first assistant message's profile_id)
                                  [[:raw "(SELECT mm.profile_id FROM metabot_message mm
                                           WHERE mm.conversation_id = c.id AND mm.role = 'assistant'
                                           ORDER BY mm.created_at LIMIT 1)"] :model]]
                      :from      [[:metabot_conversation :c]]
                      :left-join [[:metabot_message :m] [:and
                                                         [:= :m.conversation_id :c.id]
                                                         [:= :m.deleted_at nil]]]
                      :group-by  [:c.id :c.created_at :c.user_id :c.summary]}
        query        (cond-> base-query
                       where-clause (assoc :where where-clause))
        ;; Count query must include the same join to count only conversations with messages
        count-query  (cond-> {:select [[[:count [:distinct :c.id]] :count]]
                              :from   [[:metabot_conversation :c]]}
                       where-clause (assoc :where where-clause))
        total        (or (:count (t2/query-one count-query)) 0)
        ;; Fetch paginated results
        results      (t2/query (-> query
                                   (assoc :order-by [[sort-by-kw sort-dir-kw]])
                                   (assoc :limit limit)
                                   (assoc :offset offset)))]
    {:data   (enrich-conversations-with-users results)
     :total  total
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/conversations/:id"
  :- ConversationDetail
  "Return full details for a specific conversation including all messages."
  [{:keys [id]} :- [:map [:id ms/UUIDString]]]
  (api/check-superuser)
  (let [conversation (t2/select-one :model/MetabotConversation :id id)]
    (api/check-404 conversation)
    (let [messages   (t2/select :model/MetabotMessage
                                :conversation_id id
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
                              messages)})))

(api.macros/defendpoint :get "/usage"
  :- [:sequential UsageDataPoint]
  "Return daily AI usage data for charting. Defaults to last 30 days."
  [_route-params
   {:keys [days]}
   :- [:map
       [:days {:optional true :default 30} ms/PositiveInt]]]
  (api/check-superuser)
  (let [days        (or days 30)
        days-ago    (days-ago-sql days)
        date-col    (cast-to-date-sql :m.created_at)
        ;; Cost query from ai_usage_log, grouped by same dimensions, then joined
        cost-query  {:select    [[(cast-to-date-sql :created_at) :cost_date]
                                 [:profile_id :cost_profile]
                                 [[:coalesce [:sum :estimated_cost_usd] 0] :estimated_cost]]
                     :from      [:ai_usage_log]
                     :where     [:>= :created_at days-ago]
                     :group-by  [(cast-to-date-sql :created_at) :profile_id]}
        usage-query {:select    [[date-col :usage_date]
                                 [:m.profile_id :model]
                                 [[:count [:distinct :c.id]] :conversation_count]
                                 [[:count [:distinct :c.user_id]] :unique_users]
                                 [[:count [:case [:= :m.role "user"] 1]] :user_messages]
                                 [[:count [:case [:= :m.role "assistant"] 1]] :assistant_messages]
                                 [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
                                 [[:coalesce :costs.estimated_cost 0] :estimated_cost]]
                     :from      [[:metabot_message :m]]
                     :join      [[:metabot_conversation :c] [:= :c.id :m.conversation_id]]
                     :left-join [[cost-query :costs] [:and
                                                      [:= :costs.cost_date date-col]
                                                      [:= :costs.cost_profile :m.profile_id]]]
                     :where     [:and
                                 [:= :m.deleted_at nil]
                                 [:>= :m.created_at days-ago]]
                     :group-by  [date-col :m.profile_id :costs.estimated_cost]
                     :order-by  [[date-col :asc]]}]
    (t2/query usage-query)))

;;; -------------------------------------------------- Routes --------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "Routes for `/api/ee/metabot-analytics/`."
  (+auth (api.macros/ns-handler *ns*)))
