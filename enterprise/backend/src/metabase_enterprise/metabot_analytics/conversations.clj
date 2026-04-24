(ns metabase-enterprise.metabot-analytics.conversations
  "Data-access layer for the metabot analytics API. Builds and runs the
  HoneySQL queries that back the `/api/ee/metabot-analytics/conversations`
  endpoints, and assembles the response shapes the handlers return.

  Handlers in `metabase-enterprise.metabot-analytics.api` should stay thin —
  auth, param coercion, and delegation to the functions here."
  (:require
   [metabase-enterprise.metabot-analytics.queries :as analytics.queries]
   [metabase.api.common :as api]
   [metabase.metabot.persistence :as metabot-persistence]
   [metabase.query-processor.parameters.dates :as qp.parameters.dates]
   [metabase.slackbot.api :as slackbot.api]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-limit  50)
(def ^:private default-offset 0)

;; matches the frontend `DEFAULT_GROUP = "1"` — the "All Users" / no-filter
;; sentinel in ConversationFilters/useFilterOptions.ts
(def ^:private all-users-group-id 1)

(defn- date-string->constraints
  "Parse a serialized date-param string into half-open HoneySQL predicates on `col`.
   Throws 400 on a malformed string. Returns nil when no bound is produced."
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

(defn- list-where-clause
  "Compose a conjunctive WHERE from optional filters. Returns `nil` when no
   filter applies so the caller can `cond->` cleanly."
  [{:keys [user-id group-id date]}]
  (let [clauses (cond-> []
                  user-id (conj [:= :c.user_id user-id])
                  (seq date) (conj (date-string->constraints :c.created_at date))
                  (and group-id (not= group-id all-users-group-id))
                  (conj [:exists {:select [1]
                                  :from   [[:permissions_group_membership :pgm]]
                                  :where  [:and
                                           [:= :pgm.user_id :c.user_id]
                                           [:= :pgm.group_id group-id]]}]))
        clauses (remove nil? clauses)]
    (when (seq clauses)
      (into [:and] clauses))))

(defn- trim-user
  "Trim a hydrated core_user down to the minimal shape the frontend uses
   (`MetabotUserInfo`)."
  [user]
  (some-> user (select-keys [:id :email :first_name :last_name :tenant_id])))

(def ^:private sort-columns
  "Allow-list of API sort keys → HoneySQL column refs, to keep user input out
   of the `:order-by` clause."
  {"created_at"    :c.created_at
   "message_count" :message_count
   "total_tokens"  :total_tokens})

(def ^:private list-query
  "HoneySQL query that selects one row per conversation with the aggregate
   message stats the frontend needs. Filters, sorting, and paging are applied
   by [[list-conversations]]."
  {:select    [:c.*
               [[:count :m.id] :message_count]
               [[:count [:case [:= :m.role "user"] 1]] :user_message_count]
               [[:count [:case [:= :m.role "assistant"] 1]] :assistant_message_count]
               [[:coalesce [:sum :m.total_tokens] 0] :total_tokens]
               [[:max :m.created_at] :last_message_at]
               ;; First assistant message's profile_id, matching the
               ;; `v_metabot_conversations` analytics view. User messages carry
               ;; a placeholder `profile_id` and are excluded.
               [{:select   [:mm.profile_id]
                 :from     [[:metabot_message :mm]]
                 :where    [:and
                            [:= :mm.conversation_id :c.id]
                            [:= :mm.role "assistant"]
                            [:= :mm.deleted_at nil]]
                 :order-by [[:mm.created_at :asc]]
                 :limit    1}
                :profile_id]]
   :from      [[:metabot_conversation :c]]
   :left-join [[:metabot_message :m] [:and
                                      [:= :m.conversation_id :c.id]
                                      [:= :m.deleted_at nil]]]
   :group-by  [:c.id]})

(defn- row->summary
  "Reshape a raw list-query row into the response shape the frontend expects:
   renames the conversation's `:id` to `:conversation_id`, trims the hydrated
   user, and keeps only the aggregate fields the summary payload needs."
  [row]
  {:conversation_id         (:id row)
   :created_at              (:created_at row)
   :summary                 (:summary row)
   :message_count           (:message_count row)
   :user_message_count      (:user_message_count row)
   :assistant_message_count (:assistant_message_count row)
   :total_tokens            (long (:total_tokens row 0))
   :last_message_at         (:last_message_at row)
   :profile_id              (:profile_id row)
   :search_count            (:search_count row 0)
   :query_count             (:query_count row 0)
   :ip_address              (:ip_address row)
   :user                    (trim-user (:user row))})

(defn- hydrate-tool-counts
  "Batch-load `metabot_message` data for a page of conversations and attach
   `:search_count` and `:query_count` to each row. One query per page
   regardless of row count — messages are grouped in-memory by
   `:conversation_id` and both counts are computed from the same fetch."
  [rows]
  (let [conversation-ids (map :id rows)
        messages-by-conv (when (seq conversation-ids)
                           (->> (t2/select [:model/MetabotMessage :conversation_id :data]
                                           :conversation_id [:in conversation-ids]
                                           {:where [:= :deleted_at nil]})
                                (group-by :conversation_id)))]
    (map (fn [row]
           (let [msgs (get messages-by-conv (:id row) [])]
             (assoc row
                    :search_count (analytics.queries/count-tool-invocations msgs "search")
                    :query_count  (analytics.queries/count-tool-invocations
                                   msgs analytics.queries/new-query-tool-names))))
         rows)))

(defn list-conversations
  "Return a paginated `{:data :total :limit :offset}` map of conversation
   summaries. Supports optional filtering by `user-id`, `group-id`, and a
   serialized `date` parameter string, plus sorting by an allow-listed
   `sort-by` column in either direction (defaults to newest-first)."
  [{:keys [limit offset user-id group-id date sort-by sort-dir]}]
  (let [limit     (or limit default-limit)
        offset    (or offset default-offset)
        where     (list-where-clause {:user-id user-id :group-id group-id :date date})
        sort-col  (get sort-columns sort-by :c.created_at)
        direction (if (= sort-dir "asc") :asc :desc)
        total     (:count (t2/query-one (cond-> {:select [[[:count :*] :count]]
                                                 :from   [[:metabot_conversation :c]]}
                                          where (assoc :where where))))
        rows      (t2/select :model/MetabotConversation
                             (cond-> (assoc list-query
                                            :order-by [[sort-col direction] [:c.id :asc]]
                                            :limit    limit
                                            :offset   offset)
                               where (assoc :where where)))]
    {:data   (->> (t2/hydrate rows :user)
                  hydrate-tool-counts
                  (map row->summary))
     :total  total
     :limit  limit
     :offset offset}))

(defn- slack-permalink
  "Best-effort Slack permalink for a Slack-originated conversation."
  [{:keys [slack_channel_id slack_thread_ts]}]
  (slackbot.api/conversation-permalink slack_channel_id slack_thread_ts))

(defn- fetch-conversation-feedback
  "Return all `metabot_feedback` rows for messages in `conversation-id`, ordered
   by submission time. Rows are keyed per-`(message, submitter)` — a shared
   thread can yield multiple rows for the same message — so the submitter is
   hydrated as `:user` for display."
  [conversation-id]
  (let [rows (t2/select :model/MetabotFeedback
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
                         :join     [[:metabot_message :mm]
                                    [:= :mm.id :metabot_feedback.message_id]]
                         :where    [:= :mm.conversation_id conversation-id]
                         :order-by [[:metabot_feedback.created_at :asc]
                                    [:metabot_feedback.message_id :asc]
                                    [:metabot_feedback.user_id :asc]]})]
    (t2/hydrate rows :user)))

(defn fetch-conversation-detail
  "Fetch a conversation with its user info, the frontend-ready flattened
   chat messages, the queries the bot generated, and any user-submitted feedback.
   404s via `api/check-404` if no conversation matches `conversation-id`."
  [conversation-id]
  (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
    (api/check-404 conversation)
    (let [messages (t2/select :model/MetabotMessage
                              :conversation_id conversation-id
                              {:where    [:= :deleted_at nil]
                               :order-by [[:created_at :asc]]})
          hydrated (t2/hydrate conversation :user)]
      {:conversation_id (:id conversation)
       :created_at      (:created_at conversation)
       :summary         (:summary conversation)
       :user            (trim-user (:user hydrated))
       :message_count   (count messages)
       :total_tokens    (transduce (keep :total_tokens) + 0 messages)
       :profile_id      (some #(when (= :assistant (:role %)) (:profile_id %)) messages)
       :slack_permalink (slack-permalink conversation)
       :chat_messages   (metabot-persistence/messages->chat-messages messages)
       :queries         (analytics.queries/messages->generated-queries messages)
       :search_count    (analytics.queries/count-tool-invocations messages "search")
       :query_count     (analytics.queries/count-tool-invocations
                         messages analytics.queries/new-query-tool-names)
       :ip_address      (:ip_address conversation)
       :feedback        (fetch-conversation-feedback conversation-id)})))
