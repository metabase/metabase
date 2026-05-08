(ns metabase.metabot.feedback
  "Shared Metabot feedback handling."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
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
   `external-id`, or throw 404 when the lookup fails or the current user cannot
   submit feedback for the enclosing conversation."
  ([external-id]
   (resolve-rated-message external-id {}))
  ([external-id {:keys [allow-superuser?]
                 :or   {allow-superuser? false}}]
   (let [message      (t2/select-one [:model/MetabotMessage :id :conversation_id]
                                     :external_id external-id)
         _            (api/check-404 message)
         conversation (t2/select-one [:model/MetabotConversation :id :user_id]
                                     :id (:conversation_id message))
         _            (api/check-404 conversation)
         _            (api/check-404 (or (= api/*current-user-id* (:user_id conversation))
                                         (and allow-superuser? api/*is-superuser?*)))]
     (assoc message :conversation conversation))))

(defn- upsert-feedback!
  "Insert or update the `metabot_feedback` row for `message-row-id`."
  [message-row-id {:keys [positive issue_type freeform_feedback]}]
  (app-db/update-or-insert! :model/MetabotFeedback {:message_id message-row-id}
                            (fn [existing]
                              (cond-> {:positive          positive
                                       :issue_type        issue_type
                                       :freeform_feedback freeform_feedback}
                                existing (assoc :updated_at (java.time.OffsetDateTime/now))))))

(defn persist-feedback!
  "Upsert a `metabot_feedback` row for the rated message and return the
   resolved `metabot_message` row. Throws 404 when the external_id does not
   resolve to a message the current user owns."
  [{:keys [message_id] :as body}]
  (let [message (resolve-rated-message message_id)]
    (upsert-feedback! (:id message) body)
    message))

(defn- upsert-source-feedback!
  "Insert or update the `metabot_source_feedback` row for one source, message, and submitter."
  [message-row-id submitter-user-id {:keys [positive source_id source_type]}]
  (let [conditions  {:message_id  message-row-id
                     :user_id     submitter-user-id
                     :source_id   source_id
                     :source_type source_type}
        base-fields {:positive positive}]
    (app-db/update-or-insert! :model/MetabotSourceFeedback
                              conditions
                              (fn [existing]
                                (cond-> base-fields
                                  existing (assoc :updated_at (java.time.OffsetDateTime/now)))))))

(defn persist-source-feedback!
  "Upsert a `metabot_source_feedback` row for a source used by the rated message.
   Returns the resolved `metabot_message` row (with its `:conversation`)."
  [{:keys [message_id] :as body}]
  (let [message (resolve-rated-message message_id {:allow-superuser? true})]
    (upsert-source-feedback! (:id message) api/*current-user-id* body)
    message))
