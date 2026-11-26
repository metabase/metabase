(ns metabase-enterprise.metabot-analytics.db
  "Application database queries for the metabot-analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.parameters.dates :as qp.parameters.dates]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn conversation
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id conversation-id))

(defn- date-range-expr
  "A half-open predicate on `col` from the serialized date-param string `date-string`. Throws 400 on a malformed
  string. Returns nil when no bound is produced."
  [col date-string]
  (let [{:keys [start end]}
        (try
          (qp.parameters.dates/date-string->range date-string {:inclusive-end? false})
          (catch Exception e
            (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                            {:status-code 400}
                            e))))
        start (some-> start u.date/parse)
        end   (some-> end   u.date/parse)
        parts (cond-> []
                start (conj [:>= col start])
                end   (conj [:<  col end]))]
    (when (seq parts)
      (into [:and] parts))))

(defn- conversation-list-expr
  "The `:where` fragment restricting `metabot_conversation` rows aliased `:c` to `user-id`, `group-id`, `tenant-id`,
  and `date` (each nil for no restriction; `date` is a serialized date-param string). Returns nil when none apply."
  [{:keys [user-id group-id tenant-id date]}]
  (let [exprs (cond-> []
                user-id (conj [:= :c.user_id user-id])
                (seq date) (conj (date-range-expr :c.created_at date))
                (and group-id (not= group-id (:id (perms/all-users-group))))
                (conj [:exists ^:allow-subquery {:select [1]
                                                 :from   [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
                                                 :where  [:and
                                                          [:= :pgm.user_id :c.user_id]
                                                          [:= :pgm.group_id group-id]]}])
                tenant-id
                (conj [:exists ^:allow-subquery {:select [1]
                                                 :from   [[(t2/table-name :model/User) :u]]
                                                 :where  [:and
                                                          [:= :u.id :c.user_id]
                                                          [:= :u.tenant_id tenant-id]]}]))
        exprs (remove nil? exprs)]
    (when (seq exprs)
      (into [:and] exprs))))

(def ^:private sort-columns
  "Allow-list of API sort keys → vectors of ORDER BY expressions (sans
   direction). A vector lets a single sort key emit multiple ORDER BY terms that
   share the same direction (e.g. user sort orders by first_name then last_name)."
  {"created_at"        [:c.created_at]
   "title"             [:c.title]
   "message_count"     [:message_count]
   "total_tokens"      [:total_tokens]
   "uncached_tokens"   [:uncached_tokens]
   "cache_read_tokens" [:cache_read_tokens]
   "user"              [[:lower [:min :u.first_name]]
                        [:lower [:min :u.last_name]]]
   "profile_id"        [:profile_id]
   "ip_address"        [:c.ip_address]})

(defn- usage-sum-expr
  "Sum of the `ai_usage_log` column `col` over the LLM calls of a conversation. The split of the tokens into prompt,
  completion, and cache read is only recorded per LLM call in `ai_usage_log` (`metabot_message` stores one total), so
  this is a correlated subquery rather than another one-to-many join, which would fan out against the
  `metabot_message` join and inflate every other aggregate."
  [col]
  [:coalesce
   ^:allow-subquery {:select [[[:sum col]]]
                     :from   [[(t2/table-name :model/AiUsageLog) :aul]]
                     :where  [:= :aul.conversation_id :c.id]}
   0])

(defn- uncached-tokens-expr
  "The tokens of one `ai_usage_log` row that were not served from the provider cache: the input tokens
  (`prompt-col` minus `cache-read-col`) plus the output tokens (`completion-col`). `prompt_tokens` holds the cache
  read tokens for every provider; the clamp only guards against a row that breaks that rule."
  [prompt-col cache-read-col completion-col]
  [:+ [:greatest [:- prompt-col [:coalesce cache-read-col 0]] 0] completion-col])

(defn- token-usage-columns
  "The uncached and cache read token columns of a conversation aliased `:c`."
  []
  [[(usage-sum-expr (uncached-tokens-expr :aul.prompt_tokens :aul.cache_read_tokens :aul.completion_tokens))
    :uncached_tokens]
   [(usage-sum-expr :aul.cache_read_tokens) :cache_read_tokens]])

