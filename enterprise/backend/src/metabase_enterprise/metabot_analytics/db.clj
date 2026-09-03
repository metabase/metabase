(ns metabase-enterprise.metabot-analytics.db
  "Application database queries for the metabot-analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.query-processor.parameters.dates :as qp.parameters.dates]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn conversation
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id]
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
                                                 :from   [[:permissions_group_membership :pgm]]
                                                 :where  [:and
                                                          [:= :pgm.user_id :c.user_id]
                                                          [:= :pgm.group_id group-id]]}])
                tenant-id
                (conj [:exists ^:allow-subquery {:select [1]
                                                 :from   [[:core_user :u]]
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
   "cache_read_tokens" [:cache_read_tokens]
   "user"              [[:lower [:min :u.first_name]]
                        [:lower [:min :u.last_name]]]
   "profile_id"        [:profile_id]
   "ip_address"        [:c.ip_address]})

(def ^:private conversation-list-select
  "Conversation rows with aggregate stats, including deleted attempts. Messages
   a fork copied in from its origin are counted here — the list describes the
   thread as the reader sees it. `v_metabot_conversations.new_message_count` is
   the usage-metric counterpart that leaves them out."
  {:select    [:c.*
               [[:count :m.id] :message_count]
               [[:count [:case [:= :m.role "user"] 1]] :user_message_count]
               [[:count [:case [:= :m.role "assistant"] 1]] :assistant_message_count]
               [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
               [[:max :m.created_at] :last_message_at]
               [^:allow-subquery {:select   [:mm.profile_id]
                                  :from     [[:metabot_message :mm]]
                                  :where    [:and
                                             [:= :mm.conversation_id :c.id]
                                             [:= :mm.role "assistant"]]
                                  :order-by [[:mm.created_at :asc] [:mm.id :asc]]
                                  :limit    1}
                :profile_id]
               ;; Cache tokens are only recorded per LLM call in `ai_usage_log`
               ;; (`metabot_message` stores prompt+completion only), so this is a
               ;; correlated subquery rather than another one-to-many join, which
               ;; would fan out against the `metabot_message` join and inflate
               ;; every aggregate above.
               [[:coalesce
                 ^:allow-subquery {:select [[[:sum :aul.cache_read_tokens]]]
                                   :from   [[:ai_usage_log :aul]]
                                   :where  [:= :aul.conversation_id :c.id]}
                 0]
                :cache_read_tokens]]
   :from      [[:metabot_conversation :c]]
   :left-join [[:metabot_message :m] [:= :m.conversation_id :c.id]
               [:core_user :u]       [:= :u.id :c.user_id]]
   :group-by  [:c.id]})

(defn list-conversations
  "A page of conversation summary rows (see [[conversation-list-select]]), restricted to `user-id`, `group-id`,
  `tenant-id`, and `date` (each nil for no restriction), sorted by the allow-listed `sort-by` column name in
  `sort-direction` (`:asc` or `:desc`), skipping `offset` and returning up to `limit`."
  [{:keys [user-id group-id tenant-id date sort-by sort-direction offset limit]}]
  (let [where      (conversation-list-expr {:user-id user-id :group-id group-id :tenant-id tenant-id :date date})
        sort-exprs (get sort-columns sort-by [:c.created_at])
        order-by   (conj (mapv #(vector % sort-direction) sort-exprs)
                         [:c.id :asc])]
    (t2/select :model/MetabotConversation
               (cond-> (assoc conversation-list-select
                              :order-by order-by
                              :limit    limit
                              :offset   offset)
                 where (assoc :where where)))))

(defn conversation-count
  "The total count of conversations matching the same criteria as [[list-conversations]] (ignoring sort, offset,
  and limit)."
  [{:keys [user-id group-id tenant-id date]}]
  (let [where (conversation-list-expr {:user-id user-id :group-id group-id :tenant-id tenant-id :date date})]
    (:count (t2/query-one (cond-> {:select [[[:count :*] :count]]
                                   :from   [[:metabot_conversation :c]]}
                            where (assoc :where where))))))

(defn messages-for-conversation
  "The MetabotMessages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id]
  (t2/select :model/MetabotMessage :conversation_id conversation-id {:order-by [[:created_at :asc] [:id :asc]]}))

(defn message-data-for-conversations
  "The conversation, data, and data version of the MetabotMessages of the MetabotConversations with
  `conversation-ids`."
  [conversation-ids]
  (t2/select [:model/MetabotMessage :conversation_id :data :data_version] :conversation_id [:in conversation-ids]))

(defn feedback-for-conversation
  "The MetabotFeedback rows on the messages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id]
  (t2/select :model/MetabotFeedback
             {:select   [:metabot_feedback.id
                         :metabot_feedback.message_id
                         :metabot_feedback.user_id
                         [:mm.external_id :external_id]
                         :metabot_feedback.positive
                         :metabot_feedback.issue_type
                         :metabot_feedback.freeform_feedback
                         :metabot_feedback.created_at
                         :metabot_feedback.updated_at]
              :from     [:metabot_feedback]
              :join     [[:metabot_message :mm] [:= :mm.id :metabot_feedback.message_id]]
              :where    [:= :mm.conversation_id conversation-id]
              :order-by [[:metabot_feedback.created_at :asc]
                         [:metabot_feedback.message_id :asc]
                         [:metabot_feedback.user_id :asc]]}))
