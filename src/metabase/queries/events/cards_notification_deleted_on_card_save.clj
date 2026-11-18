(ns metabase.queries.events.cards-notification-deleted-on-card-save
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/card-update.notification-deleted.card-archived ::event)
(events/derive! :event/card-update.notification-deleted.card-changed ::event)

(methodical/defmethod events/publish-event! ::event
  "Emails the recipients of the alerts that the save of a Card deleted."
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
      (log/errorf "Error sending notification email: %s" (ex-message e)))))