(defn- conversation-list-select
  "Conversation rows with aggregate stats, including deleted attempts. Messages
   a fork copied in from its origin are counted here — the list describes the
   thread as the reader sees it. `v_metabot_conversations.new_message_count` is
   the usage-metric counterpart that leaves them out."
  []
  {:select    (into
               [:c.*
                [[:count :m.id] :message_count]
                [[:count [:case [:= :m.role "user"] 1]] :user_message_count]
                [[:count [:case [:= :m.role "assistant"] 1]] :assistant_message_count]
                [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
                [[:max :m.created_at] :last_message_at]
                [^:allow-subquery {:select   [:mm.profile_id]
                                   :from     [[(t2/table-name :model/MetabotMessage) :mm]]
                                   :where    [:and
                                              [:= :mm.conversation_id :c.id]
                                              [:= :mm.role "assistant"]]
                                   :order-by [[:mm.created_at :asc] [:mm.id :asc]]
                                   :limit    1}
                 :profile_id]]
               (token-usage-columns))
   :from      [[(t2/table-name :model/MetabotConversation) :c]]
   :left-join [[(t2/table-name :model/MetabotMessage) :m] [:= :m.conversation_id :c.id]
               [(t2/table-name :model/User) :u]       [:= :u.id :c.user_id]]
   :group-by  [:c.id]})

(mu/defn list-conversations
  "A page of conversation summary rows (see [[conversation-list-select]]), restricted to `user-id`, `group-id`,
  `tenant-id`, and `date` (each nil for no restriction), sorted by the allow-listed `sort-by` column name in
  `sort-direction` (`:asc` or `:desc`), skipping `offset` and returning up to `limit`."
  [{:keys [user-id group-id tenant-id date sort-by sort-direction offset limit]}
   :- [:map {:closed true}
       [:user-id        {:optional true} [:maybe ::lib.schema.id/user]]
       [:group-id       {:optional true} [:maybe ms/PositiveInt]]
       [:tenant-id      {:optional true} [:maybe ms/PositiveInt]]
       [:date           {:optional true} [:maybe :string]]
       [:sort-by        {:optional true} [:maybe :string]]
       [:sort-direction {:optional true} [:enum :asc :desc]]
       [:offset         {:optional true} ms/IntGreaterThanOrEqualToZero]
       [:limit          {:optional true} ms/PositiveInt]]]
  (let [where      (conversation-list-expr {:user-id user-id :group-id group-id :tenant-id tenant-id :date date})
        sort-exprs (get sort-columns sort-by [:c.created_at])
        order-by   (conj (mapv #(vector % sort-direction) sort-exprs)
                         [:c.id :asc])]
    (t2/select :model/MetabotConversation
               (cond-> (assoc (conversation-list-select)
                              :order-by order-by
                              :limit    limit
                              :offset   offset)
                 where (assoc :where where)))))

(mu/defn conversation-count
  "The total count of conversations matching the same criteria as [[list-conversations]] (ignoring sort, offset,
  and limit)."
  [{:keys [user-id group-id tenant-id date]}
   :- [:map {:closed true}
       [:user-id   {:optional true} [:maybe ::lib.schema.id/user]]
       [:group-id  {:optional true} [:maybe ms/PositiveInt]]
       [:tenant-id {:optional true} [:maybe ms/PositiveInt]]
       [:date      {:optional true} [:maybe :string]]]]
  (let [where (conversation-list-expr {:user-id user-id :group-id group-id :tenant-id tenant-id :date date})]
    (:count (t2/query-one (cond-> {:select [[[:count :*] :count]]
                                   :from   [[(t2/table-name :model/MetabotConversation) :c]]}
                            where (assoc :where where))))))

(mu/defn token-usage-for-conversation :- [:map
                                          [:uncached_tokens   ms/IntGreaterThanOrEqualToZero]
                                          [:cache_read_tokens ms/IntGreaterThanOrEqualToZero]]
  "The token sums of the LLM calls of the MetabotConversation with `conversation-id`: the input and output tokens
  not served from the provider cache, and the cache read tokens. The list reads the same [[token-usage-columns]]."
  [conversation-id :- :string]
  (update-vals (t2/query-one {:select (token-usage-columns)
                              :from   [[(t2/table-name :model/MetabotConversation) :c]]
                              :where  [:= :c.id conversation-id]})
               long))

(mu/defn messages-for-conversation
  "The MetabotMessages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id :- :string]
  (t2/select :model/MetabotMessage :conversation_id conversation-id {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn llm-calls-for-messages
  "The MetabotLlmCalls of the MetabotMessages with `message-ids`."
  [message-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/MetabotLlmCall :message_id [:in %]) message-ids))

(mu/defn tool-calls-for-messages
  "The MetabotToolCalls of the MetabotMessages with `message-ids`, without their input and output."
  [message-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/MetabotToolCall :id :message_id :tool_call_id :tool_name :created_at
                                   :started_at :finished_at :status :error_class]
                                  :message_id [:in %])
                      message-ids))

(mu/defn message-data-for-conversations
  "The conversation, data, and data version of the MetabotMessages of the MetabotConversations with
  `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (mdb/select-batched #(t2/select [:model/MetabotMessage :conversation_id :data :data_version] :conversation_id [:in %])
                      conversation-ids))

(mu/defn feedback-for-conversation
  "The MetabotFeedback rows on the messages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id :- :string]
  (t2/select :model/MetabotFeedback
             {:select   [:mf.id
                         :mf.message_id
                         :mf.user_id
                         [:mm.external_id :external_id]
                         :mf.positive
                         :mf.issue_type
                         :mf.freeform_feedback
                         :mf.created_at
                         :mf.updated_at]
              :from     [[(t2/table-name :model/MetabotFeedback) :mf]]
              :join     [[(t2/table-name :model/MetabotMessage) :mm] [:= :mm.id :mf.message_id]]
              :where    [:= :mm.conversation_id conversation-id]
              :order-by [[:mf.created_at :asc]
                         [:mf.message_id :asc]
                         [:mf.user_id :asc]]}))
