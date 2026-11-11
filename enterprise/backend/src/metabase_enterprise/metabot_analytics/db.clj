(ns metabase-enterprise.metabot-analytics.db
  "Application database queries for the metabot-analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.parameters.dates :as qp.parameters.dates]
   [metabase.toucan.core :as t2]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn conversation
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id conversation-id))

(defn- date-range-expr
  "A half-open predicate on `c.created_at` from the serialized date-param string `date-string`. Throws 400 on a
  malformed string. Returns nil when no bound is produced."
  [date-string]
  (let [{:keys [start end]}
        (try
          (qp.parameters.dates/date-string->range date-string {:inclusive-end? false})
          (catch Exception e
            (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                            {:status-code 400}
                            e))))
        start (some-> start u.date/parse)
        end   (some-> end   u.date/parse)]
    (when (or start end)
      (t2/fragment
       [:and
        (when start (t2/fragment [:>= :c.created_at start]))
        (when end   (t2/fragment [:<  :c.created_at end]))]))))

(defn- conversation-list-expr
  "The `:where` fragment restricting `metabot_conversation` rows aliased `:c` to `user-id`, `group-id`, `tenant-id`,
  and `date` (each nil for no restriction; `date` is a serialized date-param string)."
  [{:keys [user-id group-id tenant-id date]}]
  (t2/fragment
   [:and
    (when user-id
      (t2/fragment [:= :c.user_id user-id]))
    (when (seq date)
      (date-range-expr date))
    (when (and group-id (not= group-id (:id (perms/all-users-group))))
      (t2/fragment
       [:exists ^:allow-subquery {:select [1]
                                  :from   [[:permissions_group_membership :pgm]]
                                  :where  [:and
                                           [:= :pgm.user_id :c.user_id]
                                           [:= :pgm.group_id group-id]]}]))
    (when tenant-id
      (t2/fragment
       [:exists ^:allow-subquery {:select [1]
                                  :from   [[:core_user :u]]
                                  :where  [:and
                                           [:= :u.id :c.user_id]
                                           [:= :u.tenant_id tenant-id]]}]))]))

(defn- sort-order-by
  "The `:order-by` fragment for the allow-listed `sort-by` column name in `sort-direction`, falling back to
  `created_at`, with the conversation id as the final tie-breaker. The user sort orders by first_name then last_name."
  [sort-by sort-direction]
  (case sort-direction
    :asc  (case sort-by
            "title"             (t2/fragment [[:c.title :asc] [:c.id :asc]])
            "message_count"     (t2/fragment [[:message_count :asc] [:c.id :asc]])
            "total_tokens"      (t2/fragment [[:total_tokens :asc] [:c.id :asc]])
            "cache_read_tokens" (t2/fragment [[:cache_read_tokens :asc] [:c.id :asc]])
            "user"              (t2/fragment [[[:lower [:min :u.first_name]] :asc]
                                              [[:lower [:min :u.last_name]] :asc]
                                              [:c.id :asc]])
            "profile_id"        (t2/fragment [[:profile_id :asc] [:c.id :asc]])
            "ip_address"        (t2/fragment [[:c.ip_address :asc] [:c.id :asc]])
            (t2/fragment [[:c.created_at :asc] [:c.id :asc]]))
    :desc (case sort-by
            "title"             (t2/fragment [[:c.title :desc] [:c.id :asc]])
            "message_count"     (t2/fragment [[:message_count :desc] [:c.id :asc]])
            "total_tokens"      (t2/fragment [[:total_tokens :desc] [:c.id :asc]])
            "cache_read_tokens" (t2/fragment [[:cache_read_tokens :desc] [:c.id :asc]])
            "user"              (t2/fragment [[[:lower [:min :u.first_name]] :desc]
                                              [[:lower [:min :u.last_name]] :desc]
                                              [:c.id :asc]])
            "profile_id"        (t2/fragment [[:profile_id :desc] [:c.id :asc]])
            "ip_address"        (t2/fragment [[:c.ip_address :desc] [:c.id :asc]])
            (t2/fragment [[:c.created_at :desc] [:c.id :asc]]))))

(def ^:private conversation-list-select
  "Conversation rows with aggregate stats, including deleted attempts. Messages
   a fork copied in from its origin are counted here — the list describes the
   thread as the reader sees it. `v_metabot_conversations.new_message_count` is
   the usage-metric counterpart that leaves them out."
  (t2/fragment
   [:c.*
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
    [[:coalesce
      ^:allow-subquery {:select [[[:sum :aul.cache_read_tokens]]]
                        :from   [[:ai_usage_log :aul]]
                        :where  [:= :aul.conversation_id :c.id]}
      0]
     :cache_read_tokens]]))

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
       [:sort-direction [:enum :asc :desc]]
       [:offset         ms/IntGreaterThanOrEqualToZero]
       [:limit          ms/PositiveInt]]]
  (t2/select :model/MetabotConversation
             {:select    conversation-list-select
              :from      [[:metabot_conversation :c]]
              :left-join [[:metabot_message :m] [:= :m.conversation_id :c.id]
                          [:core_user :u]       [:= :u.id :c.user_id]]
              :where     (conversation-list-expr {:user-id user-id :group-id group-id :tenant-id tenant-id :date date})
              :group-by  [:c.id]
              :order-by  (sort-order-by sort-by sort-direction)
              :limit     limit
              :offset    offset}))

(mu/defn conversation-count
  "The total count of conversations matching the same criteria as [[list-conversations]] (ignoring sort, offset,
  and limit)."
  [{:keys [user-id group-id tenant-id date]}
   :- [:map {:closed true}
       [:user-id   {:optional true} [:maybe ::lib.schema.id/user]]
       [:group-id  {:optional true} [:maybe ms/PositiveInt]]
       [:tenant-id {:optional true} [:maybe ms/PositiveInt]]
       [:date      {:optional true} [:maybe :string]]]]
  (:count (t2/query-one {:select [[[:count :*] :count]]
                         :from   [[:metabot_conversation :c]]
                         :where  (conversation-list-expr {:user-id user-id :group-id group-id :tenant-id tenant-id :date date})})))

(mu/defn messages-for-conversation
  "The MetabotMessages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id :- :string]
  (t2/select :model/MetabotMessage :conversation_id conversation-id {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn message-data-for-conversations
  "The conversation, data, and data version of the MetabotMessages of the MetabotConversations with
  `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (t2/select [:model/MetabotMessage :conversation_id :data :data_version] :conversation_id [:in conversation-ids]))

(mu/defn feedback-for-conversation
  "The MetabotFeedback rows on the messages of the MetabotConversation with `conversation-id`, oldest first."
  [conversation-id :- :string]
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
