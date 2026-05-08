(ns metabase.metabot.feedback
  "Shared Metabot feedback handling."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
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

(defn- resolve-rated-message
  "Return the Metabot message row identified by `external-id` if the current user can read its conversation."
  [external-id]
  (let [message      (t2/select-one [:model/MetabotMessage :id :conversation_id]
                                    :external_id external-id)
        _            (api/check-404 message)
        conversation (t2/select-one [:model/MetabotConversation :id :user_id]
                                    :id (:conversation_id message))
        _            (api/check-404 conversation)
        _            (api/check-404 (or api/*is-superuser?*
                                        (= api/*current-user-id* (:user_id conversation))))]
    (assoc message :conversation conversation)))

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
  (let [message (resolve-rated-message message_id)]
    (upsert-source-feedback! (:id message) api/*current-user-id* body)
    message))
