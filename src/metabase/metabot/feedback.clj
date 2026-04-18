(ns metabase.metabot.feedback
  "Shared feedback submission to Harbormaster via the Store API, plus local persistence."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn submit-to-harbormaster!
  "Submit metabot feedback to Harbormaster via the Store API.
   Returns the HTTP response on success, or nil if the token or Store API URL is missing."
  [feedback]
  (let [token    (premium-features/premium-embedding-token)
        base-url (store-api/store-api-url)]
    (when-not (or (str/blank? token) (str/blank? base-url))
      (http/post (str base-url "/api/v2/metabot/feedback/" token)
                 {:content-type :json
                  :body         (json/encode feedback)}))))

(defn- conversation-id-from-payload
  "Pick a conversation id out of `conversation_data`. Prefers the conversation whose messages
   contain the rated `message-uuid`; falls back to any conversation present in the payload."
  [conversation-data message-uuid]
  (let [conversations (some-> conversation-data :conversations vals)]
    (or (some (fn [{:keys [messages conversationId]}]
                (when (some #(= message-uuid (:id %)) messages)
                  conversationId))
              conversations)
        (some :conversationId conversations))))

(defn- latest-assistant-message-id
  "Return the id of the most recent non-deleted assistant `metabot_message` in `conversation-id`, or nil.
   Resolution heuristic: the FE doesn't know the DB row id, so we assume the user is rating the
   message they just received. Older messages can't be rated until the FE threads DB ids through."
  [conversation-id]
  (when conversation-id
    (t2/select-one-pk :model/MetabotMessage
                      {:where    [:and
                                  [:= :conversation_id conversation-id]
                                  [:= :role "assistant"]
                                  [:= :deleted_at nil]]
                       :order-by [[:created_at :desc] [:id :desc]]
                       :limit    1})))

(defn persist-feedback!
  "Upsert a `metabot_feedback` row for the rated message. Returns the message_id on success, nil on no-op.

   Resolution: the rated message is the latest assistant message in the conversation referenced by
   `conversation_data`. If a feedback row already exists for that message it is updated in place
   (`updated_at` is bumped); otherwise a new row is inserted."
  [{:keys [feedback conversation_data] :as _payload}]
  (let [{:keys [positive message_id issue_type freeform_feedback]} feedback
        conversation-id (conversation-id-from-payload conversation_data message_id)
        message-row-id  (latest-assistant-message-id conversation-id)]
    (cond
      (nil? positive)
      nil

      (nil? message-row-id)
      (do (log/warnf "No assistant message found for feedback in conversation %s" conversation-id)
          nil)

      :else
      (let [base-fields {:positive          positive
                         :issue_type        issue_type
                         :freeform_feedback freeform_feedback
                         :user_id           api/*current-user-id*}]
        (t2/with-transaction [_conn]
          (if (t2/exists? :model/MetabotFeedback :message_id message-row-id)
            (t2/update! :model/MetabotFeedback message-row-id
                        (assoc base-fields :updated_at (java.time.OffsetDateTime/now)))
            (t2/insert! :model/MetabotFeedback (assoc base-fields :message_id message-row-id))))
        message-row-id))))
