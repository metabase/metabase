(ns metabase.events.alerts-deleted-on-card-save
  (:require
   [medley.core :as m]
   [metabase.channel.email.messages :as messages]
   [metabase.events :as events]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/card-update.alerts-deleted.card-archived ::event)
(derive :event/card-update.alerts-deleted.card-became-invalid ::event)

(methodical/defmethod events/publish-event! ::event
  "When a Card is saved and associated Alerts are deleted send email notifications to recipients of that alert. At the
  time of this writing this is triggered by [[metabase.models.card/delete-alerts-if-needed!]] and
  by [[metabase.api.collection/maybe-send-archived-notifications!]]."
  [topic {:keys [alerts actor], :as _event}]
  (let [send-message! (case topic
                        :event/card-update.alerts-deleted.card-archived
                        messages/send-alert-stopped-because-archived-email!

                        :event/card-update.alerts-deleted.card-became-invalid
                        messages/send-alert-stopped-because-changed-email!)]
    (doseq [{:keys [channels] :as alert} alerts
            :let [email-channel (m/find-first #(= :email (:channel_type %)) channels)]]
      (doseq [recipient (:recipients email-channel)]
        (send-message! alert recipient actor)))))
