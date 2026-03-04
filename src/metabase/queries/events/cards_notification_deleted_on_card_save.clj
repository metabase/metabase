(ns metabase.queries.events.cards-notification-deleted-on-card-save
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/card-update.notification-deleted.card-archived ::event)
(derive :event/card-update.notification-deleted.card-changed ::event)

(methodical/defmethod events/publish-event! ::event
  "When a Card is saved and associated Alerts are deleted send email notifications to recipients of that alert. At the
  time of this writing this is triggered by [[metabase.queries.models.card/delete-alerts-if-needed!]] and
  by [[metabase.collections-rest.api/maybe-send-archived-notifications!]]."
  [topic {:keys [notifications card actor], :as _event}]
  (try
    (let [send-message! (case topic
                          :event/card-update.notification-deleted.card-archived
                          messages/send-alert-stopped-because-archived-email!

                          :event/card-update.notification-deleted.card-changed
                          messages/send-alert-stopped-because-changed-email!)
          recipients (->> notifications
                          (filter #((complement true?) (get-in % [:payload :disable_links])))
                          (mapcat :handlers)
                          (filter #(= :channel/email (:channel_type %)))
                          (mapcat :recipients)
                          (keep (fn [recipient]
                                  (case (:type recipient)
                                    :notification-recipient/user
                                    (-> recipient :user :email)
                                    :notification-recipient/raw-value
                                    (-> recipient :details :value)
                                    (throw (ex-info "Unknown recipient type" {:recipient recipient}))))))

          recipients-with-no-links (->> notifications
                                        (filter #(true? (get-in % [:payload :disable_links])))
                                        (mapcat :handlers)
                                        (filter #(= :channel/email (:channel_type %)))
                                        (mapcat :recipients)
                                        (keep (fn [recipient]
                                                (case (:type recipient)
                                                  :notification-recipient/user
                                                  (-> recipient :user :email)
                                                  :notification-recipient/raw-value
                                                  (-> recipient :details :value)
                                                  (throw (ex-info "Unknown recipient type" {:recipient recipient}))))))]

      (send-message! card recipients recipients-with-no-links actor))
    (catch Throwable e
      (log/error e "Error sending notification email"))))
