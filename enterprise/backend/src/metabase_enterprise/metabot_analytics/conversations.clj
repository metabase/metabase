(ns metabase-enterprise.metabot-analytics.conversations
  "Data-access layer for the metabot analytics API. Delegates queries to
  `metabase-enterprise.metabot-analytics.db` and assembles the response shapes
  the `/api/ee/metabot-analytics/conversations` handlers return.

  Handlers in `metabase-enterprise.metabot-analytics.api` should stay thin —
  auth, param coercion, and delegation to the functions here."
  (:require
   [metabase-enterprise.metabot-analytics.db :as metabot-analytics.db]
   [metabase-enterprise.metabot-analytics.queries :as analytics.queries]
   [metabase.api.common :as api]
   [metabase.metabot.persistence :as metabot-persistence]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.slackbot.api :as slackbot.api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-limit  50)
(def ^:private default-offset 0)

(defn- trim-user
  "Trim a hydrated core_user down to the minimal shape the frontend uses
   (`MetabotUserInfo`)."
  [user]
  (some-> user (select-keys [:id :email :first_name :last_name :tenant_id])))

(defn- row->summary
  "Reshape a raw list-query row into the response shape the frontend expects:
   renames the conversation's `:id` to `:conversation_id`, trims the hydrated
   user, and keeps only the aggregate fields the summary payload needs."
  [row]
  {:conversation_id             (:id row)
   :created_at                  (:created_at row)
   :title                       (:title row)
   :message_count               (:message_count row)
   :user_message_count          (:user_message_count row)
   :assistant_message_count     (:assistant_message_count row)
   :total_tokens                (long (:total_tokens row 0))
   :cache_read_tokens           (long (:cache_read_tokens row 0))
   :last_message_at             (:last_message_at row)
   :profile_id                  (:profile_id row)
   :search_count                (:search_count row 0)
   :query_count                 (:query_count row 0)
   :ip_address                  (:ip_address row)
   :embedding_hostname          (:embedding_hostname row)
   :embedding_path              (:embedding_path row)
   :user_agent                  (:user_agent row)
   :sanitized_user_agent        (:sanitized_user_agent row)
   :forked_from_conversation_id (:forked_from_conversation_id row)
   :user                        (trim-user (:user row))})

(defn- hydrate-tool-counts
  "Batch-load `metabot_message` data for a page of conversations and attach
   `:search_count` and `:query_count` to each row. One query per page
   regardless of row count — messages are grouped in-memory by
   `:conversation_id` and both counts are computed from the same fetch."
  [rows]
  (let [conversation-ids (map :id rows)
        messages-by-conv (when (seq conversation-ids)
                           (->> (metabot-analytics.db/message-data-for-conversations conversation-ids)
                                (group-by :conversation_id)))]
    (map (fn [row]
           (let [msgs (get messages-by-conv (:id row) [])]
             (assoc row
                    :search_count (analytics.queries/count-tool-invocations msgs "search")
                    :query_count  (analytics.queries/count-tool-invocations
                                   msgs metabot.tools/query-generation-tool-names))))
         rows)))

(defn list-conversations
  "Return a paginated `{:data :total :limit :offset}` map of conversation
   summaries. Supports optional filtering by `user-id`, `group-id`, `tenant-id`,
   and a serialized `date` parameter string, plus sorting by an allow-listed
   `sort-by` column in either direction (defaults to newest-first)."
  [{:keys [limit offset user-id group-id tenant-id date sort-by sort-dir]}]
  (let [limit     (or limit default-limit)
        offset    (or offset default-offset)
        direction (if (= sort-dir "asc") :asc :desc)
        params    {:user-id user-id :group-id group-id :tenant-id tenant-id :date date}
        total     (metabot-analytics.db/conversation-count params)
        rows      (metabot-analytics.db/list-conversations
                   (assoc params
                          :sort-by sort-by
                          :sort-direction direction
                          :limit limit
                          :offset offset))]
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
  (let [rows (metabot-analytics.db/feedback-for-conversation conversation-id)]
    (t2/hydrate rows :user)))

(defn- fork-boundary-external-id
  "The `external_id` of the last message copied in from the parent when this
   conversation is a fork — the point the message list changes from inherited to
   new. `nil` when nothing was copied. Messages arrive ordered oldest-first, so
   the last one carrying `:forked_from_message_id` is the boundary."
  [ordered-messages]
  (->> ordered-messages
       (filter :forked_from_message_id)
       last
       :external_id))

(defn fetch-conversation-detail
  "Fetch a conversation detail or throw a 404."
  [conversation-id]
  (let [conversation (metabot-analytics.db/conversation conversation-id)]
    (api/check-404 conversation)
    (let [all-messages (metabot-analytics.db/messages-for-conversation conversation-id)
          forked-from  (:forked_from_conversation_id conversation)
          hydrated     (t2/hydrate conversation :user)]
      {:conversation_id             (:id conversation)
       :created_at                  (:created_at conversation)
       :title                       (:title conversation)
       :user                        (trim-user (:user hydrated))
       :message_count               (count all-messages)
       :total_tokens                (transduce (keep :total_tokens) + 0 all-messages)
       :profile_id                  (some #(when (= :assistant (:role %)) (:profile_id %)) all-messages)
       :slack_permalink             (slack-permalink conversation)
       :messages                    (metabot-persistence/messages->flat-messages
                                     all-messages {:include-rewound-errors? true})
       :queries                     (analytics.queries/messages->generated-queries all-messages)
       :search_count                (analytics.queries/count-tool-invocations all-messages "search")
       :query_count                 (analytics.queries/count-tool-invocations
                                     all-messages metabot.tools/query-generation-tool-names)
       :ip_address                  (:ip_address conversation)
       :embedding_hostname          (:embedding_hostname conversation)
       :embedding_path              (:embedding_path conversation)
       :user_agent                  (:user_agent conversation)
       :sanitized_user_agent        (:sanitized_user_agent conversation)
       :forked_from_conversation_id forked-from
       :fork_boundary_message_id    (fork-boundary-external-id all-messages)
       :feedback                    (fetch-conversation-feedback conversation-id)})))
