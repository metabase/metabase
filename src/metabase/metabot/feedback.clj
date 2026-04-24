(ns metabase.metabot.feedback
  "Local persistence of Metabot feedback, plus a Harbormaster submission path."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.metabot.persistence :as metabot.persistence]
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
  "Build the Harbormaster feedback payload from the request body and the
   resolved `metabot_message` row."
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
   `external-id`, or throw 404 when the lookup fails or the current user does
   not own the enclosing conversation."
  [external-id]
  (let [message  (t2/select-one [:model/MetabotMessage :id :conversation_id]
                                :external_id external-id)
        owner-id (when-let [conv-id (:conversation_id message)]
                   (t2/select-one-fn :user_id :model/MetabotConversation :id conv-id))]
    (api/check-404 message)
    (api/check-404 (= owner-id api/*current-user-id*))
    message))

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
  "Upsert a `metabot_feedback` row for the rated message and return the
   resolved `metabot_message` row. Throws 404 when the external_id does not
   resolve to a message the current user owns."
  [{:keys [message_id] :as body}]
  (let [message (resolve-rated-message message_id)]
    (upsert-feedback! (:id message) body)
    message))
