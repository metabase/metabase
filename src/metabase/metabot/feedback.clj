(ns metabase.metabot.feedback
  "Persistence of Metabot feedback."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
    (app-db/update-or-insert! :model/MetabotFeedback
                              {:message_id message-row-id :user_id submitter-user-id}
                              (fn [existing]
                                (cond-> base-fields
                                  existing (assoc :updated_at (java.time.OffsetDateTime/now)))))))

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

(defn persist-source-feedback!
  "Upsert a `metabot_source_feedback` row for a source used by the rated message.
   Returns the resolved `metabot_message` row (with its `:conversation`)."
  [{:keys [message_id] :as body}]
  (let [message (resolve-rated-message message_id)]
    (upsert-source-feedback! (:id message) api/*current-user-id* body)
    message))
