(ns metabase.metabot.feedback
  "Local persistence of Metabot feedback, plus a Harbormaster submission path."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util.json :as json]
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
  "Build the Harbormaster feedback payload from the request body, the resolved
  `metabot_message` row, and the submitter (defaults to the current user)."
  ([body message]
   (harbormaster-payload body message api/*current-user-id*))
  ([{:keys [metabot_id message_id positive issue_type freeform_feedback]}
    {:keys [conversation_id]}
    submitter-user-id]
   {:metabot_id        metabot_id
    :feedback          {:message_id        message_id
                        :positive          positive
                        :issue_type        issue_type
                        :freeform_feedback freeform_feedback}
    :conversation_data (metabot.persistence/conversation-detail conversation_id)
    :version           config/mb-version-info
    :submission_time   (str (java.time.OffsetDateTime/now))
    :submitter_user_id submitter-user-id
    :is_admin          (boolean (t2/select-one-fn :is_superuser :model/User :id submitter-user-id))}))

(defn- resolve-rated-message
  "Return the `metabot_message` row (`:id` + `:conversation_id`) identified by
  `external-id`, plus the enclosing `:model/MetabotConversation` as `:conversation`.
  Throws 404 if the message is missing, the conversation is missing, or the
  current user cannot read the conversation (superuser / originator / participant)."
  [external-id]
  (let [message      (t2/select-one [:model/MetabotMessage :id :conversation_id]
                                    :external_id external-id)
        _            (api/check-404 message)
        conversation (t2/select-one [:model/MetabotConversation :id :user_id]
                                    :id (:conversation_id message))
        _            (api/check-404 conversation)
        _            (api/check-404 (mi/can-read? conversation))]
    (assoc message :conversation conversation)))

(defn- upsert-feedback!
  "Insert or update the `metabot_feedback` row for `(message-row-id, submitter-user-id)`."
  [message-row-id submitter-user-id {:keys [positive issue_type freeform_feedback]}]
  (let [base-fields {:positive          positive
                     :issue_type        issue_type
                     :freeform_feedback freeform_feedback}]
    (t2/with-transaction [_conn]
      (if (t2/exists? :model/MetabotFeedback :message_id message-row-id :user_id submitter-user-id)
        (t2/update! :model/MetabotFeedback
                    {:message_id message-row-id :user_id submitter-user-id}
                    (assoc base-fields :updated_at (java.time.OffsetDateTime/now)))
        (t2/insert! :model/MetabotFeedback
                    (assoc base-fields
                           :message_id message-row-id
                           :user_id    submitter-user-id))))))

(defn persist-feedback!
  "Upsert a `metabot_feedback` row for the rated message and return the
  resolved `metabot_message` row (with its `:conversation`). Throws 404 when
  the external_id does not resolve to a message the current user can read.

  The submitter is always `api/*current-user-id*` — both the row's `user_id`
  and the `can-read?` authorization check key on the same identity. Callers
  that dispatch on behalf of another user (e.g. the Slack modal handler) must
  establish the binding via `request/with-current-user` before calling."
  [{:keys [message_id] :as body}]
  (let [message (resolve-rated-message message_id)]
    (upsert-feedback! (:id message) api/*current-user-id* body)
    message))
