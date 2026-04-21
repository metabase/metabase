(ns metabase.metabot.feedback
  "Local persistence of Metabot feedback, plus a Harbormaster submission path that
   is currently disabled at the call site (see `metabase.metabot.api`)."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(defn harbormaster-payload
  "Reassemble the historical Harbormaster feedback payload from the slim wire
   body plus DB-derived conversation context. The FE no longer sends
   `conversation_data`, `version`, `submission_time`, or `is_admin` — those are
   reconstructed here so re-enabling the proxy call is a one-line revert."
  [{:keys [metabot_id message_id positive issue_type freeform_feedback]}
   {:keys [conversation_id]}]
  {:metabot_id        metabot_id
   :feedback          {:message_id        message_id
                       :positive          positive
                       :issue_type        issue_type
                       :freeform_feedback freeform_feedback}
   :conversation_data (metabot.persistence/conversation-detail conversation_id)
   :version           config/mb-version-info
   :submission_time   (str (java.time.OffsetDateTime/now))
   :is_admin          (boolean api/*is-superuser?*)})

(defn- resolve-rated-message
  "Return the `metabot_message` row (`:id` + `:conversation_id`) identified by
   `external-id`, but only if the current user owns the enclosing conversation.
   Returns nil (and logs a warning) for unknown or unauthorized lookups."
  [external-id]
  (when (seq external-id)
    (let [message  (t2/select-one [:model/MetabotMessage :id :conversation_id]
                                  :external_id external-id)
          owner-id (when-let [conv-id (:conversation_id message)]
                     (t2/select-one-fn :user_id :model/MetabotConversation :id conv-id))]
      (cond
        (nil? message)
        (log/warnf "No metabot_message found for external_id %s; skipping feedback persist"
                   external-id)

        (not= owner-id api/*current-user-id*)
        (log/warnf "User %s tried to rate a message in conversation they do not own; skipping"
                   api/*current-user-id*)

        :else message))))

(defn- upsert-feedback!
  "Insert or update the `metabot_feedback` row for `message-row-id`."
  [message-row-id {:keys [positive issue_type freeform_feedback]}]
  (let [base-fields {:positive          positive
                     :issue_type        issue_type
                     :freeform_feedback freeform_feedback}]
    (t2/with-transaction [_conn]
      (if (t2/exists? :model/MetabotFeedback :message_id message-row-id)
        (t2/update! :model/MetabotFeedback message-row-id
                    (assoc base-fields :updated_at (java.time.OffsetDateTime/now)))
        (t2/insert! :model/MetabotFeedback (assoc base-fields :message_id message-row-id))))))

(defn persist-feedback!
  "Upsert a `metabot_feedback` row for the rated message. Returns the resolved
   `metabot_message` row on success, nil when the lookup/authorization path
   declines (unknown external_id, non-owner, or missing `positive`).

   DB exceptions from the upsert propagate to the caller."
  [{:keys [message_id positive] :as body}]
  (when (some? positive)
    (when-let [message (resolve-rated-message message_id)]
      (upsert-feedback! (:id message) body)
      message)))
