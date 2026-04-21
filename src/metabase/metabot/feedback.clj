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

(defn persist-feedback!
  "Upsert a `metabot_feedback` row for the rated message. Returns the `metabot_message.id`
   on success, nil on no-op.

   `feedback.message_id` is resolved via `metabot_message.external_id`. Only the user who
   owns the referenced conversation may rate its messages; other submissions are dropped."
  [{:keys [feedback] :as _payload}]
  (let [{:keys [positive message_id issue_type freeform_feedback]} feedback
        message (when (seq message_id)
                  (t2/select-one [:model/MetabotMessage :id :conversation_id]
                                 :external_id message_id))
        owner-id (when-let [conv-id (:conversation_id message)]
                   (t2/select-one-fn :user_id :model/MetabotConversation :id conv-id))]
    (cond
      (nil? positive)
      nil

      (nil? message)
      (do (log/warnf "No metabot_message found for external_id %s; skipping feedback persist"
                     message_id)
          nil)

      (not= owner-id api/*current-user-id*)
      (do (log/warnf "User %s tried to rate a message in conversation they do not own; skipping"
                     api/*current-user-id*)
          nil)

      :else
      (let [message-row-id (:id message)
            base-fields    {:positive          positive
                            :issue_type        issue_type
                            :freeform_feedback freeform_feedback
                            :user_id           api/*current-user-id*}]
        (t2/with-transaction [_conn]
          (if (t2/exists? :model/MetabotFeedback :message_id message-row-id)
            (t2/update! :model/MetabotFeedback message-row-id
                        (assoc base-fields :updated_at (java.time.OffsetDateTime/now)))
            (t2/insert! :model/MetabotFeedback (assoc base-fields :message_id message-row-id))))
        message-row-id))))
